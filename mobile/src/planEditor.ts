import { displayWeightStringToKg, kgToDisplayWeight, type WeightUnits } from '../../src/shared/weightUnits'
import { templateFingerprint } from '../../src/shared/templateFingerprint'
import type { WorkoutTemplate, TemplateExercise } from './workoutLaunch'

export interface EditorExercise extends Omit<TemplateExercise, 'sets' | 'targetReps' | 'targetWeight'> {
  rowId: string
  sets: string
  targetReps: string
  weight: string
  originalWeightKg?: number
  originalWeightDisplay?: string
}
export interface EditorDay { rowId: string; name: string; exercises: EditorExercise[] }
export interface PlanSaveRequest {
  id?: string
  operationId: string
  baseline?: string
  name: string
  days: { name: string; exercises: TemplateExercise[] }[]
}
export interface PlanDraft {
  draftId: string
  revision: number
  targetId: string | null
  baseline: string | null
  units: WeightUnits
  name: string
  days: EditorDay[]
  selectedDayId: string
  pending: PlanSaveRequest | null
  resolvedId: string | null
  dirty: boolean
}

export function newPlanDraft(draftId: string, units: WeightUnits, template: WorkoutTemplate | null, newId: () => string): PlanDraft {
  const days = template?.days.length ? template.days.map((day) => ({
    rowId: newId(), name: day.name,
    exercises: day.exercises.map((exercise) => {
      const weight = String(kgToDisplayWeight(exercise.targetWeight, units))
      return { ...exercise, rowId: newId(), sets: String(exercise.sets), targetReps: String(exercise.targetReps),
        weight, originalWeightKg: exercise.targetWeight, originalWeightDisplay: weight }
    }),
  })) : [{ rowId: newId(), name: 'Day 1', exercises: [] }]
  return {
    draftId, revision: 0, targetId: template?.id ?? null, baseline: template ? templateFingerprint(template) : null,
    units, name: template?.name ?? '', days, selectedDayId: days[0]!.rowId, pending: null, resolvedId: null, dirty: false,
  }
}

function numeric(text: string, maximum: number, whole: boolean, label: string): number {
  const clean = text.trim()
  if (!clean || !(whole ? /^\d+$/.test(clean) : /^(?:\d+\.?\d*|\.\d+)$/.test(clean))) throw new Error(`Enter a valid ${label}.`)
  const value = Number(clean)
  if (!Number.isFinite(value) || value < 0 || value > maximum || (whole && !Number.isInteger(value))) throw new Error(`Enter a valid ${label}.`)
  return value
}

export function normalizePlanDraft(draft: PlanDraft, operationId: string): PlanSaveRequest {
  if (!draft.targetId && draft.resolvedId) throw new Error('This plan was already created. Reload or discard this draft before creating another.')
  if (draft.targetId && draft.baseline === null) throw new Error('The edit baseline is missing. Reload this plan.')
  const name = draft.name.trim()
  if (name.length < 2 || name.length > 120) throw new Error('Plan name must be 2–120 characters.')
  if (draft.days.length < 1 || draft.days.length > 14) throw new Error('A plan needs 1–14 days.')
  if (draft.days.every((day) => day.exercises.length === 0)) throw new Error('Add at least one exercise.')
  const days = draft.days.map((day, index) => {
    const dayName = day.name.trim() || `Day ${index + 1}`
    if (dayName.length > 80) throw new Error('Day name cannot exceed 80 characters.')
    if (day.exercises.length > 20) throw new Error('A day can have at most 20 exercises.')
    const seen = new Set<string>()
    return { name: dayName, exercises: day.exercises.map((exercise) => {
      const key = `${exercise.exerciseSource}:${exercise.exerciseId}`
      if (seen.has(key)) throw new Error('An exercise is already in this day.')
      seen.add(key)
      const displayWeight = numeric(exercise.weight, draft.units === 'lbs' ? 4_409.25 : 2_000, false, 'weight')
      const converted = exercise.originalWeightDisplay === exercise.weight && exercise.originalWeightKg !== undefined
        ? String(exercise.originalWeightKg) : displayWeightStringToKg(String(displayWeight), draft.units)
      const sets = numeric(exercise.sets, 20, true, 'sets')
      if (sets === 0) throw new Error('Sets must be 1–20.')
      return {
        exerciseId: exercise.exerciseId, exerciseSource: exercise.exerciseSource, name: exercise.name,
        sets,
        targetReps: numeric(exercise.targetReps, 1000, true, 'reps'),
        targetWeight: numeric(converted, 2000, false, 'weight'),
      }
    }) }
  })
  return {
    ...(draft.targetId ? { id: draft.targetId, baseline: draft.baseline! } : {}),
    operationId, name, days,
  }
}
