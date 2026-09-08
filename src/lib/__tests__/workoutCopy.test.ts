import { describe, expect, it } from 'vitest'

import { getCategoryWorkloadInsight, workoutTitle } from '../workoutCopy'

it.each([
  [' Push ', ['Bench Press'], 'Push'],
  [' ', ['Bench Press'], 'Bench Press'],
  [null, ['Bench Press', 'Row'], 'Bench Press + Row'],
  [null, ['Bench Press', 'Row', 'Squat'], 'Bench Press +2'],
  [null, ['  ', ''], 'Workout'],
] as const)('names a workout with label %s and exercises %j', (label, names, expected) => {
  expect(workoutTitle({
    label,
    exercises: names.map((name) => ({ name, sets: [] })),
  })).toBe(expected)
})

describe('getCategoryWorkloadInsight', () => {
  it.each([
    ['chest', 'Chest accounted for most of the work.'],
    ['back', 'Back accounted for most of the work.'],
    ['legs', 'Legs accounted for most of the work.'],
    ['shoulders', 'Shoulders accounted for most of the work.'],
    ['arms', 'Arms accounted for most of the work.'],
    ['core', 'Core accounted for most of the work.'],
    ['cardio', 'Cardio was the main focus.'],
  ])('uses the approved sentence for %s', (category, expected) => {
    expect(getCategoryWorkloadInsight(category, 'Fallback')).toBe(expected)
  })

  it('uses the presentation label in a safe fallback sentence', () => {
    expect(getCategoryWorkloadInsight('mobility', 'Mobility')).toBe(
      'Most of the work went to the category “Mobility”.',
    )
  })
})
