import { deriveLegacySessionId } from '../../src/shared/sessionIdentity'
import { formatCompactVolume, kgStringToDisplayWeight } from '../../src/shared/weightUnits'

export type Units = 'kg' | 'lbs'
export type ExerciseSource = 'global' | 'user'

export interface WorkoutSet {
  weight: string
  reps: string
  done: boolean
}

export interface WorkoutExercise {
  exerciseId: string
  exerciseSource: ExerciseSource
  name: string
  sets: WorkoutSet[]
}

export interface ActiveWorkout {
  sessionId: string
  sessionRevision: string | null
  startedAt: number
  templateId: string | null
  label?: string
  exercises: WorkoutExercise[]
}

export class SessionDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SessionDataError'
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SessionDataError(`${path} must be an object.`)
  }
  return value as Record<string, unknown>
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new SessionDataError(`${path} must be a non-empty string.`)
  }
  return value.trim()
}

function storedNumber(value: unknown, path: string): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  throw new SessionDataError(`${path} must be a string or finite number.`)
}

export function parseSessionDocument(uid: string, value: unknown): ActiveWorkout {
  const data = record(value, 'active session')
  if (data.userId !== uid) throw new SessionDataError('Session owner does not match the signed-in account.')
  if (typeof data.startedAt !== 'number' || !Number.isFinite(data.startedAt) || data.startedAt < 0) {
    throw new SessionDataError('startedAt must be a valid millisecond timestamp.')
  }
  if (!Array.isArray(data.exercises)) throw new SessionDataError('exercises must be an array.')

  const sessionId = data.sessionId === undefined || data.sessionId === null || data.sessionId === ''
    ? deriveLegacySessionId(uid, data.startedAt)
    : requiredString(data.sessionId, 'sessionId')
  const sessionRevision = data.sessionRevision === undefined || data.sessionRevision === null
    ? null
    : requiredString(data.sessionRevision, 'sessionRevision')
  const templateId = data.templateId === undefined || data.templateId === null || data.templateId === ''
    ? null
    : requiredString(data.templateId, 'templateId')
  const label = data.label === undefined || data.label === null || data.label === ''
    ? undefined
    : requiredString(data.label, 'label')

  return {
    sessionId,
    sessionRevision,
    startedAt: data.startedAt,
    templateId,
    label,
    exercises: data.exercises.map((value, exerciseIndex) => {
      const exercise = record(value, `exercises[${exerciseIndex}]`)
      const source = exercise.exerciseSource === undefined
        ? 'global'
        : exercise.exerciseSource
      if (source !== 'global' && source !== 'user') {
        throw new SessionDataError(`exercises[${exerciseIndex}].exerciseSource is invalid.`)
      }
      if (!Array.isArray(exercise.sets)) {
        throw new SessionDataError(`exercises[${exerciseIndex}].sets must be an array.`)
      }
      return {
        exerciseId: requiredString(exercise.exerciseId, `exercises[${exerciseIndex}].exerciseId`),
        exerciseSource: source,
        name: requiredString(exercise.name, `exercises[${exerciseIndex}].name`),
        sets: exercise.sets.map((value, setIndex) => {
          const set = record(value, `exercises[${exerciseIndex}].sets[${setIndex}]`)
          if (set.done !== undefined && typeof set.done !== 'boolean') {
            throw new SessionDataError(`exercises[${exerciseIndex}].sets[${setIndex}].done must be boolean.`)
          }
          return {
            weight: storedNumber(set.weight, `exercises[${exerciseIndex}].sets[${setIndex}].weight`),
            reps: storedNumber(set.reps, `exercises[${exerciseIndex}].sets[${setIndex}].reps`),
            done: set.done === true,
          }
        }),
      }
    }),
  }
}

export function formatSet(set: WorkoutSet, units: Units): string {
  const weight = kgStringToDisplayWeight(set.weight, units)
  const weightLabel = weight ? `${weight} ${units}` : `— ${units}`
  const repsLabel = set.reps ? `${set.reps} reps` : '— reps'
  return `${weightLabel} × ${repsLabel}`
}

export function summarizeExercise(exercise: WorkoutExercise, units: Units) {
  const completedSets = exercise.sets.filter((set) => set.done && Number.parseInt(set.reps, 10) > 0)
  const volumeKg = completedSets.reduce((total, set) => (
    total + (Number.parseFloat(set.weight) || 0) * (Number.parseInt(set.reps, 10) || 0)
  ), 0)
  const maxKg = completedSets.reduce((max, set) => Math.max(max, Number.parseFloat(set.weight) || 0), 0)

  return {
    completed: completedSets.length,
    total: exercise.sets.length,
    volume: formatCompactVolume(volumeKg, units),
    max: maxKg ? `${kgStringToDisplayWeight(String(maxKg), units)} ${units}` : '—',
  }
}

export function formatElapsed(startedAt: number, now = Date.now()): string {
  const total = Math.max(0, Math.floor((now - startedAt) / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
