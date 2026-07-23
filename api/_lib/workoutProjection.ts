import { adminDb } from './firebaseAdmin.js'
import type { Firestore } from 'firebase-admin/firestore'
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
  checkpoints?: MaterializationReviewCheckpoints
}

export async function materializeWorkoutForUser(
  userId: string,
  workoutId: string,
  options: MaterializationReviewOptions = {},
): Promise<void> {
  const database = options.db ?? adminDb
  const workoutDocumentId = validateFirestoreDocumentId(workoutId, 'workoutId')
  const workoutRef = database.collection('workouts').doc(workoutDocumentId)
  const workoutSnap = await workoutRef.get()

  if (!workoutSnap.exists) throw new Error('Trening nie istnieje.')

  const workout = parseStoredWorkout(workoutSnap.data())
  assertOwnership(userId, workout.userId)
  assertFinishedWorkout(workout)

  const existingSessions = await listExerciseSessionsForWorkout(database, workoutDocumentId)
  const userExerciseMetadata = await loadUserExerciseMetadata(database, workout.userId, workout.exercises)
  const nextSessions = buildExerciseSessions(workoutDocumentId, workout, userExerciseMetadata)
  const affectedExercises = collectExerciseKeys(existingSessions, nextSessions)

  await options.checkpoints?.beforeExerciseSessions?.()
  await replaceExerciseSessions(database, existingSessions, nextSessions)
  await options.checkpoints?.afterExerciseSessions?.()
  await recomputeRecords(database, workout.userId, affectedExercises)
  await options.checkpoints?.afterRecords?.()
  await workoutRef.update({ materialized: true })
}

export async function updateFinishedWorkoutForUser(
  userId: string,
  workoutId: string,
  input: unknown
): Promise<void> {
  const workoutDocumentId = validateFirestoreDocumentId(workoutId, 'workoutId')
  const workoutRef = adminDb.collection('workouts').doc(workoutDocumentId)
  const workoutSnap = await workoutRef.get()

  if (!workoutSnap.exists) throw new Error('Trening nie istnieje.')

  const existingWorkout = parseStoredWorkoutMetadata(workoutSnap.data())
  assertOwnership(userId, existingWorkout.userId)
  assertFinishedWorkout(existingWorkout)

  const nextWorkout = parseWorkoutUpdate(input)

  await workoutRef.update({
    label: nextWorkout.label,
    exercises: nextWorkout.exercises,
    materialized: false,
  })

  await materializeWorkoutForUser(userId, workoutDocumentId)
}

export async function deleteFinishedWorkoutForUser(userId: string, workoutId: string): Promise<void> {
  const workoutDocumentId = validateFirestoreDocumentId(workoutId, 'workoutId')
  const workoutRef = adminDb.collection('workouts').doc(workoutDocumentId)
  const workoutSnap = await workoutRef.get()

  if (!workoutSnap.exists) throw new Error('Trening nie istnieje.')

  const workout = parseStoredWorkoutMetadata(workoutSnap.data())
  assertOwnership(userId, workout.userId)
  assertFinishedWorkout(workout)

  const existingSessions = await listExerciseSessionsForWorkout(adminDb, workoutDocumentId)
  const affectedExercises = collectExerciseKeys(existingSessions)

  let batch = adminDb.batch()
  let writeCount = 0

  batch.delete(workoutRef)
  writeCount += 1

  for (const session of existingSessions) {
    batch.delete(adminDb.collection('exerciseSessions').doc(session.id))
    writeCount += 1

    if (writeCount >= MAX_BATCH_WRITES) {
      await batch.commit()
      batch = adminDb.batch()
      writeCount = 0
    }
  }

  if (writeCount > 0) {
    await batch.commit()
  }

  await recomputeRecords(adminDb, workout.userId, affectedExercises)
}

function assertOwnership(currentUserId: string, resourceUserId: string): void {
  if (currentUserId !== resourceUserId) {
    throw new Error('Brak dostępu do tego treningu.')
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

function parseStoredWorkoutMetadata(raw: unknown): StoredWorkoutMetadata {
  const record = asRecord(raw)

  return {
    userId: asNonEmptyString(record.userId, 'userId'),
    startedAt: asNumber(record.startedAt, 'startedAt'),
    finishedAt: asNumber(record.finishedAt, 'finishedAt'),
    label: sanitizeStoredLabel(record.label),
    materialized: record.materialized === true,
  }
}

function parseWorkoutUpdate(raw: unknown): Pick<StoredWorkout, 'label' | 'exercises'> {
  const record = asRecord(raw)

  return {
    label: validateWorkoutLabel(record.label),
    exercises: normalizeWorkoutExercises(record.exercises),
  }
}

function sanitizeStoredLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Niepoprawny payload treningu.')
  }
  return value as Record<string, unknown>
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
  existingSessions: ExerciseSessionDoc[],
  nextSessions: ExerciseSessionDoc[]
): Promise<void> {
  let batch = database.batch()
  let writeCount = 0
  const nextIds = new Set(nextSessions.map((session) => session.id))

  for (const session of nextSessions) {
    batch.set(database.collection('exerciseSessions').doc(session.id), session)
    writeCount += 1

    if (writeCount >= MAX_BATCH_WRITES) {
      await batch.commit()
      batch = database.batch()
      writeCount = 0
    }
  }

  for (const session of existingSessions) {
    if (!nextIds.has(session.id)) {
      batch.delete(database.collection('exerciseSessions').doc(session.id))
      writeCount += 1

      if (writeCount >= MAX_BATCH_WRITES) {
        await batch.commit()
        batch = database.batch()
        writeCount = 0
      }
    }
  }

  if (writeCount > 0) {
    await batch.commit()
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
): Promise<void> {
  await Promise.all(exercises.map((exercise) => recomputeRecordForExercise(database, userId, exercise)))
}

async function recomputeRecordForExercise(
  database: Firestore,
  userId: string,
  exercise: ExerciseKey,
): Promise<void> {
  const sessionsSnap = await database.collection('exerciseSessions')
    .where('userId', '==', userId)
    .where('exerciseId', '==', exercise.exerciseId)
    .where('exerciseSource', '==', exercise.exerciseSource)
    .get()

  const recordRef = database.collection('records').doc(buildRecordId(userId, exercise))

  if (sessionsSnap.empty) {
    await recordRef.delete()
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

  const payload: RecordDoc = {
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
  }

  await recordRef.set(payload)
}

function buildRecordId(userId: string, exercise: ExerciseKey): string {
  return `${userId}_${exercise.exerciseSource}_${exercise.exerciseId}`
}

function comparePerformance(a: WorkoutSet, b: WorkoutSet): number {
  if (a.weight !== b.weight) return a.weight - b.weight
  return a.reps - b.reps
}
