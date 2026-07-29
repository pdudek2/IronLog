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

import {
  materializeWorkoutForUser,
  updateFinishedWorkoutForUser,
} from '../../api/_lib/workoutProjection'

const USER_ID = 'phase-r-user'
const STARTED_AT = 1_780_000_000_000
const FINISHED_AT = STARTED_AT + 3_600_000

const db = getReviewAdminDatabase()
const benchPressExercise = {
  exerciseId: 'bench-press',
  exerciseSource: 'global',
  name: 'Bench Press',
  sets: [{ weight: 80, reps: 5 }],
}

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
    exercises: [benchPressExercise],
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

async function seedReadyWorkout(
  workoutId: string,
  exercise = benchPressExercise,
) {
  await db.collection('workouts').doc(workoutId).set({
    userId: USER_ID,
    sessionId: workoutId,
    startedAt: STARTED_AT,
    finishedAt: FINISHED_AT,
    label: 'Serialized',
    materialized: true,
    exercises: [exercise],
  })
  await db.collection('closedSessions').doc(workoutId).set({
    userId: USER_ID,
    sessionId: workoutId,
    outcome: 'finished',
    workoutId,
    closedAt: FINISHED_AT,
    projectionState: 'ready',
    projectionRevision: 1,
    projectionExerciseKeys: [{
      exerciseSource: exercise.exerciseSource,
      exerciseId: exercise.exerciseId,
    }],
  })
}

async function seedDeletedFence(workoutId: string) {
  await db.collection('closedSessions').doc(workoutId).set({
    userId: USER_ID,
    sessionId: workoutId,
    outcome: 'finished',
    workoutId,
    closedAt: FINISHED_AT,
    projectionState: 'deleted',
    projectionRevision: 2,
    projectionExerciseKeys: [{
      exerciseSource: 'global',
      exerciseId: 'bench-press',
    }],
    deletedAt: FINISHED_AT + 1,
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

  it('increments the revision and preserves old and new exercise keys', async () => {
    const workoutId = 'serialization-update'
    await seedReadyWorkout(workoutId)
    const materialize = vi.fn().mockResolvedValue(undefined)

    await updateFinishedWorkoutForUser(USER_ID, workoutId, {
      label: 'Updated',
      exercises: [{
        exerciseId: 'custom-curl',
        exerciseSource: 'user',
        name: 'Custom Curl',
        sets: [{ weight: 20, reps: 8 }],
      }],
    }, { db, materialize })

    const tombstone = await db.collection('closedSessions').doc(workoutId).get()
    expect(tombstone.data()).toMatchObject({
      projectionState: 'pending',
      projectionRevision: 2,
      projectionExerciseKeys: [
        { exerciseSource: 'global', exerciseId: 'bench-press' },
        { exerciseSource: 'user', exerciseId: 'custom-curl' },
      ],
    })
    expect(materialize).toHaveBeenCalledWith(USER_ID, workoutId, 2)
  })

  it('rejects an update after the fence is deleted', async () => {
    const workoutId = 'serialization-update-deleted'
    await seedDeletedFence(workoutId)

    await expect(updateFinishedWorkoutForUser(USER_ID, workoutId, {
      label: 'Too late',
      exercises: [benchPressExercise],
    }, { db })).rejects.toMatchObject({
      status: 409,
      code: 'workout_deleted',
    })
  })

  it('preserves ownership rejection before validating the update payload', async () => {
    const workoutId = 'serialization-update-owner'
    await seedReadyWorkout(workoutId)

    await expect(updateFinishedWorkoutForUser('different-user', workoutId, null, {
      db,
    })).rejects.toMatchObject({
      status: 403,
      code: 'resource_owner_mismatch',
    })
  })

  it('serializes overlapping updates and materializes only the latest revision', async () => {
    const workoutId = 'serialization-concurrent-updates'
    await seedReadyWorkout(workoutId)
    await materializeWorkoutForUser(USER_ID, workoutId, {
      db,
      expectedRevision: 1,
    })
    const firstCommitted = deferred()
    const releaseFirst = deferred()

    const firstUpdate = updateFinishedWorkoutForUser(USER_ID, workoutId, {
      label: 'First update',
      exercises: [{
        exerciseId: 'back-squat',
        exerciseSource: 'global',
        name: 'Back Squat',
        sets: [{ weight: 100, reps: 5 }],
      }],
    }, {
      db,
      materialize: async (_userId, _workoutId, expectedRevision) => {
        expect(expectedRevision).toBe(2)
        firstCommitted.resolve()
        await releaseFirst.promise
      },
    })

    await firstCommitted.promise
    const secondUpdate = updateFinishedWorkoutForUser(USER_ID, workoutId, {
      label: 'Second update',
      exercises: [{
        exerciseId: 'custom-curl',
        exerciseSource: 'user',
        name: 'Custom Curl',
        sets: [{ weight: 20, reps: 8 }],
      }],
    }, {
      db,
      materialize: vi.fn().mockResolvedValue(undefined),
    })
    await secondUpdate
    releaseFirst.resolve()
    await firstUpdate

    const pendingFence = await db.collection('closedSessions').doc(workoutId).get()
    expect(pendingFence.data()).toMatchObject({
      projectionState: 'pending',
      projectionRevision: 3,
    })
    await expect(materializeWorkoutForUser(USER_ID, workoutId, {
      db,
      expectedRevision: 2,
    })).rejects.toMatchObject({
      status: 409,
      code: 'projection_superseded',
    })

    await materializeWorkoutForUser(USER_ID, workoutId, {
      db,
      expectedRevision: 3,
    })

    const [workout, sessions, records, fence] = await Promise.all([
      db.collection('workouts').doc(workoutId).get(),
      db.collection('exerciseSessions').where('workoutId', '==', workoutId).get(),
      db.collection('records').where('userId', '==', USER_ID).get(),
      db.collection('closedSessions').doc(workoutId).get(),
    ])
    expect(workout.data()).toMatchObject({
      label: 'Second update',
      materialized: true,
      exercises: [{
        exerciseId: 'custom-curl',
        exerciseSource: 'user',
        name: 'Custom Curl',
        sets: [{ weight: 20, reps: 8 }],
      }],
    })
    expect(sessions.docs.map((doc) => doc.data())).toMatchObject([{
      label: 'Second update',
      exerciseId: 'custom-curl',
      exerciseSource: 'user',
      exerciseName: 'Custom Curl',
    }])
    expect(records.docs.map((doc) => doc.data())).toMatchObject([{
      exerciseId: 'custom-curl',
      exerciseSource: 'user',
      exerciseName: 'Custom Curl',
    }])
    expect(fence.data()).toMatchObject({
      projectionState: 'ready',
      projectionRevision: 3,
      projectionExerciseKeys: [{
        exerciseSource: 'user',
        exerciseId: 'custom-curl',
      }],
    })
  })
})
