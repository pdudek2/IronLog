import { describe, expect, it } from 'vitest'
import { formatExerciseMeta, getEquipmentLabel, getMuscleLabel } from '../exerciseLabels'

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
})
