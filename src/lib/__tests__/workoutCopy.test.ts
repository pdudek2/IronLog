import { expect, it } from 'vitest'

import { workoutTitle } from '../workoutCopy'

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
