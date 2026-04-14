import { describe, it, expect, vi } from 'vitest'

vi.mock('../firebase', () => ({ db: {}, auth: {} }))
vi.mock('firebase/firestore', () => ({}))

import {
  aggregateMuscleBalance,
  aggregatePeriodComparison,
  aggregateWeeklyVolume,
  type ProgressSessionLite,
} from '../progressService'

/** Helper: build a ProgressSessionLite N days ago */
function session(overrides: Partial<ProgressSessionLite> & { daysAgo: number }): ProgressSessionLite {
  const { daysAgo, ...rest } = overrides
  const finishedAt = Date.now() - daysAgo * 86_400_000
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
      session({ daysAgo: 1, workoutId: 'same-workout', totalVolume: 400 }),
      session({ daysAgo: 1, workoutId: 'same-workout', totalVolume: 600 }),
    ]
    const result = aggregateWeeklyVolume(sessions, 4)
    const thisWeek = result[result.length - 1]
    expect(thisWeek.sessions).toBe(1)
    expect(thisWeek.volume).toBe(1000) // 400+600
  })
})
