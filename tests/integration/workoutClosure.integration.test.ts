import type { Firestore } from 'firebase-admin/firestore'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  discardSessionForUser,
  finalizeWorkoutForUser,
} from '../../api/_lib/workoutClosure'
import { deriveLegacySessionId } from '../../src/lib/sessionIdentity'
import {
  clearReviewAdminDatabase,
  closeReviewAdminDatabase,
  getReviewAdminDatabase,
} from '../review/support/adminReviewDatabase'

const USER_ID = 'closure-user'
const OTHER_USER_ID = 'closure-user-2'
const STARTED_AT = 1_790_000_000_000
const FINISHED_AT = STARTED_AT + 3_600_000
const db = getReviewAdminDatabase()

const input = {
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

async function seedActive(sessionId = input.sessionId, userId = USER_ID) {
  await db.collection('activeSessions').doc(userId).set({
    userId,
    sessionId,
    sessionRevision: 'revision-1',
    startedAt: STARTED_AT,
    templateId: null,
    label: input.label,
    updatedAt: STARTED_AT + 1_000,
    exercises: [{
      exerciseId: 'bench-press',
      exerciseSource: 'global',
      name: 'Bench Press',
      sets: [
        { weight: '80', reps: '5', done: true },
        { weight: '90', reps: '3', done: false },
      ],
    }],
  })
}

async function seedLegacyActive(userId = USER_ID) {
  await db.collection('activeSessions').doc(userId).set({
    userId,
    startedAt: STARTED_AT,
    templateId: null,
    label: input.label,
    updatedAt: STARTED_AT + 1_000,
    exercises: [{
      exerciseId: 'bench-press',
      exerciseSource: 'global',
      name: 'Bench Press',
      sets: [{ weight: '80', reps: '5', done: true }],
    }],
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
  it('persists canonical active-session contents instead of request contents', async () => {
    await seedActive()
    const materialize = vi.fn().mockImplementation(async (_uid, workoutId: string) => {
      await db.collection('workouts').doc(workoutId).update({ materialized: true })
    })

    await finalizeWorkoutForUser(USER_ID, {
      sessionId: input.sessionId,
      sessionRevision: 'revision-1',
    }, { db, now: () => FINISHED_AT, materialize })

    const state = await readClosure()
    expect(state.workout.data()).toMatchObject({
      label: 'Push',
      finishedAt: FINISHED_AT,
      exercises: [{
        exerciseId: 'bench-press',
        exerciseSource: 'global',
        name: 'Bench Press',
        sets: [{ weight: 80, reps: 5 }],
      }],
    })
  })

  it('performs no writes when the active revision changed', async () => {
    await seedActive()

    await expect(finalizeWorkoutForUser(USER_ID, {
      sessionId: input.sessionId,
      sessionRevision: 'revision-stale',
    }, { db, now: () => FINISHED_AT }))
      .rejects.toMatchObject({ status: 409, code: 'active_session_changed' })

    const state = await readClosure()
    expect(state.active.exists).toBe(true)
    expect(state.workout.exists).toBe(false)
    expect(state.tombstone.exists).toBe(false)
  })

  it('performs no writes when a canonical completed set is malformed', async () => {
    await seedActive()
    await db.collection('activeSessions').doc(USER_ID).update({
      exercises: [{
        exerciseId: 'bench-press',
        exerciseSource: 'global',
        name: 'Bench Press',
        sets: [{ weight: 'not-a-weight', reps: '5', done: true }],
      }],
    })
    const materialize = vi.fn()

    await expect(finalizeWorkoutForUser(USER_ID, {
      sessionId: input.sessionId,
      sessionRevision: 'revision-1',
    }, { db, now: () => FINISHED_AT, materialize }))
      .rejects.toMatchObject({ status: 400, message: 'Niepoprawny ciężar w serii.' })

    const state = await readClosure()
    expect(state.active.exists).toBe(true)
    expect(state.workout.exists).toBe(false)
    expect(state.tombstone.exists).toBe(false)
    expect(materialize).not.toHaveBeenCalled()
  })

  it('finishes a legacy active session using its deterministic derived ID', async () => {
    const legacySessionId = deriveLegacySessionId(USER_ID, STARTED_AT)
    await seedLegacyActive()
    const materialize = vi.fn().mockImplementation(async (_userId, workoutId: string) => {
      await db.collection('workouts').doc(workoutId).update({ materialized: true })
    })

    await expect(finalizeWorkoutForUser(USER_ID, {
      sessionId: legacySessionId,
    }, {
      db,
      now: () => FINISHED_AT + 1,
      materialize,
    })).resolves.toEqual({ workoutId: legacySessionId, status: 'materialized' })

    const state = await readClosure(legacySessionId)
    expect(state.active.exists).toBe(false)
    expect(state.workouts.size).toBe(1)
  })

  it('discards a legacy active session using its deterministic derived ID', async () => {
    const legacySessionId = deriveLegacySessionId(USER_ID, STARTED_AT)
    await seedLegacyActive()

    await expect(discardSessionForUser(USER_ID, legacySessionId, {
      db,
      now: () => FINISHED_AT + 1,
    })).resolves.toEqual({ status: 'discarded' })

    const state = await readClosure(legacySessionId)
    expect(state.active.exists).toBe(false)
    expect(state.tombstone.data()?.outcome).toBe('discarded')
  })

  it('atomically finishes the active session with deterministic documents', async () => {
    await seedActive()
    const materialize = vi.fn().mockImplementation(async (_userId, workoutId: string) => {
      await db.collection('workouts').doc(workoutId).update({ materialized: true })
    })

    await expect(finalizeWorkoutForUser(USER_ID, {
      sessionId: input.sessionId,
      sessionRevision: 'revision-1',
    }, {
      db,
      now: () => FINISHED_AT,
      materialize,
    })).resolves.toEqual({ workoutId: input.sessionId, status: 'materialized' })

    const state = await readClosure()
    expect(state.workout.data()).toEqual({
      ...input,
      finishedAt: FINISHED_AT,
      userId: USER_ID,
      materialized: true,
    })
    expect(state.tombstone.data()).toEqual({
      userId: USER_ID,
      sessionId: input.sessionId,
      outcome: 'finished',
      workoutId: input.sessionId,
      closedAt: FINISHED_AT,
      projectionState: 'pending',
      projectionRevision: 1,
      projectionExerciseKeys: [{
        exerciseSource: 'global',
        exerciseId: 'bench-press',
      }],
    })
    expect(materialize).toHaveBeenCalledWith(USER_ID, input.sessionId, 1)
    expect(state.active.exists).toBe(false)
    expect(state.workouts.size).toBe(1)
  })

  it('returns the existing workout on retry without rewriting its payload', async () => {
    await seedActive()
    const materialize = vi.fn().mockImplementation(async (_userId, workoutId: string) => {
      await db.collection('workouts').doc(workoutId).update({ materialized: true })
    })
    await finalizeWorkoutForUser(USER_ID, {
      sessionId: input.sessionId,
      sessionRevision: 'revision-1',
    }, { db, now: () => FINISHED_AT, materialize })

    const changedRetry = { sessionId: input.sessionId, sessionRevision: 'revision-stale' }
    await expect(finalizeWorkoutForUser(USER_ID, changedRetry, {
      db,
      now: () => FINISHED_AT + 2,
      materialize,
    })).resolves.toEqual({ workoutId: input.sessionId, status: 'materialized' })

    const state = await readClosure()
    expect(state.workout.data()?.label).toBe('Push')
    expect(state.tombstone.data()?.closedAt).toBe(FINISHED_AT)
    expect(state.workouts.size).toBe(1)
    expect(materialize).toHaveBeenCalledOnce()
  })

  it('converges two concurrent finishes to one logical workout', async () => {
    await seedActive()
    const materialize = vi.fn().mockImplementation(async (_userId, workoutId: string) => {
      await db.collection('workouts').doc(workoutId).update({ materialized: true })
    })

    const results = await Promise.all([
      finalizeWorkoutForUser(USER_ID, {
        sessionId: input.sessionId,
        sessionRevision: 'revision-1',
      }, { db, now: () => FINISHED_AT, materialize }),
      finalizeWorkoutForUser(USER_ID, {
        sessionId: input.sessionId,
        sessionRevision: 'revision-1',
      }, { db, now: () => FINISHED_AT, materialize }),
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

    await expect(finalizeWorkoutForUser(USER_ID, {
      sessionId: input.sessionId,
      sessionRevision: 'revision-1',
    }, {
      db: lostAckDb,
      now: () => FINISHED_AT + 1,
      materialize,
    })).rejects.toThrow('lost acknowledgement')

    await expect(finalizeWorkoutForUser(USER_ID, {
      sessionId: input.sessionId,
      sessionRevision: 'revision-1',
    }, {
      db,
      now: () => FINISHED_AT + 2,
      materialize,
    })).resolves.toEqual({ workoutId: input.sessionId, status: 'materialized' })
    expect((await readClosure()).workouts.size).toBe(1)
  })

  it('keeps the committed closure when materialization fails and converges on retry', async () => {
    await seedActive()
    const failingMaterialize = vi.fn().mockRejectedValue(new Error('projection failed'))

    await expect(finalizeWorkoutForUser(USER_ID, {
      sessionId: input.sessionId,
      sessionRevision: 'revision-1',
    }, {
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
    await expect(finalizeWorkoutForUser(USER_ID, {
      sessionId: input.sessionId,
      sessionRevision: 'revision-1',
    }, {
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

  it('rejects a first discard when the active session and owned tombstone are absent', async () => {
    await expect(discardSessionForUser(USER_ID, input.sessionId, {
      db,
      now: () => FINISHED_AT + 1,
    })).rejects.toMatchObject({ status: 409, code: 'session_mismatch' })

    expect((await readClosure()).tombstone.exists).toBe(false)
  })

  it('isolates same-startedAt legacy sessions by owner', async () => {
    const firstId = deriveLegacySessionId(USER_ID, STARTED_AT)
    const secondId = deriveLegacySessionId(OTHER_USER_ID, STARTED_AT)
    await Promise.all([seedLegacyActive(USER_ID), seedLegacyActive(OTHER_USER_ID)])

    await discardSessionForUser(USER_ID, firstId, { db, now: () => FINISHED_AT + 1 })
    await discardSessionForUser(OTHER_USER_ID, secondId, { db, now: () => FINISHED_AT + 2 })

    expect(firstId).not.toBe(secondId)
    await expect(db.collection('closedSessions').doc(firstId).get())
      .resolves.toMatchObject({ exists: true })
    await expect(db.collection('closedSessions').doc(secondId).get())
      .resolves.toMatchObject({ exists: true })
  })

  it('does not let another user preemptively reserve a legacy namespace', async () => {
    const ownerLegacyId = deriveLegacySessionId(USER_ID, STARTED_AT)
    await seedLegacyActive(USER_ID)

    await expect(discardSessionForUser(OTHER_USER_ID, ownerLegacyId, {
      db,
      now: () => FINISHED_AT + 1,
    })).rejects.toMatchObject({ status: 409, code: 'session_mismatch' })
    expect((await db.collection('closedSessions').doc(ownerLegacyId).get()).exists).toBe(false)

    await expect(discardSessionForUser(USER_ID, ownerLegacyId, {
      db,
      now: () => FINISHED_AT + 2,
    })).resolves.toEqual({ status: 'discarded' })
  })

  it('reports session_mismatch without deleting a newer active session', async () => {
    await seedActive('session-newer')

    await expect(finalizeWorkoutForUser(USER_ID, {
      sessionId: input.sessionId,
      sessionRevision: 'revision-1',
    }, {
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
    await finalizeWorkoutForUser(USER_ID, {
      sessionId: input.sessionId,
      sessionRevision: 'revision-1',
    }, {
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
    await seedActive()
    await discardSessionForUser(USER_ID, input.sessionId, { db, now: () => FINISHED_AT + 3 })
    await expect(finalizeWorkoutForUser(USER_ID, {
      sessionId: input.sessionId,
      sessionRevision: 'revision-1',
    }, {
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

    await expect(finalizeWorkoutForUser(USER_ID, { sessionId: input.sessionId }, {
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

    await expect(finalizeWorkoutForUser(USER_ID, { sessionId: input.sessionId }, {
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

    await expect(finalizeWorkoutForUser(USER_ID, { sessionId: input.sessionId }, {
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
