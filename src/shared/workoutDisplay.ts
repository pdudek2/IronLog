import { formatCompactVolume, kgToDisplayWeight, type WeightUnits } from './weightUnits'
import { groupRestSec, restSec, type Role } from './compression'

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
type FlowExercise = { group?: string; sets: Pick<DisplaySet, 'done'>[] }

// Every open set in the order the session takes them. A pair or circuit goes in rounds (A1 B1 A2 B2):
// the member with the fewest logged sets goes next, so a member without a set in this round is skipped.
function upcomingSets(exercises: FlowExercise[]): number[] {
  const open = exercises.map((exercise) => exercise.sets.filter((set) => !set.done).length)
  const logged = exercises.map((exercise, index) => exercise.sets.length - open[index]!)
  const order: number[] = []
  for (let first = open.findIndex((count) => count > 0); first >= 0; first = open.findIndex((count) => count > 0)) {
    const group = exercises[first]!.group
    let next = first
    if (group) {
      exercises.forEach((exercise, index) => {
        if (exercise.group === group && open[index]! > 0 && logged[index]! < logged[next]!) next = index
      })
    }
    order.push(next)
    open[next]! -= 1
    logged[next]! += 1
  }
  return order
}

export function focusExerciseIndex(exercises: FlowExercise[]): number {
  return upcomingSets(exercises)[0] ?? exercises.length - 1
}
export function focusSetIndex(sets: Pick<DisplaySet, 'done'>[]): number {
  const next = sets.findIndex((set) => !set.done)
  return next >= 0 ? next : Math.max(sets.length - 1, 0)
}
export function upNextQueue(exercises: FlowExercise[], currentIndex: number): number[] {
  const queue = [...new Set(upcomingSets(exercises))].filter((index) => index !== currentIndex)
  // Outside a group the queue starts after the exercise on screen, as it always has.
  return exercises[currentIndex]?.group ? queue : [...queue.filter((index) => index > currentIndex), ...queue.filter((index) => index < currentIndex)]
}
// Seconds of rest after the set just logged (the state already counts it); 0 while its round is still open.
export function restAfterSet(exercises: FlowExercise[], exerciseIndex: number, roles: readonly Role[], shortRest: boolean): number {
  const exercise = exercises[exerciseIndex]
  if (!exercise) return 0
  const role = roles[exerciseIndex] ?? 'compound'
  const round = exercise.sets.filter((set) => set.done).length
  const peers = exercise.group
    ? exercises.flatMap((other, index) => (index !== exerciseIndex && other.group === exercise.group && other.sets.length >= round ? [index] : []))
    : []
  if (!peers.length) return restSec(role, shortRest, false)
  if (peers.some((index) => exercises[index]!.sets.filter((set) => set.done).length < round)) return 0
  return groupRestSec([role, ...peers.map((index) => roles[index] ?? 'compound')], shortRest, false)
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
export function bestSet<T extends { weight: number; reps: number }>(sets: T[]): T | null {
  return sets.reduce<T | null>((top, set) => (
    !top || set.weight > top.weight || (set.weight === top.weight && set.reps > top.reps) ? set : top
  ), null)
}
export function exerciseSummaryLabel(sets: { weight: number; reps: number }[], units: WeightUnits): string {
  const count = `${sets.length} ${sets.length === 1 ? 'set' : 'sets'}`
  const best = bestSet(sets)
  if (!best) return count
  return `${count} · ${best.weight > 0 ? `${kgToDisplayWeight(best.weight, units)} ${units} × ${best.reps}` : `${best.reps} reps`}`
}
export function estimatedOneRepMax(weight: number, reps: number): number {
  return Math.round(weight * (1 + reps / 30))
}
export function trainingSinceLabel(createdAt: number, firstWorkoutAt: number | null): string {
  return `Training since ${new Date(Math.min(createdAt, firstWorkoutAt ?? createdAt)).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
}
export function formatPreviousSet(set: { weight: number; reps: number } | undefined, units: WeightUnits): string {
  return set ? `${kgToDisplayWeight(set.weight, units)} × ${set.reps}` : '—'
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

export function templateStartWeight(exercise: { targetWeight: number }, best?: { bestSetWeight: number } | null): number {
  return best && best.bestSetWeight > 0 ? best.bestSetWeight : exercise.targetWeight
}

export function setPanelStatus(set: { done: boolean } | null | undefined, setIndex: number, setCount: number): string {
  if (!set) return 'All sets done'
  return set.done ? `Editing set ${setIndex + 1}` : `Set ${setIndex + 1} of ${setCount}`
}

export function setPanelRestLabel(set: { done: boolean } | null | undefined, setIndex: number): string {
  if (!set) return 'Rest'
  return set.done ? `Editing set ${setIndex + 1}` : `Set ${setIndex + 1} rest`
}

export function exerciseSummary(names: string[]): string {
  return names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ')
}
