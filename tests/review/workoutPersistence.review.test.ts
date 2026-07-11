import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ActiveWorkout } from '../../src/store/workoutStore'
import {
  discardStaleSessionLifecycle,
  discardWorkoutLifecycle,
  finishWorkoutLifecycle,
} from '../../src/lib/workoutLifecycle'
import {
  saveWorkoutWithPort,
  type WorkoutWritePayload,
} from '../../src/lib/workoutService'
import { ReviewFault } from './support/faultOutcomes'
import { createFirestoreReviewEnvironment } from './support/firestoreReviewEnvironment'

const USER_ID = 'phase-r-user'
// Keep the emulator fixture completed relative to the approved plan's execution date.
const STARTED_AT = 1_780_000_000_000

const workout: ActiveWorkout = {
  sessionId: 'session-1',
  startedAt: STARTED_AT,
  templateId: null,
  label: 'Phase R workout',
  exercises: [{
    exerciseId: 'bench-press',
    exerciseSource: 'global',
    name: 'Bench Press',
    sets: [{ weight: '80', reps: '5', done: true }],
  }],
}

let testEnv: RulesTestEnvironment

beforeAll(async () => {
  testEnv = await createFirestoreReviewEnvironment()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
})

afterAll(async () => {
  await testEnv.cleanup()
})

function activeSessionDocument(session: ActiveWorkout) {
  return {
    userId: USER_ID,
    sessionId: session.sessionId,
    startedAt: session.startedAt,
    templateId: session.templateId ?? null,
    label: session.label ?? null,
    exercises: session.exercises,
    updatedAt: session.startedAt + 1,
  }
}

describe('workout persistence review', () => {
  it('remote commit succeeded, acknowledgement was lost, retry creates a second logical workout', async () => {
    const db = testEnv.authenticatedContext(USER_ID).firestore()
    const ambiguousPort = {
      async createWorkout(payload: WorkoutWritePayload) {
        await addDoc(collection(db, 'workouts'), payload)
        throw new ReviewFault('remote_commit_succeeded_ack_lost')
      },
      materializeWorkout: vi.fn(),
    }

    await expect(saveWorkoutWithPort(USER_ID, workout, ambiguousPort)).rejects.toEqual(
      new ReviewFault('remote_commit_succeeded_ack_lost'),
    )
    expect(ambiguousPort.materializeWorkout).not.toHaveBeenCalled()

    await saveWorkoutWithPort(USER_ID, workout, {
      async createWorkout(payload) {
        const created = await addDoc(collection(db, 'workouts'), payload)
        return { id: created.id }
      },
      materializeWorkout: vi.fn().mockResolvedValue(undefined),
    })

    const snapshot = await getDocs(query(
      collection(db, 'workouts'),
      where('userId', '==', USER_ID),
    ))
    const documents = snapshot.docs.map((document) => ({ id: document.id, ...document.data() }))
    const logicalWorkouts = documents.map(({ id, ...payload }) => ({ id, payload }))
    const ids = logicalWorkouts.map(({ id }) => id)

    console.info(`[review observation] ack-loss workout ids: ${ids.sort().join(', ')}`)
    expect(documents).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    expect(logicalWorkouts[0]?.payload).toEqual(logicalWorkouts[1]?.payload)
  })

  it('finish cleanup failure leaves activeSessions document after local clear', async () => {
    const db = testEnv.authenticatedContext(USER_ID).firestore()
    const sessionRef = doc(db, 'activeSessions', USER_ID)
    await setDoc(sessionRef, activeSessionDocument(workout))
    const clearWorkout = vi.fn()

    const result = await finishWorkoutLifecycle({
      saveWorkout: vi.fn().mockResolvedValue({ id: 'workout-1', materialized: true }),
      clearWorkout,
      clearSession: vi.fn().mockRejectedValue(new ReviewFault('active_session_delete_failed')),
    })

    expect(result.sessionCleanup).toBe('unconfirmed')
    expect(clearWorkout).toHaveBeenCalledOnce()
    expect((await getDoc(sessionRef)).exists()).toBe(true)
  })

  it('discard cleanup failure leaves activeSessions document after local clear', async () => {
    const db = testEnv.authenticatedContext(USER_ID).firestore()
    const sessionRef = doc(db, 'activeSessions', USER_ID)
    await setDoc(sessionRef, activeSessionDocument(workout))
    const clearWorkout = vi.fn()

    const result = await discardWorkoutLifecycle({
      clearWorkout,
      clearSession: vi.fn().mockRejectedValue(new ReviewFault('active_session_delete_failed')),
    })

    expect(result.sessionCleanup).toBe('unconfirmed')
    expect(clearWorkout).toHaveBeenCalledOnce()
    expect((await getDoc(sessionRef)).exists()).toBe(true)
  })

  it('stale discard masks delete failure and persists a replacement session', async () => {
    const db = testEnv.authenticatedContext(USER_ID).firestore()
    const sessionRef = doc(db, 'activeSessions', USER_ID)
    await setDoc(sessionRef, activeSessionDocument(workout))
    const replacement: ActiveWorkout = {
      ...workout,
      startedAt: STARTED_AT + 10_000,
      label: 'Replacement workout',
    }
    const clearLocal = vi.fn()

    const result = await discardStaleSessionLifecycle({
      clearLocal,
      deleteRemote: vi.fn().mockRejectedValue(new ReviewFault('active_session_delete_failed')),
      startReplacement: vi.fn(() => replacement),
      persistReplacement: async (session) => {
        await setDoc(sessionRef, activeSessionDocument(session))
      },
    })

    expect(result.sessionCleanup).toBe('unconfirmed')
    expect(clearLocal).toHaveBeenCalledOnce()
    const persisted = await getDoc(sessionRef)
    expect(persisted.exists()).toBe(true)
    expect(persisted.data()?.startedAt).toBe(replacement.startedAt)
    expect(persisted.data()?.label).toBe(replacement.label)
  })
})
