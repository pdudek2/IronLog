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
export function upNextQueue(exercises: { sets: Pick<DisplaySet, 'done'>[] }[], currentIndex: number): number[] {
  const order = [...exercises.keys()]
  return [...order.slice(currentIndex + 1), ...order.slice(0, Math.max(currentIndex, 0))]
    .filter((index) => exercises[index]!.sets.some((set) => !set.done))
}
export function panelSetIndex(sets: { clientId?: string; done: boolean }[], selectedSetId: string | null): number {
  const selected = selectedSetId === null ? -1 : sets.findIndex((set, index) => (set.clientId ?? String(index)) === selectedSetId)
  return selected >= 0 ? selected : sets.findIndex((set) => !set.done)
}
export function setPairLabel(set: Pick<DisplaySet, 'weight' | 'reps'>, units: WeightUnits): string {
  return `${kgToDisplayWeight(parseWeight(set.weight), units)} × ${parseReps(set.reps)}`
}
export function exerciseTargetLabel(sets: DisplaySet[], units: WeightUnits): string {
  const next = sets.find((set) => !set.done) ?? sets[0]
  const reps = parseReps(next?.reps ?? '')
  const weight = parseWeight(next?.weight ?? '')
  const volume = reps > 0 ? `${sets.length} × ${reps}` : `${sets.length} ${sets.length === 1 ? 'set' : 'sets'}`
  return weight > 0 ? `${volume} · ${kgToDisplayWeight(weight, units)} ${units}` : volume
}
export function exerciseSummaryLabel(sets: { weight: number; reps: number }[], units: WeightUnits): string {
  const count = `${sets.length} ${sets.length === 1 ? 'set' : 'sets'}`
  const best = sets.reduce<{ weight: number; reps: number } | null>((top, set) => (
    !top || set.weight > top.weight || (set.weight === top.weight && set.reps > top.reps) ? set : top
  ), null)
  if (!best) return count
  return `${count} · ${best.weight > 0 ? `${kgToDisplayWeight(best.weight, units)} × ${best.reps}` : `${best.reps} reps`}`
}
export function estimatedOneRepMax(weight: number, reps: number): number {
  return Math.round(weight * (1 + reps / 30))
}
export function trainingSinceLabel(createdAt: number): string {
  return `Training since ${new Date(createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
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

