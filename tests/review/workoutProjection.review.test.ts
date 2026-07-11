import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ReviewFault } from './support/faultOutcomes'
import {
  clearReviewAdminDatabase,
  closeReviewAdminDatabase,
  getReviewAdminDatabase,
} from './support/adminReviewDatabase'

vi.mock('../../api/lib/firebaseAdmin.js', async () => {
  const { getReviewAdminDatabase } = await import('./support/adminReviewDatabase')
  return { adminDb: getReviewAdminDatabase() }
})

import { materializeWorkoutForUser } from '../../api/lib/workoutProjection'

const USER_ID = 'phase-r-user'
const STARTED_AT = 1_780_000_000_000
const FINISHED_AT = STARTED_AT + 3_600_000

const checkpointCases = [
  {
    checkpoint: 'beforeExerciseSessions',
    outcome: 'failed_after_workout_before_projection',
    expectedSessionCount: 0,
    expectsRecord: false,
  },
  {
    checkpoint: 'afterExerciseSessions',
    outcome: 'failed_after_sessions_before_records',
    expectedSessionCount: 1,
    expectsRecord: false,
  },
  {
    checkpoint: 'afterRecords',
    outcome: 'failed_after_records_before_materialized_flag',
    expectedSessionCount: 1,
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

describe('workout projection retry review', () => {
  for (const checkpointCase of checkpointCases) {
    it(`retries consistently after ${checkpointCase.checkpoint}`, async () => {
      const workoutId = `phase-r-${checkpointCase.checkpoint}`
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
      expect(intermediate.exerciseSessions).toHaveLength(checkpointCase.expectedSessionCount)
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
      await materializeWorkoutForUser(USER_ID, workoutId, { db })

      const final = await readProjectionState(workoutId)
      console.info(
        `[review observation] ${checkpointCase.checkpoint} final: materialized=${String(final.workout?.materialized)}, sessions=${final.exerciseSessions.length}, totalSessions=${String(final.record?.totalSessions)}, maxWeight=${String(final.record?.maxWeight)}, maxReps=${String(final.record?.maxReps)}, bestVolume=${String(final.record?.bestVolume)}`,
      )
      expect(final.workout?.materialized).toBe(true)
      expect(final.exerciseSessions).toHaveLength(1)
      expect(final.exerciseSessions[0]?.workoutId).toBe(workoutId)
      expect(final.record?.totalSessions).toBe(1)
      expect(final.record?.maxWeight).toBe(80)
      expect(final.record?.maxReps).toBe(5)
      expect(final.record?.bestVolume).toBe(400)
    })
  }
})
