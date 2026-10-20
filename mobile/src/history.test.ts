import assert from 'node:assert/strict'
import test from 'node:test'
import { exercises } from '../../data/exercises'
import {
  deriveWorkout,
  filterWorkouts,
  formatExercisePreview,
  formatWorkoutDuration,
  groupWorkoutsByMonth,
  parseSavedWorkout,
  workoutFocusLabel,
  workoutSetVolumeLabel,
} from './history'

const exerciseMap = new Map(exercises.map((exercise) => [`global:${exercise.id}`, exercise]))

function workout(id: string, startedAt: number, overrides: Record<string, unknown> = {}) {
  return parseSavedWorkout(id, 'user-a', {
    userId: 'user-a', startedAt, finishedAt: startedAt + 45 * 60_000,
    materialized: true, label: null,
    exercises: [{
      exerciseId: 'bench-press', exerciseSource: 'global', name: 'Bench Press',
      sets: [{ weight: 65, reps: 8 }, { weight: 60, reps: 10 }],
    }],
    ...overrides,
  })
}

test('saved workout parser keeps owner, source, set values, and projection state', () => {
  const parsed = workout('workout-a', 1_742_000_000_000, {
    materialized: false,
    exercises: [{ exerciseId: 'custom-a', exerciseSource: 'user', name: 'Custom Row', sets: [{ weightKg: '22.5', reps: '12' }] }],
  })
  assert.equal(parsed.materialized, false)
  assert.equal(parsed.exercises[0]?.exerciseSource, 'user')
  assert.deepEqual(parsed.exercises[0]?.sets, [{ weight: 22.5, reps: 12 }])
  assert.throws(() => parseSavedWorkout('workout-a', 'user-b', { userId: 'user-a' }), /owner/)
  assert.throws(() => workout('workout-a', 10, { finishedAt: 9 }), /timestamps/)
})

test('history derives source-scoped categories, filters title/exercises and groups newest first', () => {
  const recent = deriveWorkout(workout('recent', Date.UTC(2025, 2, 15)), exerciseMap)
  const older = deriveWorkout(workout('older', Date.UTC(2024, 2, 15)), exerciseMap)
  assert.equal(recent.totalSets, 2)
  assert.equal(recent.totalVolume, 1120)
  assert.deepEqual([...recent.categories], ['chest'])
  assert.deepEqual(filterWorkouts([recent, older], {
    range: '365', rangeAnchorMs: Date.UTC(2025, 3, 1), search: 'bench', category: 'chest',
  }).map(({ workout: item }) => item.id), ['recent'])
  assert.equal(filterWorkouts([recent], {
    range: 'all', rangeAnchorMs: Date.UTC(2025, 3, 1), search: 'missing', category: null,
  }).length, 0)
  assert.equal(groupWorkoutsByMonth([recent, older])[0]?.label, 'March 2025')
})

test('history formatting stays aligned with web duration, preview, and unit conversion', () => {
  assert.equal(formatWorkoutDuration(0, 45 * 60_000), '45 min')
  assert.equal(formatWorkoutDuration(0, 13 * 60 * 60_000), '12h 0m')
  assert.equal(formatExercisePreview(['A', 'B', 'C', 'D']), 'A · B · C · +1')
  assert.equal(workoutSetVolumeLabel(65, 8, 'lbs'), '1,146.4')
})

test('the focus eyebrow is the dominant category, first seen winning a tie', () => {
  assert.equal(workoutFocusLabel(['back', 'chest', 'chest', undefined]), 'Chest')
  assert.equal(workoutFocusLabel(['back', 'chest']), 'Back')
  assert.equal(workoutFocusLabel([undefined]), null)
})
