import { describe, expect, it } from 'vitest'

import { getCategoryWorkloadInsight, workoutTitle } from '../workoutCopy'

it.each([
  [' Push ', ['Bench Press'], 'Push'],
  [' ', ['Bench Press'], 'Bench Press'],
  [null, ['Bench Press', 'Row'], 'Bench Press + Row'],
  [null, ['Bench Press', 'Row', 'Squat'], 'Bench Press +2'],
  [null, ['  ', ''], 'Trening'],
] as const)('names a workout with label %s and exercises %j', (label, names, expected) => {
  expect(workoutTitle({
    label,
    exercises: names.map((name) => ({ name, sets: [] })),
  })).toBe(expected)
})

describe('getCategoryWorkloadInsight', () => {
  it.each([
    ['chest', 'Najwięcej pracy poszło na klatkę.'],
    ['back', 'Najwięcej pracy poszło na plecy.'],
    ['legs', 'Najwięcej pracy wykonały nogi.'],
    ['shoulders', 'Najwięcej pracy poszło w barki.'],
    ['arms', 'Najwięcej pracy poszło w ramiona.'],
    ['core', 'Najwięcej pracy wykonał core.'],
    ['cardio', 'Najmocniejszym akcentem było cardio.'],
  ])('uses the approved sentence for %s', (category, expected) => {
    expect(getCategoryWorkloadInsight(category, 'Fallback')).toBe(expected)
  })

  it('uses the presentation label in a safe fallback sentence', () => {
    expect(getCategoryWorkloadInsight('mobility', 'Mobilność')).toBe(
      'Najwięcej pracy przypadło kategorii „Mobilność”.',
    )
  })
})
