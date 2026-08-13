interface StoredWorkoutDeleteRecovery {
  uid: string
  workoutId: string
}

export interface WorkoutDeleteRecovery {
  workoutId: string
}

const STORAGE_KEY_PREFIX = 'ironlog:workout-delete-recovery:'
// ponytail: stores one committed delete recovery per user because the UI allows one delete at a time.

export function writeWorkoutDeleteRecovery(
  uid: string,
  recovery: WorkoutDeleteRecovery,
  storage: Storage = getLocalStorage(),
): void {
  storage.setItem(storageKey(uid), JSON.stringify({
    uid,
    workoutId: recovery.workoutId,
  } satisfies StoredWorkoutDeleteRecovery))
}

export function readWorkoutDeleteRecovery(
  uid: string,
  storage: Storage = getLocalStorage(),
): WorkoutDeleteRecovery | null {
  const raw = storage.getItem(storageKey(uid))
  if (!raw) return null

  try {
    const stored = JSON.parse(raw) as unknown
    if (!isStoredWorkoutDeleteRecovery(stored) || stored.uid !== uid) return null
    return { workoutId: stored.workoutId }
  } catch {
    return null
  }
}

export function clearWorkoutDeleteRecovery(
  uid: string,
  storage: Storage = getLocalStorage(),
): void {
  storage.removeItem(storageKey(uid))
}

function storageKey(uid: string): string {
  return `${STORAGE_KEY_PREFIX}${uid}`
}

function getLocalStorage(): Storage {
  if (typeof localStorage === 'undefined') {
    throw new Error('Local storage is unavailable.')
  }
  return localStorage
}

function isStoredWorkoutDeleteRecovery(value: unknown): value is StoredWorkoutDeleteRecovery {
  return isRecord(value)
    && typeof value.uid === 'string'
    && value.uid.length > 0
    && typeof value.workoutId === 'string'
    && value.workoutId.length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
