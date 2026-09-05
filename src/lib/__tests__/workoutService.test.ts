import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'

const { auth } = vi.hoisted(() => ({
  auth: {
    currentUser: null as { uid: string; getIdToken: () => Promise<string> } | null,
  },
}))

// Mock Firebase before any service imports — prevents initializeApp() from running
vi.mock('../firebase', () => ({ db: {}, auth }))
vi.mock('firebase/firestore', () => ({}))

import {
  calcStreak,
  deleteWorkout,
  retryPendingMaterializations,
  retryWorkoutMaterialization,
  updateWorkout,
} from '../workoutService'
import { clearWorkoutDeleteRecovery, readWorkoutDeleteRecovery, writeWorkoutDeleteRecovery } from '../workoutDeleteRecovery'
import type { WorkoutSummary } from '../workoutService'

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
      uid: 'user-1',
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
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ ok: true }),
      })
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
      uid: 'user-1',
      getIdToken: vi.fn().mockResolvedValue('token'),
    }
  })

  afterEach(() => {
    auth.currentUser = null
    vi.unstubAllGlobals()
  })

  it('retries only the requested workout and resolves on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true }),
    })
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

describe('workout mutation results', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    })
    auth.currentUser = {
      uid: 'user-1',
      getIdToken: vi.fn().mockResolvedValue('token'),
    }
  })

  afterEach(() => {
    auth.currentUser = null
    vi.unstubAllGlobals()
  })

  it.each([
    ['updateWorkout', updateWorkout, '/api/update-workout', { status: 'projection_pending' }],
    ['deleteWorkout', deleteWorkout, '/api/delete-workout', { status: 'cleanup_pending' }],
  ] as const)('returns the validated %s result', async (_name, operation, path, payload) => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(payload),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = operation === updateWorkout
      ? await updateWorkout('workout-1', { label: 'Updated', exercises: [] })
      : await deleteWorkout('workout-1')

    expect(result).toEqual(payload)
    expect(fetchMock).toHaveBeenCalledWith(path, expect.objectContaining({ method: 'POST' }))
  })

  it.each([
    ['updateWorkout', () => updateWorkout('workout-1', { label: 'Updated', exercises: [] })],
  ] as const)('rejects a malformed successful %s response', async (_name, operation) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ status: 'unknown' }),
    }))

    await expect(operation()).rejects.toThrow('Nieprawidłowa odpowiedź serwera.')
  })
  it('persists before a request that commits then loses its response, and retries after reload', async () => {
    let committed = false
    const fetchMock = vi.fn().mockImplementationOnce(async () => {
      expect(readWorkoutDeleteRecovery('user-1')).toEqual({ workoutId: 'workout-1', status: 'unknown' })
      committed = true
      throw new TypeError('response lost')
    }).mockImplementationOnce(async () => {
      expect(committed).toBe(true) // canonical workout is already gone; retry uses persisted ID only
      return { ok: true, json: async () => ({ status: 'deleted' }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(deleteWorkout('workout-1')).resolves.toEqual({ status: 'unknown' })
    const restored = readWorkoutDeleteRecovery('user-1')!
    await expect(deleteWorkout('another-workout')).rejects.toThrow('Najpierw ponów')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await expect(deleteWorkout(restored.workoutId)).resolves.toEqual({ status: 'deleted' })
    expect(readWorkoutDeleteRecovery('user-1')).toBeNull()
  })

  it.each([
    { ok: true, json: async () => ({ status: 'invalid' }) },
    { ok: true, json: async () => { throw new Error('invalid JSON') } },
    { ok: false, status: 500, json: async () => ({ error: 'server interrupted' }) },
  ])('retains an unknown outcome for an ambiguous response', async (response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    await expect(deleteWorkout('workout-1')).resolves.toEqual({ status: 'unknown' })
    expect(readWorkoutDeleteRecovery('user-1')?.status).toBe('unknown')
  })

  it('rejects a definite rejection without claiming deletion, but keeps an earlier unknown intent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 403, json: async () => ({ error: 'forbidden' }),
    }))
    await expect(deleteWorkout('workout-1')).rejects.toThrow('forbidden')
    expect(readWorkoutDeleteRecovery('user-1')).toBeNull()
    writeWorkoutDeleteRecovery('user-1', { workoutId: 'workout-1', status: 'unknown' })
    await expect(deleteWorkout('workout-1')).rejects.toThrow('forbidden')
    expect(readWorkoutDeleteRecovery('user-1')?.status).toBe('unknown')
  })

  it('keeps confirmed cleanup pending when retry loses its response', async () => {
    writeWorkoutDeleteRecovery('user-1', { workoutId: 'workout-1', status: 'cleanup_pending' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(deleteWorkout('workout-1')).resolves.toEqual({ status: 'cleanup_pending' })
  })

  it('does not send a request after the account changes while obtaining a token', async () => {
    auth.currentUser!.getIdToken = async () => {
      auth.currentUser = { uid: 'user-2', getIdToken: async () => 'token-b' }
      return 'token-a'
    }
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(deleteWorkout('workout-1')).rejects.toThrow('Konto użytkownika zmieniło się.')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(readWorkoutDeleteRecovery('user-1')).toBeNull()
  })

  it('clears only the captured owner and workout when the response arrives after account change', async () => {
    writeWorkoutDeleteRecovery('user-2', { workoutId: 'workout-2', status: 'unknown' })
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      auth.currentUser = { uid: 'user-2', getIdToken: async () => 'token-b' }
      return { ok: true, json: async () => ({ status: 'deleted' }) }
    }))
    await expect(deleteWorkout('workout-1')).resolves.toEqual({ status: 'deleted' })
    expect(readWorkoutDeleteRecovery('user-1')).toBeNull()
    expect(readWorkoutDeleteRecovery('user-2')?.workoutId).toBe('workout-2')
  })

  it('does not clear a newer workout recovery when an old response arrives', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      // Another retry completed this delete and the next workout delete has started.
      clearWorkoutDeleteRecovery('user-1', 'workout-1')
      writeWorkoutDeleteRecovery('user-1', { workoutId: 'workout-2', status: 'unknown' })
      return { ok: true, json: async () => ({ status: 'deleted' }) }
    }))
    await expect(deleteWorkout('workout-1')).resolves.toEqual({ status: 'deleted' })
    expect(readWorkoutDeleteRecovery('user-1')?.workoutId).toBe('workout-2')
  })

  it('never sends the delete when persisting intent fails', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('storage full') } })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(deleteWorkout('workout-1')).rejects.toThrow('storage full')
    expect(fetchMock).not.toHaveBeenCalled()
  })

})
