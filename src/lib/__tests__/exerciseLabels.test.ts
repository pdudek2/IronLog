import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EXERCISE_CATEGORY_COLOR,
  EXERCISE_CATEGORY_COLORS,
  EXERCISE_CATEGORY_LABELS,
  formatExerciseMeta,
  getEquipmentLabel,
  getMuscleLabel,
} from '../exerciseLabels'

describe('exerciseLabels', () => {
  it('translates equipment and muscle ids to Polish labels', () => {
    expect(getEquipmentLabel('barbell')).toBe('Sztanga')
    expect(getMuscleLabel('triceps')).toBe('Triceps')
  })

  it('formats picker metadata without raw English ids', () => {
    expect(formatExerciseMeta('barbell', ['chest', 'triceps', 'shoulders'])).toBe(
      'Sztanga · Klatka, Triceps, Barki',
    )
  })

  it('keeps category labels and colors consistent across workout screens', () => {
    expect(EXERCISE_CATEGORY_LABELS.chest).toBe('Klatka')
    expect(EXERCISE_CATEGORY_COLORS.chest).toBe('#F0435A')
    expect(DEFAULT_EXERCISE_CATEGORY_COLOR).toBe('#A09AA0')
  })
})
