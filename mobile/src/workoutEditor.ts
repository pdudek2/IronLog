import type { EditableWorkout, WorkoutEditContent, WorkoutMutationGuard } from '../../src/shared/workoutMutation'
import { displayWeightStringToKg, kgToDisplayWeight, type WeightUnits } from '../../src/shared/weightUnits'
export interface WorkoutDraftSet { rowId: string; weight: string; reps: string; originalKg?: number; originalDisplay?: string }
export interface WorkoutDraftExercise { rowId: string; exerciseId: string; exerciseSource: 'global' | 'user'; name: string; sets: WorkoutDraftSet[] }
export type WorkoutPendingOperation = WorkoutMutationGuard & { workoutId: string; committed?: true } & ({ action: 'delete' } | { action: 'update'; content: WorkoutEditContent })
export interface WorkoutDraft {
  draftId: string; revision: number; workoutId: string; baseline: string; original: WorkoutEditContent
  startedAt: number; finishedAt: number; label: string; units: WeightUnits; exercises: WorkoutDraftExercise[]; pending: WorkoutPendingOperation | null
}
export function newWorkoutDraft(workout: EditableWorkout, baseline: string, units: WeightUnits, newId: () => string): WorkoutDraft {
  return { draftId: newId(), revision: 0, workoutId: workout.id, baseline, startedAt: workout.startedAt, finishedAt: workout.finishedAt,
    original: { label: workout.label, exercises: workout.exercises }, label: workout.label ?? '', units, pending: null,
    exercises: workout.exercises.map(ex => ({ ...ex, rowId: newId(), sets: ex.sets.map(set => {
      const weight = String(kgToDisplayWeight(set.weight, units))
      return { rowId: newId(), weight, reps: String(set.reps), originalKg: set.weight, originalDisplay: weight }
    }) })),
  }
}
export function normalizeWorkoutDraft(draft: WorkoutDraft): WorkoutEditContent {
  const label = draft.label.trim() || null
  if ((label?.length ?? 0) > 120) throw new Error('Label cannot exceed 120 characters.')
  if (!draft.exercises.length || draft.exercises.length > 20) throw new Error('A workout needs 1–20 exercises.')
  return { label, exercises: draft.exercises.map(ex => {
    if (!ex.exerciseId || !ex.name.trim() || !['global', 'user'].includes(ex.exerciseSource)) throw new Error('Invalid exercise identity.')
    if (!ex.sets.length || ex.sets.length > 20) throw new Error('Each exercise needs 1–20 sets.')
    return { exerciseId: ex.exerciseId, exerciseSource: ex.exerciseSource, name: ex.name, sets: ex.sets.map(set => {
      const clean = set.weight.trim().replace(',', '.')
      if (!/^(?:\d+\.?\d*|\.\d+)$/.test(clean)) throw new Error('Enter a valid weight.')
      const weight = set.weight === set.originalDisplay && set.originalKg !== undefined ? set.originalKg : Number(displayWeightStringToKg(clean, draft.units))
      const reps = Number(set.reps.trim())
      if (!Number.isFinite(weight) || weight < 0 || weight > 2000) throw new Error('Weight must be between 0 and 2000 kg.')
      if (!/^\d+$/.test(set.reps.trim()) || !Number.isInteger(reps) || reps < 1 || reps > 1000) throw new Error('Reps must be a whole number from 1 to 1000.')
      return { weight, reps }
    }) }
  }) }
}
export function workoutDraftDirty(draft: WorkoutDraft): boolean {
  try { return JSON.stringify(normalizeWorkoutDraft(draft)) !== JSON.stringify(draft.original) }
  catch { return true }
}
// Storage validation is separate from form validation: incomplete form fields remain recoverable.
export function isWorkoutDraft(value: unknown, workoutId: string): value is WorkoutDraft {
  if (!value || typeof value !== 'object') return false
  const d = value as WorkoutDraft
  const string = (v: unknown, max: number) => typeof v === 'string' && v.length <= max
  if (!string(d.draftId, 128) || !d.draftId || !Number.isSafeInteger(d.revision) || d.revision < 0 || d.workoutId !== workoutId
    || !/^[a-f0-9]{64}$/.test(d.baseline) || !Number.isFinite(d.startedAt) || !Number.isFinite(d.finishedAt) || !string(d.label, 120)
    || !['kg', 'lbs'].includes(d.units) || !validOriginal(d.original)
    || !Array.isArray(d.exercises) || d.exercises.length > 20) return false
  const rowIds = new Set<string>()
  for (const ex of d.exercises) {
    if (!ex || !string(ex.rowId, 128) || rowIds.has(ex.rowId) || !string(ex.exerciseId, 160) || !string(ex.name, 120)
      || !['global', 'user'].includes(ex.exerciseSource) || !Array.isArray(ex.sets) || ex.sets.length > 20) return false
    rowIds.add(ex.rowId)
    for (const set of ex.sets) {
      if (!set || !string(set.rowId, 128) || rowIds.has(set.rowId) || !string(set.weight, 32) || !string(set.reps, 16)
        || (set.originalKg !== undefined && (!Number.isFinite(set.originalKg) || set.originalKg < 0 || set.originalKg > 2000))
        || (set.originalDisplay !== undefined && !string(set.originalDisplay, 32))) return false
      rowIds.add(set.rowId)
    }
  }
  if (d.pending !== null) {
    const p = d.pending
    if (!p || (p.committed !== undefined && p.committed !== true) || !['update', 'delete'].includes(p.action) || p.workoutId !== workoutId || p.baseline !== d.baseline
      || !/^[A-Za-z0-9_-]{8,128}$/.test(p.operationId)) return false
    if (p.action === 'update') {
      try { if (JSON.stringify(p.content) !== JSON.stringify(normalizeWorkoutDraft(d))) return false } catch { return false }
    }
  }
  return true
}

function validOriginal(value: unknown): value is WorkoutEditContent {
  if (!value || typeof value !== 'object') return false
  const content = value as WorkoutEditContent
  return (content.label === null || (typeof content.label === 'string' && content.label.length <= 120))
    && Array.isArray(content.exercises) && content.exercises.length > 0 && content.exercises.length <= 20
    && content.exercises.every(ex => ex && typeof ex.exerciseId === 'string' && !!ex.exerciseId
      && typeof ex.name === 'string' && !!ex.name && ['global', 'user'].includes(ex.exerciseSource)
      && Array.isArray(ex.sets) && ex.sets.length > 0 && ex.sets.length <= 20
      && ex.sets.every(set => set && Number.isFinite(set.weight) && set.weight >= 0 && set.weight <= 2000
        && Number.isInteger(set.reps) && set.reps >= 1 && set.reps <= 1000))
}
