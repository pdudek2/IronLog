import { useEffect } from 'react'

import { subscribeToActiveSession } from '../lib/activeSessionService'
import {
  decideRemoteSessionSync,
  isAuthoritativeActiveSessionSnapshot,
} from '../lib/activeSessionSyncPolicy'
import { useWorkoutStore } from '../store/workoutStore'

export function usePassiveActiveSessionSync(uid: string | undefined, enabled = true): void {
  const hydrateFromDoc = useWorkoutStore((state) => state.hydrateFromDoc)
  const clearWorkout = useWorkoutStore((state) => state.clearWorkout)

  useEffect(() => {
    if (!uid || !enabled) return

    return subscribeToActiveSession(uid, ({ session, fromCache, hasPendingWrites }) => {
      const decision = decideRemoteSessionSync({
        localSession: useWorkoutStore.getState().active,
        remoteSession: session,
        closureIntent: null,
        authoritative: isAuthoritativeActiveSessionSnapshot({ fromCache, hasPendingWrites }),
      })

      if (decision === 'accept_remote' && session) hydrateFromDoc(session)
      if (decision === 'clear_local') clearWorkout()
    })
  }, [clearWorkout, enabled, hydrateFromDoc, uid])
}
