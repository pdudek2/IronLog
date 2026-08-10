import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  hasActiveSessionWork,
  TemplateLaunchConflictError,
} from '../lib/activeSessionService'
import { createPersistedTemplateWorkout } from '../lib/templateLaunchService'
import type {
  TemplateExerciseOverrideMap,
  WorkoutTemplate,
} from '../lib/templateService'
import { useWorkoutStore } from '../store/workoutStore'

export interface TemplateLaunchTarget {
  template: WorkoutTemplate
  dayIndex: number
  requestKey: string
  overrides?: TemplateExerciseOverrideMap
}

export interface TemplateLaunchOperation {
  target: TemplateLaunchTarget
  replaceExisting: boolean
  status: 'pending' | 'error'
  errorMessage: string | null
}

export interface TemplateWorkoutLaunch {
  pendingLaunch: TemplateLaunchTarget | null
  launchOperation: TemplateLaunchOperation | null
  launchingTemplateId: string | null
  requestTemplateLaunch: (
    template: WorkoutTemplate,
    dayIndex: number,
    requestKey: string,
    overrides?: TemplateExerciseOverrideMap,
  ) => Promise<void>
  confirmTemplateLaunch: () => Promise<void>
  cancelTemplateLaunch: () => void
  retryTemplateLaunch: () => Promise<void>
  dismissTemplateLaunchError: () => void
}

export function useTemplateWorkoutLaunch(
  uid: string | null | undefined,
): TemplateWorkoutLaunch {
  const active = useWorkoutStore((state) => state.active)
  const hydrateFromDoc = useWorkoutStore((state) => state.hydrateFromDoc)
  const navigate = useNavigate()
  const [pendingLaunch, setPendingLaunch] = useState<TemplateLaunchTarget | null>(null)
  const [launchOperation, setLaunchOperation] = useState<TemplateLaunchOperation | null>(null)
  const [launchStateUid, setLaunchStateUid] = useState(uid)
  const launchLockRef = useRef(false)
  const launchGenerationRef = useRef(0)
  const mountedRef = useRef(true)

  if (launchStateUid !== uid) {
    setLaunchStateUid(uid)
    setPendingLaunch(null)
    setLaunchOperation(null)
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      launchGenerationRef.current += 1
      launchLockRef.current = false
    }
  }, [])

  useEffect(() => {
    launchGenerationRef.current += 1
    launchLockRef.current = false
  }, [uid])

  const isCurrentLaunch = useCallback((generation: number) => (
    mountedRef.current && launchGenerationRef.current === generation
  ), [])

  const beginLaunch = useCallback(async (
    target: TemplateLaunchTarget,
    replaceExisting: boolean,
  ) => {
    if (!uid || launchLockRef.current) return
    launchLockRef.current = true
    const generation = ++launchGenerationRef.current
    setLaunchOperation({
      target,
      replaceExisting,
      status: 'pending',
      errorMessage: null,
    })

    try {
      const workout = target.overrides
        ? await createPersistedTemplateWorkout(
            uid,
            target.template,
            target.dayIndex,
            replaceExisting,
            target.overrides,
          )
        : await createPersistedTemplateWorkout(
            uid,
            target.template,
            target.dayIndex,
            replaceExisting,
          )
      if (!isCurrentLaunch(generation)) return
      setLaunchOperation(null)
      hydrateFromDoc(workout)
      toast.success(`Szablon „${target.template.name}” gotowy do startu`)
      navigate('/workout/new')
    } catch (error) {
      if (!isCurrentLaunch(generation)) return
      if (!replaceExisting && error instanceof TemplateLaunchConflictError) {
        setLaunchOperation(null)
        setPendingLaunch(target)
        return
      }
      console.error('[useTemplateWorkoutLaunch] launch failed', error)
      setLaunchOperation({
        target,
        replaceExisting,
        status: 'error',
        errorMessage: 'Nie udało się uruchomić planu.',
      })
    } finally {
      if (launchGenerationRef.current === generation) {
        launchLockRef.current = false
      }
    }
  }, [hydrateFromDoc, isCurrentLaunch, navigate, uid])

  const requestTemplateLaunch = useCallback(async (
    template: WorkoutTemplate,
    dayIndex: number,
    requestKey: string,
    overrides?: TemplateExerciseOverrideMap,
  ) => {
    if (!uid || launchLockRef.current) return
    const target: TemplateLaunchTarget = overrides
      ? { template, dayIndex, requestKey, overrides }
      : { template, dayIndex, requestKey }
    if (hasActiveSessionWork(active)) {
      setLaunchOperation(null)
      setPendingLaunch(target)
      return
    }

    await beginLaunch(target, false)
  }, [active, beginLaunch, uid])

  const confirmTemplateLaunch = useCallback(async () => {
    if (!pendingLaunch || launchLockRef.current) return
    const target = pendingLaunch
    setPendingLaunch(null)
    await beginLaunch(target, true)
  }, [beginLaunch, pendingLaunch])

  const cancelTemplateLaunch = useCallback(() => {
    setPendingLaunch(null)
  }, [])

  const retryTemplateLaunch = useCallback(async () => {
    if (!launchOperation || launchOperation.status !== 'error') return
    await beginLaunch(launchOperation.target, launchOperation.replaceExisting)
  }, [beginLaunch, launchOperation])

  const dismissTemplateLaunchError = useCallback(() => {
    setLaunchOperation((current) => current?.status === 'error' ? null : current)
  }, [])

  const launchingTemplateId = launchOperation?.status === 'pending'
    ? launchOperation.target.template.id
    : null

  return {
    pendingLaunch,
    launchOperation,
    launchingTemplateId,
    requestTemplateLaunch,
    confirmTemplateLaunch,
    cancelTemplateLaunch,
    retryTemplateLaunch,
    dismissTemplateLaunchError,
  }
}
