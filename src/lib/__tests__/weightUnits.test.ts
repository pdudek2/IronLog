import { describe, expect, it } from 'vitest'

import {
  displayWeightStringToKg,
  formatCompactVolume,
  kgToDisplayWeight,
} from '../weightUnits'

describe('weight unit boundaries', () => {
  it('converts display and input with existing precision', () => {
    expect(kgToDisplayWeight(65, 'lbs')).toBe(143.3)
    expect(Number(displayWeightStringToKg('100', 'lbs'))).toBeCloseTo(45.3592, 4)
    expect(displayWeightStringToKg('', 'lbs')).toBe('')
    expect(displayWeightStringToKg('0', 'lbs')).toBe('0')
    expect(formatCompactVolume(480, 'kg')).toBe('480 kg')
    expect(formatCompactVolume(520, 'lbs')).toBe('1,146 lbs')
  })

  it('writes volume in full below 10,000 and compact from there', () => {
    expect(formatCompactVolume(0, 'kg')).toBe('0 kg')
    expect(formatCompactVolume(5_820, 'kg')).toBe('5,820 kg')
    expect(formatCompactVolume(9_999.6, 'kg')).toBe('10k kg')
    expect(formatCompactVolume(17_000, 'kg')).toBe('17k kg')
    expect(formatCompactVolume(164_389, 'kg')).toBe('164k kg')
  })
})
