import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearReviewAdminDatabase,
  closeReviewAdminDatabase,
  getReviewAdminDatabase,
} from '../review/support/adminReviewDatabase'

vi.mock('../../api/_lib/firebaseAdmin.js', async () => {
  const { getReviewAdminDatabase } = await import('../review/support/adminReviewDatabase')
  return { adminDb: getReviewAdminDatabase() }
})

import { materializeWorkoutForUser } from '../../api/_lib/workoutProjection'

const USER_ID = 'phase-r-user'
const STARTED_AT = 1_780_000_000_000
const FINISHED_AT = STARTED_AT + 3_600_000

const db = getReviewAdminDatabase()

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(async () => {
  await clearReviewAdminDatabase()
})

afterEach(async () => {
  await clearReviewAdminDatabase()
  const snapshots = await Promise.all([
    db.collection('workouts').get(),
    db.collection('exerciseSessions').get(),
    db.collection('records').get(),
    db.collection('closedSessions').get(),
  ])
  expect(snapshots.every((snapshot) => snapshot.empty)).toBe(true)
})

afterAll(async () => {
  await closeReviewAdminDatabase()
})

async function seedWorkoutWithoutTombstone(workoutId: string) {
  await db.collection('workouts').doc(workoutId).set({
    userId: USER_ID,
    sessionId: workoutId,
    startedAt: STARTED_AT,
    finishedAt: FINISHED_AT,
    label: 'Serialized',
    materialized: false,
    exercises: [{
      exerciseId: 'bench-press',
      exerciseSource: 'global',
      name: 'Bench Press',
      sets: [{ weight: 80, reps: 5 }],
    }],
  })
}

async function seedWorkoutWithFence(
  workoutId: string,
  fence: { projectionState: 'pending' | 'ready'; projectionRevision: number },
) {
  await seedWorkoutWithoutTombstone(workoutId)
  await db.collection('closedSessions').doc(workoutId).set({
    userId: USER_ID,
    sessionId: workoutId,
    outcome: 'finished',
    workoutId,
    closedAt: FINISHED_AT,
    projectionExerciseKeys: [{
      exerciseSource: 'global',
      exerciseId: 'bench-press',
    }],
    ...fence,
  })
}

describe('workout projection serialization', () => {
  it('initializes a missing legacy fence before projection writes', async () => {
    await seedWorkoutWithoutTombstone('serialization-legacy')

    await materializeWorkoutForUser(USER_ID, 'serialization-legacy', { db })

    const tombstone = await db.collection('closedSessions')
      .doc('serialization-legacy')
      .get()
    expect(tombstone.data()).toMatchObject({
      userId: USER_ID,
      sessionId: 'serialization-legacy',
      outcome: 'finished',
      workoutId: 'serialization-legacy',
      projectionState: 'ready',
      projectionRevision: 1,
      projectionExerciseKeys: [{
        exerciseSource: 'global',
        exerciseId: 'bench-press',
      }],
    })
  })

  it('rejects a paused materialization after the fence revision changes', async () => {
    const workoutId = 'serialization-stale'
    await seedWorkoutWithFence(workoutId, {
      projectionState: 'pending',
      projectionRevision: 1,
    })
    const paused = deferred()
    const release = deferred()

    const materializing = materializeWorkoutForUser(USER_ID, workoutId, {
      db,
      expectedRevision: 1,
      checkpoints: {
        beforeExerciseSessions: async () => {
          paused.resolve()
          await release.promise
        },
      },
    })

    await paused.promise
    await db.collection('closedSessions').doc(workoutId).update({
      projectionRevision: 2,
    })
    release.resolve()

    await expect(materializing).rejects.toMatchObject({
      status: 409,
      code: 'projection_superseded',
    })
    expect((await db.collection('exerciseSessions')
      .where('workoutId', '==', workoutId).get()).empty).toBe(true)
  })
})
