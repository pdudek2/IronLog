import { disableNetwork, doc, enableNetwork, getDocFromCache } from 'firebase/firestore'
import { auth, db } from '../../../src/lib/firebase'

export interface CachedActiveSessionWrite {
  exists: boolean
  hasPendingWrites: boolean
  sessionId: string | null
  reps: string | null
}

export interface LocalActiveSessionRecovery {
  sessionId: string | null
  reps: string | null
}

export function readLocalActiveSessionRecovery(): LocalActiveSessionRecovery {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Authenticated Firebase user is required to inspect active-session recovery.')
  const raw = window.localStorage.getItem(`ironlog-active-session-backup:${uid}`)
  if (!raw) return { sessionId: null, reps: null }
  const parsed = JSON.parse(raw) as { session?: { sessionId?: unknown; exercises?: unknown } }
  const exercises = Array.isArray(parsed.session?.exercises) ? parsed.session.exercises : []
  const firstExercise = exercises[0] as { sets?: unknown } | undefined
  const sets = Array.isArray(firstExercise?.sets) ? firstExercise.sets : []
  const firstSet = sets[0] as { reps?: unknown } | undefined
  return {
    sessionId: typeof parsed.session?.sessionId === 'string' ? parsed.session.sessionId : null,
    reps: typeof firstSet?.reps === 'string' ? firstSet.reps : null,
  }
}

export async function readCachedActiveSessionWrite(): Promise<CachedActiveSessionWrite> {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Authenticated Firebase user is required to inspect active-session cache metadata.')

  const snapshot = await getDocFromCache(doc(db, 'activeSessions', uid))
  const data = snapshot.data()
  const exercises = Array.isArray(data?.exercises) ? data.exercises : []
  const firstExercise = exercises[0] as { sets?: unknown } | undefined
  const sets = Array.isArray(firstExercise?.sets) ? firstExercise.sets : []
  const firstSet = sets[0] as { reps?: unknown } | undefined

  return {
    exists: snapshot.exists(),
    hasPendingWrites: snapshot.metadata.hasPendingWrites,
    sessionId: typeof data?.sessionId === 'string' ? data.sessionId : null,
    reps: typeof firstSet?.reps === 'string' ? firstSet.reps : null,
  }
}

export async function setFirestoreNetworkEnabled(enabled: boolean): Promise<void> {
  await (enabled ? enableNetwork(db) : disableNetwork(db))
}
