import { describe, expect, it } from 'vitest'
import { importedWorkoutId, MAX_IMPORT_WORKOUTS, parseImportWorkoutsRequest } from '../historyImport'

const NOW = Date.UTC(2026, 10, 11, 12)
const workout = (key: string, overrides: Record<string, unknown> = {}) => ({
  key, startedAt: Date.UTC(2026, 3, 10, 10), label: 'Lower',
  exercises: [{ exerciseId: 'squat', exerciseSource: 'global', name: 'Squat', sets: [{ weight: 75, reps: 8 }] }],
  ...overrides,
})
const parse = (body: unknown) => parseImportWorkoutsRequest(body, NOW)

describe('parseImportWorkoutsRequest', () => {
  it('accepts a batch of finished workouts and keeps only weight and reps of each set', () => {
    const request = parse({ importId: 'run-1', workouts: [workout('2026-04-10|130', { exercises: [{ exerciseId: 'squat', exerciseSource: 'global', name: 'Squat', sets: [{ weight: 75, reps: 8, completedAt: 5 }] }] })] })
    expect(request.workouts[0]).toEqual({ key: '2026-04-10|130', startedAt: Date.UTC(2026, 3, 10, 10), label: 'Lower', exercises: [{ exerciseId: 'squat', exerciseSource: 'global', name: 'Squat', sets: [{ weight: 75, reps: 8 }] }] })
  })

  it('refuses a batch it cannot store as history', () => {
    const cases: [unknown, RegExp][] = [
      [{ workouts: [workout('a')] }, /importId/],
      [{ importId: 'r', workouts: [] }, /at least one workout/],
      [{ importId: 'r', workouts: Array.from({ length: MAX_IMPORT_WORKOUTS + 1 }, (_, index) => workout(`k${index}`)) }, /at most/],
      [{ importId: 'r', workouts: [workout('a'), workout('a')] }, /own key/],
      [{ importId: 'r', workouts: [workout('a', { startedAt: NOW + 2 * 24 * 3_600_000 })] }, /date/],
      [{ importId: 'r', workouts: [workout('a', { startedAt: Date.UTC(1999, 0, 1) })] }, /date/],
      [{ importId: 'r', workouts: [workout('a', { exercises: [] })] }, /at least one exercise/],
      [{ importId: 'r', workouts: [workout('a', { exercises: [{ exerciseId: 'squat', exerciseSource: 'global', name: 'Squat', sets: [{ weight: 5000, reps: 5 }] }] })] }, /weight/i],
      [{ importId: 'r', workouts: [workout('a', { finishedAt: 1 })] }, /Unexpected field finishedAt/],
      [{ importId: 'r', workouts: [workout('a')], userId: 'other' }, /Unexpected field userId/],
    ]
    for (const [body, error] of cases) expect(() => parse(body), String(error)).toThrow(error)
  })

  it('gives one run stable ids that differ by user, run and workout', () => {
    const id = importedWorkoutId('u1', 'run-1', 'k')
    expect(id).toMatch(/^import_[0-9a-f]{40}$/)
    expect(importedWorkoutId('u1', 'run-1', 'k')).toBe(id)
    expect(new Set([id, importedWorkoutId('u2', 'run-1', 'k'), importedWorkoutId('u1', 'run-2', 'k'), importedWorkoutId('u1', 'run-1', 'j')]).size).toBe(4)
  })
})
