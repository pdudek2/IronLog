import { describe, it, expect, vi } from 'vitest'

vi.mock('../firebase', () => ({ db: {}, auth: {} }))
vi.mock('firebase/firestore', () => ({}))

import {
  aggregateStrengthProgression,
  defaultStrengthKey,
  type ProgressSessionLite,
} from '../progressService'

/** Helper: build a ProgressSessionLite N days ago */
function session(overrides: Partial<ProgressSessionLite> & { daysAgo: number }): ProgressSessionLite {
  const { daysAgo, ...rest } = overrides
  const finishedAt = rest.finishedAt ?? Date.now() - daysAgo * 86_400_000
  return {
    id: `sess-${daysAgo}-${Math.random()}`,
    workoutId: rest.workoutId ?? `workout-${daysAgo}`,
    exerciseId: rest.exerciseId ?? 'bench-press',
    exerciseSource: rest.exerciseSource ?? 'global',
    finishedAt,
    totalVolume: rest.totalVolume ?? 1000,
    totalSets: rest.totalSets ?? 3,
    bestSetWeight: rest.bestSetWeight ?? 80,
    exerciseName: rest.exerciseName ?? 'Bench Press',
    muscleGroups: rest.muscleGroups ?? ['chest'],
  }
}

// ─── aggregateStrengthProgression ───────────────────────────────────────────

describe('defaultStrengthKey', () => {
  it('prefers the most logged main lift over an isolation exercise', () => {
    expect(defaultStrengthKey([{ key: 'global:barbell-curl' }, { key: 'user:press' }, { key: 'global:bench-press' }])).toBe('global:bench-press')
  })

  it('falls back to the most logged exercise, or nothing', () => {
    expect(defaultStrengthKey([{ key: 'global:barbell-curl' }, { key: 'user:press' }])).toBe('global:barbell-curl')
    expect(defaultStrengthKey([])).toBeNull()
  })
})

describe('aggregateStrengthProgression', () => {
  it('returns every weighted exercise ordered by frequency with source-aware keys', () => {
    const result = aggregateStrengthProgression([
      session({ daysAgo: 6, exerciseId: 'bench', exerciseName: 'Bench Press' }),
      session({ daysAgo: 5, exerciseId: 'bench', exerciseName: 'Bench Press' }),
      session({ daysAgo: 4, exerciseId: 'squat', exerciseName: 'Squat' }),
      session({ daysAgo: 3, exerciseId: 'row', exerciseName: 'Row' }),
      session({ daysAgo: 2, exerciseId: 'curl', exerciseName: 'Curl' }),
      session({ daysAgo: 1, exerciseId: 'deadlift', exerciseName: 'Deadlift' }),
      session({ daysAgo: 0, exerciseSource: 'user', exerciseId: 'bench', exerciseName: 'Bench Press' }),
    ])

    expect(result.series.map(({ key }) => key)).toEqual([
      'global:bench',
      'user:bench',
      'global:curl',
      'global:deadlift',
      'global:row',
      'global:squat',
    ])
  })

  it('keeps the optional series limit for bounded callers', () => {
    const result = aggregateStrengthProgression([
      session({ daysAgo: 3, exerciseId: 'bench', exerciseName: 'Bench Press' }),
      session({ daysAgo: 2, exerciseId: 'row', exerciseName: 'Row' }),
      session({ daysAgo: 1, exerciseId: 'squat', exerciseName: 'Squat' }),
    ], 2)

    expect(result.series).toHaveLength(2)
  })

  it('keeps global and user exercises with the same name in separate strength series', () => {
    const result = aggregateStrengthProgression([
      session({ daysAgo: 2, exerciseSource: 'global', exerciseId: 'bench', exerciseName: 'Bench Press', bestSetWeight: 80 }),
      session({ daysAgo: 1, exerciseSource: 'user', exerciseId: 'bench', exerciseName: 'Bench Press', bestSetWeight: 60 }),
    ], 5)

    expect(result.series.map((series) => series.key)).toEqual([
      'global:bench',
      'user:bench',
    ])
    expect(result.data.some((point) => point['global:bench'] === 80)).toBe(true)
    expect(result.data.some((point) => point['user:bench'] === 60)).toBe(true)
  })
})
