import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActiveWorkout } from '../../store/workoutStore'

const { auth } = vi.hoisted(() => ({
  auth: { currentUser: null as { getIdToken: () => Promise<string> } | null },
}))

vi.mock('../firebase', () => ({ auth, db: {} }))
vi.mock('firebase/firestore', () => ({}))

import {
  discardWorkoutSession,
  finalizeWorkout,
  WorkoutClosureError,
} from '../workoutClosureService'

const session: ActiveWorkout = {
  sessionId: 'session-1',
  startedAt: 1_790_000_000_000,
  templateId: null,
  label: ' Push ',
  exercises: [{
    exerciseId: 'bench-press',
    exerciseSource: 'global',
    name: 'Bench Press',
    sets: [
      { weight: '82.5', reps: '5', done: true },
      { weight: '90', reps: '', done: true },
      { weight: '100', reps: '3', done: false },
    ],
  }],
}

function response(status: number, body: unknown, readable = true): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: readable ? vi.fn().mockResolvedValue(body) : vi.fn().mockRejectedValue(new Error('bad json')),
  } as unknown as Response
}

describe('workout closure service', () => {
  beforeEach(() => {
    auth.currentUser = { getIdToken: vi.fn().mockResolvedValue('id-token') }
  })

  afterEach(() => {
    auth.currentUser = null
    vi.unstubAllGlobals()
  })

  it.each(['materialized', 'projection_pending'] as const)('returns the exact %s finalize result', async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, { workoutId: 'session-1', status }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(finalizeWorkout(session)).resolves.toEqual({ workoutId: 'session-1', status })
    expect(fetchMock).toHaveBeenCalledWith('/api/finalize-workout', expect.objectContaining({
      method: 'POST',
      headers: {
        Authorization: 'Bearer id-token',
        'Content-Type': 'application/json',
      },
    }))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      sessionId: 'session-1',
      templateId: null,
      startedAt: session.startedAt,
      finishedAt: expect.any(Number),
      label: ' Push ',
      exercises: [{
        exerciseId: 'bench-press',
        exerciseSource: 'global',
        name: 'Bench Press',
        sets: [{ weight: 82.5, reps: 5 }],
      }],
    })
  })

  it('returns discarded from the discard endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, { status: 'discarded' })))

    await expect(discardWorkoutSession('session-1')).resolves.toEqual({ status: 'discarded' })
  })

  it.each([
    ['rejected fetch', () => Promise.reject(new Error('offline'))],
    ['unreadable success', () => Promise.resolve(response(200, null, false))],
    ['HTTP 500', () => Promise.resolve(response(500, { error: 'failed', code: 'internal' }))],
  ])('classifies %s as ambiguous', async (_case, fetchResult) => {
    vi.stubGlobal('fetch', vi.fn(fetchResult))

    const error = await finalizeWorkout(session).catch((caught) => caught)
    expect(error).toBeInstanceOf(WorkoutClosureError)
    expect(error).toMatchObject({ kind: 'ambiguous' })
  })

  it.each([
    [400, 'invalid_workout'],
    [409, 'session_mismatch'],
  ])('classifies structured HTTP %s as definitive and preserves its code', async (status, code) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(status, {
      error: 'Request rejected',
      code,
    })))

    const error = await finalizeWorkout(session).catch((caught) => caught)
    expect(error).toBeInstanceOf(WorkoutClosureError)
    expect(error).toMatchObject({ kind: 'definitive', status, code })
  })

  it('retries with the identical sessionId', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('ack lost'))
      .mockResolvedValueOnce(response(200, { workoutId: 'session-1', status: 'materialized' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(finalizeWorkout(session)).rejects.toMatchObject({ kind: 'ambiguous' })
    await expect(finalizeWorkout(session)).resolves.toEqual({ workoutId: 'session-1', status: 'materialized' })

    expect(fetchMock.mock.calls.map((call) => JSON.parse(call[1].body).sessionId))
      .toEqual(['session-1', 'session-1'])
  })
})
