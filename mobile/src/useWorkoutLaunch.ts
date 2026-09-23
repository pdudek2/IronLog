import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'expo-router'

import { launchJournal } from './fileSessionJournal'
import {
  claimNewActiveSession, createSessionRevision, readActiveFromServer,
  readTemplateBestSet, readTemplateFromServer,
} from './firebase'
import { useActiveRuntime, useAuthRuntime, useClosureRuntime } from './runtime'
import { WorkoutLaunchController, type LaunchState, type LaunchTarget } from './workoutLaunchController'

const initial: LaunchState = { status: 'loading' }

export function useWorkoutLaunch(uid: string) {
  const { user } = useAuthRuntime()
  const active = useActiveRuntime()
  const closure = useClosureRuntime()
  const router = useRouter()
  const current = useRef({ user, active, closure, router })
  current.current = { user, active, closure, router }
  const [owned, setOwned] = useState<{ uid: string; state: LaunchState }>({ uid, state: initial })
  const controller = useMemo(() => new WorkoutLaunchController(uid, launchJournal, {
    readActive: readActiveFromServer,
    claim: claimNewActiveSession,
    readTemplate: readTemplateFromServer,
    readBest: readTemplateBestSet,
    createId: createSessionRevision,
    now: Date.now,
  }, (state) => setOwned({ uid, state }), () => {
    current.current.active.retry()
    current.current.router.dismissTo('/')
  }), [uid])

  useEffect(() => {
    void controller.load()
    return () => controller.dispose()
  }, [controller])

  const canStart = () => current.current.user?.uid === uid
    && current.current.active.state.status === 'empty'
    && current.current.closure.closure.status === 'ready'

  return {
    state: owned.uid === uid ? owned.state : initial,
    start: (target: LaunchTarget) => controller.launch(target, canStart),
    retry: () => controller.retry(canStart),
    dismissUnavailable: () => controller.dismissUnavailable(),
  }
}
