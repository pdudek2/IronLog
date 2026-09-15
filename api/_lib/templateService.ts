import type { Firestore } from 'firebase-admin/firestore'

import { adminDb } from './firebaseAdmin.js'
import { ApiError } from './errors.js'
import {
  MAX_SET_REPS,
  MAX_SET_WEIGHT_KG,
  MAX_WORKOUT_EXERCISES,
  validateExerciseId,
  validateExerciseName,
  validateExerciseSource,
  validateFirestoreDocumentId,
  type ExerciseSource,
} from './workoutValidation.js'

const MAX_TEMPLATE_NAME_LENGTH = 120
const MAX_DAY_NAME_LENGTH = 80
const MAX_TEMPLATE_DAYS = 14
const MAX_TEMPLATE_SETS = 20
const SAVE_FIELDS = new Set(['id', 'name', 'days'])
const REQUIRED_SAVE_FIELDS = ['name', 'days']
const DAY_FIELDS = new Set(['name', 'exercises'])
const EXERCISE_FIELDS = new Set([
  'exerciseId',
  'exerciseSource',
  'name',
  'sets',
  'targetReps',
  'targetWeight',
])

export interface ValidatedTemplateExercise {
  exerciseId: string
  exerciseSource: ExerciseSource
  name: string
  sets: number
  targetReps: number
  targetWeight: number
}

export interface ValidatedTemplateDay {
  name: string
  exercises: ValidatedTemplateExercise[]
}

export interface SaveTemplateRequest {
  id?: string
  name: string
  days: ValidatedTemplateDay[]
}

export interface SavedTemplate extends SaveTemplateRequest {
  id: string
  userId: string
  createdAt: number
  updatedAt: number
}

export function parseSaveTemplateRequest(raw: unknown): SaveTemplateRequest {
  const record = asRecord(raw, 'Invalid template payload.')
  assertFields(record, SAVE_FIELDS, REQUIRED_SAVE_FIELDS)

  const days = record.days
  if (!Array.isArray(days)) throw badRequest('Template days must be an array.')
  if (days.length === 0 || days.length > MAX_TEMPLATE_DAYS) {
    throw badRequest('A template must contain between 1 and 14 days.')
  }

  return {
    ...(record.id === undefined
      ? {}
      : { id: validateFirestoreDocumentId(record.id, 'id') }),
    name: validateName(record.name, 'template name', MAX_TEMPLATE_NAME_LENGTH),
    days: days.map(validateDay),
  }
}

export async function saveTemplateForUser(
  userId: string,
  input: SaveTemplateRequest,
  options: { db?: Firestore; now?: () => number } = {},
): Promise<SavedTemplate> {
  const db = options.db ?? adminDb
  const now = options.now?.() ?? Date.now()

  if (!input.id) {
    const ref = db.collection('templates').doc()
    const document = {
      userId,
      name: input.name,
      createdAt: now,
      updatedAt: now,
      days: input.days,
    }
    await ref.create(document)
    return { id: ref.id, ...document }
  }

  const ref = db.collection('templates').doc(input.id)
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists) throw new ApiError(404, 'Template not found.')

    const stored = snapshot.data()
    if (stored?.userId !== userId) throw new ApiError(403, 'Template belongs to another user.')

    transaction.update(ref, {
      name: input.name,
      days: input.days,
      updatedAt: now,
    })

    return {
      id: ref.id,
      userId,
      name: input.name,
      createdAt: typeof stored.createdAt === 'number' ? stored.createdAt : 0,
      updatedAt: now,
      days: input.days,
    }
  })
}

function validateDay(raw: unknown): ValidatedTemplateDay {
  const record = asRecord(raw, 'Invalid template day.')
  assertFields(record, DAY_FIELDS, ['name', 'exercises'])
  if (!Array.isArray(record.exercises)) throw badRequest('Day exercises must be an array.')
  if (record.exercises.length > MAX_WORKOUT_EXERCISES) {
    throw badRequest('Too many exercises in a template day.')
  }

  return {
    name: validateName(record.name, 'day name', MAX_DAY_NAME_LENGTH),
    exercises: record.exercises.map(validateExercise),
  }
}

function validateExercise(raw: unknown): ValidatedTemplateExercise {
  const record = asRecord(raw, 'Invalid template exercise.')
  assertFields(record, EXERCISE_FIELDS, [...EXERCISE_FIELDS])

  return {
    exerciseId: validateExerciseId(record.exerciseId),
    exerciseSource: validateExerciseSource(record.exerciseSource),
    name: validateExerciseName(record.name),
    sets: validateInteger(record.sets, 1, MAX_TEMPLATE_SETS, 'Invalid template sets.'),
    targetReps: validateInteger(record.targetReps, 0, MAX_SET_REPS, 'Invalid target reps.'),
    targetWeight: validateNumber(record.targetWeight, 0, MAX_SET_WEIGHT_KG, 'Invalid target weight.'),
  }
}

function validateName(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string') throw badRequest(`Invalid ${label}.`)
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) throw badRequest(`Invalid ${label}.`)
  return trimmed
}

function validateInteger(value: unknown, min: number, max: number, message: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw badRequest(message)
  }
  return value
}

function validateNumber(value: unknown, min: number, max: number, message: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw badRequest(message)
  }
  return value
}

function assertFields(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  required: readonly string[],
): void {
  for (const field of Object.keys(record)) {
    if (!allowed.has(field)) throw badRequest(`Unexpected field ${field}.`)
  }
  for (const field of required) {
    if (!(field in record)) throw badRequest(`Missing field ${field}.`)
  }
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw badRequest(message)
  return value as Record<string, unknown>
}

function badRequest(message: string): never {
  throw new ApiError(400, message)
}
