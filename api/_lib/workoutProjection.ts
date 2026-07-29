import { adminDb } from './firebaseAdmin.js'
import type {
  DocumentReference,
  Firestore,
  Transaction,
} from 'firebase-admin/firestore'
import { ApiError } from './errors.js'
import {
  INITIAL_PROJECTION_REVISION,
  normalizeProjectionExerciseKeys,
  parseProjectionFence,
  projectionStateConflict,
  projectionSuperseded,
  workoutDeleted,
  type ProjectionExerciseKey,
  type ProjectionFence,
} from './workoutProjectionFence.js'
import {
  buildExerciseSessionDocumentId,
  normalizeWorkoutExercises,
  validateFirestoreDocumentId,
  validateWorkoutLabel,
  type ExerciseSource,
  type ValidatedWorkoutExercise,
  type ValidatedWorkoutSet,
} from './workoutValidation.js'
import { exercises as exerciseCatalog } from '../../data/exercises.js'

type WorkoutSet = ValidatedWorkoutSet
type WorkoutExercise = ValidatedWorkoutExercise

interface StoredWorkoutMetadata {
  userId: string
  startedAt: number
  finishedAt: number
  label: string | null
  materialized: boolean
}

interface StoredWorkout extends StoredWorkoutMetadata {
  exercises: WorkoutExercise[]
}

interface ExerciseSessionDoc {
  id: string
  userId: string
  workoutId: string
  startedAt: number
  finishedAt: number
  label: string | null
  exerciseId: string
  exerciseSource: ExerciseSource
  exerciseName: string
  orderIndex: number
  totalSets: number
  totalReps: number
  totalVolume: number
  bestSetWeight: number
  bestSetReps: number
  category: string | null
  equipment: string | null
  muscleGroups: string[]
  sets: WorkoutSet[]
}

interface RecordDoc {
  userId: string
  exerciseId: string
  exerciseSource: ExerciseSource
  exerciseName: string
  maxWeight: number
  maxReps: number
  totalSessions: number
  bestVolume: number
  lastPerformedAt: number
  updatedAt: number
}

interface ExerciseKey {
  exerciseId: string
  exerciseSource: ExerciseSource
}

interface ExerciseMetadata {
  category: string | null
  equipment: string | null
  muscleGroups: string[]
}

const exerciseMap = new Map(exerciseCatalog.map((exercise) => [exercise.id, exercise]))
const MAX_BATCH_WRITES = 450

export interface MaterializationReviewCheckpoints {
  beforeExerciseSessions?(): void | Promise<void>
  afterExerciseSessions?(): void | Promise<void>
  afterRecords?(): void | Promise<void>
}

export interface MaterializationReviewOptions {
  db?: Firestore
  expectedRevision?: number
  checkpoints?: MaterializationReviewCheckpoints
}

export interface WorkoutMutationReviewOptions {
  db?: Firestore
  materialize?: (
    userId: string,
    workoutId: string,
    expectedRevision: number,
  ) => Promise<void>
}

export interface DeletionReviewCheckpoints {
  afterDeleteClaim?(): void | Promise<void>
  afterDeleteSessions?(): void | Promise<void>
  beforeDeleteRecords?(): void | Promise<void>
}

export interface DeleteWorkoutReviewOptions {
  db?: Firestore
  now?: () => number
  checkpoints?: DeletionReviewCheckpoints
}

export async function materializeWorkoutForUser(
  userId: string,
  workoutId: string,
  options: MaterializationReviewOptions = {},
): Promise<void> {
  const database = options.db ?? adminDb
  const workoutDocumentId = validateFirestoreDocumentId(workoutId, 'workoutId')
  const workoutRef = database.collection('workouts').doc(workoutDocumentId)
  const tombstoneRef = database.collection('closedSessions').doc(workoutDocumentId)
  const prepared = await prepareMaterialization(
    database,
    workoutRef,
    tombstoneRef,
    userId,
    options.expectedRevision,
  )

  const existingSessions = await listExerciseSessionsForWorkout(database, workoutDocumentId)
  const userExerciseMetadata = await loadUserExerciseMetadata(
    database,
    prepared.workout.userId,
    prepared.workout.exercises,
  )
  const nextSessions = buildExerciseSessions(
    workoutDocumentId,
    prepared.workout,
    userExerciseMetadata,
  )
  const affectedExercises = normalizeProjectionExerciseKeys(
    prepared.fence.projectionExerciseKeys,
    collectExerciseKeys(existingSessions),
    collectExerciseKeys(nextSessions),
  )

  await stageProjectionKeys(
    database,
    tombstoneRef,
    userId,
    prepared.fence.projectionRevision,
    affectedExercises,
  )
  await options.checkpoints?.beforeExerciseSessions?.()
  await replaceExerciseSessions(
    database,
    tombstoneRef,
    prepared.fence.projectionRevision,
    existingSessions,
    nextSessions,
  )
  await options.checkpoints?.afterExerciseSessions?.()
  await recomputeRecords(
    database,
    prepared.workout.userId,
    affectedExercises,
    {
      tombstoneRef,
      expectedRevision: prepared.fence.projectionRevision,
      allowedState: 'pending',
    },
  )
  await options.checkpoints?.afterRecords?.()
  await completeMaterialization(
    database,
    workoutRef,
    tombstoneRef,
    userId,
    prepared.fence.projectionRevision,
    normalizeProjectionExerciseKeys(collectExerciseKeys(nextSessions)),
  )
}

async function prepareMaterialization(
  database: Firestore,
  workoutRef: DocumentReference,
  tombstoneRef: DocumentReference,
  userId: string,
  expectedRevision?: number,
): Promise<{ workout: StoredWorkout; fence: ProjectionFence }> {
  return database.runTransaction(async (transaction) => {
    const [workoutSnap, tombstoneSnap] = await transaction.getAll(workoutRef, tombstoneRef)

    if (tombstoneSnap.exists) {
      const tombstone = requireOwnedFinishedTombstone(
        tombstoneSnap.data(),
        userId,
        workoutRef.id,
      )
      const storedFence = parseProjectionFence(tombstone)
      if (storedFence?.projectionState === 'deleted') throw workoutDeleted()
    }

    if (!workoutSnap.exists) throw new Error('Trening nie istnieje.')

    const workout = parseStoredWorkout(workoutSnap.data())
    assertOwnership(userId, workout.userId)
    assertFinishedWorkout(workout)

    const initialFence: ProjectionFence = {
      projectionState: workout.materialized ? 'ready' : 'pending',
      projectionRevision: INITIAL_PROJECTION_REVISION,
      projectionExerciseKeys: normalizeProjectionExerciseKeys(workout.exercises),
    }
    let fence = initialFence

    if (tombstoneSnap.exists) {
      const storedFence = parseProjectionFence(tombstoneSnap.data())
      fence = storedFence ?? initialFence
      if (!storedFence) transaction.update(tombstoneRef, { ...initialFence })
    } else {
      transaction.create(tombstoneRef, {
        userId,
        sessionId: workoutRef.id,
        outcome: 'finished',
        workoutId: workoutRef.id,
        closedAt: workout.finishedAt,
        ...initialFence,
      })
    }

    if (expectedRevision !== undefined && fence.projectionRevision !== expectedRevision) {
      throw projectionSuperseded()
    }

    return { workout, fence }
  })
}

async function stageProjectionKeys(
  database: Firestore,
  tombstoneRef: DocumentReference,
  userId: string,
  expectedRevision: number,
  projectionExerciseKeys: ProjectionExerciseKey[],
): Promise<void> {
  await database.runTransaction(async (transaction) => {
    const tombstoneSnap = await transaction.get(tombstoneRef)
    if (!tombstoneSnap.exists) throw projectionStateConflict()

    const tombstone = requireOwnedFinishedTombstone(
      tombstoneSnap.data(),
      userId,
      tombstoneRef.id,
    )
    const fence = parseProjectionFence(tombstone)
    if (!fence) throw projectionStateConflict()
    if (fence.projectionState === 'deleted') throw workoutDeleted()
    if (fence.projectionRevision !== expectedRevision) throw projectionSuperseded()
    if (fence.projectionState !== 'pending' && fence.projectionState !== 'ready') {
      throw projectionStateConflict()
    }

    transaction.update(tombstoneRef, {
      projectionState: 'pending',
      projectionExerciseKeys: normalizeProjectionExerciseKeys(projectionExerciseKeys),
    })
  })
}

async function runGuardedProjectionTransaction<T>(
  database: Firestore,
  tombstoneRef: DocumentReference,
  expectedRevision: number,
  allowedState: 'pending' | 'deleted',
  apply: (transaction: Transaction, fence: ProjectionFence) => Promise<T> | T,
): Promise<T> {
  return database.runTransaction(async (transaction) => {
    const tombstoneSnap = await transaction.get(tombstoneRef)
    if (!tombstoneSnap.exists) throw projectionStateConflict()

    const tombstone = requireFinishedTombstone(tombstoneSnap.data(), tombstoneRef.id)
    const fence = parseProjectionFence(tombstone)
    if (!fence) throw projectionStateConflict()
    if (allowedState === 'pending' && fence.projectionState === 'deleted') {
      throw workoutDeleted()
    }
    if (fence.projectionRevision !== expectedRevision) throw projectionSuperseded()
    if (fence.projectionState !== allowedState) throw projectionStateConflict()

    return apply(transaction, fence)
  })
}

async function completeMaterialization(
  database: Firestore,
  workoutRef: DocumentReference,
  tombstoneRef: DocumentReference,
  userId: string,
  expectedRevision: number,
  projectionExerciseKeys: ProjectionExerciseKey[],
): Promise<void> {
  await database.runTransaction(async (transaction) => {
    const [tombstoneSnap, workoutSnap] = await transaction.getAll(tombstoneRef, workoutRef)
    if (!tombstoneSnap.exists) throw projectionStateConflict()

    const tombstone = requireOwnedFinishedTombstone(
      tombstoneSnap.data(),
      userId,
      tombstoneRef.id,
    )
    const fence = parseProjectionFence(tombstone)
    if (!fence) throw projectionStateConflict()
    if (fence.projectionState === 'deleted') throw workoutDeleted()
    if (fence.projectionRevision !== expectedRevision) throw projectionSuperseded()
    if (!workoutSnap.exists) throw projectionStateConflict()

    const workout = asRecord(workoutSnap.data())
    if (typeof workout.userId !== 'string' || !workout.userId.trim()) {
      throw projectionStateConflict()
    }
    assertOwnership(userId, workout.userId)

    if (fence.projectionState === 'ready') {
      if (workout.materialized !== true) throw projectionStateConflict()
      return
    }
    if (fence.projectionState !== 'pending') throw projectionStateConflict()

    transaction.update(workoutRef, { materialized: true })
    transaction.update(tombstoneRef, {
      projectionState: 'ready',
      projectionExerciseKeys,
    })
  })
}

export async function updateFinishedWorkoutForUser(
  userId: string,
  workoutId: string,
  input: unknown,
  options: WorkoutMutationReviewOptions = {},
): Promise<void> {
  const database = options.db ?? adminDb
  const workoutDocumentId = validateFirestoreDocumentId(workoutId, 'workoutId')
  const workoutRef = database.collection('workouts').doc(workoutDocumentId)
  const tombstoneRef = database.collection('closedSessions').doc(workoutDocumentId)
  const nextRevision = await database.runTransaction(async (transaction) => {
    const [workoutSnap, tombstoneSnap] = await transaction.getAll(workoutRef, tombstoneRef)
    let storedFence: ProjectionFence | null = null

    if (tombstoneSnap.exists) {
      const tombstone = requireOwnedFinishedTombstone(
        tombstoneSnap.data(),
        userId,
        workoutDocumentId,
      )
      storedFence = parseProjectionFence(tombstone)
      if (storedFence?.projectionState === 'deleted') throw workoutDeleted()
    }

    if (!workoutSnap.exists) throw new Error('Trening nie istnieje.')

    const existingWorkout = parseStoredWorkout(workoutSnap.data())
    assertOwnership(userId, existingWorkout.userId)
    assertFinishedWorkout(existingWorkout)
    const nextWorkout = parseWorkoutUpdate(input)

    const initialFence: ProjectionFence = {
      projectionState: existingWorkout.materialized ? 'ready' : 'pending',
      projectionRevision: INITIAL_PROJECTION_REVISION,
      projectionExerciseKeys: normalizeProjectionExerciseKeys(existingWorkout.exercises),
    }
    const fence = storedFence ?? initialFence
    const projectionRevision = fence.projectionRevision + 1
    const projectionExerciseKeys = normalizeProjectionExerciseKeys(
      existingWorkout.exercises,
      fence.projectionExerciseKeys,
      nextWorkout.exercises,
    )

    transaction.update(workoutRef, {
      label: nextWorkout.label,
      exercises: nextWorkout.exercises,
      materialized: false,
    })

    const pendingFence = {
      projectionState: 'pending' as const,
      projectionRevision,
      projectionExerciseKeys,
    }
    if (tombstoneSnap.exists) {
      transaction.update(tombstoneRef, pendingFence)
    } else {
      transaction.create(tombstoneRef, {
        userId,
        sessionId: workoutDocumentId,
        outcome: 'finished',
        workoutId: workoutDocumentId,
        closedAt: existingWorkout.finishedAt,
        ...pendingFence,
      })
    }

    return projectionRevision
  })

  if (options.materialize) {
    await options.materialize(userId, workoutDocumentId, nextRevision)
  } else {
    await materializeWorkoutForUser(userId, workoutDocumentId, {
      db: database,
      expectedRevision: nextRevision,
    })
  }
}

export async function deleteFinishedWorkoutForUser(
  userId: string,
  workoutId: string,
  options: DeleteWorkoutReviewOptions = {},
): Promise<void> {
  const database = options.db ?? adminDb
  const workoutDocumentId = validateFirestoreDocumentId(workoutId, 'workoutId')
  const workoutRef = database.collection('workouts').doc(workoutDocumentId)
  const tombstoneRef = database.collection('closedSessions').doc(workoutDocumentId)
  const claim = await database.runTransaction(async (transaction) => {
    const [workoutSnap, tombstoneSnap] = await transaction.getAll(workoutRef, tombstoneRef)
    let storedFence: ProjectionFence | null = null

    if (tombstoneSnap.exists) {
      const tombstone = requireOwnedDeletionTombstone(
        tombstoneSnap.data(),
        userId,
        workoutDocumentId,
      )
      storedFence = parseProjectionFence(tombstone)
    }

    let workout: StoredWorkout | undefined
    if (workoutSnap.exists) {
      workout = parseStoredWorkout(workoutSnap.data())
      assertOwnership(userId, workout.userId)
      assertFinishedWorkout(workout)
    }

    if (storedFence?.projectionState === 'deleted') {
      return {
        projectionRevision: storedFence.projectionRevision,
        projectionExerciseKeys: storedFence.projectionExerciseKeys,
      }
    }
    if (!workout) throw new Error('Trening nie istnieje.')

    const initialFence: ProjectionFence = {
      projectionState: workout.materialized ? 'ready' : 'pending',
      projectionRevision: INITIAL_PROJECTION_REVISION,
      projectionExerciseKeys: normalizeProjectionExerciseKeys(workout.exercises),
    }
    const fence = storedFence ?? initialFence
    const deletedFence = {
      projectionState: 'deleted' as const,
      projectionRevision: fence.projectionRevision + 1,
      projectionExerciseKeys: normalizeProjectionExerciseKeys(
        fence.projectionExerciseKeys,
        workout.exercises,
      ),
      deletedAt: (options.now ?? Date.now)(),
    }

    if (tombstoneSnap.exists) {
      transaction.update(tombstoneRef, deletedFence)
    } else {
      transaction.create(tombstoneRef, {
        userId,
        sessionId: workoutDocumentId,
        outcome: 'finished',
        workoutId: workoutDocumentId,
        closedAt: workout.finishedAt,
        ...deletedFence,
      })
    }
    transaction.delete(workoutRef)

    return deletedFence
  })

  await options.checkpoints?.afterDeleteClaim?.()
  const existingSessions = await listExerciseSessionsForWorkout(database, workoutDocumentId)
  const affectedExercises = await stageDeletedProjectionKeys(
    database,
    tombstoneRef,
    claim.projectionRevision,
    collectExerciseKeys(existingSessions),
  )
  await deleteExerciseSessions(
    database,
    tombstoneRef,
    claim.projectionRevision,
    existingSessions,
  )
  await options.checkpoints?.afterDeleteSessions?.()
  await options.checkpoints?.beforeDeleteRecords?.()
  await recomputeRecords(database, userId, affectedExercises, {
    tombstoneRef,
    expectedRevision: claim.projectionRevision,
    allowedState: 'deleted',
  })
}

function assertOwnership(currentUserId: string, resourceUserId: string): void {
  if (currentUserId !== resourceUserId) {
    throw new ApiError(403, 'Brak dostępu do tego treningu.', {
      code: 'resource_owner_mismatch',
    })
  }
}

function assertFinishedWorkout(workout: StoredWorkoutMetadata): void {
  if (workout.finishedAt <= 0) {
    throw new Error('Można synchronizować tylko zakończone treningi.')
  }
}

function parseStoredWorkout(raw: unknown): StoredWorkout {
  const record = asRecord(raw)
  const userId = asNonEmptyString(record.userId, 'userId')
  const startedAt = asNumber(record.startedAt, 'startedAt')
  const finishedAt = asNumber(record.finishedAt, 'finishedAt')
  const exercises = normalizeWorkoutExercises(record.exercises)

  return {
    userId,
    startedAt,
    finishedAt,
    label: validateWorkoutLabel(record.label),
    materialized: record.materialized === true,
    exercises,
  }
}

function parseWorkoutUpdate(raw: unknown): Pick<StoredWorkout, 'label' | 'exercises'> {
  const record = asRecord(raw)

  return {
    label: validateWorkoutLabel(record.label),
    exercises: normalizeWorkoutExercises(record.exercises),
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Niepoprawny payload treningu.')
  }
  return value as Record<string, unknown>
}

function requireOwnedFinishedTombstone(
  raw: unknown,
  userId: string,
  workoutId: string,
): Record<string, unknown> {
  const tombstone = requireFinishedTombstone(raw, workoutId)
  assertOwnership(userId, asNonEmptyString(tombstone.userId, 'userId'))
  return tombstone
}

function requireOwnedDeletionTombstone(
  raw: unknown,
  userId: string,
  workoutId: string,
): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw closureConflict()
  }

  const tombstone = raw as Record<string, unknown>
  assertOwnership(userId, asNonEmptyString(tombstone.userId, 'userId'))
  if (
    tombstone.sessionId !== workoutId
    || tombstone.outcome !== 'finished'
    || tombstone.workoutId !== workoutId
  ) {
    throw closureConflict()
  }
  return tombstone
}

function requireFinishedTombstone(
  raw: unknown,
  workoutId: string,
): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw projectionStateConflict()
  }

  const tombstone = raw as Record<string, unknown>
  if (
    typeof tombstone.userId !== 'string'
    || !tombstone.userId.trim()
    || tombstone.sessionId !== workoutId
    || tombstone.outcome !== 'finished'
    || tombstone.workoutId !== workoutId
  ) {
    throw projectionStateConflict()
  }
  return tombstone
}

function closureConflict(): ApiError {
  return new ApiError(409, 'Sesja ma już inny wynik zamknięcia.', {
    code: 'closure_conflict',
  })
}

function asNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Brak pola ${field}.`)
  return value.trim()
}

function asNumber(value: unknown, field: string): number {
  const numeric = toFiniteNumber(value)
  if (numeric < 0) throw new Error(`Niepoprawne pole ${field}.`)
  return numeric
}

function toFiniteNumber(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

async function loadUserExerciseMetadata(
  database: Firestore,
  userId: string,
  exercises: WorkoutExercise[],
): Promise<Map<string, ExerciseMetadata>> {
  const ids = [...new Set(
    exercises
      .filter((exercise) => exercise.exerciseSource === 'user')
      .map((exercise) => exercise.exerciseId),
  )]

  if (ids.length === 0) return new Map()

  const refs = ids.map((id) => database.collection('userExercises').doc(id))
  const snapshots = await database.getAll(...refs)
  const metadataMap = new Map<string, ExerciseMetadata>()

  for (const snapshot of snapshots) {
    if (!snapshot.exists) continue

    const record = snapshot.data() as Record<string, unknown>
    if (record.userId !== userId) continue

    metadataMap.set(snapshot.id, {
      category: typeof record.category === 'string' ? record.category : null,
      equipment: typeof record.equipment === 'string' ? record.equipment : null,
      muscleGroups: Array.isArray(record.muscles)
        ? record.muscles.filter((value): value is string => typeof value === 'string')
        : [],
    })
  }

  return metadataMap
}

function buildExerciseSessions(
  workoutId: string,
  workout: StoredWorkout,
  userExerciseMetadata: Map<string, ExerciseMetadata>,
): ExerciseSessionDoc[] {
  return workout.exercises.map((exercise, index) => {
    let category: string | null = null
    let equipment: string | null = null
    let muscleGroups: string[] = []

    if (exercise.exerciseSource === 'global') {
      const metadata = exerciseMap.get(exercise.exerciseId)
      category = metadata?.category ?? null
      equipment = metadata?.equipment ?? null
      muscleGroups = metadata?.muscles ?? []
    } else {
      const metadata = userExerciseMetadata.get(exercise.exerciseId)
      category = metadata?.category ?? null
      equipment = metadata?.equipment ?? null
      muscleGroups = metadata?.muscleGroups ?? []
    }

    const totals = exercise.sets.reduce((acc, set) => ({
      totalReps: acc.totalReps + set.reps,
      totalVolume: acc.totalVolume + set.weight * set.reps,
      bestSet: comparePerformance(acc.bestSet, set) >= 0 ? acc.bestSet : set,
    }), {
      totalReps: 0,
      totalVolume: 0,
      bestSet: { weight: 0, reps: 0 },
    })

    return {
      id: buildExerciseSessionDocumentId(workoutId, exercise.exerciseSource, exercise.exerciseId, index),
      userId: workout.userId,
      workoutId,
      startedAt: workout.startedAt,
      finishedAt: workout.finishedAt,
      label: workout.label,
      exerciseId: exercise.exerciseId,
      exerciseSource: exercise.exerciseSource,
      exerciseName: exercise.name,
      orderIndex: index,
      totalSets: exercise.sets.length,
      totalReps: totals.totalReps,
      totalVolume: totals.totalVolume,
      bestSetWeight: totals.bestSet.weight,
      bestSetReps: totals.bestSet.reps,
      category,
      equipment,
      muscleGroups,
      sets: exercise.sets,
    }
  })
}

async function listExerciseSessionsForWorkout(
  database: Firestore,
  workoutId: string,
): Promise<ExerciseSessionDoc[]> {
  const snap = await database.collection('exerciseSessions').where('workoutId', '==', workoutId).get()
  return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<ExerciseSessionDoc, 'id'>) }))
}

async function replaceExerciseSessions(
  database: Firestore,
  tombstoneRef: DocumentReference,
  expectedRevision: number,
  existingSessions: ExerciseSessionDoc[],
  nextSessions: ExerciseSessionDoc[]
): Promise<void> {
  const nextIds = new Set(nextSessions.map((session) => session.id))
  const operations: Array<(transaction: Transaction) => void> = []

  for (const session of nextSessions) {
    const sessionRef = database.collection('exerciseSessions').doc(session.id)
    operations.push((transaction) => transaction.set(sessionRef, session))
  }

  for (const session of existingSessions) {
    if (!nextIds.has(session.id)) {
      const sessionRef = database.collection('exerciseSessions').doc(session.id)
      operations.push((transaction) => transaction.delete(sessionRef))
    }
  }

  const chunkSize = MAX_BATCH_WRITES - 1
  for (let start = 0; start < operations.length; start += chunkSize) {
    const chunk = operations.slice(start, start + chunkSize)
    await runGuardedProjectionTransaction(
      database,
      tombstoneRef,
      expectedRevision,
      'pending',
      (transaction) => {
        for (const apply of chunk) apply(transaction)
      },
    )
  }
}

async function stageDeletedProjectionKeys(
  database: Firestore,
  tombstoneRef: DocumentReference,
  expectedRevision: number,
  remainingSessionKeys: ExerciseKey[],
): Promise<ProjectionExerciseKey[]> {
  return runGuardedProjectionTransaction(
    database,
    tombstoneRef,
    expectedRevision,
    'deleted',
    (transaction, fence) => {
      const projectionExerciseKeys = normalizeProjectionExerciseKeys(
        fence.projectionExerciseKeys,
        remainingSessionKeys,
      )
      transaction.update(tombstoneRef, { projectionExerciseKeys })
      return projectionExerciseKeys
    },
  )
}

async function deleteExerciseSessions(
  database: Firestore,
  tombstoneRef: DocumentReference,
  expectedRevision: number,
  sessions: ExerciseSessionDoc[],
): Promise<void> {
  const chunkSize = MAX_BATCH_WRITES - 1
  for (let start = 0; start < sessions.length; start += chunkSize) {
    const chunk = sessions.slice(start, start + chunkSize)
    await runGuardedProjectionTransaction(
      database,
      tombstoneRef,
      expectedRevision,
      'deleted',
      (transaction) => {
        for (const session of chunk) {
          transaction.delete(database.collection('exerciseSessions').doc(session.id))
        }
      },
    )
  }
}

function collectExerciseKeys(...groups: Array<Array<Pick<ExerciseSessionDoc, 'exerciseId' | 'exerciseSource'>>>): ExerciseKey[] {
  const map = new Map<string, ExerciseKey>()

  for (const group of groups) {
    for (const exercise of group) {
      const key = `${exercise.exerciseSource}:${exercise.exerciseId}`
      if (!map.has(key)) {
        map.set(key, {
          exerciseId: exercise.exerciseId,
          exerciseSource: exercise.exerciseSource,
        })
      }
    }
  }

  return [...map.values()]
}

async function recomputeRecords(
  database: Firestore,
  userId: string,
  exercises: ExerciseKey[],
  guard: {
    tombstoneRef: DocumentReference
    expectedRevision: number
    allowedState: 'pending' | 'deleted'
  },
): Promise<void> {
  await Promise.all(exercises.map((exercise) => recomputeRecordForExercise(
    database,
    userId,
    exercise,
    guard,
  )))
}

async function recomputeRecordForExercise(
  database: Firestore,
  userId: string,
  exercise: ExerciseKey,
  guard: {
    tombstoneRef: DocumentReference
    expectedRevision: number
    allowedState: 'pending' | 'deleted'
  },
): Promise<void> {
  const sessionsQuery = database.collection('exerciseSessions')
    .where('userId', '==', userId)
    .where('exerciseId', '==', exercise.exerciseId)
    .where('exerciseSource', '==', exercise.exerciseSource)
  const recordRef = database.collection('records').doc(buildRecordId(userId, exercise))

  await runGuardedProjectionTransaction(
    database,
    guard.tombstoneRef,
    guard.expectedRevision,
    guard.allowedState,
    async (transaction) => {
      const sessionsSnap = await transaction.get(sessionsQuery)
      if (sessionsSnap.empty) {
        transaction.delete(recordRef)
        return
      }

      const sessions = sessionsSnap.docs.map((doc) => doc.data() as ExerciseSessionDoc)
      let best = sessions[0]
      let bestVolume = sessions[0].totalVolume
      let lastPerformedAt = sessions[0].finishedAt

      for (const session of sessions.slice(1)) {
        if (comparePerformance(
          { weight: session.bestSetWeight, reps: session.bestSetReps },
          { weight: best.bestSetWeight, reps: best.bestSetReps }
        ) > 0) {
          best = session
        }
        if (session.totalVolume > bestVolume) bestVolume = session.totalVolume
        if (session.finishedAt > lastPerformedAt) lastPerformedAt = session.finishedAt
      }

      transaction.set(recordRef, {
        userId,
        exerciseId: exercise.exerciseId,
        exerciseSource: exercise.exerciseSource,
        exerciseName: best.exerciseName,
        maxWeight: best.bestSetWeight,
        maxReps: best.bestSetReps,
        totalSessions: sessions.length,
        bestVolume,
        lastPerformedAt,
        updatedAt: Date.now(),
      } satisfies RecordDoc)
    }
  )
}

function buildRecordId(userId: string, exercise: ExerciseKey): string {
  return `${userId}_${exercise.exerciseSource}_${exercise.exerciseId}`
}

function comparePerformance(a: WorkoutSet, b: WorkoutSet): number {
  if (a.weight !== b.weight) return a.weight - b.weight
  return a.reps - b.reps
}
