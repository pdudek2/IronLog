import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  fetchRemoteSessionHasWork,
  hasActiveSessionWork,
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

  const executeLaunch = useCallback(async (target: TemplateLaunchTarget) => {
    if (!uid) return
    const workout = await createPersistedTemplateWorkout(
      uid,
      target.template,
      target.dayIndex,
    )
    hydrateFromDoc(workout)
    toast.success(`Szablon „${target.template.name}” gotowy do startu`)
    navigate('/workout/new')
  }, [hydrateFromDoc, navigate, uid])

  const requestTemplateLaunch = useCallback(async (
    template: WorkoutTemplate,
    dayIndex = 0,
  ) => {
    if (!uid || launchingTemplateId) return
    const target = { template, dayIndex }
    setLaunchingTemplateId(template.id)
    try {
      const hasConflict = hasActiveSessionWork(active)
        || await fetchRemoteSessionHasWork(uid)
      if (hasConflict) {
        setPendingLaunch(target)
        return
      }
      await executeLaunch(target)
    } catch (error) {
      console.error('[useTemplateWorkoutLaunch] launch failed', error)
      toast.error('Nie udało się uruchomić szablonu.')
    } finally {
      setLaunchingTemplateId(null)
    }
  }, [active, executeLaunch, launchingTemplateId, uid])

  const confirmTemplateLaunch = useCallback(async () => {
    if (!pendingLaunch || launchingTemplateId) return
    const target = pendingLaunch
    setPendingLaunch(null)
    setLaunchingTemplateId(target.template.id)
    try {
      await executeLaunch(target)
    } catch (error) {
      console.error('[useTemplateWorkoutLaunch] confirmed launch failed', error)
      toast.error('Nie udało się uruchomić szablonu.')
    } finally {
      setLaunchingTemplateId(null)
    }
  }, [executeLaunch, launchingTemplateId, pendingLaunch])

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
