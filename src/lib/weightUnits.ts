import type { Units } from './userProfile'

const POUNDS_PER_KILOGRAM = 2.2046226218

function roundWeight(value: number): number {
  return Math.round(value * 10) / 10
}

function formatWeight(value: number): string {
  const rounded = roundWeight(value)
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function formatStoredWeight(value: number): string {
  return String(Math.round(value * 10_000) / 10_000)
}

export function kgToDisplayWeight(weightKg: number, units: Units): number {
  return units === 'lbs' ? roundWeight(weightKg * POUNDS_PER_KILOGRAM) : weightKg
}

export function kgStringToDisplayWeight(value: string, units: Units): string {
  if (units === 'kg') return value
  const weightKg = Number.parseFloat(value)
  if (!Number.isFinite(weightKg)) return value
  return formatWeight(kgToDisplayWeight(weightKg, units))
}

export function displayWeightStringToKg(value: string, units: Units): string {
  const displayWeight = Number.parseFloat(value)
  if (!Number.isFinite(displayWeight)) return value
  if (units === 'kg') return value
  return formatStoredWeight(displayWeight / POUNDS_PER_KILOGRAM)
}

export function displayWeightDeltaToKg(delta: number, units: Units): number {
  return units === 'lbs' ? delta / POUNDS_PER_KILOGRAM : delta
}

export function formatCompactVolume(volumeKg: number, units: Units): string {
  const volume = kgToDisplayWeight(volumeKg, units)
  if (!volume) return `0 ${units}`
  if (volume >= 10_000) return `${Math.round(volume / 1_000)}k ${units}`
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(1)}k ${units}`
  return `${Math.round(volume).toLocaleString('pl-PL')} ${units}`
}
