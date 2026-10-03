import { parseAiContextHeader, type AiContextMetadata } from '../../src/lib/aiContext'
import { kgToDisplayWeight, type WeightUnits } from '../../src/shared/weightUnits'
import type { TemplateExercise } from './workoutLaunch'
import { normalizePlanDraft, type PlanDraft } from './planEditor'
import { boundedJson, CoachApiError } from './coachService'

export interface PlanBrief {
  goal: string; daysPerWeek: number; experience: string; equipment: string[]; focus: string; notes: string
}
export interface GeneratedPlan { name: string; summary: string; days: { name: string; exercises: TemplateExercise[] }[] }
export interface PlanResult { plan: GeneratedPlan; context: AiContextMetadata }
export interface CoachPlanRequest { key: string; brief: PlanBrief; signal: AbortSignal }
export const PLAN_RESPONSE_LIMIT = 128 * 1024
export const defaultPlanBrief = (): PlanBrief => ({ goal: '', daysPerWeek: 3, experience: 'intermediate', equipment: ['barbell', 'dumbbell', 'bodyweight'], focus: '', notes: '' })

export function planRequestBody(key: string, brief: PlanBrief): string {
  if (brief.goal.trim().length < 2) throw new CoachApiError('Enter a plan goal to generate a template.')
  if (brief.goal.length > 400 || brief.focus.length > 160 || brief.notes.length > 400
    || !Number.isInteger(brief.daysPerWeek) || brief.daysPerWeek < 2 || brief.daysPerWeek > 6
    || !['beginner', 'intermediate', 'advanced'].includes(brief.experience)
    || brief.equipment.length > 6 || brief.equipment.some(item => !['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'kettlebell'].includes(item))) {
    throw new CoachApiError('Check the workout brief before generating a plan.')
  }
  return JSON.stringify({ apiKey: key, mode: 'plan', planRequest: brief })
}
function invalid(): never { throw new CoachApiError('AI Coach returned an invalid plan. Generate again when ready.') }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  return value as Record<string, unknown>
}
function text(value: unknown, max: number, min = 1): string {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) return invalid()
  return value.trim()
}
function number(value: unknown, max: number, min = 0, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) return invalid()
  return value
}
export function parseGeneratedPlan(payload: unknown): GeneratedPlan {
  const plan = record(record(payload).plan)
  if (!Array.isArray(plan.days) || !plan.days.length || plan.days.length > 14) return invalid()
  return { name: text(plan.name, 120, 2), summary: text(plan.summary, 4000), days: plan.days.map(rawDay => {
    const day = record(rawDay)
    if (!Array.isArray(day.exercises) || !day.exercises.length || day.exercises.length > 20) return invalid()
    const seen = new Set<string>()
    return { name: text(day.name, 80), exercises: day.exercises.map(raw => {
      const exercise = record(raw)
      if (exercise.exerciseSource !== 'global' && exercise.exerciseSource !== 'user') return invalid()
      const exerciseId = text(exercise.exerciseId, 512)
      if (exerciseId.includes('/') || seen.has(`${exercise.exerciseSource}:${exerciseId}`)) return invalid()
      seen.add(`${exercise.exerciseSource}:${exerciseId}`)
      return { exerciseId, exerciseSource: exercise.exerciseSource, name: text(exercise.name, 160),
        sets: number(exercise.sets, 20, 1, true), targetReps: number(exercise.targetReps, 1000, 0, true), targetWeight: number(exercise.targetWeight, 2000) }
    }) }
  }) }
}
export async function consumePlanResponse(response: Response, signal: AbortSignal): Promise<PlanResult> {
  if (!response.headers.get('content-type')?.includes('application/json') || !response.body
    || Number(response.headers.get('content-length')) > PLAN_RESPONSE_LIMIT) return invalid()
  let payload: unknown
  try { payload = await boundedJson(response, signal, PLAN_RESPONSE_LIMIT) } catch { return invalid() }
  return { plan: parseGeneratedPlan(payload), context: parseAiContextHeader(response.headers) }
}

export function generatedPlanDraft(plan: GeneratedPlan, units: WeightUnits, newId: () => string, save: boolean): PlanDraft {
  const days = plan.days.map(day => ({ rowId: newId(), name: day.name, exercises: day.exercises.map(exercise => {
    const weight = String(kgToDisplayWeight(exercise.targetWeight, units))
    return { ...exercise, rowId: newId(), sets: String(exercise.sets), targetReps: String(exercise.targetReps), weight,
      originalWeightKg: exercise.targetWeight, originalWeightDisplay: weight }
  }) }))
  const draft: PlanDraft = { draftId: newId(), revision: 0, targetId: null, baseline: null, resolvedId: null,
    units, name: plan.name, days, selectedDayId: days[0]!.rowId, pending: null, dirty: true }
  if (save) draft.pending = normalizePlanDraft(draft, newId())
  return draft
}
export function shouldSaveImportedDraft(draft: PlanDraft | null, importId?: string): boolean {
  return !!importId && draft?.draftId === importId && draft.targetId === null && !!draft.pending && !draft.resolvedId
}
