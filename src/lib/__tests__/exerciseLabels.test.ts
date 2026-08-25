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

  it('keeps category identity colors distinct from semantic state colors', () => {
    const categoryColors = Object.values(EXERCISE_CATEGORY_COLORS).map((color) => color.toUpperCase())
    const semanticStateColors = ['#F0435A', '#8FB8A0', '#F0A75A']

    expect(EXERCISE_CATEGORY_LABELS.chest).toBe('Klatka')
    expect(new Set(categoryColors).size).toBe(categoryColors.length)
    expect(categoryColors.filter((color) => semanticStateColors.includes(color))).toEqual([])
    expect(DEFAULT_EXERCISE_CATEGORY_COLOR).toBe('#A09AA0')
  })
})
