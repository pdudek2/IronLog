import { adminDb } from './firebaseAdmin.js'
import { exercises as exerciseCatalog } from '../../src/data/exercises.js'

type ExerciseSource = 'global' | 'user'

interface WorkoutSet {
  weight: number
  reps: number
}

interface WorkoutExercise {
  exerciseId: string
  exerciseSource: ExerciseSource
  name: string
  sets: WorkoutSet[]
}

interface StoredWorkout {
  userId: string
  startedAt: number
  finishedAt: number
  label: string | null
  materialized: boolean
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

const exerciseMap = new Map(exerciseCatalog.map((exercise) => [exercise.id, exercise]))

export async function materializeWorkoutForUser(userId: string, workoutId: string): Promise<void> {
  const workoutRef = adminDb.collection('workouts').doc(workoutId)
  const workoutSnap = await workoutRef.get()

  if (!workoutSnap.exists) throw new Error('Trening nie istnieje.')

  const workout = parseStoredWorkout(workoutSnap.data())
  assertOwnership(userId, workout.userId)
  assertFinishedWorkout(workout)

  const existingSessions = await listExerciseSessionsForWorkout(workoutId)
  const nextSessions = buildExerciseSessions(workoutId, workout)
  const affectedExercises = collectExerciseKeys(existingSessions, nextSessions)

  await replaceExerciseSessions(existingSessions, nextSessions)
  await recomputeRecords(workout.userId, affectedExercises)
  await workoutRef.update({ materialized: true })
}

export async function updateFinishedWorkoutForUser(
  userId: string,
  workoutId: string,
  input: unknown
): Promise<void> {
  const workoutRef = adminDb.collection('workouts').doc(workoutId)
  const workoutSnap = await workoutRef.get()

  if (!workoutSnap.exists) throw new Error('Trening nie istnieje.')

  const existingWorkout = parseStoredWorkout(workoutSnap.data())
  assertOwnership(userId, existingWorkout.userId)
  assertFinishedWorkout(existingWorkout)

  const nextWorkout = parseWorkoutUpdate(input)

  await workoutRef.update({
    label: nextWorkout.label,
    exercises: nextWorkout.exercises,
    materialized: false,
  })

  await materializeWorkoutForUser(userId, workoutId)
}

export async function deleteFinishedWorkoutForUser(userId: string, workoutId: string): Promise<void> {
  const workoutRef = adminDb.collection('workouts').doc(workoutId)
  const workoutSnap = await workoutRef.get()

  if (!workoutSnap.exists) throw new Error('Trening nie istnieje.')

  const workout = parseStoredWorkout(workoutSnap.data())
  assertOwnership(userId, workout.userId)
  assertFinishedWorkout(workout)

  const existingSessions = await listExerciseSessionsForWorkout(workoutId)
  const affectedExercises = collectExerciseKeys(existingSessions)

  const batch = adminDb.batch()
  batch.delete(workoutRef)
  for (const session of existingSessions) {
    batch.delete(adminDb.collection('exerciseSessions').doc(session.id))
  }
  await batch.commit()

  await recomputeRecords(workout.userId, affectedExercises)
}

function assertOwnership(currentUserId: string, resourceUserId: string): void {
  if (currentUserId !== resourceUserId) {
    throw new Error('Brak dostępu do tego treningu.')
  }
}

function assertFinishedWorkout(workout: StoredWorkout): void {
  if (workout.finishedAt <= 0) {
    throw new Error('Można synchronizować tylko zakończone treningi.')
  }
}

function parseStoredWorkout(raw: unknown): StoredWorkout {
  const record = asRecord(raw)
  const userId = asNonEmptyString(record.userId, 'userId')
  const startedAt = asNumber(record.startedAt, 'startedAt')
  const finishedAt = asNumber(record.finishedAt, 'finishedAt')
  const exercises = sanitizeExercises(record.exercises)

  return {
    userId,
    startedAt,
    finishedAt,
    label: sanitizeLabel(record.label),
    materialized: record.materialized === true,
    exercises,
  }
}

function parseWorkoutUpdate(raw: unknown): Pick<StoredWorkout, 'label' | 'exercises'> {
  const record = asRecord(raw)

  return {
    label: sanitizeLabel(record.label),
    exercises: sanitizeExercises(record.exercises),
  }
}

function sanitizeExercises(raw: unknown): WorkoutExercise[] {
  if (!Array.isArray(raw)) return []

  return raw.flatMap((exercise) => {
    const record = asNullableRecord(exercise)
    if (!record) return []

    const exerciseId = typeof record.exerciseId === 'string' ? record.exerciseId.trim() : ''
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    const sets = sanitizeSets(record.sets)
    const exerciseSource: ExerciseSource = record.exerciseSource === 'user' ? 'user' : 'global'

    if (!exerciseId || !name || sets.length === 0) return []

    return [{ exerciseId, exerciseSource, name, sets }]
  })
}

function sanitizeSets(raw: unknown): WorkoutSet[] {
  if (!Array.isArray(raw)) return []

  return raw.flatMap((set) => {
    const record = asNullableRecord(set)
    if (!record) return []

    const weight = toFiniteNumber(record.weight ?? record.weightKg)
    const reps = toFiniteNumber(record.reps)

    if (reps <= 0 || weight < 0) return []

    return [{ weight, reps }]
  })
}

function sanitizeLabel(value: unknown): string | null {
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

function asNullableRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
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

function buildExerciseSessions(workoutId: string, workout: StoredWorkout): ExerciseSessionDoc[] {
  return workout.exercises.map((exercise, index) => {
    const metadata = exerciseMap.get(exercise.exerciseId)
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
      id: buildExerciseSessionId(workoutId, exercise.exerciseSource, exercise.exerciseId, index),
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
      category: exercise.exerciseSource === 'global' ? (metadata?.category ?? null) : null,
      equipment: exercise.exerciseSource === 'global' ? (metadata?.equipment ?? null) : null,
      muscleGroups: exercise.exerciseSource === 'global' ? (metadata?.muscles ?? []) : [],
      sets: exercise.sets,
    }
  })
}

function buildExerciseSessionId(workoutId: string, exerciseSource: ExerciseSource, exerciseId: string, orderIndex: number): string {
  return `${workoutId}_${exerciseSource}_${exerciseId}_${orderIndex}`
}

async function listExerciseSessionsForWorkout(workoutId: string): Promise<ExerciseSessionDoc[]> {
  const snap = await adminDb.collection('exerciseSessions').where('workoutId', '==', workoutId).get()
  return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<ExerciseSessionDoc, 'id'>) }))
}

async function replaceExerciseSessions(
  existingSessions: ExerciseSessionDoc[],
  nextSessions: ExerciseSessionDoc[]
): Promise<void> {
  const batch = adminDb.batch()
  const nextIds = new Set(nextSessions.map((session) => session.id))

  for (const session of nextSessions) {
    batch.set(adminDb.collection('exerciseSessions').doc(session.id), session)
  }

  for (const session of existingSessions) {
    if (!nextIds.has(session.id)) {
      batch.delete(adminDb.collection('exerciseSessions').doc(session.id))
    }
  }

  if (existingSessions.length === 0 && nextSessions.length === 0) return

  await batch.commit()
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

async function recomputeRecords(userId: string, exercises: ExerciseKey[]): Promise<void> {
  await Promise.all(exercises.map((exercise) => recomputeRecordForExercise(userId, exercise)))
}

async function recomputeRecordForExercise(userId: string, exercise: ExerciseKey): Promise<void> {
  const sessionsSnap = await adminDb.collection('exerciseSessions')
    .where('userId', '==', userId)
    .where('exerciseId', '==', exercise.exerciseId)
    .where('exerciseSource', '==', exercise.exerciseSource)
    .get()

  const recordRef = adminDb.collection('records').doc(buildRecordId(userId, exercise))

  if (sessionsSnap.empty) {
    await recordRef.delete().catch(() => undefined)
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
