import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'expo-router'

import { launchJournal } from './fileSessionJournal'
import {
  replaceActiveSession, claimNewActiveSession, createSessionRevision, isLaunchSessionClosed, readActiveFromServer,
  readTemplateBestSet, readTemplateFromServer,
} from './firebase'
import { useActiveRuntime, useAuthRuntime, useClosureRuntime } from './runtime'
import { WorkoutLaunchController, type LaunchState, type LaunchTarget } from './workoutLaunchController'
import { shouldOpenLaunchResult } from './workoutLaunch'
import { showDialog } from './dialog'

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
  const [confirmation, setConfirmation] = useState<{ uid: string; path: string; confirm: () => void } | null>(null)
  useEffect(() => { setConfirmation(null) }, [uid, pathname])
  const [owned, setOwned] = useState<{ uid: string; state: LaunchState }>({ uid, state: initial })
  const controller = useMemo(() => new WorkoutLaunchController(uid, launchJournal, {
    readActive: readActiveFromServer,
    isClosed: isLaunchSessionClosed,
    claim: claimNewActiveSession,
    replace: replaceActiveSession,
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

  const canReplace = () => {
    const value = current.current.active.state
    return current.current.user?.uid === uid && current.current.closure.closure.status === 'ready'
      && value.status === 'ready' && !value.stale && value.syncStatus === 'saved' && !!value.session.sessionRevision
  }
  const start = (target: LaunchTarget) => {
    initiatingPath.current = current.current.pathname
    const value = current.current.active.state
    if (target.kind !== 'template' || value.status !== 'ready') return controller.launch(target, canStart)
    if (!canReplace()) { showDialog('Waiting for sync', 'Reconnect and wait for your changes to be saved before replacing this workout.'); return Promise.resolve() }
    const replaces = { sessionId: value.session.sessionId, sessionRevision: value.session.sessionRevision! }
    const path = current.current.pathname
    setConfirmation({ uid, path, confirm: () => {
      setConfirmation(null)
      const fresh = current.current.active.state
      if (current.current.pathname !== path || !canReplace() || fresh.status !== 'ready' || fresh.session.sessionId !== replaces.sessionId || fresh.session.sessionRevision !== replaces.sessionRevision) {
        showDialog('Workout changed', 'Review your current workout before replacing it.'); return
      }
      void controller.launch({ ...target, replaces }, () => canReplace() && current.current.pathname === path)
    } })
    return Promise.resolve()
  }
  return {
    confirmation: confirmation?.uid === uid && confirmation.path === pathname ? confirmation : null,
    cancelReplacement: () => setConfirmation(null),
    state: owned.uid === uid ? owned.state : initial,
    start,
    retry: () => { initiatingPath.current = current.current.pathname; return controller.retry(() => canStart() || canReplace()) },
    dismissUnavailable: () => controller.dismissUnavailable(),
  }
}
