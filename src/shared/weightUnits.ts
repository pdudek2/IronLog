export type WeightUnits = 'kg' | 'lbs'

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

export function kgToDisplayWeight(weightKg: number, units: WeightUnits): number {
  return units === 'lbs' ? roundWeight(weightKg * POUNDS_PER_KILOGRAM) : weightKg
}

export function kgStringToDisplayWeight(value: string, units: WeightUnits): string {
  if (units === 'kg') return value
  const weightKg = Number.parseFloat(value)
  if (!Number.isFinite(weightKg)) return value
  return formatWeight(kgToDisplayWeight(weightKg, units))
}

export function displayWeightStringToKg(value: string, units: WeightUnits): string {
  const displayWeight = Number.parseFloat(value)
  if (!Number.isFinite(displayWeight)) return value
  if (units === 'kg') return value
  return formatStoredWeight(displayWeight / POUNDS_PER_KILOGRAM)
}

// The set panel's weight step in the units shown: plates go up by 2.5 kg or 5 lb.
export const weightStep = (units: WeightUnits): number => (units === 'lbs' ? 5 : 2.5)

export function displayWeightDeltaToKg(delta: number, units: WeightUnits): number {
  return units === 'lbs' ? delta / POUNDS_PER_KILOGRAM : delta
}

export function formatCompactVolume(volumeKg: number, units: WeightUnits): string {
  const volume = Math.round(kgToDisplayWeight(volumeKg, units))
  if (volume >= 10_000) return `${Math.round(volume / 1_000).toLocaleString('en-US')}k ${units}`
  return `${volume.toLocaleString('en-US')} ${units}`
}

// Chart labels such as "9.5k" or "30k"; the unit is in the heading.
export function formatShortVolume(volumeKg: number, units: WeightUnits): string {
  const volume = Math.round(kgToDisplayWeight(volumeKg, units))
  return volume >= 1_000 ? `${Math.round(volume / 100) / 10}k` : String(volume)
}

// A weekly average such as "19,200": exact to 100 from 10,000 and to 10 below.
export function formatRoundedVolume(volumeKg: number, units: WeightUnits): string {
  const volume = kgToDisplayWeight(volumeKg, units)
  const step = volume >= 10_000 ? 100 : 10
  return (Math.round(volume / step) * step).toLocaleString('en-US')
}
