import type { ActiveWorkout } from '../store/workoutStore'

export type WorkoutClosureIntent =
  | { action: 'finish'; session: ActiveWorkout; createdAt: number; sessionRevision?: string }
  | { action: 'discard'; session: ActiveWorkout; createdAt: number }

interface StoredWorkoutClosureIntent {
  uid: string
  intent: WorkoutClosureIntent
}

const STORAGE_KEY_PREFIX = 'ironlog:workout-closure:'

export function writeWorkoutClosureIntent(
  uid: string,
  intent: WorkoutClosureIntent,
  storage: Storage = getLocalStorage(),
): void {
  storage.setItem(storageKey(uid), JSON.stringify({ uid, intent } satisfies StoredWorkoutClosureIntent))
}

export function readWorkoutClosureIntent(
  uid: string,
  storage: Storage = getLocalStorage(),
): WorkoutClosureIntent | null {
  const raw = storage.getItem(storageKey(uid))
  if (!raw) return null

  try {
    const stored = JSON.parse(raw) as unknown
    if (!isRecord(stored) || stored.uid !== uid || !isWorkoutClosureIntent(stored.intent)) {
      return null
    }
    return stored.intent
  } catch {
    return null
  }
}

export function clearWorkoutClosureIntent(
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

function isWorkoutClosureIntent(value: unknown): value is WorkoutClosureIntent {
  if (!isRecord(value)) return false
  if (value.action !== 'finish' && value.action !== 'discard') return false
  if (value.action === 'finish') {
    if (value.sessionRevision !== undefined
      && (typeof value.sessionRevision !== 'string' || !value.sessionRevision)) return false
  } else if ('sessionRevision' in value) return false
  return typeof value.createdAt === 'number'
    && Number.isFinite(value.createdAt)
    && isActiveWorkout(value.session)
}

function isActiveWorkout(value: unknown): value is ActiveWorkout {
  if (!isRecord(value)) return false
  if (typeof value.sessionId !== 'string' || !value.sessionId) return false
  if (typeof value.startedAt !== 'number' || !Number.isFinite(value.startedAt)) return false
  if (value.label !== undefined && typeof value.label !== 'string') return false
  if (value.templateId !== undefined && value.templateId !== null && typeof value.templateId !== 'string') return false
  if (!Array.isArray(value.exercises)) return false

  return value.exercises.every((exercise) => {
    if (!isRecord(exercise)) return false
    if (typeof exercise.exerciseId !== 'string' || !exercise.exerciseId) return false
    if (exercise.exerciseSource !== 'global' && exercise.exerciseSource !== 'user') return false
    if (typeof exercise.name !== 'string' || !Array.isArray(exercise.sets)) return false
    return exercise.sets.every((set) => isRecord(set)
      && typeof set.weight === 'string'
      && typeof set.reps === 'string'
      && typeof set.done === 'boolean')
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
