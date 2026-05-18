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

export function normalizeWorkoutExercises(
  raw: unknown,
  options: NormalizeWorkoutExercisesOptions = {},
): ValidatedWorkoutExercise[] {
  if (!Array.isArray(raw)) {
    throw badRequest('Ćwiczenia treningu muszą być tablicą.')
  }
  if (!options.allowEmpty && raw.length === 0) {
    throw badRequest('Trening musi zawierać co najmniej jedno ćwiczenie.')
  }
  if (raw.length > MAX_WORKOUT_EXERCISES) {
    throw badRequest('Za dużo ćwiczeń w treningu.')
  }

  return raw.map((exercise) => normalizeWorkoutExercise(exercise))
}

export function validateWorkoutLabel(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw badRequest('Niepoprawna nazwa treningu.')

  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length > MAX_WORKOUT_LABEL_LENGTH) {
    throw badRequest('Nazwa treningu jest za długa.')
  }

  return trimmed
}

export function validateFirestoreDocumentId(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw badRequest(`Brak pola ${fieldName}.`)
  }

  const trimmed = value.trim()
  if (trimmed.includes('/') || trimmed.length > MAX_FIRESTORE_DOCUMENT_ID_LENGTH) {
    throw badRequest(`Niepoprawne pole ${fieldName}.`)
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
  const record = asRecord(raw, 'Niepoprawne ćwiczenie w treningu.')
  const exerciseId = normalizeExerciseId(record.exerciseId)
  const exerciseSource = normalizeExerciseSource(record.exerciseSource)
  const name = normalizeExerciseName(record.name)
  const sets = normalizeWorkoutSets(record.sets)

  return { exerciseId, exerciseSource, name, sets }
}

function normalizeWorkoutSets(raw: unknown): ValidatedWorkoutSet[] {
  if (!Array.isArray(raw)) {
    throw badRequest('Serie ćwiczenia muszą być tablicą.')
  }
  if (raw.length === 0) {
    throw badRequest('Ćwiczenie musi zawierać co najmniej jedną serię.')
  }
  if (raw.length > MAX_SETS_PER_EXERCISE) {
    throw badRequest('Za dużo serii w ćwiczeniu.')
  }

  return raw.map((set) => normalizeWorkoutSet(set))
}

function normalizeWorkoutSet(raw: unknown): ValidatedWorkoutSet {
  const record = asRecord(raw, 'Niepoprawna seria w ćwiczeniu.')
  const weight = normalizeNumber(record.weight ?? record.weightKg, 'Niepoprawny ciężar w serii.')
  const reps = normalizeNumber(record.reps, 'Niepoprawna liczba powtórzeń w serii.')

  if (weight < 0 || weight > MAX_SET_WEIGHT_KG) {
    throw badRequest('Niepoprawny ciężar w serii.')
  }
  if (reps <= 0 || reps > MAX_SET_REPS || !Number.isInteger(reps)) {
    throw badRequest('Niepoprawna liczba powtórzeń w serii.')
  }

  return { weight, reps }
}

function normalizeExerciseId(value: unknown): string {
  if (typeof value !== 'string') {
    throw badRequest('Niepoprawny identyfikator ćwiczenia.')
  }

  const trimmed = value.trim()
  if (
    !trimmed
    || trimmed.length > MAX_EXERCISE_ID_LENGTH
    || !EXERCISE_ID_PATTERN.test(trimmed)
  ) {
    throw badRequest('Niepoprawny identyfikator ćwiczenia.')
  }

  return trimmed
}

function normalizeExerciseSource(value: unknown): ExerciseSource {
  if (value === 'global' || value === 'user') return value
  throw badRequest('Niepoprawne źródło ćwiczenia.')
}

function normalizeExerciseName(value: unknown): string {
  if (typeof value !== 'string') {
    throw badRequest('Niepoprawna nazwa ćwiczenia.')
  }

  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MAX_EXERCISE_NAME_LENGTH) {
    throw badRequest('Niepoprawna nazwa ćwiczenia.')
  }

  return trimmed
}

function normalizeNumber(value: unknown, message: string): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) throw badRequest(message)
  return numeric
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
