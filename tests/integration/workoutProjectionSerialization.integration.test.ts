import type { Firestore } from 'firebase-admin/firestore'
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
  deleteFinishedWorkoutForUser,
  materializeWorkoutForUser,
  updateFinishedWorkoutForUser,
} from '../../api/_lib/workoutProjection'
import { ReviewFault } from '../review/support/faultOutcomes'

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
const customCurlExercise = {
  exerciseId: 'custom-curl',
  exerciseSource: 'user',
  name: 'Custom Curl',
  sets: [{ weight: 20, reps: 8 }],
}

const deletionCheckpointCases = [
  {
    checkpoint: 'afterDeleteClaim',
    outcome: 'failed_after_delete_claim',
    expectedSessionCount: 1,
  },
  {
    checkpoint: 'afterDeleteSessions',
    outcome: 'failed_after_delete_sessions',
    expectedSessionCount: 0,
  },
  {
    checkpoint: 'beforeDeleteRecords',
    outcome: 'failed_before_delete_records',
    expectedSessionCount: 0,
  },
] as const

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

async function seedMaterializedWorkoutWithRecord(workoutId: string) {
  await seedReadyWorkout(workoutId)
  await materializeWorkoutForUser(USER_ID, workoutId, {
    db,
    expectedRevision: 1,
  })
}

async function readDeletionState(workoutId: string) {
  const [workout, tombstone, exerciseSessions, records] = await Promise.all([
    db.collection('workouts').doc(workoutId).get(),
    db.collection('closedSessions').doc(workoutId).get(),
    db.collection('exerciseSessions').where('workoutId', '==', workoutId).get(),
    db.collection('records').where('userId', '==', USER_ID).get(),
  ])

  return {
    workout: workout.exists ? workout.data() : undefined,
    tombstone: tombstone.exists ? tombstone.data() : undefined,
    exerciseSessions: exerciseSessions.docs
      .map((document) => ({ id: document.id, ...document.data() }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    records: records.docs
      .map((document) => ({ id: document.id, ...document.data() }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  }
}

function deletionEvidence(state: Awaited<ReturnType<typeof readDeletionState>>) {
  const tombstone = state.tombstone ? { ...state.tombstone } : undefined
  if (tombstone) delete tombstone.deletedAt
  const records = state.records.map((record) => {
    const stableRecord = { ...record }
    delete stableRecord.updatedAt
    return stableRecord
  })

  return {
    workout: state.workout,
    tombstone,
    exerciseSessions: state.exerciseSessions,
    records,
  }
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

  it.each([
    'beforeExerciseSessions',
    'afterExerciseSessions',
  ] as const)('keeps delete terminal when an older materialization resumes after %s', async (
    checkpoint,
  ) => {
    const workoutId = `serialization-delete-wins-${checkpoint}`
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
        [checkpoint]: async () => {
          paused.resolve()
          await release.promise
        },
      },
    })

    await paused.promise
    await deleteFinishedWorkoutForUser(USER_ID, workoutId, {
      db,
      now: () => 999,
    })
    release.resolve()

    await expect(materializing).rejects.toMatchObject({
      status: 409,
      code: 'workout_deleted',
    })
    const state = await readDeletionState(workoutId)
    expect(state.workout).toBeUndefined()
    expect(state.exerciseSessions).toEqual([])
    expect(state.records).toEqual([])
    expect(state.tombstone).toMatchObject({
      projectionState: 'deleted',
      projectionRevision: 2,
      deletedAt: 999,
    })
  })

  it('rejects materialization from an update committed before delete', async () => {
    const workoutId = 'serialization-update-before-delete'
    await seedMaterializedWorkoutWithRecord(workoutId)
    const updateCommitted = deferred()
    const releaseUpdate = deferred()

    const updating = updateFinishedWorkoutForUser(USER_ID, workoutId, {
      label: 'Deleted update',
      exercises: [customCurlExercise],
    }, {
      db,
      materialize: async (ownerId, id, expectedRevision) => {
        updateCommitted.resolve()
        await releaseUpdate.promise
        await materializeWorkoutForUser(ownerId, id, {
          db,
          expectedRevision,
        })
      },
    })

    await updateCommitted.promise
    await deleteFinishedWorkoutForUser(USER_ID, workoutId, {
      db,
      now: () => 999,
    })
    releaseUpdate.resolve()

    await expect(updating).rejects.toMatchObject({
      status: 409,
      code: 'workout_deleted',
    })
    const state = await readDeletionState(workoutId)
    expect(state.workout).toBeUndefined()
    expect(state.exerciseSessions).toEqual([])
    expect(state.records).toEqual([])
    expect(state.tombstone).toMatchObject({
      projectionState: 'deleted',
      projectionRevision: 3,
      projectionExerciseKeys: [
        { exerciseSource: 'global', exerciseId: 'bench-press' },
        { exerciseSource: 'user', exerciseId: 'custom-curl' },
      ],
    })
  })

  for (const checkpointCase of deletionCheckpointCases) {
    it(`converges idempotently after ${checkpointCase.checkpoint}`, async () => {
      const workoutId = `serialization-delete-retry-${checkpointCase.checkpoint}`
      await seedMaterializedWorkoutWithRecord(workoutId)

      await expect(deleteFinishedWorkoutForUser(USER_ID, workoutId, {
        db,
        now: () => 999,
        checkpoints: {
          [checkpointCase.checkpoint]: () => {
            throw new ReviewFault(checkpointCase.outcome)
          },
        },
      })).rejects.toEqual(new ReviewFault(checkpointCase.outcome))

      const failed = await readDeletionState(workoutId)
      expect(failed.workout).toBeUndefined()
      expect(failed.tombstone).toMatchObject({
        projectionState: 'deleted',
        projectionRevision: 2,
        projectionExerciseKeys: [{
          exerciseSource: 'global',
          exerciseId: 'bench-press',
        }],
        deletedAt: 999,
      })
      expect(failed.exerciseSessions).toHaveLength(checkpointCase.expectedSessionCount)
      expect(failed.records).toHaveLength(1)

      await deleteFinishedWorkoutForUser(USER_ID, workoutId, {
        db,
        now: () => 1_000,
      })
      const recovered = await readDeletionState(workoutId)
      expect(recovered.workout).toBeUndefined()
      expect(recovered.exerciseSessions).toEqual([])
      expect(recovered.records).toEqual([])
      expect(recovered.tombstone).toMatchObject({
        projectionState: 'deleted',
        projectionRevision: 2,
        deletedAt: 999,
      })

      await deleteFinishedWorkoutForUser(USER_ID, workoutId, {
        db,
        now: () => 1_001,
      })
      const idempotentRetry = await readDeletionState(workoutId)
      expect(idempotentRetry.tombstone?.deletedAt).toBe(999)
      expect(deletionEvidence(idempotentRetry)).toEqual(deletionEvidence(recovered))
    })
  }

  it('cleans records for the union of fenced and remaining session keys', async () => {
    const workoutId = 'serialization-delete-key-union'
    await seedWorkoutWithFence(workoutId, {
      projectionState: 'pending',
      projectionRevision: 1,
    })
    await db.collection('closedSessions').doc(workoutId).update({
      projectionExerciseKeys: [
        { exerciseSource: 'global', exerciseId: 'bench-press' },
        { exerciseSource: 'user', exerciseId: 'custom-curl' },
      ],
    })
    await db.collection('exerciseSessions').doc(`${workoutId}_custom-curl`).set({
      id: `${workoutId}_custom-curl`,
      userId: USER_ID,
      workoutId,
      startedAt: STARTED_AT,
      finishedAt: FINISHED_AT,
      label: 'Serialized',
      exerciseId: 'custom-curl',
      exerciseSource: 'user',
      exerciseName: 'Custom Curl',
      orderIndex: 0,
      totalSets: 1,
      totalReps: 8,
      totalVolume: 160,
      bestSetWeight: 20,
      bestSetReps: 8,
      category: null,
      equipment: null,
      muscleGroups: [],
      sets: [{ weight: 20, reps: 8 }],
    })
    await Promise.all([
      db.collection('records').doc(`${USER_ID}_global_bench-press`).set({
        userId: USER_ID,
        exerciseSource: 'global',
        exerciseId: 'bench-press',
      }),
      db.collection('records').doc(`${USER_ID}_user_custom-curl`).set({
        userId: USER_ID,
        exerciseSource: 'user',
        exerciseId: 'custom-curl',
      }),
    ])

    await deleteFinishedWorkoutForUser(USER_ID, workoutId, {
      db,
      now: () => 999,
    })

    const state = await readDeletionState(workoutId)
    expect(state.exerciseSessions).toEqual([])
    expect(state.records).toEqual([])
    expect(state.tombstone).toMatchObject({
      projectionState: 'deleted',
      projectionRevision: 2,
      projectionExerciseKeys: [
        { exerciseSource: 'global', exerciseId: 'bench-press' },
        { exerciseSource: 'user', exerciseId: 'custom-curl' },
      ],
    })
  })

  it('does not recreate a shared record from another workout deleted during recomputation', async () => {
    const firstWorkoutId = 'serialization-delete-shared-first'
    const secondWorkoutId = 'serialization-delete-shared-second'
    await seedMaterializedWorkoutWithRecord(firstWorkoutId)
    await seedMaterializedWorkoutWithRecord(secondWorkoutId)
    const beforeFirstRecordTransaction = deferred()
    const releaseFirstRecordTransaction = deferred()
    let transactionCount = 0
    const delayedDb = new Proxy(db, {
      get(target, property, receiver) {
        if (property !== 'runTransaction') return Reflect.get(target, property, receiver)
        return async (...args: Parameters<Firestore['runTransaction']>) => {
          transactionCount += 1
          if (transactionCount === 4) {
            beforeFirstRecordTransaction.resolve()
            await releaseFirstRecordTransaction.promise
          }
          return target.runTransaction(...args)
        }
      },
    }) as Firestore

    const deletingFirst = deleteFinishedWorkoutForUser(USER_ID, firstWorkoutId, {
      db: delayedDb,
      now: () => 999,
    })
    await beforeFirstRecordTransaction.promise
    try {
      await deleteFinishedWorkoutForUser(USER_ID, secondWorkoutId, {
        db,
        now: () => 1_000,
      })
    } finally {
      releaseFirstRecordTransaction.resolve()
    }
    await deletingFirst

    expect((await db.collection('exerciseSessions')
      .where('userId', '==', USER_ID)
      .where('exerciseId', '==', 'bench-press')
      .where('exerciseSource', '==', 'global')
      .get()).empty).toBe(true)
    expect((await db.collection('records')
      .doc(`${USER_ID}_global_bench-press`)
      .get()).exists).toBe(false)
  })

  it.each([
    'workout',
    'tombstone',
  ] as const)('preserves resources when the %s belongs to another user', async (resource) => {
    const workoutId = `serialization-delete-foreign-${resource}`
    await seedReadyWorkout(workoutId)
    if (resource === 'workout') {
      await db.collection('closedSessions').doc(workoutId).delete()
      await db.collection('workouts').doc(workoutId).update({ userId: 'different-user' })
    } else {
      await db.collection('closedSessions').doc(workoutId).update({
        userId: 'different-user',
      })
    }
    const before = await Promise.all([
      db.collection('workouts').doc(workoutId).get(),
      db.collection('closedSessions').doc(workoutId).get(),
    ])

    await expect(deleteFinishedWorkoutForUser(USER_ID, workoutId, {
      db,
      now: () => 999,
    })).rejects.toMatchObject({
      status: 403,
      code: 'resource_owner_mismatch',
    })

    const after = await Promise.all([
      db.collection('workouts').doc(workoutId).get(),
      db.collection('closedSessions').doc(workoutId).get(),
    ])
    expect(after.map((snapshot) => snapshot.data()))
      .toEqual(before.map((snapshot) => snapshot.data()))
  })

  it('preserves closure_conflict for a discarded tombstone', async () => {
    const workoutId = 'serialization-delete-discarded'
    await db.collection('closedSessions').doc(workoutId).set({
      userId: USER_ID,
      sessionId: workoutId,
      outcome: 'discarded',
      workoutId: null,
      closedAt: FINISHED_AT,
    })

    await expect(deleteFinishedWorkoutForUser(USER_ID, workoutId, {
      db,
      now: () => 999,
    })).rejects.toMatchObject({
      status: 409,
      code: 'closure_conflict',
    })
    expect((await db.collection('closedSessions').doc(workoutId).get()).data())
      .toMatchObject({
        userId: USER_ID,
        outcome: 'discarded',
        workoutId: null,
      })
  })
})
