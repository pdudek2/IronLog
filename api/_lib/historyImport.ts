import { createHash } from 'node:crypto'
import type { Firestore } from 'firebase-admin/firestore'

import { ApiError } from './errors.js'
import { adminDb } from './firebaseAdmin.js'
import { materializeWorkoutForUser } from './workoutProjection.js'
import { INITIAL_PROJECTION_REVISION, projectionExerciseKeysFromWorkout } from './workoutProjectionFence.js'
import { normalizeWorkoutExercises, validateWorkoutLabel, type ValidatedWorkoutExercise } from './workoutValidation.js'

// Workouts from a history file (PRODUCT.md, „Specyfikacja punktu 4B”), written like finished ones: the workout, its
// closure tombstone, then the projection into exerciseSessions and records.
export const MAX_IMPORT_WORKOUTS = 10
const MAX_KEY_LENGTH = 200
const EARLIEST_STARTED_AT = Date.UTC(2000, 0, 1)
// The client sends local dates up to tomorrow, so a late time tomorrow is almost two days ahead.
const CLOCK_SLACK_MS = 48 * 60 * 60_000
const REQUEST_FIELDS = new Set(['importId', 'workouts'])
const WORKOUT_FIELDS = new Set(['key', 'startedAt', 'label', 'exercises'])

export interface ImportWorkoutsRequest {
  importId: string
  workouts: { key: string; startedAt: number; label: string | null; exercises: ValidatedWorkoutExercise[] }[]
}
export type ImportWorkoutStatus = 'created' | 'exists' | 'projection_pending'
export interface ImportWorkoutsResult { results: { key: string; workoutId: string; status: ImportWorkoutStatus }[] }

const badRequest = (message: string): never => { throw new ApiError(400, message) }

function record(value: unknown, message: string, fields: Set<string>): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) badRequest(message)
  const result = value as Record<string, unknown>
  for (const field of Object.keys(result)) if (!fields.has(field)) badRequest(`Unexpected field ${field}.`)
  return result
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) badRequest(`Invalid field ${field}.`)
  return (value as string).trim()
}

export function parseImportWorkoutsRequest(raw: unknown, now: number): ImportWorkoutsRequest {
  const body = record(raw, 'Invalid import payload.', REQUEST_FIELDS)
  const importId = text(body.importId, 'importId', 80)
  if (!Array.isArray(body.workouts) || !body.workouts.length) badRequest('An import must contain at least one workout.')
  const list = body.workouts as unknown[]
  if (list.length > MAX_IMPORT_WORKOUTS) badRequest(`Import at most ${MAX_IMPORT_WORKOUTS} workouts at a time.`)
  const workouts = list.map((raw) => {
    const workout = record(raw, 'Invalid imported workout.', WORKOUT_FIELDS)
    const startedAt = workout.startedAt
    if (typeof startedAt !== 'number' || !Number.isInteger(startedAt) || startedAt < EARLIEST_STARTED_AT || startedAt > now + CLOCK_SLACK_MS) {
      badRequest('Invalid workout date.')
    }
    // History has no set times: a set time would let a file claim a duration it never recorded.
    const exercises = normalizeWorkoutExercises(workout.exercises).map((exercise) => ({
      ...exercise, sets: exercise.sets.map(({ weight, reps }) => ({ weight, reps })),
    }))
    return { key: text(workout.key, 'key', MAX_KEY_LENGTH), startedAt: startedAt as number, label: validateWorkoutLabel(workout.label), exercises }
  })
  if (new Set(workouts.map((workout) => workout.key)).size !== workouts.length) badRequest('Each workout of an import needs its own key.')
  return { importId, workouts }
}

// One import run keeps its ids, so a retry adds nothing; a new run after Undo gets new ones.
export function importedWorkoutId(userId: string, importId: string, key: string): string {
  return `import_${createHash('sha256').update(`${userId}\n${importId}\n${key}`).digest('hex').slice(0, 40)}`
}

type Materialize = (userId: string, workoutId: string, expectedRevision?: number) => Promise<void>
export interface HistoryImportOptions { db?: Firestore; now?: () => number; materialize?: Materialize }

export async function importWorkoutsForUser(userId: string, request: ImportWorkoutsRequest, options: HistoryImportOptions = {}): Promise<ImportWorkoutsResult> {
  const database = options.db ?? adminDb
  const now = (options.now ?? Date.now)()
  const materialize = options.materialize
    ?? ((ownerId: string, workoutId: string, expectedRevision?: number) => materializeWorkoutForUser(ownerId, workoutId, { db: database, expectedRevision }))
  const results: ImportWorkoutsResult['results'] = []

  for (const workout of request.workouts) {
    const workoutId = importedWorkoutId(userId, request.importId, workout.key)
    const workoutRef = database.collection('workouts').doc(workoutId)
    const tombstoneRef = database.collection('closedSessions').doc(workoutId)
    const outcome = await database.runTransaction(async (transaction) => {
      const [stored, tombstone] = await transaction.getAll(workoutRef, tombstoneRef)
      if (stored.exists || tombstone.exists) {
        const owner = (stored.data() ?? tombstone.data())?.userId
        if (owner !== userId) throw new ApiError(409, 'This workout id belongs to another account.', { code: 'resource_owner_mismatch' })
        return { created: false, materialized: stored.data()?.materialized === true || !stored.exists }
      }
      transaction.create(workoutRef, {
        sessionId: workoutId,
        templateId: null,
        planDayId: null,
        startedAt: workout.startedAt,
        finishedAt: workout.startedAt,
        label: workout.label,
        exercises: workout.exercises,
        userId,
        materialized: false,
        imported: { source: 'csv', importId: request.importId, at: now },
      })
      transaction.create(tombstoneRef, {
        userId,
        sessionId: workoutId,
        outcome: 'finished',
        workoutId,
        closedAt: now,
        projectionState: 'pending',
        projectionRevision: INITIAL_PROJECTION_REVISION,
        projectionExerciseKeys: projectionExerciseKeysFromWorkout(workout.exercises),
      })
      return { created: true, materialized: false }
    })

    // A retry after an interrupted run finishes the projection the first attempt left pending.
    let status: ImportWorkoutStatus = outcome.created ? 'created' : 'exists'
    if (!outcome.materialized) {
      try {
        await materialize(userId, workoutId, outcome.created ? INITIAL_PROJECTION_REVISION : undefined)
      } catch (error) {
        console.error('[import-workouts] projection left pending', { workoutId, error })
        status = 'projection_pending'
      }
    }
    results.push({ key: workout.key, workoutId, status })
  }
  return { results }
}
