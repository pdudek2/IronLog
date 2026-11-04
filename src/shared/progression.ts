import { kgToDisplayWeight, type WeightUnits } from './weightUnits'

// Rules and their sources: PRODUCT.md, „Specyfikacja punktu 1 — silnik progresji”.
export interface ProgressionSet { weight: number; reps: number }
export interface ProgressionSession { finishedAt: number; sets: ProgressionSet[] }

export interface ProgressionInput {
  sessions: ProgressionSession[]
  // Plan prescription; null when the session has no plan, 'ambiguous' when the plan has the exercise on days with
  // different targets and the day is unknown.
  target: { reps: number; sets: number } | null | 'ambiguous'
  equipment?: string
  category?: string
  units: WeightUnits
  lowReadiness?: boolean
  now: number
}

export interface Progression {
  // Today's working weight in kg; null when a very long break leaves the choice to the user.
  weight: number | null
  reps: number
  change: 'weight' | 'reps' | 'none'
  delta: number
  // Set on a break: the first set is a test and may raise the weight up to maxWeight.
  trial: { maxWeight: number } | null
  floor: number
  step: number
}

const DAY_MS = 24 * 60 * 60 * 1000
const LB_KG = 0.45359237
const DEFAULT_STEP_KG: Record<string, number> = { dumbbell: 2, kettlebell: 4 }

export function repCeiling(target: number): number {
  if (target <= 3) return target
  return target <= 6 ? target + 1 : target + 2
}

function cleanSessions(sessions: ProgressionSession[]): ProgressionSession[] {
  return sessions
    .map((session) => ({
      finishedAt: session.finishedAt,
      sets: session.sets.filter((set) => Number.isFinite(set.weight) && set.weight >= 0 && Number.isInteger(set.reps) && set.reps > 0),
    }))
    .filter((session) => Number.isFinite(session.finishedAt) && session.sets.length > 0)
    .sort((a, b) => b.finishedAt - a.finishedAt)
}

function topWeight(session: ProgressionSession): number {
  return Math.max(...session.sets.map((set) => set.weight))
}

// Working sets share the session's top weight; lighter sets under 80% of it are warm-ups.
function workingSets(session: ProgressionSession): ProgressionSet[] | 'ambiguous' {
  const top = topWeight(session)
  if (session.sets.some((set) => set.weight < top && set.weight >= top * 0.8)) return 'ambiguous'
  return session.sets.filter((set) => set.weight === top)
}

function mostCommonReps(sets: ProgressionSet[]): number {
  const counts = new Map<number, number>()
  for (const set of sets) counts.set(set.reps, (counts.get(set.reps) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0]
}

function stepFor(sessions: ProgressionSession[], equipment: string | undefined, units: WeightUnits): number {
  const tops = sessions.map(topWeight)
  // Jumps over 10% are deloads or returns, not the plate or stack step.
  const diffs = tops.slice(1)
    .map((top, i) => ({ diff: Math.abs(tops[i]! - top), heavier: Math.max(tops[i]!, top) }))
    .filter(({ diff, heavier }) => diff >= 0.25 && diff <= heavier * 0.1)
    .map(({ diff }) => diff)
  if (diffs.length) return Math.min(...diffs)
  if (units === 'lbs') return 5 * LB_KG
  return DEFAULT_STEP_KG[equipment ?? ''] ?? 2.5
}

const round2 = (value: number) => Math.round(value * 100) / 100

export function buildProgression(input: ProgressionInput): Progression | null {
  if (input.category === 'cardio' || input.target === 'ambiguous') return null
  const sessions = cleanSessions(input.sessions)
  const latest = sessions[0]
  if (!latest) return null
  const latestWorking = workingSets(latest)
  if (latestWorking === 'ambiguous') return null

  const target = input.target ?? { reps: mostCommonReps(latestWorking), sets: latestWorking.length }
  const floor = target.reps
  const step = stepFor(sessions, input.equipment, input.units)
  const lastWeight = topWeight(latest)
  const gapDays = (input.now - latest.finishedAt) / DAY_MS

  if (gapDays > 14) {
    const trial = { maxWeight: lastWeight }
    if (gapDays > 84) return { weight: null, reps: floor, change: 'none', delta: 0, trial, floor, step }
    const cut = gapDays > 28 ? Math.min(0.2, 0.05 * Math.ceil((gapDays - 28) / 14)) : 0
    const weight = Math.max(0, round2(lastWeight - Math.round((lastWeight * cut) / step) * step))
    const delta = round2(weight - lastWeight)
    return { weight, reps: floor, change: delta < 0 ? 'weight' : 'none', delta, trial, floor, step }
  }

  // A deload in the last fortnight is not the reference: the heaviest of the last three recent sessions is.
  const recent = sessions.slice(0, 3).filter((session) => input.now - session.finishedAt <= 14 * DAY_MS)
  const base = recent.reduce((best, session) => (topWeight(session) > topWeight(best) ? session : best), latest)
  const working = workingSets(base)
  if (working === 'ambiguous') return null
  const weight = topWeight(base)
  const weakest = Math.min(...working.map((set) => set.reps))

  if (weight === 0) {
    return { weight: 0, reps: weakest + 1, change: 'reps', delta: 0, trial: null, floor, step }
  }

  // A step over 10% of the weight (light dumbbells) first asks for two more reps.
  const stepTooBig = step > weight * 0.1
  const ceiling = repCeiling(floor) + (stepTooBig ? 2 : 0)
  const enoughSets = working.length >= Math.max(1, target.sets - 1)
  const reachedTop = working.every((set) => set.reps >= ceiling)

  if (reachedTop && enoughSets && !input.lowReadiness) {
    return { weight: round2(weight + step), reps: floor, change: 'weight', delta: round2(step), trial: null, floor, step }
  }
  const reps = Math.min(ceiling, weakest + 1)
  return { weight, reps, change: reps > weakest && enoughSets ? 'reps' : 'none', delta: 0, trial: null, floor, step }
}

// Epley 1RM from the first set of a trial, turned into a weight for the floor reps; never above the pre-break weight.
export function trialWeight(progression: Progression, firstSet: ProgressionSet): number | null {
  if (!progression.trial || progression.floor <= 3 || firstSet.weight <= 0 || firstSet.reps <= 0) return null
  const planned = progression.weight ?? firstSet.weight
  if (firstSet.weight < planned * 0.8) return null
  const oneRepMax = firstSet.weight * (1 + Math.min(firstSet.reps, 10) / 30)
  const raw = oneRepMax / (1 + progression.floor / 30)
  const onGrid = firstSet.weight + Math.floor((raw - firstSet.weight) / progression.step + 1e-9) * progression.step
  return Math.max(0, round2(Math.min(progression.trial.maxWeight, onGrid)))
}

function signedWeight(deltaKg: number, units: WeightUnits): string {
  return `${deltaKg > 0 ? '+' : '−'}${kgToDisplayWeight(Math.abs(deltaKg), units)} ${units}`
}

export function progressionHintLabel(progression: Progression, units: WeightUnits, equipment?: string): string {
  const perDumbbell = equipment === 'dumbbell' ? ' per dumbbell' : ''
  if (progression.trial) {
    return progression.weight !== null && progression.delta < 0
      ? `Long break: first set is a test at ${signedWeight(progression.delta, units)}`
      : 'Long break: first set is a test'
  }
  if (progression.change === 'weight') return `Suggested ${signedWeight(progression.delta, units)}${perDumbbell}`
  return `Aim for ${progression.reps} reps`
}

export function trialHintLabel(weightKg: number, units: WeightUnits): string {
  return `From your first set: ${kgToDisplayWeight(weightKg, units)} ${units}`
}

export interface SessionHint { label: string; weight?: number; reps?: number }
type SessionSet = { weight: string; reps: string; done: boolean }

// Shown only when it would change an open set; a trial is announced until a non-warm-up set is logged.
export function sessionHint(progression: Progression | null, sets: SessionSet[], units: WeightUnits, equipment?: string): SessionHint | null {
  const open = sets.filter((set) => !set.done)
  if (!progression || !open.length) return null
  const differs = (field: 'weight' | 'reps', value: number) => open.some((set) => Number.parseFloat(set[field]) !== value)
  const label = progressionHintLabel(progression, units, equipment)

  if (progression.trial) {
    const done = sets.filter((set) => set.done).map((set) => ({ weight: Number.parseFloat(set.weight) || 0, reps: Number.parseInt(set.reps, 10) || 0 }))
    if (!done.length) return progression.weight !== null && differs('weight', progression.weight) ? { label, weight: progression.weight } : { label }
    const weight = done.map((set) => trialWeight(progression, set)).find((value) => value !== null) ?? null
    if (weight !== null) return differs('weight', weight) ? { label: trialHintLabel(weight, units), weight } : null
    const planned = progression.weight ?? done[0]!.weight
    const onlyWarmUps = progression.floor > 3 && done.every((set) => set.weight > 0 && set.weight < planned * 0.8)
    return onlyWarmUps ? { label } : null
  }
  if (progression.change === 'weight' && progression.weight !== null && differs('weight', progression.weight)) {
    return { label, weight: progression.weight, reps: progression.reps }
  }
  if (progression.change === 'reps' && differs('reps', progression.reps)) return { label, reps: progression.reps }
  return null
}

// The plan's prescription for an exercise; ambiguous while the plan day is not recorded (PRODUCT.md, punkt 2).
export function planTarget(
  template: { days: { exercises: { exerciseId: string; exerciseSource: string; targetReps: number; sets: number }[] }[] } | null | undefined,
  exerciseId: string,
  exerciseSource: string,
): ProgressionInput['target'] {
  const matches = (template?.days ?? []).flatMap((day) => day.exercises)
    .filter((exercise) => exercise.exerciseId === exerciseId && exercise.exerciseSource === exerciseSource)
  if (!matches.length) return null
  const first = matches[0]!
  return matches.every((exercise) => exercise.targetReps === first.targetReps && exercise.sets === first.sets)
    ? { reps: first.targetReps, sets: first.sets }
    : 'ambiguous'
}
