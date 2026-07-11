import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore'
import type { ActiveWorkout, ExerciseSource } from '../store/workoutStore'
import { db } from './firebase'
import { createSessionId } from './sessionIdentity'

export interface TemplateExercise {
  exerciseId: string
  exerciseSource: ExerciseSource
  name: string
  sets: number
  targetReps: number
  targetWeight: number
}

export interface TemplateDay {
  name: string
  exercises: TemplateExercise[]
}

export interface WorkoutTemplate {
  id: string
  userId: string
  name: string
  createdAt: number
  updatedAt: number
  days: TemplateDay[]
}

export interface TemplateInput {
  name: string
  days: TemplateDay[]
}

export interface TemplateExerciseHistory {
  bestSetWeight: number
  bestSetReps: number
}

export type TemplateExerciseHistoryMap = Map<string, TemplateExerciseHistory>

export function templateExerciseKey(exerciseId: string, source: ExerciseSource): string {
  return `${source}:${exerciseId}`
}

export async function getTemplates(uid: string): Promise<WorkoutTemplate[]> {
  const snap = await getDocs(
    query(collection(db, 'templates'), where('userId', '==', uid)),
  )

  return snap.docs
    .map((docSnap) => normalizeTemplate(docSnap.id, docSnap.data()))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getTemplate(id: string): Promise<WorkoutTemplate | null> {
  const snap = await getDoc(doc(db, 'templates', id))
  return snap.exists() ? normalizeTemplate(snap.id, snap.data()) : null
}

export async function createTemplate(uid: string, input: TemplateInput): Promise<WorkoutTemplate> {
  const now = Date.now()
  const days = normalizeDays(input.days)

  const ref = await addDoc(collection(db, 'templates'), {
    userId: uid,
    name: input.name.trim(),
    createdAt: now,
    updatedAt: now,
    days,
  })

  return {
    id: ref.id,
    userId: uid,
    name: input.name.trim(),
    createdAt: now,
    updatedAt: now,
    days,
  }
}

export async function updateTemplate(id: string, input: TemplateInput): Promise<void> {
  await updateDoc(doc(db, 'templates', id), {
    name: input.name.trim(),
    days: normalizeDays(input.days),
    updatedAt: Date.now(),
  })
}

export async function deleteTemplate(id: string): Promise<void> {
  await deleteDoc(doc(db, 'templates', id))
}

export function buildActiveWorkoutFromTemplate(
  template: WorkoutTemplate,
  dayIndex = 0,
  historyByExercise: TemplateExerciseHistoryMap = new Map(),
): ActiveWorkout {
  const day = template.days[dayIndex] ?? template.days[0]
  const label = day?.name?.trim()
    ? day.name.trim()
    : template.name.trim()

  return {
    sessionId: createSessionId(),
    startedAt: Date.now(),
    templateId: template.id,
    label,
    exercises: (day?.exercises ?? []).map((exercise) => {
      const history = historyByExercise.get(templateExerciseKey(exercise.exerciseId, exercise.exerciseSource))
      const weight = history && history.bestSetWeight > 0
        ? String(history.bestSetWeight)
        : exercise.targetWeight > 0 ? String(exercise.targetWeight) : ''
      const reps = history && history.bestSetReps > 0
        ? String(history.bestSetReps)
        : exercise.targetReps > 0 ? String(exercise.targetReps) : ''

      return {
        exerciseId: exercise.exerciseId,
        exerciseSource: exercise.exerciseSource,
        name: exercise.name,
        sets: Array.from({ length: Math.max(1, exercise.sets) }, () => ({
          weight,
          reps,
          done: false,
        })),
      }
    }),
  }
}

function normalizeTemplate(id: string, raw: unknown): WorkoutTemplate {
  const record = asRecord(raw)

  return {
    id,
    userId: typeof record.userId === 'string' ? record.userId : '',
    name: typeof record.name === 'string' && record.name.trim() ? record.name.trim() : 'Szablon',
    createdAt: toFiniteNumber(record.createdAt),
    updatedAt: toFiniteNumber(record.updatedAt ?? record.createdAt),
    days: normalizeDays(record.days),
  }
}

function normalizeDays(raw: unknown): TemplateDay[] {
  if (!Array.isArray(raw)) return []

  return raw.flatMap((day, index) => {
    const record = asNullableRecord(day)
    if (!record) return []

    const name = typeof record.name === 'string' && record.name.trim()
      ? record.name.trim()
      : `Dzień ${index + 1}`

    const exercises = normalizeExercises(record.exercises)

    return [{ name, exercises }]
  })
}

function normalizeExercises(raw: unknown): TemplateExercise[] {
  if (!Array.isArray(raw)) return []

  return raw.flatMap((exercise) => {
    const record = asNullableRecord(exercise)
    if (!record) return []

    const exerciseId = typeof record.exerciseId === 'string' ? record.exerciseId : ''
    const name = typeof record.name === 'string' ? record.name.trim() : ''

    if (!exerciseId || !name) return []

    return [{
      exerciseId,
      exerciseSource: record.exerciseSource === 'user' ? 'user' : 'global',
      name,
      sets: clampPositiveInteger(record.sets, 1),
      targetReps: clampPositiveInteger(record.targetReps, 0),
      targetWeight: clampPositiveNumber(record.targetWeight, 0),
    }]
  })
}

function clampPositiveInteger(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(fallback, Math.round(numeric))
}

function clampPositiveNumber(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value))
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(fallback, Math.round(numeric * 10) / 10)
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
