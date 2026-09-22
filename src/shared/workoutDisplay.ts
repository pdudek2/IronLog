import { formatCompactVolume, kgToDisplayWeight, type WeightUnits } from './weightUnits'

export type DisplaySet = { weight: string; reps: string; done: boolean }
export function parseWeight(value: string): number {
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n : 0
}
export function parseReps(value: string): number {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : 0
}
export function calcSetVolume(set: Pick<DisplaySet, 'weight' | 'reps'>): number {
  return parseWeight(set.weight) * parseReps(set.reps)
}
export function exerciseMetrics(sets: DisplaySet[]) {
  return {
    completed: sets.filter((set) => set.done && parseReps(set.reps) > 0).length,
    volumeKg: sets.reduce((sum, set) => sum + (set.done ? calcSetVolume(set) : 0), 0),
    maxKg: sets.reduce((max, set) => set.done ? Math.max(max, parseWeight(set.weight)) : max, 0),
  }
}
export function summarizeExercise(exercise: { sets: DisplaySet[] }, units: WeightUnits) {
  const { completed, volumeKg, maxKg } = exerciseMetrics(exercise.sets)
  return { completed, total: exercise.sets.length, volume: formatCompactVolume(volumeKg, units),
    max: maxKg ? `${kgToDisplayWeight(maxKg, units)} ${units}` : '—' }
}
export function focusExerciseIndex(exercises: { sets: Pick<DisplaySet, 'done'>[] }[]): number {
  const next = exercises.findIndex((exercise) => exercise.sets.some((set) => !set.done))
  return next >= 0 ? next : exercises.length - 1
}
export function focusSetIndex(sets: Pick<DisplaySet, 'done'>[]): number {
  const next = sets.findIndex((set) => !set.done)
  return next >= 0 ? next : Math.max(sets.length - 1, 0)
}
export function formatPreviousSet(set: { weight: number; reps: number } | undefined, units: WeightUnits): string {
  return set ? `${kgToDisplayWeight(set.weight, units)}×${set.reps}` : '—'
}

export const WORKOUT_LABELS = ['Push', 'Pull', 'Legs', 'Upper Body', 'Lower Body', 'Full Body', 'Back & Biceps', 'Chest & Triceps', 'Cardio', 'Crossfit', 'Mobility'] as const
export const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbells',
  cable: 'Cable',
  machine: 'Machine',
  bodyweight: 'BW',
  kettlebell: 'KB',
}

export function formatElapsedTime(startedAt: number, now = Date.now()): string {
  const total = Math.max(0, Math.floor((now - startedAt) / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

