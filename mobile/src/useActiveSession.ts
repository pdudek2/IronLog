import { useEffect, useMemo, useState } from 'react'

import {
  ActiveSessionController,
  stateForAccount,
  type ActiveSessionState,
} from './activeSessionController'
import { readUnits, subscribeToActiveSession } from './firebase'

const initialState: ActiveSessionState = { status: 'loading', session: null, units: 'kg' }

export function useActiveSession(uid: string | null) {
  const [scopedState, setScopedState] = useState<{ uid: string | null; state: ActiveSessionState }>({
    uid: null,
    state: initialState,
  })
  const controller = useMemo(
    () => new ActiveSessionController(
      subscribeToActiveSession,
      readUnits,
      (state) => setScopedState({ uid, state }),
    ),
    [uid],
  )

  useEffect(() => {
    if (uid) controller.start(uid)
    else controller.clear()
    return () => controller.dispose()
  }, [controller, uid])

  return { state: stateForAccount(uid, scopedState.uid, scopedState.state), retry: () => controller.retry() }
}
