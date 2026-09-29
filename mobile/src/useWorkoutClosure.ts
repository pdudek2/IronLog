import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'expo-router'

import { closureIntentStorage } from './fileSessionJournal'
import { apiBaseUrl, currentIdToken } from './firebase'
import type { ActiveWorkout } from './session'
import {
  isClosureLocked,
  requestClosure,
  WorkoutClosureController,
  type ClosureAction,
  type ClosureResult,
  type ClosureState,
} from './workoutClosure'

export type { ClosureState } from './workoutClosure'

const initialState: ClosureState = { status: 'loading' }

export function useWorkoutClosure(uid: string) {
  const pathname = usePathname()
  const router = useRouter()
  const [owned, setOwned] = useState<{ uid: string | null; state: ClosureState; completed: ClosureResult | null }>({
    uid: null,
    state: initialState,
    completed: null,
  })
  const controller = useMemo(() => new WorkoutClosureController(
    uid,
    closureIntentStorage,
    (intent) => requestClosure(intent, { apiBaseUrl, getIdToken: () => currentIdToken(uid), fetch }),
    (state, completed) => setOwned({ uid, state, completed }),
  ), [uid])

  useEffect(() => {
    void controller.start()
    return () => controller.dispose()
  }, [controller])

  const current = owned.uid === uid ? owned : { uid, state: initialState, completed: null }
  useEffect(() => {
    if (!current.completed) return
    const workoutId = controller.consumeFinishedNavigation(pathname === '/')
    if (workoutId) router.push({ pathname: '/workout/[workoutId]', params: { workoutId } })
  }, [controller, current.completed, pathname, router])

  return {
    closure: current.state,
    completed: current.completed,
    locked: isClosureLocked(current.state),
    canEdit: () => controller.canEdit(),
    start: (action: ClosureAction, session: ActiveWorkout) => controller.startClosure(action, session),
    retry: () => controller.retry(),
    dismiss: () => controller.dismiss(),
  }
}
