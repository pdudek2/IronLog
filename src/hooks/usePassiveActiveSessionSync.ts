import { useEffect } from 'react'

import { subscribeToActiveSession } from '../lib/activeSessionService'
import {
  clearActiveSessionBackup,
  readActiveSessionBackupRecord,
  writeActiveSessionBackup,
} from '../lib/activeSessionBackup'
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

    return subscribeToActiveSession(uid, ({ session, sessionRevision, fromCache, hasPendingWrites }) => {
      const authoritative = isAuthoritativeActiveSessionSnapshot({ fromCache, hasPendingWrites })
      const decision = decideRemoteSessionSync({
        localSession: useWorkoutStore.getState().active,
        remoteSession: session,
        closureIntent: null,
        authoritative,
      })
      const backup = readActiveSessionBackupRecord(uid)
      const localEdits = backup?.unsynced === true && backup.session.sessionId === session?.sessionId
      // The workout screen resumes from this copy, so a newer server version of the same session replaces it
      // together with its revision, unless this device still holds edits the server has not saved.
      if (session && (decision === 'accept_remote' || (decision === 'keep_local' && authoritative && !localEdits))) {
        hydrateFromDoc(session)
        writeActiveSessionBackup(uid, session, { baseRevision: sessionRevision ?? null, unsynced: false })
      }
      if (decision === 'clear_local') {
        clearActiveSessionBackup(uid)
        clearWorkout()
      }
    })
  }, [clearWorkout, enabled, hydrateFromDoc, uid])
}
