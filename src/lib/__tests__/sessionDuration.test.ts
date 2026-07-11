import { describe, expect, it } from 'vitest'
import {
  MAX_ACTIVE_SESSION_AGE_MS,
  getCappedWorkoutFinishedAt,
  getStaleSessionAgeLabel,
  isActiveSessionStale,
  refreshStaleActiveSession,
} from '../sessionDuration'
import type { ActiveWorkout } from '../../store/workoutStore'

function session(startedAt: number): ActiveWorkout {
  return {
    sessionId: 'session-1',
    startedAt,
    templateId: null,
    label: 'Push',
    exercises: [{
      exerciseId: 'bench-press',
      exerciseSource: 'global',
      name: 'Bench Press',
      sets: [{ weight: '80', reps: '5', done: false }],
    }],
  }
}

describe('sessionDuration', () => {
  it('marks active sessions older than the max age as stale', () => {
    const now = 1_000_000
    const staleStartedAt = now - MAX_ACTIVE_SESSION_AGE_MS - 1
    const freshStartedAt = now - MAX_ACTIVE_SESSION_AGE_MS + 1

    expect(isActiveSessionStale(session(staleStartedAt), now)).toBe(true)
    expect(isActiveSessionStale(session(freshStartedAt), now)).toBe(false)
  })

  it('refreshes stale sessions without losing entered exercises', () => {
    const original = session(100)
    const refreshed = refreshStaleActiveSession(original, 500)

    expect(refreshed.startedAt).toBe(500)
    expect(refreshed.sessionId).toBe('session-1')
    expect(refreshed.exercises).toEqual(original.exercises)
    expect(refreshed.label).toBe('Push')
  })

  it('caps saved workout duration to the max active session age', () => {
    const startedAt = 100
    const now = startedAt + MAX_ACTIVE_SESSION_AGE_MS + 60_000

    expect(getCappedWorkoutFinishedAt(startedAt, now)).toBe(startedAt + MAX_ACTIVE_SESSION_AGE_MS)
  })

  it('keeps normal workout finish time unchanged', () => {
    const startedAt = 100
    const now = startedAt + 45 * 60_000

    expect(getCappedWorkoutFinishedAt(startedAt, now)).toBe(now)
  })

  it('formats stale session age for the confirm dialog', () => {
    const now = 3 * 86_400_000 + 2 * 60 * 60_000

    expect(getStaleSessionAgeLabel(0, now)).toBe('3 dni')
  })
})
