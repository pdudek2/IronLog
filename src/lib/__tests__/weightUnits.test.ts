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
    expect(formatCompactVolume(520, 'lbs')).toBe('1.1k lbs')
  })
})
