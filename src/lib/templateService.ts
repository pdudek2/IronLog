import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore'
import type { ActiveWorkout, ExerciseSource } from '../store/workoutStore'
import { db } from './firebase'
import { callAuthedApi } from './authedApi'
import { templateFingerprint, type EditableTemplate } from '../shared/templateFingerprint'
import { createSessionId } from './sessionIdentity'
import { confirmedQuery } from './confirmedQuery'

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

import { templateExerciseKey, type TemplateExerciseOverrideMap } from '../shared/nextSessionRecommendation'
export { templateExerciseKey, type TemplateExerciseOverride, type TemplateExerciseOverrideMap } from '../shared/nextSessionRecommendation'

export async function getTemplates(uid: string): Promise<WorkoutTemplate[]> {
  const snap = confirmedQuery(await getDocs(
    query(collection(db, 'templates'), where('userId', '==', uid)),
  ))

  return snap.docs
    .map((docSnap) => normalizeTemplate(docSnap.id, docSnap.data()))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

// The server compares this fingerprint of the stored document before an edit is saved, so it is taken from the raw
// data rather than the normalized template. null when the stored plan is too malformed to fingerprint.
export async function getTemplate(id: string): Promise<(WorkoutTemplate & { editBaseline: string | null }) | null> {
  const snap = await getDoc(doc(db, 'templates', id))
  if (!snap.exists()) return null
  let editBaseline: string | null
  try {
    editBaseline = templateFingerprint(snap.data() as EditableTemplate)
  } catch {
    editBaseline = null
  }
  return { ...normalizeTemplate(snap.id, snap.data()), editBaseline }
}

// A retried save reuses its operationId, so a lost response cannot create the plan twice.
export async function createTemplate(uid: string, input: TemplateInput, operationId?: string): Promise<WorkoutTemplate> {
  return saveTemplate(input, undefined, uid, operationId ? { operationId } : undefined)
}

// With a guard the server refuses the edit when the plan changed since it was loaded, instead of overwriting it.
export async function updateTemplate(
  id: string,
  input: TemplateInput,
  guard?: { operationId: string; baseline: string },
): Promise<void> {
  await saveTemplate(input, id, undefined, guard)
}

export async function deleteTemplate(id: string): Promise<void> {
  await deleteDoc(doc(db, 'templates', id))
}

export function buildActiveWorkoutFromTemplate(
  template: WorkoutTemplate,
  dayIndex = 0,
  historyByExercise: TemplateExerciseHistoryMap = new Map(),
  overridesByExercise: TemplateExerciseOverrideMap = new Map(),
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
      const key = templateExerciseKey(exercise.exerciseId, exercise.exerciseSource)
      const history = historyByExercise.get(key)
      const override = overridesByExercise.get(key)
      const weightValue = override?.weight
        ?? (history && history.bestSetWeight > 0 ? history.bestSetWeight : exercise.targetWeight)
      const repsValue = override?.reps
        ?? (history && history.bestSetReps > 0 ? history.bestSetReps : exercise.targetReps)
      const weight = weightValue > 0 ? String(weightValue) : ''
      const reps = repsValue > 0 ? String(repsValue) : ''
      const setCount = Math.max(1, Math.round(override?.sets ?? exercise.sets))

      return {
        exerciseId: exercise.exerciseId,
        exerciseSource: exercise.exerciseSource,
        name: exercise.name,
        sets: Array.from({ length: setCount }, () => ({
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
    name: typeof record.name === 'string' && record.name.trim() ? record.name.trim() : 'Template',
    createdAt: toFiniteNumber(record.createdAt),
    updatedAt: toFiniteNumber(record.updatedAt ?? record.createdAt),
    days: normalizeDays(record.days),
  }
}

async function saveTemplate(
  input: TemplateInput,
  id?: string,
  expectedUid?: string,
  guard?: { operationId: string; baseline?: string },
): Promise<WorkoutTemplate> {
  const response = await callAuthedApi<unknown>('/api/save-template', {
    ...(id ? { id } : {}),
    name: input.name,
    days: input.days,
    ...guard,
  }, expectedUid)
  const record = asRecord(response)
  const template = asNullableRecord(record.template)
  if (!template || typeof template.id !== 'string') throw new Error('Invalid server response.')
  return normalizeTemplate(template.id, template)
}

function normalizeDays(raw: unknown): TemplateDay[] {
  if (!Array.isArray(raw)) return []

  return raw.flatMap((day, index) => {
    const record = asNullableRecord(day)
    if (!record) return []

    const name = typeof record.name === 'string' && record.name.trim()
      ? record.name.trim()
      : `Day ${index + 1}`

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
  // Four decimals, as saved: a lbs target stored in kg must read back as the same lbs value.
  return Math.max(fallback, Math.round(numeric * 10_000) / 10_000)
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
