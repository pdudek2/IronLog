import { createHash } from 'node:crypto'

import { ApiError } from './errors.js'

export type ExerciseSource = 'global' | 'user'

export interface ValidatedWorkoutSet {
  weight: number
  reps: number
}

export interface ValidatedWorkoutExercise {
  exerciseId: string
  exerciseSource: ExerciseSource
  name: string
  sets: ValidatedWorkoutSet[]
}

export interface FinalizeWorkoutInput {
  sessionId: string
  templateId: string | null
  startedAt: number
  finishedAt: number
  label: string | null
  exercises: ValidatedWorkoutExercise[]
}

interface NormalizeWorkoutExercisesOptions {
  allowEmpty?: boolean
}

export const MAX_WORKOUT_EXERCISES = 20
export const MAX_SETS_PER_EXERCISE = 20
export const MAX_WORKOUT_LABEL_LENGTH = 120
export const MAX_EXERCISE_NAME_LENGTH = 120
export const MAX_EXERCISE_ID_LENGTH = 160
export const MAX_FIRESTORE_DOCUMENT_ID_LENGTH = 160
export const MAX_SET_WEIGHT_KG = 2_000
export const MAX_SET_REPS = 1_000

const EXERCISE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/
const COMPATIBILITY_FINALIZE_FIELDS = new Set([
  'sessionId',
  'sessionRevision',
  'templateId',
  'startedAt',
  'finishedAt',
  'label',
  'exercises',
])
const STRICT_FINALIZE_FIELDS = new Set(['sessionId', 'sessionRevision'])

export interface FinalizeWorkoutRequest {
  sessionId: string
  sessionRevision?: string
}

interface ParseFinalizeWorkoutRequestOptions {
  requireRevision?: boolean
  allowLegacyFields?: boolean
}

export function parseFinalizeWorkoutRequest(
  raw: unknown,
  options: ParseFinalizeWorkoutRequestOptions = {},
): FinalizeWorkoutRequest {
  const record = asRecord(raw, 'Invalid workout payload.')
  const allowedFields = options.allowLegacyFields === false
    ? STRICT_FINALIZE_FIELDS
    : COMPATIBILITY_FINALIZE_FIELDS
  for (const field of Object.keys(record)) {
    if (!allowedFields.has(field)) throw badRequest(`Unexpected field ${field}.`)
  }

  const sessionId = validateFirestoreDocumentId(record.sessionId, 'sessionId')
  if (record.sessionRevision === undefined || record.sessionRevision === null) {
    if (options.requireRevision) throw badRequest('Missing sessionRevision field.')
    return { sessionId }
  }

  return {
    sessionId,
    sessionRevision: validateFirestoreDocumentId(record.sessionRevision, 'sessionRevision'),
  }
}

export function buildFinishedWorkoutFromActiveSession(
  raw: unknown,
  finishedAt: number,
): FinalizeWorkoutInput {
  const record = asRecord(raw, 'Invalid active session.')
  const startedAt = normalizeTimestamp(record.startedAt, 'startedAt')
  const normalizedFinishedAt = normalizeTimestamp(finishedAt, 'finishedAt')
  if (normalizedFinishedAt < startedAt) {
    throw badRequest('Finish time cannot be before start time.')
  }
  const exercises = normalizeActiveWorkoutExercises(record.exercises)

  return {
    sessionId: validateFirestoreDocumentId(record.sessionId, 'sessionId'),
    templateId: record.templateId === undefined || record.templateId === null
      ? null
      : validateFirestoreDocumentId(record.templateId, 'templateId'),
    startedAt,
    finishedAt: normalizedFinishedAt,
    label: validateWorkoutLabel(record.label),
    exercises,
  }
}

export function normalizeWorkoutExercises(
  raw: unknown,
  options: NormalizeWorkoutExercisesOptions = {},
): ValidatedWorkoutExercise[] {
  if (!Array.isArray(raw)) {
    throw badRequest('Workout exercises must be an array.')
  }
  if (!options.allowEmpty && raw.length === 0) {
    throw badRequest('A workout must contain at least one exercise.')
  }
  if (raw.length > MAX_WORKOUT_EXERCISES) {
    throw badRequest('Too many exercises in the workout.')
  }

  return raw.map((exercise) => normalizeWorkoutExercise(exercise))
}

function normalizeActiveWorkoutExercises(raw: unknown): ValidatedWorkoutExercise[] {
  if (!Array.isArray(raw)) throw badRequest('Workout exercises must be an array.')

  const completed = raw.map((exercise) => {
    const record = asRecord(exercise, 'Invalid workout exercise.')
    const sets = Array.isArray(record.sets)
      ? record.sets.flatMap((set) => {
        const setRecord = asRecord(set, 'Invalid workout set.')
        return setRecord.done === true
          ? [{ weight: setRecord.weight, reps: setRecord.reps }]
          : []
      })
      : []

    return {
      exerciseId: record.exerciseId,
      exerciseSource: record.exerciseSource,
      name: record.name,
      sets,
    }
  }).filter((exercise) => exercise.sets.length > 0)

  return normalizeWorkoutExercises(completed)
}

export function validateWorkoutLabel(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw badRequest('Invalid workout name.')

  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length > MAX_WORKOUT_LABEL_LENGTH) {
    throw badRequest('Workout name is too long.')
  }

  return trimmed
}

export function validateFirestoreDocumentId(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw badRequest(`Missing field ${fieldName}.`)
  }

  const trimmed = value.trim()
  if (trimmed.includes('/') || trimmed.length > MAX_FIRESTORE_DOCUMENT_ID_LENGTH) {
    throw badRequest(`Invalid field ${fieldName}.`)
  }

  return trimmed
}

export function buildExerciseSessionDocumentId(
  workoutId: string,
  exerciseSource: ExerciseSource,
  exerciseId: string,
  orderIndex: number,
): string {
  const hash = createHash('sha256')
    .update(`${exerciseSource}:${exerciseId}:${orderIndex}`)
    .digest('hex')
    .slice(0, 24)

  return `${workoutId}_${exerciseSource}_${orderIndex}_${hash}`
}

function normalizeWorkoutExercise(raw: unknown): ValidatedWorkoutExercise {
  const record = asRecord(raw, 'Invalid workout exercise.')
  const exerciseId = normalizeExerciseId(record.exerciseId)
  const exerciseSource = normalizeExerciseSource(record.exerciseSource)
  const name = normalizeExerciseName(record.name)
  const sets = normalizeWorkoutSets(record.sets)

  return { exerciseId, exerciseSource, name, sets }
}

function normalizeWorkoutSets(raw: unknown): ValidatedWorkoutSet[] {
  if (!Array.isArray(raw)) {
    throw badRequest('Exercise sets must be an array.')
  }
  if (raw.length === 0) {
    throw badRequest('An exercise must contain at least one set.')
  }
  if (raw.length > MAX_SETS_PER_EXERCISE) {
    throw badRequest('Too many sets in the exercise.')
  }

  return raw.map((set) => normalizeWorkoutSet(set))
}

function normalizeWorkoutSet(raw: unknown): ValidatedWorkoutSet {
  const record = asRecord(raw, 'Invalid exercise set.')
  const weight = normalizeNumber(record.weight ?? record.weightKg, 'Invalid set weight.')
  const reps = normalizeNumber(record.reps, 'Invalid set reps.')

  if (weight < 0 || weight > MAX_SET_WEIGHT_KG) {
    throw badRequest('Invalid set weight.')
  }
  if (reps <= 0 || reps > MAX_SET_REPS || !Number.isInteger(reps)) {
    throw badRequest('Invalid set reps.')
  }

  return { weight, reps }
}

function normalizeExerciseId(value: unknown): string {
  if (typeof value !== 'string') {
    throw badRequest('Invalid exercise ID.')
  }

  const trimmed = value.trim()
  if (
    !trimmed
    || trimmed.length > MAX_EXERCISE_ID_LENGTH
    || !EXERCISE_ID_PATTERN.test(trimmed)
  ) {
    throw badRequest('Invalid exercise ID.')
  }

  return trimmed
}

function normalizeExerciseSource(value: unknown): ExerciseSource {
  if (value === 'global' || value === 'user') return value
  throw badRequest('Invalid exercise source.')
}

function normalizeExerciseName(value: unknown): string {
  if (typeof value !== 'string') {
    throw badRequest('Invalid exercise name.')
  }

  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MAX_EXERCISE_NAME_LENGTH) {
    throw badRequest('Invalid exercise name.')
  }

  return trimmed
}

function normalizeNumber(value: unknown, message: string): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) throw badRequest(message)
  return numeric
}

function normalizeTimestamp(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw badRequest(`Invalid field ${fieldName}.`)
  }
  return value
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw badRequest(message)
  }
  return value as Record<string, unknown>
}

function badRequest(message: string): never {
  throw new ApiError(400, message)
}
