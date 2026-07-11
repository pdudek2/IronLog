import type { Firestore } from 'firebase-admin/firestore'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  discardSessionForUser,
  finalizeWorkoutForUser,
  type FinalizeWorkoutInput,
} from '../../api/lib/workoutClosure'
import {
  clearReviewAdminDatabase,
  closeReviewAdminDatabase,
  getReviewAdminDatabase,
} from '../review/support/adminReviewDatabase'

const USER_ID = 'closure-user'
const STARTED_AT = 1_790_000_000_000
const FINISHED_AT = STARTED_AT + 3_600_000
const db = getReviewAdminDatabase()

const input: FinalizeWorkoutInput = {
  sessionId: 'session-1',
  templateId: null,
  startedAt: STARTED_AT,
  finishedAt: FINISHED_AT,
  label: 'Push',
  exercises: [{
    exerciseId: 'bench-press',
    exerciseSource: 'global',
    name: 'Bench Press',
    sets: [{ weight: 80, reps: 5 }],
  }],
}

beforeEach(async () => {
  await clearReviewAdminDatabase()
})

afterEach(async () => {
  await clearReviewAdminDatabase()
})

afterAll(async () => {
  await closeReviewAdminDatabase()
})

async function seedActive(sessionId = input.sessionId) {
  await db.collection('activeSessions').doc(USER_ID).set({
    userId: USER_ID,
    sessionId,
    startedAt: STARTED_AT,
    templateId: null,
    label: input.label,
    exercises: input.exercises,
  })
}

async function readClosure(sessionId = input.sessionId) {
  const [workout, tombstone, active, workouts] = await Promise.all([
    db.collection('workouts').doc(sessionId).get(),
    db.collection('closedSessions').doc(sessionId).get(),
    db.collection('activeSessions').doc(USER_ID).get(),
    db.collection('workouts').where('sessionId', '==', sessionId).get(),
  ])
  return { workout, tombstone, active, workouts }
}

describe('workout closure', () => {
  it('atomically finishes the active session with deterministic documents', async () => {
    await seedActive()
    const materialize = vi.fn().mockImplementation(async (_userId, workoutId: string) => {
      await db.collection('workouts').doc(workoutId).update({ materialized: true })
    })

    await expect(finalizeWorkoutForUser(USER_ID, input, {
      db,
      now: () => FINISHED_AT + 1,
      materialize,
    })).resolves.toEqual({ workoutId: input.sessionId, status: 'materialized' })

    const state = await readClosure()
    expect(state.workout.data()).toEqual({
      ...input,
      userId: USER_ID,
      materialized: true,
    })
    expect(state.tombstone.data()).toEqual({
      userId: USER_ID,
      sessionId: input.sessionId,
      outcome: 'finished',
      workoutId: input.sessionId,
      closedAt: FINISHED_AT + 1,
    })
    expect(state.active.exists).toBe(false)
    expect(state.workouts.size).toBe(1)
  })

  it('returns the existing workout on retry without rewriting its payload', async () => {
    await seedActive()
    const materialize = vi.fn().mockImplementation(async (_userId, workoutId: string) => {
      await db.collection('workouts').doc(workoutId).update({ materialized: true })
    })
    await finalizeWorkoutForUser(USER_ID, input, { db, now: () => FINISHED_AT + 1, materialize })

    const changedRetry = { ...input, label: 'Changed retry payload' }
    await expect(finalizeWorkoutForUser(USER_ID, changedRetry, {
      db,
      now: () => FINISHED_AT + 2,
      materialize,
    })).resolves.toEqual({ workoutId: input.sessionId, status: 'materialized' })

    const state = await readClosure()
    expect(state.workout.data()?.label).toBe('Push')
    expect(state.tombstone.data()?.closedAt).toBe(FINISHED_AT + 1)
    expect(state.workouts.size).toBe(1)
    expect(materialize).toHaveBeenCalledOnce()
  })

  it('converges two concurrent finishes to one logical workout', async () => {
    await seedActive()
    const materialize = vi.fn().mockImplementation(async (_userId, workoutId: string) => {
      await db.collection('workouts').doc(workoutId).update({ materialized: true })
    })

    const results = await Promise.all([
      finalizeWorkoutForUser(USER_ID, input, { db, now: () => FINISHED_AT + 1, materialize }),
      finalizeWorkoutForUser(USER_ID, input, { db, now: () => FINISHED_AT + 1, materialize }),
    ])

    expect(results).toEqual([
      { workoutId: input.sessionId, status: 'materialized' },
      { workoutId: input.sessionId, status: 'materialized' },
    ])
    expect((await readClosure()).workouts.size).toBe(1)
  })

  it('survives a lost transaction acknowledgement and retry', async () => {
    await seedActive()
    let loseAcknowledgement = true
    const lostAckDb = new Proxy(db, {
      get(target, property, receiver) {
        if (property !== 'runTransaction') return Reflect.get(target, property, receiver)
        return async (...args: Parameters<Firestore['runTransaction']>) => {
          const result = await target.runTransaction(...args)
          if (loseAcknowledgement) {
            loseAcknowledgement = false
            throw new Error('lost acknowledgement')
          }
          return result
        }
      },
    }) as Firestore
    const materialize = vi.fn().mockResolvedValue(undefined)

    await expect(finalizeWorkoutForUser(USER_ID, input, {
      db: lostAckDb,
      now: () => FINISHED_AT + 1,
      materialize,
    })).rejects.toThrow('lost acknowledgement')

    await expect(finalizeWorkoutForUser(USER_ID, input, {
      db,
      now: () => FINISHED_AT + 2,
      materialize,
    })).resolves.toEqual({ workoutId: input.sessionId, status: 'materialized' })
    expect((await readClosure()).workouts.size).toBe(1)
  })

  it('keeps the committed closure when materialization fails and converges on retry', async () => {
    await seedActive()
    const failingMaterialize = vi.fn().mockRejectedValue(new Error('projection failed'))

    await expect(finalizeWorkoutForUser(USER_ID, input, {
      db,
      now: () => FINISHED_AT + 1,
      materialize: failingMaterialize,
    })).resolves.toEqual({ workoutId: input.sessionId, status: 'projection_pending' })

    const pending = await readClosure()
    expect(pending.workout.data()?.materialized).toBe(false)
    expect(pending.tombstone.data()?.outcome).toBe('finished')
    expect(pending.active.exists).toBe(false)

    const succeedingMaterialize = vi.fn().mockImplementation(async (_userId, workoutId: string) => {
      await db.collection('workouts').doc(workoutId).update({ materialized: true })
    })
    await expect(finalizeWorkoutForUser(USER_ID, input, {
      db,
      now: () => FINISHED_AT + 2,
      materialize: succeedingMaterialize,
    })).resolves.toEqual({ workoutId: input.sessionId, status: 'materialized' })
  })

  it('discards idempotently without creating a workout', async () => {
    await seedActive()

    await expect(discardSessionForUser(USER_ID, input.sessionId, {
      db,
      now: () => FINISHED_AT + 1,
    })).resolves.toEqual({ status: 'discarded' })
    await expect(discardSessionForUser(USER_ID, input.sessionId, {
      db,
      now: () => FINISHED_AT + 2,
    })).resolves.toEqual({ status: 'discarded' })

    const state = await readClosure()
    expect(state.workout.exists).toBe(false)
    expect(state.tombstone.data()).toMatchObject({ outcome: 'discarded', workoutId: null })
    expect(state.tombstone.data()?.closedAt).toBe(FINISHED_AT + 1)
    expect(state.active.exists).toBe(false)
  })

  it('tombstones discard when the active session is already absent', async () => {
    await expect(discardSessionForUser(USER_ID, input.sessionId, {
      db,
      now: () => FINISHED_AT + 1,
    })).resolves.toEqual({ status: 'discarded' })

    expect((await readClosure()).tombstone.data()).toEqual({
      userId: USER_ID,
      sessionId: input.sessionId,
      outcome: 'discarded',
      workoutId: null,
      closedAt: FINISHED_AT + 1,
    })
  })

  it('reports session_mismatch without deleting a newer active session', async () => {
    await seedActive('session-newer')

    await expect(finalizeWorkoutForUser(USER_ID, input, {
      db,
      now: () => FINISHED_AT + 1,
      materialize: vi.fn(),
    })).rejects.toMatchObject({ status: 409, code: 'session_mismatch' })
    await expect(discardSessionForUser(USER_ID, input.sessionId, {
      db,
      now: () => FINISHED_AT + 1,
    })).rejects.toMatchObject({ status: 409, code: 'session_mismatch' })

    expect((await readClosure()).active.data()?.sessionId).toBe('session-newer')
  })

  it('never converts a finished tombstone to discarded or a discarded tombstone to finished', async () => {
    await seedActive()
    await finalizeWorkoutForUser(USER_ID, input, {
      db,
      now: () => FINISHED_AT + 1,
      materialize: vi.fn().mockResolvedValue(undefined),
    })
    await expect(discardSessionForUser(USER_ID, input.sessionId, {
      db,
      now: () => FINISHED_AT + 2,
    })).rejects.toMatchObject({ status: 409 })
    expect((await readClosure()).tombstone.data()?.outcome).toBe('finished')

    await clearReviewAdminDatabase()
    await discardSessionForUser(USER_ID, input.sessionId, { db, now: () => FINISHED_AT + 3 })
    await expect(finalizeWorkoutForUser(USER_ID, input, {
      db,
      now: () => FINISHED_AT + 4,
      materialize: vi.fn(),
    })).rejects.toMatchObject({ status: 409 })
    expect((await readClosure()).tombstone.data()?.outcome).toBe('discarded')
  })

  it('validates ownership before classifying a workout-only closure as incomplete', async () => {
    await db.collection('workouts').doc(input.sessionId).set({
      ...input,
      userId: 'other-user',
      materialized: false,
    })

    await expect(finalizeWorkoutForUser(USER_ID, input, {
      db,
      materialize: vi.fn(),
    })).rejects.toMatchObject({ status: 403, code: 'resource_owner_mismatch' })
  })

  it('validates ownership before classifying a tombstone-only closure as incomplete', async () => {
    await db.collection('closedSessions').doc(input.sessionId).set({
      userId: 'other-user',
      sessionId: input.sessionId,
      outcome: 'finished',
      workoutId: input.sessionId,
      closedAt: FINISHED_AT,
    })

    await expect(finalizeWorkoutForUser(USER_ID, input, {
      db,
      materialize: vi.fn(),
    })).rejects.toMatchObject({ status: 403, code: 'resource_owner_mismatch' })
  })

  it('validates both existing records before classifying a contradictory finish', async () => {
    await Promise.all([
      db.collection('workouts').doc(input.sessionId).set({
        ...input,
        userId: USER_ID,
        materialized: false,
      }),
      db.collection('closedSessions').doc(input.sessionId).set({
        userId: 'other-user',
        sessionId: input.sessionId,
        outcome: 'discarded',
        workoutId: null,
        closedAt: FINISHED_AT,
      }),
    ])

    await expect(finalizeWorkoutForUser(USER_ID, input, {
      db,
      materialize: vi.fn(),
    })).rejects.toMatchObject({ status: 403, code: 'resource_owner_mismatch' })
  })

  it('validates an existing workout before accepting a discarded tombstone retry', async () => {
    await Promise.all([
      db.collection('workouts').doc(input.sessionId).set({
        ...input,
        userId: 'other-user',
        materialized: false,
      }),
      db.collection('closedSessions').doc(input.sessionId).set({
        userId: USER_ID,
        sessionId: input.sessionId,
        outcome: 'discarded',
        workoutId: null,
        closedAt: FINISHED_AT,
      }),
    ])

    await expect(discardSessionForUser(USER_ID, input.sessionId, {
      db,
    })).rejects.toMatchObject({ status: 403, code: 'resource_owner_mismatch' })
  })
})
