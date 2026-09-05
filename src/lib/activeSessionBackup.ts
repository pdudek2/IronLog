import type { ActiveWorkout } from '../store/workoutStore'
import { normalizeSessionId } from './sessionIdentity'

const BACKUP_PREFIX = 'ironlog-active-session-backup:'
const MAX_BACKUP_AGE_MS = 24 * 60 * 60 * 1000

export interface ActiveSessionBackupRecord {
  uid: string
  savedAt: number
  session: ActiveWorkout
  baseRevision: string | null
  unsynced: boolean
}

function storageKey(uid: string) {
  return `${BACKUP_PREFIX}${uid}`
}

export function readActiveSessionBackupRecord(uid: string): ActiveSessionBackupRecord | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(storageKey(uid))
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<ActiveSessionBackupRecord>
    if (parsed.uid !== uid) return null
    if (typeof parsed.savedAt !== 'number') return null
    if (Date.now() - parsed.savedAt > MAX_BACKUP_AGE_MS) {
      window.localStorage.removeItem(storageKey(uid))
      return null
    }

    const session = parsed.session
    if (!session || typeof session !== 'object') return null
    const startedAt = typeof session.startedAt === 'number' ? session.startedAt : Date.now()
    return {
      uid,
      savedAt: parsed.savedAt,
      baseRevision: typeof parsed.baseRevision === 'string' ? parsed.baseRevision : null,
      unsynced: parsed.unsynced === true,
      session: {
        ...session,
        sessionId: normalizeSessionId(session.sessionId, uid, startedAt),
        startedAt,
      } as ActiveWorkout,
    }
  } catch {
    return null
  }
}

export function readActiveSessionBackup(uid: string): ActiveWorkout | null {
  return readActiveSessionBackupRecord(uid)?.session ?? null
}

export function writeActiveSessionBackup(
  uid: string,
  session: ActiveWorkout,
  sync: { baseRevision: string | null; unsynced: boolean } = { baseRevision: null, unsynced: false },
): void {
  if (typeof window === 'undefined') return

  try {
    const payload: ActiveSessionBackupRecord = {
      uid,
      savedAt: Date.now(),
      session,
      ...sync,
    }
    window.localStorage.setItem(storageKey(uid), JSON.stringify(payload))
  } catch {
    // Ignore localStorage write failures. Firestore remains canonical.
  }
}

export function clearActiveSessionBackup(uid: string): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.removeItem(storageKey(uid))
  } catch {
    // Ignore localStorage delete failures.
  }
}
