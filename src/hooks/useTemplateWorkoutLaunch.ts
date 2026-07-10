import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  hasActiveSessionWork,
  TemplateLaunchConflictError,
} from '../lib/activeSessionService'
import { createPersistedTemplateWorkout } from '../lib/templateLaunchService'
import type { WorkoutTemplate } from '../lib/templateService'
import { useWorkoutStore } from '../store/workoutStore'

export interface TemplateLaunchTarget {
  template: WorkoutTemplate
  dayIndex: number
}

export interface TemplateWorkoutLaunch {
  pendingLaunch: TemplateLaunchTarget | null
  launchingTemplateId: string | null
  requestTemplateLaunch: (template: WorkoutTemplate, dayIndex?: number) => Promise<void>
  confirmTemplateLaunch: () => Promise<void>
  cancelTemplateLaunch: () => void
}

export function useTemplateWorkoutLaunch(
  uid: string | null | undefined,
): TemplateWorkoutLaunch {
  const active = useWorkoutStore((state) => state.active)
  const hydrateFromDoc = useWorkoutStore((state) => state.hydrateFromDoc)
  const navigate = useNavigate()
  const [pendingLaunch, setPendingLaunch] = useState<TemplateLaunchTarget | null>(null)
  const [launchingTemplateId, setLaunchingTemplateId] = useState<string | null>(null)
  const launchLockRef = useRef(false)
  const launchGenerationRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      launchGenerationRef.current += 1
      launchLockRef.current = false
    }
  }, [])

  const isCurrentLaunch = useCallback((generation: number) => (
    mountedRef.current && launchGenerationRef.current === generation
  ), [])

  const executeLaunch = useCallback(async (
    target: TemplateLaunchTarget,
    replaceExisting: boolean,
    generation: number,
  ) => {
    if (!uid) return
    const workout = await createPersistedTemplateWorkout(
      uid,
      target.template,
      target.dayIndex,
      replaceExisting,
    )
    if (!isCurrentLaunch(generation)) return
    hydrateFromDoc(workout)
    toast.success(`Szablon „${target.template.name}” gotowy do startu`)
    navigate('/workout/new')
  }, [hydrateFromDoc, isCurrentLaunch, navigate, uid])

  const requestTemplateLaunch = useCallback(async (
    template: WorkoutTemplate,
    dayIndex = 0,
  ) => {
    if (!uid || launchLockRef.current) return
    launchLockRef.current = true
    const generation = ++launchGenerationRef.current
    const target = { template, dayIndex }
    try {
      if (hasActiveSessionWork(active)) {
        setPendingLaunch(target)
        return
      }

      setLaunchingTemplateId(template.id)
      await executeLaunch(target, false, generation)
    } catch (error) {
      if (!isCurrentLaunch(generation)) return
      if (error instanceof TemplateLaunchConflictError) {
        setPendingLaunch(target)
        return
      }
      console.error('[useTemplateWorkoutLaunch] launch failed', error)
      toast.error('Nie udało się uruchomić szablonu.')
    } finally {
      if (isCurrentLaunch(generation)) {
        setLaunchingTemplateId(null)
      }
      launchLockRef.current = false
    }
  }, [active, executeLaunch, isCurrentLaunch, uid])

  const confirmTemplateLaunch = useCallback(async () => {
    if (!pendingLaunch || launchLockRef.current) return
    launchLockRef.current = true
    const generation = ++launchGenerationRef.current
    const target = pendingLaunch
    setPendingLaunch(null)
    setLaunchingTemplateId(target.template.id)
    try {
      await executeLaunch(target, true, generation)
    } catch (error) {
      if (!isCurrentLaunch(generation)) return
      console.error('[useTemplateWorkoutLaunch] confirmed launch failed', error)
      toast.error('Nie udało się uruchomić szablonu.')
    } finally {
      if (isCurrentLaunch(generation)) {
        setLaunchingTemplateId(null)
      }
      launchLockRef.current = false
    }
  }, [executeLaunch, isCurrentLaunch, pendingLaunch])

  const cancelTemplateLaunch = useCallback(() => {
    setPendingLaunch(null)
  }, [])

  return {
    pendingLaunch,
    launchingTemplateId,
    requestTemplateLaunch,
    confirmTemplateLaunch,
    cancelTemplateLaunch,
  }
}
