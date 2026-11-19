import { expect, it } from 'vitest'

import { weekCountLabel, workoutTitle } from '../workoutCopy'

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

it('counts the week against the goal until the goal is passed', () => {
  expect([2, 3, 4].map((done) => weekCountLabel(done, 3))).toEqual(['2 of 3', '3 of 3', '4'])
})
