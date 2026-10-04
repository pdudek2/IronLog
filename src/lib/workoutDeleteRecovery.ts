import type { WorkoutMutationGuard } from '../shared/workoutMutation'
interface StoredWorkoutDeleteRecovery {
  uid: string
  guard?: WorkoutMutationGuard
  workoutId: string
  status?: 'unknown' | 'cleanup_pending'
}

export interface WorkoutDeleteRecovery {
  guard?: WorkoutMutationGuard
  workoutId: string
  status?: 'unknown' | 'cleanup_pending'
}

const STORAGE_KEY_PREFIX = 'ironlog:workout-delete-recovery:'
// ponytail: stores one unresolved delete per user; use a queue if parallel deletes are needed.

export function writeWorkoutDeleteRecovery(
  uid: string,
  recovery: WorkoutDeleteRecovery,
  storage: Storage = getLocalStorage(),
): void {
  const existing = readWorkoutDeleteRecovery(uid, storage)
  if (existing && existing.workoutId !== recovery.workoutId) {
    throw new Error('Retry the previous workout deletion first.')
  }
  storage.setItem(storageKey(uid), JSON.stringify({
    uid,
    ...recovery,
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
    return { workoutId: stored.workoutId, ...(stored.guard ? { guard: stored.guard } : {}), ...(stored.status && { status: stored.status }) }
  } catch {
    return null
  }
}

export function clearWorkoutDeleteRecovery(
  uid: string,
  workoutId: string,
  storage: Storage = getLocalStorage(),
): void {
  if (readWorkoutDeleteRecovery(uid, storage)?.workoutId === workoutId) {
    storage.removeItem(storageKey(uid))
  }
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
    && (value.guard === undefined || (isRecord(value.guard) && typeof value.guard.operationId === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value.guard.operationId) && typeof value.guard.baseline === 'string' && /^[a-f0-9]{64}$/.test(value.guard.baseline)))
    && (value.status === undefined || value.status === 'unknown' || value.status === 'cleanup_pending')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
