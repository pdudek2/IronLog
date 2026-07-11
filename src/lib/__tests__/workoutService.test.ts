import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'

const { auth } = vi.hoisted(() => ({
  auth: {
    currentUser: null as { getIdToken: () => Promise<string> } | null,
  },
}))

// Mock Firebase before any service imports — prevents initializeApp() from running
vi.mock('../firebase', () => ({ db: {}, auth }))
vi.mock('firebase/firestore', () => ({}))

import {
  buildFinishedWorkoutPayload,
  calcStreak,
  retryPendingMaterializations,
  retryWorkoutMaterialization,
} from '../workoutService'
import type { WorkoutSummary } from '../workoutService'
import type { ActiveWorkout } from '../../store/workoutStore'

const workout: ActiveWorkout = {
  sessionId: 'session-1',
  startedAt: 1_790_000_000_000,
  templateId: null,
  label: 'Phase R workout',
  exercises: [{
    exerciseId: 'bench-press',
    exerciseSource: 'global',
    name: 'Bench Press',
    sets: [{ weight: '80', reps: '5', done: true }],
  }],
}

/** Returns a WorkoutSummary with startedAt set to N days ago (relative to now) */
function workoutDaysAgo(daysAgo: number): WorkoutSummary {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(12, 0, 0, 0) // noon, deterministic
  return { id: `w-${daysAgo}`, startedAt: d.getTime() } as WorkoutSummary
}

describe('calcStreak', () => {
  it('returns 0 for empty workout list', () => {
    expect(calcStreak([])).toBe(0)
  })

  it('returns 1 when only today has a workout', () => {
    expect(calcStreak([workoutDaysAgo(0)])).toBe(1)
  })

  it('returns 1 when only yesterday has a workout (no training today yet)', () => {
    // Key fix from BUG: streak should NOT reset to 0 in the morning before training
    expect(calcStreak([workoutDaysAgo(1)])).toBe(1)
  })

  it('counts consecutive days ending yesterday', () => {
    const workouts = [
      workoutDaysAgo(1),
      workoutDaysAgo(2),
      workoutDaysAgo(3),
    ]
    expect(calcStreak(workouts)).toBe(3)
  })

  it('counts consecutive days including today', () => {
    const workouts = [
      workoutDaysAgo(0),
      workoutDaysAgo(1),
      workoutDaysAgo(2),
    ]
    expect(calcStreak(workouts)).toBe(3)
  })

  it('stops at a gap', () => {
    const workouts = [
      workoutDaysAgo(0),
      workoutDaysAgo(1),
      // gap on day 2
      workoutDaysAgo(3),
      workoutDaysAgo(4),
    ]
    // Streak is 2 (today + yesterday), then breaks at day 2 gap
    expect(calcStreak(workouts)).toBe(2)
  })

  it('returns 0 when last workout was 2+ days ago', () => {
    const workouts = [workoutDaysAgo(2), workoutDaysAgo(3)]
    expect(calcStreak(workouts)).toBe(0)
  })

  it('handles multiple workouts on the same day (deduplicates)', () => {
    // Two workouts today — should still count as 1 day streak
    const workouts = [
      workoutDaysAgo(0),
      workoutDaysAgo(0),
      workoutDaysAgo(1),
    ]
    expect(calcStreak(workouts)).toBe(2)
  })
})

describe('retryPendingMaterializations', () => {
  beforeEach(() => {
    auth.currentUser = {
      getIdToken: vi.fn().mockResolvedValue('token'),
    }
  })

  afterEach(() => {
    auth.currentUser = null
    vi.unstubAllGlobals()
  })

  it('returns an empty retry summary when no workouts are pending', async () => {
    expect(await retryPendingMaterializations([])).toEqual({ attempted: 0, failed: 0 })
  })

  it('counts attempted and failed pending materializations', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: false,
        json: vi.fn().mockResolvedValue({ error: 'Materialization failed' }),
      }))

    const pendingA = { id: 'pending-a', materialized: false } as WorkoutSummary
    const done = { id: 'done', materialized: true } as WorkoutSummary
    const pendingB = { id: 'pending-b', materialized: false } as WorkoutSummary

    expect(await retryPendingMaterializations([pendingA, done, pendingB])).toEqual({
      attempted: 2,
      failed: 1,
    })
  })
})

describe('retryWorkoutMaterialization', () => {
  beforeEach(() => {
    auth.currentUser = {
      getIdToken: vi.fn().mockResolvedValue('token'),
    }
  })

  afterEach(() => {
    auth.currentUser = null
    vi.unstubAllGlobals()
  })

  it('retries only the requested workout and resolves on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    await expect(retryWorkoutMaterialization('workout-42')).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith('/api/materialize-workout', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ workoutId: 'workout-42' }),
    }))
  })

  it('propagates a failed retry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Projection unavailable' }),
    }))

    await expect(retryWorkoutMaterialization('workout-42'))
      .rejects.toThrow('Projection unavailable')
  })
})

describe('buildFinishedWorkoutPayload', () => {
  it('builds the endpoint payload without client-owned administrative fields', () => {
    const payload = buildFinishedWorkoutPayload(workout)

    expect(payload).toMatchObject({
      sessionId: 'session-1',
      templateId: null,
      startedAt: workout.startedAt,
      label: 'Phase R workout',
      exercises: [{
        exerciseId: 'bench-press',
        exerciseSource: 'global',
        sets: [{ weight: 80, reps: 5 }],
      }],
    })
    expect(payload).not.toHaveProperty('userId')
    expect(payload).not.toHaveProperty('materialized')
  })
})
