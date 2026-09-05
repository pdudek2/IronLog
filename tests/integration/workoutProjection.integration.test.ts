import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ReviewFault } from '../review/support/faultOutcomes'
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
import { buildExerciseSessionDocumentId } from '../../api/_lib/workoutValidation'

const USER_ID = 'phase-r-user'
const STARTED_AT = 1_780_000_000_000
const FINISHED_AT = STARTED_AT + 3_600_000

const checkpointCases = [
  {
    checkpoint: 'beforeExerciseSessions',
    outcome: 'failed_after_workout_before_projection',
    expectedSessionCount: 0,
    expectsStaleSession: true,
    expectsRecord: false,
  },
  {
    checkpoint: 'afterExerciseSessions',
    outcome: 'failed_after_sessions_before_records',
    expectedSessionCount: 1,
    expectsStaleSession: false,
    expectsRecord: false,
  },
  {
    checkpoint: 'afterRecords',
    outcome: 'failed_after_records_before_materialized_flag',
    expectedSessionCount: 1,
    expectsStaleSession: false,
    expectsRecord: true,
  },
] as const

const db = getReviewAdminDatabase()

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

async function readProjectionState(workoutId: string) {
  const workout = await db.collection('workouts').doc(workoutId).get()
  const exerciseSessions = await db.collection('exerciseSessions')
    .where('workoutId', '==', workoutId)
    .get()
  const record = await db.collection('records')
    .doc(`${USER_ID}_global_bench-press`)
    .get()

  return {
    workout: workout.data(),
    exerciseSessions: exerciseSessions.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    })),
    record: record.exists ? record.data() : undefined,
  }
}

function projectionEvidence(state: Awaited<ReturnType<typeof readProjectionState>>) {
  const stableRecord = state.record ? { ...state.record } : undefined
  if (stableRecord) delete stableRecord.updatedAt

  return {
    workout: state.workout,
    exerciseSessions: [...state.exerciseSessions].sort((left, right) => (
      left.id.localeCompare(right.id)
    )),
    record: stableRecord,
  }
}

function expectRecoveredProjection(
  state: Awaited<ReturnType<typeof readProjectionState>>,
  workoutId: string,
) {
  const expectedSessionId = `${workoutId}_global_0_eb1b4441075b583cdfb78f5b`
  expect(state.workout?.materialized).toBe(true)
  expect(state.exerciseSessions).toHaveLength(1)
  expect(state.exerciseSessions[0]).toMatchObject({
    id: expectedSessionId,
    workoutId,
    userId: USER_ID,
    finishedAt: FINISHED_AT,
    exerciseId: 'bench-press',
    exerciseSource: 'global',
    orderIndex: 0,
  })
  expect(state.record).toMatchObject({
    totalSessions: 1,
    maxWeight: 80,
    maxReps: 5,
    bestVolume: 400,
    lastPerformedAt: FINISHED_AT,
  })
}

describe('workout projection retry review', () => {
  it('groups repeated exercises, removes legacy entries and rematerializes an edited workout', async () => {
    const workoutId = 'phase-r-repeated-exercise'
    const exercise = {
      exerciseId: 'bench-press',
      exerciseSource: 'global' as const,
      name: 'Bench Press',
      sets: [{ weight: 80, reps: 5 }],
    }
    const exercises = [exercise, { ...exercise, name: 'Bench Press again' }]
    await db.collection('workouts').doc(workoutId).set({
      userId: USER_ID,
      startedAt: STARTED_AT,
      finishedAt: FINISHED_AT,
      label: 'Repeated exercise',
      materialized: false,
      exercises,
    })

    await materializeWorkoutForUser(USER_ID, workoutId, { db })
    const grouped = await readProjectionState(workoutId)
    expect(grouped.workout?.exercises).toEqual(exercises)
    expect(grouped.exerciseSessions).toHaveLength(1)
    expect(grouped.exerciseSessions[0]).toMatchObject({
      orderIndex: 0,
      exerciseName: 'Bench Press',
      totalSets: 2,
      totalReps: 10,
      totalVolume: 800,
      sets: [{ weight: 80, reps: 5 }, { weight: 80, reps: 5 }],
    })
    expect(grouped.record).toMatchObject({ totalSessions: 1, bestVolume: 800 })

    // Model old per-entry projection data; explicit rematerialization must replace it.
    const legacySession = {
      ...grouped.exerciseSessions[0],
      totalSets: 1,
      totalReps: 5,
      totalVolume: 400,
      sets: exercise.sets,
    }
    for (const index of [0, 1]) {
      const id = buildExerciseSessionDocumentId(workoutId, 'global', 'bench-press', index)
      await db.collection('exerciseSessions').doc(id).set({ ...legacySession, id, orderIndex: index })
    }
    await materializeWorkoutForUser(USER_ID, workoutId, { db })
    expect(projectionEvidence(await readProjectionState(workoutId))).toEqual(projectionEvidence(grouped))

    await expect(updateFinishedWorkoutForUser(USER_ID, workoutId, {
      label: 'Repeated exercise',
      exercises: [exercise],
    }, { db })).resolves.toEqual({ status: 'materialized' })
    const edited = await readProjectionState(workoutId)
    expect(edited.workout?.exercises).toEqual([exercise])
    expectRecoveredProjection(edited, workoutId)
    expect(edited.exerciseSessions[0]).toMatchObject({ totalSets: 1, totalReps: 5, totalVolume: 400 })

    await materializeWorkoutForUser(USER_ID, workoutId, { db })
    expect(projectionEvidence(await readProjectionState(workoutId))).toEqual(projectionEvidence(edited))
  })

  it('keeps global and user exercise identities distinct when grouping repeated entries', async () => {
    const workoutId = 'phase-r-repeated-sources'
    const globalExercise = {
      exerciseId: 'bench-press',
      exerciseSource: 'global',
      name: 'Bench Press',
      sets: [{ weight: 80, reps: 5 }],
    }
    const userExercise = {
      ...globalExercise,
      exerciseSource: 'user',
      name: 'My Bench Press',
      sets: [{ weight: 40, reps: 5 }],
    }
    const exercises = [globalExercise, userExercise, globalExercise, userExercise]
    await db.collection('workouts').doc(workoutId).set({
      userId: USER_ID,
      startedAt: STARTED_AT,
      finishedAt: FINISHED_AT,
      label: null,
      materialized: false,
      exercises,
    })

    await materializeWorkoutForUser(USER_ID, workoutId, { db })
    const state = await readProjectionState(workoutId)
    expect(state.workout?.exercises).toEqual(exercises)
    expect(state.exerciseSessions).toHaveLength(2)
    expect(state.exerciseSessions).toEqual(expect.arrayContaining([
      expect.objectContaining({ exerciseSource: 'global', orderIndex: 0, totalSets: 2, totalVolume: 800 }),
      expect.objectContaining({ exerciseSource: 'user', orderIndex: 1, totalSets: 2, totalVolume: 400 }),
    ]))
    expect(state.record).toMatchObject({ totalSessions: 1, bestVolume: 800 })
    expect((await db.collection('records').doc(`${USER_ID}_user_bench-press`).get()).data())
      .toMatchObject({ totalSessions: 1, bestVolume: 400, maxWeight: 40 })
  })

  for (const checkpointCase of checkpointCases) {
    it(`retries consistently after ${checkpointCase.checkpoint}`, async () => {
      const workoutId = `phase-r-${checkpointCase.checkpoint}`
      const staleSessionId = `${workoutId}_stale-projection`
      await db.collection('workouts').doc(workoutId).set({
        userId: USER_ID,
        startedAt: STARTED_AT,
        finishedAt: FINISHED_AT,
        label: 'Phase R workout',
        materialized: false,
        exercises: [{
          exerciseId: 'bench-press',
          exerciseSource: 'global',
          name: 'Bench Press',
          sets: [{ weight: 80, reps: 5 }],
        }],
      })
      await db.collection('exerciseSessions').doc(staleSessionId).set({
        id: staleSessionId,
        userId: USER_ID,
        workoutId,
        startedAt: STARTED_AT - 10_000,
        finishedAt: FINISHED_AT - 10_000,
        label: 'Stale projection',
        exerciseId: 'bench-press',
        exerciseSource: 'global',
        exerciseName: 'Bench Press',
        orderIndex: 99,
        totalSets: 1,
        totalReps: 1,
        totalVolume: 1,
        bestSetWeight: 1,
        bestSetReps: 1,
        category: null,
        equipment: null,
        muscleGroups: [],
        sets: [{ weight: 1, reps: 1 }],
      })

      const checkpoints = {
        [checkpointCase.checkpoint]: () => {
          throw new ReviewFault(checkpointCase.outcome)
        },
      }

      await expect(materializeWorkoutForUser(USER_ID, workoutId, {
        db,
        checkpoints,
      })).rejects.toEqual(new ReviewFault(checkpointCase.outcome))

      const intermediate = await readProjectionState(workoutId)
      console.info(
        `[review observation] ${checkpointCase.checkpoint} intermediate: materialized=${String(intermediate.workout?.materialized)}, sessions=${intermediate.exerciseSessions.length}, record=${intermediate.record ? 'present' : 'absent'}`,
      )
      expect(intermediate.workout?.materialized).toBe(false)
      expect(intermediate.exerciseSessions).toHaveLength(
        checkpointCase.expectedSessionCount + (checkpointCase.expectsStaleSession ? 1 : 0),
      )
      expect(intermediate.exerciseSessions.some(({ id }) => id === staleSessionId)).toBe(
        checkpointCase.expectsStaleSession,
      )
      expect(Boolean(intermediate.record)).toBe(checkpointCase.expectsRecord)

      if (checkpointCase.expectsRecord) {
        expect(intermediate.record).toMatchObject({
          totalSessions: 1,
          maxWeight: 80,
          maxReps: 5,
          bestVolume: 400,
        })
      }

      await materializeWorkoutForUser(USER_ID, workoutId, { db })
      const recovered = await readProjectionState(workoutId)
      console.info(
        `[review observation] ${checkpointCase.checkpoint} recovered: materialized=${String(recovered.workout?.materialized)}, sessions=${recovered.exerciseSessions.length}, totalSessions=${String(recovered.record?.totalSessions)}, maxWeight=${String(recovered.record?.maxWeight)}, maxReps=${String(recovered.record?.maxReps)}, bestVolume=${String(recovered.record?.bestVolume)}`,
      )
      expectRecoveredProjection(recovered, workoutId)
      expect(recovered.exerciseSessions.some(({ id }) => id === staleSessionId)).toBe(false)

      await materializeWorkoutForUser(USER_ID, workoutId, { db })
      const idempotentRetry = await readProjectionState(workoutId)
      console.info(
        `[review observation] ${checkpointCase.checkpoint} idempotent retry: materialized=${String(idempotentRetry.workout?.materialized)}, sessions=${idempotentRetry.exerciseSessions.length}, totalSessions=${String(idempotentRetry.record?.totalSessions)}, maxWeight=${String(idempotentRetry.record?.maxWeight)}, maxReps=${String(idempotentRetry.record?.maxReps)}, bestVolume=${String(idempotentRetry.record?.bestVolume)}`,
      )
      expectRecoveredProjection(idempotentRetry, workoutId)
      expect(idempotentRetry.exerciseSessions.some(({ id }) => id === staleSessionId)).toBe(false)
      expect(projectionEvidence(idempotentRetry)).toEqual(projectionEvidence(recovered))
    })
  }
})
