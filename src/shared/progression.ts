import { kgToDisplayWeight, type WeightUnits } from './weightUnits'
import { planDayIndex } from './planDay'
import { workingSets as workingSetsOf } from './compressionRecord'

// Rules and their sources: PRODUCT.md, „Specyfikacja punktu 1 — silnik progresji”.
export interface ProgressionSet { weight: number; reps: number }
// shortened: the start cut this exercise's sets and fewer working sets than planned were done (Specyfikacja punktu 3).
export interface ProgressionSession { finishedAt: number; sets: ProgressionSet[]; shortened?: boolean }

export interface ProgressionInput {
  sessions: ProgressionSession[]
  // Plan prescription; null when the session has no plan, 'ambiguous' when the plan has the exercise on days with
  // different targets and the day is unknown.
  // weight: the plan's weight; 0 on an exercise without history makes the first set a test.
  target: { reps: number; sets: number; weight?: number } | null | 'ambiguous'
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
  // Against the latest session's working weight.
  change: 'weight' | 'reps' | 'none'
  delta: number
  // Set on a break: the first set is a test and may raise the weight up to maxWeight. Without history and without a
  // weight in the plan the test has no cap (maxWeight null) and no start weight.
  trial: { maxWeight: number | null } | null
  // The plan's rep number is the top of the range (2026-11-04); 1–5 reps stay fixed.
  floor: number
  ceiling: number
  step: number
}

const DAY_MS = 24 * 60 * 60 * 1000
const LB_KG = 0.45359237
const DEFAULT_STEP_KG: Record<string, number> = { dumbbell: 2, kettlebell: 4 }
const WINDOW = 3
const SAME = 0.01

export function repRange(target: number): { floor: number; ceiling: number } {
  if (target <= 5) return { floor: target, ceiling: target }
  return { floor: target === 6 ? 5 : target - 2, ceiling: target }
}

// Train and the session must see the same history, so the engine itself keeps only the latest few sessions.
function cleanSessions(sessions: ProgressionSession[]): ProgressionSession[] {
  return sessions
    .map((session) => ({
      finishedAt: session.finishedAt,
      shortened: session.shortened === true,
      sets: session.sets.filter((set) => Number.isFinite(set.weight) && set.weight >= 0 && Number.isInteger(set.reps) && set.reps > 0),
    }))
    .filter((session) => Number.isFinite(session.finishedAt) && session.finishedAt > 0 && session.sets.length > 0)
    .sort((a, b) => b.finishedAt - a.finishedAt)
    .slice(0, WINDOW)
}

function topWeight(session: ProgressionSession): number {
  return Math.max(...session.sets.map((set) => set.weight))
}

const workingSets = (session: ProgressionSession) => workingSetsOf(session.sets)

function mostCommonReps(sets: ProgressionSet[]): number {
  const counts = new Map<number, number>()
  for (const set of sets) counts.set(set.reps, (counts.get(set.reps) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0]
}

function stepFor(sessions: ProgressionSession[], equipment: string | undefined, units: WeightUnits): number {
  if (units === 'lbs') return 5 * LB_KG
  // The plate step is how the lifter has added weight: only increases count. Jumps over 10% are returns from a deload,
  // and sessions over 14 days apart straddle a break.
  const diffs = sessions.flatMap((a, i) => sessions.slice(i + 1).map((b) => {
    const diff = topWeight(a) - topWeight(b)
    const close = Math.abs(a.finishedAt - b.finishedAt) <= 14 * DAY_MS
    return close && diff >= 0.25 && diff <= Math.max(topWeight(a), topWeight(b)) * 0.1 ? [diff] : []
  }).flat())
  if (diffs.length) return Math.min(...diffs)
  return DEFAULT_STEP_KG[equipment ?? ''] ?? 2.5
}

const round2 = (value: number) => Math.round(value * 100) / 100
// Pound users load 5 lb plates; their weights are stored in kg, so suggestions snap to the 5 lb grid.
const onUnitGrid = (kg: number, units: WeightUnits) => (units === 'lbs' ? Math.round(kg / LB_KG / 5) * 5 * LB_KG : kg)
const finish = (kg: number, units: WeightUnits) => Math.max(0, round2(onUnitGrid(kg, units)))

export function buildProgression(input: ProgressionInput): Progression | null {
  if (input.category === 'cardio' || input.target === 'ambiguous') return null
  const sessions = cleanSessions(input.sessions)
  const latest = sessions[0]
  if (!latest) {
    const plan = input.target
    if (!plan || plan.reps <= 0 || plan.weight !== 0 || input.equipment === 'bodyweight') return null
    const { floor, ceiling } = repRange(plan.reps)
    return { weight: null, reps: ceiling, change: 'none', delta: 0, trial: { maxWeight: null }, floor, ceiling, step: stepFor([], input.equipment, input.units) }
  }
  const latestWorking = workingSets(latest)
  if (latestWorking === 'ambiguous') return null

  const planned = input.target && input.target.reps > 0 ? input.target : null
  const target = planned ?? { reps: mostCommonReps(latestWorking), sets: latestWorking.length }
  const { floor, ceiling } = repRange(target.reps)
  const step = stepFor(sessions, input.equipment, input.units)
  const lastWeight = topWeight(latest)
  const gapDays = Math.floor((input.now - latest.finishedAt) / DAY_MS)
  const result = (weight: number | null, reps: number, change: Progression['change'], trial: Progression['trial'] = null): Progression => ({
    weight, reps, change, delta: weight === null ? 0 : round2(weight - lastWeight), trial, floor, ceiling, step,
  })

  if (gapDays > 14) {
    const trial = { maxWeight: lastWeight }
    if (gapDays > 84) return result(null, ceiling, 'none', trial)
    const cut = gapDays > 28 ? Math.min(0.2, 0.05 * Math.ceil((gapDays - 28) / 14)) : 0
    const weight = finish(lastWeight - Math.floor((lastWeight * cut) / step + 1e-9) * step, input.units)
    return result(weight, ceiling, weight < lastWeight - SAME ? 'weight' : 'none', trial)
  }

  // A deload is not the reference: an older heavier session in the last fortnight is the base only when the latest
  // one was at most 90% of it; a smaller drop is the lifter's own correction.
  const recent = sessions.filter((session) => input.now - session.finishedAt <= 14 * DAY_MS)
  const heaviest = recent.reduce((best, session) => (topWeight(session) > topWeight(best) ? session : best), latest)
  // A shortened latest session holds its own weight: no raise, no return to an older heavier one.
  const base = !latest.shortened && lastWeight <= topWeight(heaviest) * 0.9 ? heaviest : latest
  const working = workingSets(base)
  if (working === 'ambiguous') return null
  const baseWeight = topWeight(base)
  const weakest = Math.min(...working.map((set) => set.reps))
  const enoughSets = working.length >= Math.max(1, target.sets - 1)
  // Low readiness never brings back a heavier weight than last time.
  const holdWeight = input.lowReadiness ? Math.min(baseWeight, lastWeight) : baseWeight
  const repsChange = (reps: number) => (holdWeight !== lastWeight ? 'weight' : enoughSets && reps > weakest ? 'reps' : 'none')

  if (baseWeight === 0) {
    const reps = Math.max(floor, weakest + 1)
    return result(0, reps, enoughSets ? 'reps' : 'none')
  }

  // A step over 10% of the weight (light dumbbells) first asks for two reps over the plan.
  const top = ceiling + (step > baseWeight * 0.1 && ceiling > 5 ? 2 : 0)
  const reachedTop = working.every((set) => set.reps >= top)
  if (reachedTop && enoughSets && !input.lowReadiness && !latest.shortened) {
    return result(finish(baseWeight + step, input.units), floor, 'weight')
  }
  const reps = Math.min(top, Math.max(floor, weakest + 1))
  return result(holdWeight, reps, repsChange(reps))
}

// Epley 1RM from the first real set of a trial, turned into a weight for the plan's reps. Never above the pre-break
// weight, unless the set itself was heavier; never below a set the lifter just did for the plan's reps.
export function trialWeight(progression: Progression, set: ProgressionSet, units: WeightUnits = 'kg'): number | null {
  if (!progression.trial || progression.ceiling <= 3 || set.weight <= 0 || set.reps <= 0) return null
  const oneRepMax = set.weight * (1 + Math.min(set.reps, 10) / 30)
  const raw = oneRepMax / (1 + progression.ceiling / 30)
  const onGrid = set.weight + Math.floor((raw - set.weight) / progression.step + 1e-9) * progression.step
  const cap = progression.trial.maxWeight
  const capped = cap === null ? onGrid : Math.min(Math.max(cap, set.weight), onGrid)
  return finish(set.reps >= progression.ceiling ? Math.max(capped, set.weight) : capped, units)
}

function signedWeight(deltaKg: number, units: WeightUnits): string {
  return `${deltaKg > 0 ? '+' : '−'}${kgToDisplayWeight(Math.abs(deltaKg), units)} ${units}`
}

const perDumbbell = (equipment?: string) => (equipment === 'dumbbell' ? ' per dumbbell' : '')

export function progressionHintLabel(progression: Progression, units: WeightUnits, equipment?: string): string {
  if (progression.trial?.maxWeight === null) return 'First set is a test'
  if (progression.trial) {
    return progression.weight !== null && progression.delta < 0
      ? `Long break: first set is a test at ${signedWeight(progression.delta, units)}${perDumbbell(equipment)}`
      : 'Long break: first set is a test'
  }
  if (progression.change === 'weight') return `Suggested ${signedWeight(progression.delta, units)}${perDumbbell(equipment)}`
  return `Aim for ${progression.reps} reps`
}

export function trialHintLabel(weightKg: number, units: WeightUnits, equipment?: string): string {
  return `From your first set: ${kgToDisplayWeight(weightKg, units)} ${units}${perDumbbell(equipment)}`
}

export interface SessionHint { label: string; weight?: number; reps?: number }
type SessionSet = { weight: string; reps: string; done: boolean }

// Shown only when it would change an open set; a trial is announced until a non-warm-up set is logged.
export function sessionHint(progression: Progression | null, sets: SessionSet[], units: WeightUnits, equipment?: string): SessionHint | null {
  const open = sets.filter((set) => !set.done)
  if (!progression || !open.length) return null
  const differs = (field: 'weight' | 'reps', value: number) => open.some((set) => {
    const current = Number.parseFloat(set[field])
    return !Number.isFinite(current) || Math.abs(current - value) > SAME
  })
  const label = progressionHintLabel(progression, units, equipment)

  if (progression.trial) {
    const done = sets.filter((set) => set.done).map((set) => ({ weight: Number.parseFloat(set.weight) || 0, reps: Number.parseInt(set.reps, 10) || 0 }))
    if (!done.length) return progression.weight !== null && differs('weight', progression.weight) ? { label, weight: progression.weight } : { label }
    // The heaviest logged set sets the scale, so a warm-up never counts as the test.
    const reference = progression.weight ?? Math.max(...done.map((set) => set.weight))
    const test = done.find((set) => set.weight >= reference * 0.8)
    if (!test) return progression.ceiling > 3 ? { label } : null
    const weight = trialWeight(progression, test, units)
    return weight !== null && differs('weight', weight) ? { label: trialHintLabel(weight, units, equipment), weight } : null
  }
  if (progression.weight === null) return null
  if (progression.change === 'weight' && differs('weight', progression.weight)) {
    return { label, weight: progression.weight, reps: progression.reps }
  }
  if (progression.change === 'reps' && differs('reps', progression.reps)) {
    // A rep target belongs to its weight: when the open sets carry another weight, the hint brings both.
    return differs('weight', progression.weight)
      ? { label: `${kgToDisplayWeight(progression.weight, units)} ${units}, aim for ${progression.reps} reps`, weight: progression.weight, reps: progression.reps }
      : { label, reps: progression.reps }
  }
  return null
}

// The plan's prescription for an exercise, from the session's plan day when it is known and still in the plan.
export function planTarget(
  template: { days: { id?: unknown; exercises: { exerciseId: string; exerciseSource: string; targetReps: number; sets: number; targetWeight?: number }[] }[] } | null | undefined,
  exerciseId: string,
  exerciseSource: string,
  dayId?: string | null,
): ProgressionInput['target'] {
  const dayIndex = template ? planDayIndex(template, dayId) : -1
  const days = dayIndex >= 0 ? [template!.days[dayIndex]!] : template?.days ?? []
  const matches = days.flatMap((day) => day.exercises)
    .filter((exercise) => exercise.exerciseId === exerciseId && exercise.exerciseSource === exerciseSource)
  if (!matches.length) return null
  const first = matches[0]!
  return matches.every((exercise) => exercise.targetReps === first.targetReps && exercise.sets === first.sets)
    ? { reps: first.targetReps, sets: first.sets, weight: matches.every((exercise) => exercise.targetWeight !== undefined) ? Math.max(...matches.map((exercise) => exercise.targetWeight!)) : undefined }
    : 'ambiguous'
}
