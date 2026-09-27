import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'expo-router'

import { launchJournal } from './fileSessionJournal'
import {
  claimNewActiveSession, createSessionRevision, isLaunchSessionClosed, readActiveFromServer,
  readTemplateBestSet, readTemplateFromServer,
} from './firebase'
import { useActiveRuntime, useAuthRuntime, useClosureRuntime } from './runtime'
import { WorkoutLaunchController, type LaunchState, type LaunchTarget } from './workoutLaunchController'
import { shouldOpenLaunchResult } from './workoutLaunch'

const initial: LaunchState = { status: 'loading' }

export function useWorkoutLaunch(uid: string) {
  const { user } = useAuthRuntime()
  const active = useActiveRuntime()
  const closure = useClosureRuntime()
  const router = useRouter()
  const pathname = usePathname()
  const initiatingPath = useRef(pathname)
  const current = useRef({ user, active, closure, router, pathname })
  current.current = { user, active, closure, router, pathname }
  const [owned, setOwned] = useState<{ uid: string; state: LaunchState }>({ uid, state: initial })
  const controller = useMemo(() => new WorkoutLaunchController(uid, launchJournal, {
    readActive: readActiveFromServer,
    isClosed: isLaunchSessionClosed,
    claim: claimNewActiveSession,
    readTemplate: readTemplateFromServer,
    readBest: readTemplateBestSet,
    createId: createSessionRevision,
    now: Date.now,
  }, (state) => setOwned({ uid, state }), () => {
    current.current.active.retry()
    if (shouldOpenLaunchResult(initiatingPath.current, current.current.pathname)) current.current.router.dismissTo('/')
  }), [uid])

  useEffect(() => {
    initiatingPath.current = current.current.pathname
    void controller.load()
    return () => controller.dispose()
  }, [controller])

  useEffect(() => {
    if (active.state.status === 'ready' && !active.state.stale) void controller.observeActive(active.state.session)
    else if (active.state.status === 'empty') void controller.recover()
  }, [controller, active.state])

  const canStart = () => current.current.user?.uid === uid
    && current.current.active.state.status === 'empty'
    && current.current.closure.closure.status === 'ready'

  return {
    state: owned.uid === uid ? owned.state : initial,
    start: (target: LaunchTarget) => { initiatingPath.current = current.current.pathname; return controller.launch(target, canStart) },
    retry: () => { initiatingPath.current = current.current.pathname; return controller.retry(canStart) },
    dismissUnavailable: () => controller.dismissUnavailable(),
  }
}
