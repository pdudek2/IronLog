import {
  displayWeightStringToKg,
  kgStringToDisplayWeight,
} from '../../src/shared/weightUnits'
import type { Units } from './session'

export type SetInputField = 'weight' | 'reps'

const COMPLETE_UNSIGNED_DECIMAL = /^(?:\d+(?:\.\d*)?|\.\d+)$/

function normalizeDecimal(value: string): string {
  return value.replace(',', '.')
}

export function setInputToStoredValue(value: string, field: SetInputField, units: Units): string {
  const normalized = normalizeDecimal(value)
  if (field !== 'weight' || units !== 'lbs' || !COMPLETE_UNSIGNED_DECIMAL.test(normalized)) {
    return normalized
  }
  return displayWeightStringToKg(normalized, units)
}

export function storedValueToSetInput(value: string, field: SetInputField, units: Units): string {
  if (field !== 'weight' || units !== 'lbs' || !COMPLETE_UNSIGNED_DECIMAL.test(value)) {
    return value
  }
  return kgStringToDisplayWeight(value, units)
}

export interface SubmissionReconciliation {
  pending: string[]
  acknowledged: boolean
}

export function reconcileSetInputSubmissions(pending: readonly string[], incoming: string): SubmissionReconciliation {
  const acknowledgedIndex = pending.indexOf(incoming)
  if (acknowledgedIndex < 0) return { pending: [], acknowledged: false }
  return { pending: pending.slice(acknowledgedIndex + 1), acknowledged: true }
}
