import { displayWeightDeltaToKg, kgToDisplayWeight, type WeightUnits } from './weightUnits'

// The finish endpoint rejects a workout outside these limits and Firestore rules cap the active session at
// MAX_SESSION_EXERCISES, so both clients check them before a set counts as done.
export const MAX_SESSION_EXERCISES = 20
export const MAX_DONE_SETS_PER_EXERCISE = 20
export const MAX_SET_WEIGHT_KG = 2_000
export const MAX_SET_REPS = 1_000

export function isValidCompletedSet(set: { weight: string; reps: string }): boolean {
  const weight = Number(set.weight)
  const reps = Number(set.reps)
  return Number.isFinite(weight) && weight >= 0 && weight <= MAX_SET_WEIGHT_KG
    && Number.isInteger(reps) && reps >= 1 && reps <= MAX_SET_REPS
}

export function completedSetError(set: { weight: string; reps: string }, otherDoneSets: number): string | null {
  if (!isValidCompletedSet(set)) {
    return isValidCompletedSet({ ...set, weight: '0' })
      ? 'Weight cannot be negative or above 2000 kg (4409 lbs).'
      : `Enter whole reps from 1 to ${MAX_SET_REPS} before marking this set as complete.`
  }
  return otherDoneSets >= MAX_DONE_SETS_PER_EXERCISE ? `An exercise can hold up to ${MAX_DONE_SETS_PER_EXERCISE} completed sets.` : null
}

const LOADED = new Set(['barbell', 'dumbbell', 'machine', 'cable', 'kettlebell'])
// Assistance of 0 on the assisted pull-up machine is a real set.
const ZERO_IS_REAL = new Set(['assisted-pull-up'])

// A loaded exercise logged without weight is asked about, not refused: lunges, step-ups and calf raises are often
// done unloaded, and a custom exercise defaults to barbell. Cardio machines log time, not weight.
export function needsWeightConfirm(
  set: { weight: string },
  exercise: { exerciseId: string; equipment?: string; category?: string },
): boolean {
  if (!exercise.equipment || !LOADED.has(exercise.equipment) || exercise.category === 'cardio' || ZERO_IS_REAL.has(exercise.exerciseId)) return false
  const weight = Number.parseFloat(set.weight)
  return !(weight > 0)
}

const WEIGHT_INPUT = /^\d{0,4}(?:[.,]\d{0,2})?$/
const REPS_INPUT = /^\d{0,4}$/

function removesOnly(next: string, previous: string): boolean {
  let kept = 0
  for (const char of previous) if (char === next[kept]) kept += 1
  return kept === next.length && next.length < previous.length
}

// A keystroke that breaks the rule is refused, never clamped. Deleting always passes, so an old draft's "8690.25"
// or "90.7185" left by a lbs → kg switch can still be cleared.
export function acceptSetInput(next: string, previous: string, field: 'weight' | 'reps', units: WeightUnits): boolean {
  if (removesOnly(next, previous)) return true
  if (field === 'reps') return REPS_INPUT.test(next) && Number(next || 0) <= MAX_SET_REPS
  if (!WEIGHT_INPUT.test(next)) return false
  const value = Number.parseFloat(next.replace(',', '.'))
  return !(value > 0) || displayWeightDeltaToKg(value, units) <= MAX_SET_WEIGHT_KG
}

// More than twice the reference is likelier a slip (881.75 for 88.75) than a real jump, so it is asked about, not refused.
export function weightSlip(weightKg: string | number, referenceKg: number | undefined, units: WeightUnits, label = 'Last time'): { title: string; message: string } | null {
  const weight = Number(weightKg)
  if (referenceKg === undefined || !(referenceKg > 0) || !(weight > 2 * referenceKg)) return null
  const shown = (kg: number) => `${kgToDisplayWeight(kg, units)} ${units}`
  return { title: `${shown(weight)}?`, message: `${label} ${shown(referenceKg)}` }
}

// The heaviest set of the last finished session; 0 when there is none.
export const lastSessionBest = (sessions: readonly { sets: readonly { weight: number }[] }[]): number => Math.max(0, ...(sessions[0]?.sets.map((set) => set.weight) ?? []))

// Steppers stop at the limits a set can be logged with.
export const clampSetValue = (value: number, field: 'weight' | 'reps'): number => Math.min(field === 'weight' ? MAX_SET_WEIGHT_KG : MAX_SET_REPS, Math.max(0, value))
