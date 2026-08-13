import {
  type QueryDocumentSnapshot,
  type DocumentData,
  type QuerySnapshot,
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
import type { ExerciseSource } from '../store/workoutStore'
import { auth, db } from './firebase'

interface WorkoutSetSummary {
  weight: number
  reps: number
}

export interface WorkoutExerciseSummary {
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

export interface SaveWorkoutResult {
  id: string
  materialized: boolean
}

export interface WorkoutHistoryResult {
  workouts: WorkoutSummary[]
  truncated: boolean
}

export interface MaterializationRetryResult {
  attempted: number
  failed: number
}

export interface WorkoutUpdateResult {
  status: 'materialized' | 'projection_pending'
}

export interface WorkoutDeleteResult {
  status: 'deleted' | 'cleanup_pending'
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
): Promise<WorkoutUpdateResult> {
  const result = await callAuthedApi<unknown>('/api/update-workout', {
    workoutId: id,
    label: data.label ?? null,
    exercises: data.exercises ?? [],
  })
  if (!isWorkoutUpdateResult(result)) throw new Error('Nieprawidłowa odpowiedź serwera.')
  return result
}

export async function deleteWorkout(id: string): Promise<WorkoutDeleteResult> {
  const result = await callAuthedApi<unknown>('/api/delete-workout', { workoutId: id })
  if (!isWorkoutDeleteResult(result)) throw new Error('Nieprawidłowa odpowiedź serwera.')
  return result
}

export async function retryPendingMaterializations(
  workouts: WorkoutSummary[],
): Promise<MaterializationRetryResult> {
  const pending = workouts.filter((workout) => !workout.materialized)
  const results = await Promise.allSettled(
    pending.map((workout) => retryWorkoutMaterialization(workout.id)),
  )

  return {
    attempted: pending.length,
    failed: results.filter((result) => result.status === 'rejected').length,
  }
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

export async function materializeWorkout(workoutId: string): Promise<void> {
  await callAuthedApi<{ ok: true }>('/api/materialize-workout', { workoutId })
}

export async function retryWorkoutMaterialization(workoutId: string): Promise<void> {
  await materializeWorkout(workoutId)
}

async function callAuthedApi<T>(path: string, body: unknown): Promise<T> {
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

  const payload = await response.json().catch(() => null) as T | { error?: string } | null
  if (!response.ok) {
    const errorPayload = payload as { error?: string } | null
    throw new Error(errorPayload?.error ?? 'Operacja serwerowa nie powiodła się.')
  }
  if (!payload) throw new Error('Nieprawidłowa odpowiedź serwera.')
  return payload as T
}

function isWorkoutUpdateResult(value: unknown): value is WorkoutUpdateResult {
  return isRecord(value)
    && (value.status === 'materialized' || value.status === 'projection_pending')
}

function isWorkoutDeleteResult(value: unknown): value is WorkoutDeleteResult {
  return isRecord(value)
    && (value.status === 'deleted' || value.status === 'cleanup_pending')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
