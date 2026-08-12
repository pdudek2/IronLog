import type { DocumentData, DocumentSnapshot, Firestore } from 'firebase-admin/firestore'

import { ApiError } from './errors.js'
import { adminDb } from './firebaseAdmin.js'
import { materializeWorkoutForUser } from './workoutProjection.js'
import {
  INITIAL_PROJECTION_REVISION,
  parseProjectionFence,
  projectionExerciseKeysFromWorkout,
} from './workoutProjectionFence.js'
import {
  buildFinishedWorkoutFromActiveSession,
  validateFirestoreDocumentId,
  type FinalizeWorkoutRequest,
} from './workoutValidation.js'
import { deriveLegacySessionId } from '../../src/lib/sessionIdentity.js'
import { getCappedWorkoutFinishedAt } from '../../src/lib/sessionDuration.js'

export type { FinalizeWorkoutRequest } from './workoutValidation.js'

export type FinalizeWorkoutStatus = 'materialized' | 'projection_pending'
export type ClosedSessionOutcome = 'finished' | 'discarded'

type MaterializeWorkout = (
  userId: string,
  workoutId: string,
  expectedRevision?: number,
) => Promise<void>

export interface WorkoutClosureOptions {
  db?: Firestore
  now?: () => number
  materialize?: MaterializeWorkout
}

interface ClosureTransactionResult {
  materialized: boolean
  projectionRevision?: number
}

export async function finalizeWorkoutForUser(
  userId: string,
  input: FinalizeWorkoutRequest,
  options: WorkoutClosureOptions = {},
): Promise<{ workoutId: string; status: FinalizeWorkoutStatus }> {
  const database = options.db ?? adminDb
  const workoutId = validateFirestoreDocumentId(input.sessionId, 'sessionId')
  const closedAt = (options.now ?? Date.now)()
  const workoutRef = database.collection('workouts').doc(workoutId)
  const tombstoneRef = database.collection('closedSessions').doc(workoutId)
  const activeRef = database.collection('activeSessions').doc(userId)

  const transactionResult = await database.runTransaction(async (transaction) => {
    const [workout, tombstone, active] = await transaction.getAll(
      workoutRef,
      tombstoneRef,
      activeRef,
    )

    if (workout.exists || tombstone.exists) {
      return validateExistingFinishedClosure(userId, workoutId, workout, tombstone)
    }

    const activeData = requireMatchingActiveSession(userId, workoutId, active)
    requireActiveSessionRevision(activeData, input.sessionRevision)
    const canonicalWorkout = buildFinishedWorkoutFromActiveSession(
      activeData,
      getCappedWorkoutFinishedAt(activeData.startedAt, closedAt),
    )

    transaction.create(workoutRef, {
      ...canonicalWorkout,
      userId,
      materialized: false,
    })
    transaction.create(tombstoneRef, {
      userId,
      sessionId: workoutId,
      outcome: 'finished' satisfies ClosedSessionOutcome,
      workoutId,
      closedAt,
      projectionState: 'pending',
      projectionRevision: INITIAL_PROJECTION_REVISION,
      projectionExerciseKeys: projectionExerciseKeysFromWorkout(canonicalWorkout.exercises),
    })
    transaction.delete(activeRef)

    return { materialized: false, projectionRevision: INITIAL_PROJECTION_REVISION }
  })

  if (transactionResult.materialized) {
    return { workoutId, status: 'materialized' }
  }

  const materialize = options.materialize
    ?? ((ownerId, id, expectedRevision) => materializeWorkoutForUser(ownerId, id, {
      db: database,
      expectedRevision,
    }))

  try {
    await materialize(userId, workoutId, transactionResult.projectionRevision)
    return { workoutId, status: 'materialized' }
  } catch {
    return { workoutId, status: 'projection_pending' }
  }
}

export async function discardSessionForUser(
  userId: string,
  sessionId: string,
  options: WorkoutClosureOptions = {},
): Promise<{ status: 'discarded' }> {
  const database = options.db ?? adminDb
  const normalizedSessionId = validateFirestoreDocumentId(sessionId, 'sessionId')
  const workoutRef = database.collection('workouts').doc(normalizedSessionId)
  const tombstoneRef = database.collection('closedSessions').doc(normalizedSessionId)
  const activeRef = database.collection('activeSessions').doc(userId)

  await database.runTransaction(async (transaction) => {
    const [workout, tombstone, active] = await transaction.getAll(
      workoutRef,
      tombstoneRef,
      activeRef,
    )

    const storedWorkout = validateExistingClosureRecord(
      workout,
      userId,
      normalizedSessionId,
      'workout',
    )
    const storedTombstone = validateExistingClosureRecord(
      tombstone,
      userId,
      normalizedSessionId,
      'tombstone',
    )

    if (storedTombstone) {
      if (
        storedTombstone.outcome !== 'discarded'
        || storedTombstone.workoutId !== null
        || storedWorkout
      ) {
        throw closureConflict()
      }
      return
    }

    if (storedWorkout) throw closureConflict()

    if (!active.exists) throw sessionMismatch()
    requireMatchingActiveSession(userId, normalizedSessionId, active)

    transaction.create(tombstoneRef, {
      userId,
      sessionId: normalizedSessionId,
      outcome: 'discarded' satisfies ClosedSessionOutcome,
      workoutId: null,
      closedAt: (options.now ?? Date.now)(),
    })
    transaction.delete(activeRef)
  })

  return { status: 'discarded' }
}

function validateExistingFinishedClosure(
  userId: string,
  sessionId: string,
  workout: DocumentSnapshot,
  tombstone: DocumentSnapshot,
): ClosureTransactionResult {
  const storedWorkout = validateExistingClosureRecord(workout, userId, sessionId, 'workout')
  const storedTombstone = validateExistingClosureRecord(tombstone, userId, sessionId, 'tombstone')

  if (!storedWorkout || !storedTombstone) throw closureConflict()

  if (storedTombstone.outcome !== 'finished' || storedTombstone.workoutId !== sessionId) {
    throw closureConflict()
  }

  return {
    materialized: storedWorkout.materialized === true,
    projectionRevision: parseProjectionFence(storedTombstone)?.projectionRevision,
  }
}

function validateExistingClosureRecord(
  snapshot: DocumentSnapshot,
  userId: string,
  sessionId: string,
  resource: string,
): DocumentData | undefined {
  if (!snapshot.exists) return undefined

  const stored = requireOwnedRecord(snapshot, userId, resource)
  requireIdentity(stored.sessionId, sessionId)
  return stored
}

function requireMatchingActiveSession(
  userId: string,
  sessionId: string,
  active: DocumentSnapshot,
): DocumentData {
  if (!active.exists) throw sessionMismatch()
  const stored = requireOwnedRecord(active, userId, 'active session')
  const storedSessionId = typeof stored.sessionId === 'string' && stored.sessionId.trim()
    ? stored.sessionId.trim()
    : typeof stored.startedAt === 'number'
      ? deriveLegacySessionId(userId, stored.startedAt)
      : undefined
  if (storedSessionId !== sessionId) throw sessionMismatch()
  return { ...stored, sessionId: storedSessionId }
}

function requireActiveSessionRevision(
  active: DocumentData,
  expectedRevision: string | undefined,
): void {
  if (expectedRevision === undefined) return
  if (active.sessionRevision !== expectedRevision) {
    throw new ApiError(409, 'Aktywna sesja zmieniła się na innym urządzeniu.', {
      code: 'active_session_changed',
    })
  }
}

function requireOwnedRecord(
  snapshot: DocumentSnapshot,
  userId: string,
  resource: string,
): DocumentData {
  const data = snapshot.data()
  if (!data || data.userId !== userId) {
    throw new ApiError(403, `Brak dostępu do ${resource}.`, { code: 'resource_owner_mismatch' })
  }
  return data
}

function requireIdentity(actual: unknown, expected: string): void {
  if (actual !== expected) throw closureConflict()
}

function sessionMismatch(): ApiError {
  return new ApiError(409, 'Ta sesja nie jest już aktywna na serwerze.', {
    code: 'session_mismatch',
  })
}

function closureConflict(): ApiError {
  return new ApiError(409, 'Sesja ma już inny wynik zamknięcia.', {
    code: 'closure_conflict',
  })
}
