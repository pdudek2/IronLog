import { useEffect, useMemo, useState } from 'react'

import {
  ActiveSessionController,
  type ActiveSessionState,
} from './activeSessionController'
import { readUnits, subscribeToActiveSession } from './firebase'

const initialState: ActiveSessionState = { status: 'loading', session: null, units: 'kg' }

export function useActiveSession(uid: string | null) {
  const [state, setState] = useState<ActiveSessionState>(initialState)
  const controller = useMemo(
    () => new ActiveSessionController(subscribeToActiveSession, readUnits, setState),
    [],
  )

  useEffect(() => {
    if (uid) controller.start(uid)
    else controller.clear()
    return () => controller.clear()
  }, [controller, uid])

  useEffect(() => () => controller.dispose(), [controller])

  return { state, retry: () => controller.retry() }
}
