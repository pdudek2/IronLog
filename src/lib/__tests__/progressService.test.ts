import { describe, it, expect, vi } from 'vitest'

vi.mock('../firebase', () => ({ db: {}, auth: {} }))
vi.mock('firebase/firestore', () => ({}))

import {
  aggregateActivityHeatmap,
  aggregateMuscleBalance,
  aggregatePeriodComparison,
  aggregateStrengthProgression,
  aggregateWeeklyVolume,
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

// ─── aggregateMuscleBalance ──────────────────────────────────────────────────

describe('aggregateMuscleBalance', () => {
  it('returns empty array for empty sessions', () => {
    expect(aggregateMuscleBalance([])).toEqual([])
  })

  it('counts muscle groups correctly', () => {
    const sessions = [
      session({ daysAgo: 1, muscleGroups: ['chest', 'triceps'] }),
      session({ daysAgo: 2, muscleGroups: ['chest'] }),
      session({ daysAgo: 3, muscleGroups: ['back'] }),
    ]
    const result = aggregateMuscleBalance(sessions)
    const chestEntry = result.find((r) => r.muscle === 'chest')
    expect(chestEntry?.count).toBe(2)
    const backEntry = result.find((r) => r.muscle === 'back')
    expect(backEntry?.count).toBe(1)
  })

  it('sorts by count descending', () => {
    const sessions = [
      session({ daysAgo: 1, muscleGroups: ['back'] }),
      session({ daysAgo: 2, muscleGroups: ['chest'] }),
      session({ daysAgo: 3, muscleGroups: ['chest'] }),
      session({ daysAgo: 4, muscleGroups: ['chest'] }),
    ]
    const result = aggregateMuscleBalance(sessions)
    expect(result[0].muscle).toBe('chest')
    expect(result[0].count).toBe(3)
  })

  it('respects topN limit', () => {
    const sessions = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((muscle, i) =>
      session({ daysAgo: i + 1, muscleGroups: [muscle] })
    )
    const result = aggregateMuscleBalance(sessions, 3)
    expect(result.length).toBe(3)
  })
})

// ─── aggregatePeriodComparison ───────────────────────────────────────────────

describe('aggregatePeriodComparison', () => {
  it('returns zeros for empty sessions', () => {
    const result = aggregatePeriodComparison([], 30)
    expect(result.currentSessions).toBe(0)
    expect(result.previousSessions).toBe(0)
    expect(result.currentVolume).toBe(0)
  })

  it('splits sessions into current and previous period correctly', () => {
    const sessions = [
      // Current period (< 30 days ago)
      session({ daysAgo: 5, workoutId: 'w1', totalVolume: 500 }),
      session({ daysAgo: 10, workoutId: 'w2', totalVolume: 600 }),
      // Previous period (> 30 days ago)
      session({ daysAgo: 40, workoutId: 'w3', totalVolume: 400 }),
    ]
    const result = aggregatePeriodComparison(sessions, 30)
    expect(result.currentSessions).toBe(2)
    expect(result.previousSessions).toBe(1)
  })

  it('excludes sessions older than the preceding comparison window', () => {
    const anchorMs = new Date('2026-07-10T12:00:00Z').getTime()
    const sessions = [
      session({ daysAgo: 0, finishedAt: anchorMs - 15 * 86_400_000, workoutId: 'current', totalVolume: 800 }),
      session({ daysAgo: 0, finishedAt: anchorMs - 45 * 86_400_000, workoutId: 'previous', totalVolume: 500 }),
      session({ daysAgo: 0, finishedAt: anchorMs - 61 * 86_400_000, workoutId: 'too-old', totalVolume: 9_999 }),
    ]

    const result = aggregatePeriodComparison(sessions, 30, anchorMs)

    expect(result.previousSessions).toBe(1)
    expect(result.previousVolume).toBe(500)
  })

  it('calculates sessionsDelta as percentage', () => {
    const sessions = [
      session({ daysAgo: 5, workoutId: 'w1' }),
      session({ daysAgo: 10, workoutId: 'w2' }),
      // previous: 1 session
      session({ daysAgo: 40, workoutId: 'w3' }),
    ]
    const result = aggregatePeriodComparison(sessions, 30)
    // 2 current, 1 previous → +100%
    expect(result.sessionsDelta).toBeCloseTo(100, 0)
  })

  it('returns 100% delta when previous is 0 and current > 0', () => {
    const sessions = [session({ daysAgo: 5, workoutId: 'w1' })]
    const result = aggregatePeriodComparison(sessions, 30)
    expect(result.sessionsDelta).toBe(100)
  })
})

// ─── aggregateWeeklyVolume ───────────────────────────────────────────────────

describe('aggregateWeeklyVolume', () => {
  it('returns the correct number of weekly buckets', () => {
    const result = aggregateWeeklyVolume([], 12)
    expect(result.length).toBe(12)
  })

  it('returns 4 buckets when weeks=4', () => {
    const result = aggregateWeeklyVolume([], 4)
    expect(result.length).toBe(4)
  })

  it('all buckets are zero for empty sessions', () => {
    const result = aggregateWeeklyVolume([], 4)
    result.forEach((bucket) => {
      expect(bucket.volume).toBe(0)
      expect(bucket.sessions).toBe(0)
    })
  })

  it('assigns volume to the correct week bucket', () => {
    // Use daysAgo: 0 (today) to guarantee the session falls in the current week bucket,
    // regardless of what day of the week it is
    const sessions = [
      session({ daysAgo: 0, workoutId: 'w1', totalVolume: 1000 }),
      session({ daysAgo: 0, workoutId: 'w1', totalVolume: 500 }), // same workout, different exercise
    ]
    const result = aggregateWeeklyVolume(sessions, 4)

    // The current week bucket (last in array) should have the volume
    const lastBucket = result[result.length - 1]
    // Volume is summed per workout: w1 has 1000+500=1500 total
    expect(lastBucket.volume).toBe(1500)
    expect(lastBucket.sessions).toBe(1)
  })

  it('deduplicates sessions from the same workout', () => {
    // Two exercise sessions from same workout — should count as 1 session in chart
    const sessions = [
      session({ daysAgo: 0, workoutId: 'same-workout', totalVolume: 400 }),
      session({ daysAgo: 0, workoutId: 'same-workout', totalVolume: 600 }),
    ]
    const result = aggregateWeeklyVolume(sessions, 4)
    const thisWeek = result[result.length - 1]
    expect(thisWeek.sessions).toBe(1)
    expect(thisWeek.volume).toBe(1000) // 400+600
  })
})

// ─── Snapshot anchors ───────────────────────────────────────────────────────

describe('snapshot anchors', () => {
  it('anchors weekly, comparison, and heatmap boundaries to the supplied snapshot time', () => {
    const anchorMs = new Date('2024-01-10T12:00:00Z').getTime()
    const anchoredSession: ProgressSessionLite = {
      id: 'anchored',
      workoutId: 'workout-anchored',
      exerciseId: 'bench',
      exerciseSource: 'global',
      finishedAt: new Date('2024-01-09T12:00:00Z').getTime(),
      totalVolume: 1_000,
      totalSets: 3,
      bestSetWeight: 80,
      exerciseName: 'Bench Press',
      muscleGroups: ['chest'],
    }

    expect(aggregateWeeklyVolume([anchoredSession], 4, anchorMs).at(-1)?.volume).toBe(1_000)
    expect(aggregatePeriodComparison([anchoredSession], 30, anchorMs).currentSessions).toBe(1)
    expect(aggregateActivityHeatmap([anchoredSession], 12, anchorMs).some((day) => day.volume === 1_000)).toBe(true)
  })
})

// ─── aggregateStrengthProgression ───────────────────────────────────────────

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
