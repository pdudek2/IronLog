// API functions import workoutLimits as unbundled ESM, so the rules that need unit conversion live here.
import { displayWeightDeltaToKg, kgToDisplayWeight, type WeightUnits } from './weightUnits'
import { MAX_SET_REPS, MAX_SET_WEIGHT_KG } from './workoutLimits'

const WEIGHT_INPUT = /^\d{0,4}(?:[.,]\d{0,2})?$/
const REPS_INPUT = /^\d{0,4}$/

function removesOnly(next: string, previous: string): boolean {
  let kept = 0
  for (const char of previous) if (char === next[kept]) kept += 1
  return kept === next.length && next.length < previous.length
}

function fitsRule(text: string, field: 'weight' | 'reps', units: WeightUnits): boolean {
  if (field === 'reps') return REPS_INPUT.test(text) && Number(text || 0) <= MAX_SET_REPS
  if (!WEIGHT_INPUT.test(text)) return false
  const value = Number.parseFloat(text.replace(',', '.'))
  return !(value > 0) || displayWeightDeltaToKg(value, units) <= MAX_SET_WEIGHT_KG
}

// A keystroke that breaks the rule is refused, never clamped. Deleting from a value that already broke it passes,
// so an old draft's "8690.25" or "90.7185" left by a lbs → kg switch can still be cleared.
export function acceptSetInput(next: string, previous: string, field: 'weight' | 'reps', units: WeightUnits): boolean {
  return fitsRule(next, field, units) || (removesOnly(next, previous) && !fitsRule(previous, field, units))
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
