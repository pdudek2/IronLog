import {
  type QueryDocumentSnapshot,
  type DocumentData,
  type QuerySnapshot,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from 'firebase/firestore'
import type { ActiveWorkout, ExerciseSource } from '../store/workoutStore'
import { auth, db } from './firebase'

interface WorkoutSetSummary {
  weight: number
  reps: number
}

interface WorkoutExerciseSummary {
  exerciseId?: string
  exerciseSource?: ExerciseSource
  name: string
  sets: WorkoutSetSummary[]
}

export interface WorkoutSummary {
  id: string
  startedAt: number
  finishedAt: number
  materialized: boolean
  templateId?: string | null
  label?: string | null
  exercises: WorkoutExerciseSummary[]
}

interface SaveWorkoutResult {
  id: string
  materialized: boolean
}

export interface WorkoutHistoryResult {
  workouts: WorkoutSummary[]
  truncated: boolean
}

export async function saveWorkout(uid: string, workout: ActiveWorkout): Promise<SaveWorkoutResult> {
  const payload = buildWorkoutPayload(uid, workout)
  const ref = await addDoc(collection(db, 'workouts'), payload)

  try {
    await materializeWorkout(ref.id)
    return { id: ref.id, materialized: true }
  } catch (error) {
    console.error('[materializeWorkout error]', error)
    return { id: ref.id, materialized: false }
  }
}

export async function getRecentWorkouts(uid: string, count = 20): Promise<WorkoutSummary[]> {
  const q = query(
    collection(db, 'workouts'),
    where('userId', '==', uid),
    orderBy('startedAt', 'desc'),
    limit(count)
  )
  const snap = await getDocs(q)
  return snap.docs.map((docSnap) => normalizeWorkoutSummary(docSnap.id, docSnap.data()))
}

export async function getWorkoutHistory(
  uid: string,
  batchSize = 250,
  maxDocs = 2_000,
): Promise<WorkoutHistoryResult> {
  const workouts: WorkoutSummary[] = []
  let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null
  let truncated = false

  while (workouts.length < maxDocs) {
    const remaining = maxDocs - workouts.length
    const currentLimit = Math.min(batchSize, remaining)
    let snap: QuerySnapshot<DocumentData>
    if (lastDoc) {
      snap = await getDocs(
        query(
          collection(db, 'workouts'),
          where('userId', '==', uid),
          orderBy('startedAt', 'desc'),
          startAfter(lastDoc),
          limit(currentLimit),
        ),
      )
    } else {
      snap = await getDocs(
        query(
          collection(db, 'workouts'),
          where('userId', '==', uid),
          orderBy('startedAt', 'desc'),
          limit(currentLimit),
        ),
      )
    }

    workouts.push(...snap.docs.map((docSnap) => normalizeWorkoutSummary(docSnap.id, docSnap.data())))

    if (snap.docs.length < currentLimit) {
      return { workouts, truncated: false }
    }

    lastDoc = snap.docs[snap.docs.length - 1] ?? null
    if (!lastDoc) {
      return { workouts, truncated: false }
    }
  }

  truncated = true
  return { workouts, truncated }
}

export async function getWorkout(id: string): Promise<WorkoutSummary | null> {
  const snap = await getDoc(doc(db, 'workouts', id))
  return snap.exists() ? normalizeWorkoutSummary(snap.id, snap.data()) : null
}

export async function updateWorkout(
  id: string,
  data: Partial<Pick<WorkoutSummary, 'label' | 'exercises'>>
): Promise<void> {
  await callAuthedApi('/api/update-workout', {
    workoutId: id,
    label: data.label ?? null,
    exercises: sanitizeWorkoutExercises(data.exercises ?? []),
  })
}

export async function deleteWorkout(id: string): Promise<void> {
  await callAuthedApi('/api/delete-workout', { workoutId: id })
}

export async function retryPendingMaterializations(workouts: WorkoutSummary[]): Promise<void> {
  const pending = workouts.filter((workout) => !workout.materialized)
  if (pending.length === 0) return

  await Promise.allSettled(pending.map((workout) => materializeWorkout(workout.id)))
}

export function countWeeklyWorkouts(workouts: WorkoutSummary[]): number {
  const startOfWeek = new Date()
  startOfWeek.setHours(0, 0, 0, 0)
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7))
  return workouts.filter((workout) => workout.startedAt >= startOfWeek.getTime()).length
}

export function calcStreak(workouts: WorkoutSummary[]): number {
  if (!workouts.length) return 0

  const days = new Set(workouts.map((workout) => {
    const date = new Date(workout.startedAt)
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
  }))

  const today = new Date()
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`
  const startOffset = days.has(todayKey) ? 0 : 1

  let streak = 0
  for (let i = startOffset; i < 365; i++) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    if (days.has(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`)) streak++
    else break
  }
  return streak
}

export function calcVolume(workout: WorkoutSummary): number {
  return workout.exercises.reduce(
    (total, exercise) => total + exercise.sets.reduce((sum, set) => sum + set.weight * set.reps, 0),
    0
  )
}

function buildWorkoutPayload(uid: string, workout: ActiveWorkout) {
  return {
    userId: uid,
    templateId: workout.templateId ?? null,
    startedAt: workout.startedAt,
    finishedAt: Date.now(),
    materialized: false,
    label: workout.label?.trim() ? workout.label : null,
    exercises: workout.exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      exerciseSource: exercise.exerciseSource,
      name: exercise.name,
      sets: exercise.sets
        .filter((set) => set.done && set.reps !== '')
        .map((set) => ({
          weight: parseFloat(set.weight) || 0,
          reps: parseInt(set.reps, 10) || 0,
        })),
    })).filter((exercise) => exercise.sets.length > 0),
  }
}

function normalizeWorkoutSummary(id: string, raw: unknown): WorkoutSummary {
  const record = asRecord(raw)

  return {
    id,
    startedAt: toFiniteNumber(record.startedAt),
    finishedAt: toFiniteNumber(record.finishedAt),
    materialized: record.materialized === true,
    templateId: typeof record.templateId === 'string' && record.templateId ? record.templateId : null,
    label: typeof record.label === 'string' && record.label.trim() ? record.label : null,
    exercises: sanitizeWorkoutExercises(record.exercises),
  }
}

function sanitizeWorkoutExercises(raw: unknown): WorkoutExerciseSummary[] {
  if (!Array.isArray(raw)) return []

  return raw.flatMap((exercise) => {
    const record = asNullableRecord(exercise)
    if (!record) return []

    const name = typeof record.name === 'string' ? record.name.trim() : ''
    const exerciseId = typeof record.exerciseId === 'string' ? record.exerciseId : undefined
    const sets = sanitizeWorkoutSets(record.sets)

    if (!name || sets.length === 0) return []

    const exerciseSource: ExerciseSource = record.exerciseSource === 'user' ? 'user' : 'global'

    return [{
      ...(exerciseId ? { exerciseId } : {}),
      exerciseSource,
      name,
      sets,
    }]
  })
}

function sanitizeWorkoutSets(raw: unknown): WorkoutSetSummary[] {
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

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function asNullableRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function toFiniteNumber(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

async function materializeWorkout(workoutId: string): Promise<void> {
  await callAuthedApi('/api/materialize-workout', { workoutId })
}

async function callAuthedApi(path: string, body: unknown): Promise<void> {
  const user = auth.currentUser
  if (!user) throw new Error('Brak aktywnej sesji użytkownika.')

  const idToken = await user.getIdToken()
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (response.ok) return

  const payload = await response.json().catch(() => null) as { error?: string } | null
  throw new Error(payload?.error ?? 'Operacja serwerowa nie powiodła się.')
}
