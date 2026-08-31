import { readFileSync } from 'node:fs'

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  where,
  type Firestore,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActiveWorkout } from '../../src/store/workoutStore'
import type { UserExerciseInput } from '../../src/lib/userExercisesService'

const PROJECT_ID = 'demo-ironlog-rules'

let testEnv: RulesTestEnvironment

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  })
})

beforeEach(async () => {
  await testEnv.clearFirestore()
})

afterAll(async () => {
  await testEnv.cleanup()
})

describe('workouts rules', () => {
  it('rejects client creation while preserving owner read access to server-created history', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()

    await assertFails(setDoc(doc(db, 'workouts', 'workout-valid'), validWorkout('alice')))

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'workouts', 'workout-history'), validWorkout('alice'))
    })

    await assertSucceeds(getDoc(doc(db, 'workouts', 'workout-history')))
  })
})

describe('templates rules', () => {
  it('allows a valid template and rejects oversized nested arrays', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()

    await assertSucceeds(setDoc(doc(db, 'templates', 'template-valid'), validTemplate('alice')))
    await assertFails(setDoc(doc(db, 'templates', 'template-large'), {
      ...validTemplate('alice'),
      days: [{
        name: 'Push',
        exercises: Array.from({ length: 61 }, () => validTemplateExercise()),
      }],
    }))
  })
})

describe('userExercises rules', () => {
  it('requires an atomic name claim and rejects invalid taxonomy values', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()

    await assertFails(setDoc(doc(db, 'userExercises', 'custom-without-claim'), validUserExercise('alice')))
    await assertFails(setDoc(doc(db, 'userExercises', 'custom-with-fake-claim'), {
      ...validUserExercise('alice'),
      nameClaimId: `alice_${'0'.repeat(64)}`,
    }))
    await assertFails(setDoc(doc(db, 'userExercises', 'custom-invalid'), {
      ...validUserExercise('alice'),
      category: 'everything',
    }))
  })

  it('creates at most one exercise when two clients submit the same name', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    const { createUserExercise } = await loadUserExerciseService(db)
    const input: UserExerciseInput = {
      name: 'Concurrent Curl',
      category: 'arms',
      equipment: 'dumbbell',
      muscles: ['biceps'],
    }

    const results = await Promise.allSettled([
      createUserExercise('alice', input),
      createUserExercise('alice', input),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { message: 'Ćwiczenie o nazwie "Concurrent Curl" już istnieje.' },
    })

    const stored = await getDocs(query(
      collection(db, 'userExercises'),
      where('userId', '==', 'alice'),
      where('name', '==', input.name),
    ))
    expect(stored.size).toBe(1)
  })

  it('allows at most one exercise to claim a name during concurrent renames', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    const { createUserExercise, updateUserExercise } = await loadUserExerciseService(db)
    const first = await createUserExercise('alice', {
      name: 'First Curl',
      category: 'arms',
      equipment: 'dumbbell',
      muscles: ['biceps'],
    })
    const second = await createUserExercise('alice', {
      name: 'Second Curl',
      category: 'arms',
      equipment: 'dumbbell',
      muscles: ['biceps'],
    })
    const renamed: UserExerciseInput = {
      name: 'Shared Curl',
      category: 'arms',
      equipment: 'dumbbell',
      muscles: ['biceps'],
    }

    const results = await Promise.allSettled([
      updateUserExercise(first.id, renamed),
      updateUserExercise(second.id, renamed),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    const stored = await getDocs(query(
      collection(db, 'userExercises'),
      where('userId', '==', 'alice'),
      where('name', '==', renamed.name),
    ))
    expect(stored.size).toBe(1)
  })

  it('adopts a legacy exercise without changing its document id', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'userExercises', 'legacy-id'),
        validUserExercise('alice'),
      )
    })
    const { updateUserExercise } = await loadUserExerciseService(db)

    await updateUserExercise('legacy-id', {
      name: 'Renamed Legacy Lift',
      category: 'back',
      equipment: 'barbell',
      muscles: ['back'],
    })

    const stored = await getDoc(doc(db, 'userExercises', 'legacy-id'))
    expect(stored.exists()).toBe(true)
    expect(stored.data()).toMatchObject({
      name: 'Renamed Legacy Lift',
      nameClaimId: expect.stringMatching(/^alice_[0-9a-f]{64}$/),
    })
  })

  it('releases the name claim when an exercise is deleted', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    const { createUserExercise, deleteUserExercise } = await loadUserExerciseService(db)
    const input: UserExerciseInput = {
      name: 'Reusable Curl',
      category: 'arms',
      equipment: 'dumbbell',
      muscles: ['biceps'],
    }

    const created = await createUserExercise('alice', input)
    await deleteUserExercise(created.id)

    await expect(createUserExercise('alice', input)).resolves.toMatchObject({
      name: input.name,
    })
  })

  it('rejects deleting a name claim while its exercise still uses it', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    const { createUserExercise } = await loadUserExerciseService(db)
    const created = await createUserExercise('alice', {
      name: 'Protected Curl',
      category: 'arms',
      equipment: 'dumbbell',
      muscles: ['biceps'],
    })
    const stored = await getDoc(doc(db, 'userExercises', created.id))
    const claimId = stored.data()?.nameClaimId as string

    await assertFails(deleteDoc(doc(db, 'userExerciseNames', claimId)))
  })

  it('rejects atomically repointing an existing name claim to another exercise', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    const { createUserExercise } = await loadUserExerciseService(db)
    const first = await createUserExercise('alice', {
      name: 'Claimed Curl',
      category: 'arms',
      equipment: 'dumbbell',
      muscles: ['biceps'],
    })
    const second = await createUserExercise('alice', {
      name: 'Other Curl',
      category: 'arms',
      equipment: 'dumbbell',
      muscles: ['biceps'],
    })
    const firstStored = await getDoc(doc(db, 'userExercises', first.id))
    const firstClaimId = firstStored.data()?.nameClaimId as string

    await assertFails(runTransaction(db, async (transaction) => {
      transaction.update(doc(db, 'userExercises', second.id), {
        name: first.name,
        nameClaimId: firstClaimId,
      })
      transaction.set(doc(db, 'userExerciseNames', firstClaimId), {
        userId: 'alice',
        exerciseId: second.id,
        name: first.name,
      })
    }))
  })
})

describe('readiness rules', () => {
  it('allows today-style readiness entries and rejects out-of-range scores', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()

    await assertSucceeds(setDoc(doc(db, 'readiness', 'alice_2026-05-18'), validReadiness('alice')))
    await assertFails(setDoc(doc(db, 'readiness', 'alice_2026-05-19'), {
      ...validReadiness('alice'),
      date: '2026-05-19',
      sleep: 9,
    }))
  })
})

describe('activeSessions rules', () => {
  it('rejects a stale second client save and preserves the newer edit', async () => {
    const clientA = testEnv.authenticatedContext('alice').firestore()
    const clientB = testEnv.authenticatedContext('alice').firestore()
    const activeRef = doc(clientA, 'activeSessions', 'alice')
    const startedAt = Date.now() - 1_000
    await assertSucceeds(setDoc(activeRef, {
      ...validActiveSession('alice'),
      startedAt,
      updatedAt: startedAt,
    }))
    const serviceA = await loadActiveSessionService(clientA)
    const serviceB = await loadActiveSessionService(clientB)

    await expect(serviceA.saveActiveSession(
      'alice',
      activeWorkout('82.5', startedAt),
      'revision-1',
    )).resolves.toMatchObject({ sessionRevision: expect.any(String) })
    await expect(serviceB.saveActiveSession(
      'alice',
      activeWorkout('80', startedAt),
      'revision-1',
    )).rejects.toMatchObject({ name: 'ActiveSessionConflictError' })

    const stored = await assertSucceeds(getDoc(activeRef))
    expect(stored.data()?.exercises[0].sets[0].weight).toBe('82.5')
  })

  it('allows valid active sessions containing a sessionId and rejects oversized drafts', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()

    await assertSucceeds(setDoc(doc(db, 'activeSessions', 'alice'), validActiveSession('alice')))
    await assertFails(setDoc(doc(db, 'activeSessions', 'alice'), {
      ...validActiveSession('alice'),
      exercises: Array.from({ length: 61 }, () => validActiveExercise()),
    }))
  })

  it('requires safe session revisions', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    const activeRef = doc(db, 'activeSessions', 'alice')
    const validActive = validActiveSession('alice')

    await assertSucceeds(setDoc(activeRef, validActive))
    const withoutRevision = structuredClone(validActive)
    Reflect.deleteProperty(withoutRevision, 'sessionRevision')

    await assertFails(setDoc(activeRef, withoutRevision))
    await assertFails(setDoc(activeRef, { ...validActive, sessionRevision: 'unsafe/revision' }))
  })

  it('allows a realistic multi-exercise template session', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    const exercises = [
      ['squat', 'Squat', 4],
      ['leg-press', 'Leg Press', 3],
      ['leg-curl', 'Leg Curl', 3],
      ['custom-machine', 'Machine abduction', 3],
    ].map(([exerciseId, name, setCount]) => ({
      exerciseId,
      exerciseSource: exerciseId === 'custom-machine' ? 'user' : 'global',
      name,
      sets: Array.from({ length: Number(setCount) }, () => ({
        weight: '77.5',
        reps: '8',
        done: false,
      })),
    }))

    await assertSucceeds(setDoc(doc(db, 'activeSessions', 'alice'), {
      ...validActiveSession('alice'),
      templateId: 'template-lower',
      label: 'Dzień 1',
      exercises,
    }))
  })

  it('rejects active sessions without a sessionId', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    const sessionWithoutId = structuredClone(validActiveSession('alice'))
    Reflect.deleteProperty(sessionWithoutId, 'sessionId')

    await assertFails(setDoc(doc(db, 'activeSessions', 'alice'), sessionWithoutId))
  })

  it('rejects creation and update using a tombstoned sessionId', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()

    await seedClosedSession('session-1')

    await assertFails(setDoc(doc(db, 'activeSessions', 'alice'), validActiveSession('alice')))

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'activeSessions', 'alice'),
        validActiveSession('alice', 'session-2'),
      )
    })

    await assertFails(setDoc(doc(db, 'activeSessions', 'alice'), validActiveSession('alice')))
  })

  it('does not let a late tombstoned write overwrite a newer session', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    const newerSession = validActiveSession('alice', 'session-2')

    await seedClosedSession('session-1')
    await assertSucceeds(setDoc(doc(db, 'activeSessions', 'alice'), newerSession))

    await assertFails(setDoc(doc(db, 'activeSessions', 'alice'), {
      ...validActiveSession('alice', 'session-1'),
      label: 'Late offline write',
      updatedAt: newerSession.updatedAt + 1,
    }))

    const retainedSnapshot = await assertSucceeds(getDoc(doc(db, 'activeSessions', 'alice')))
    expect(retainedSnapshot.data()).toEqual(newerSession)
  })
})

describe('closedSessions rules', () => {
  it('rejects client reads and writes', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()

    await seedClosedSession('session-1')

    await assertFails(getDoc(doc(db, 'closedSessions', 'session-1')))
    await assertFails(setDoc(doc(db, 'closedSessions', 'session-2'), closedSession('session-2')))
  })
})

describe('users rules', () => {
  it('allows valid profiles and rejects malformed profile data', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()

    await assertSucceeds(setDoc(doc(db, 'users', 'alice'), validProfile()))
    await assertFails(setDoc(doc(db, 'users', 'alice'), {
      ...validProfile(),
      weeklyGoal: 99,
    }))
  })
})

function validWorkout(userId: string) {
  return {
    userId,
    templateId: null,
    startedAt: 1_790_000_000_000,
    finishedAt: 1_790_003_600_000,
    materialized: false,
    label: 'Push',
    exercises: [validFinishedExercise()],
  }
}

function validFinishedExercise() {
  return {
    exerciseId: 'bench-press',
    exerciseSource: 'global',
    name: 'Bench Press',
    sets: [{ weight: 80.5, reps: 5 }],
  }
}

function validTemplate(userId: string) {
  return {
    userId,
    name: 'Plan A',
    createdAt: 1_790_000_000_000,
    updatedAt: 1_790_000_000_000,
    days: [{ name: 'Push', exercises: [validTemplateExercise()] }],
  }
}

function validTemplateExercise() {
  return {
    exerciseId: 'bench-press',
    exerciseSource: 'global',
    name: 'Bench Press',
    sets: 4,
    targetReps: 8,
    targetWeight: 80,
  }
}

function validUserExercise(userId: string) {
  return {
    userId,
    name: 'My Lift',
    category: 'chest',
    equipment: 'barbell',
    muscles: ['chest', 'triceps'],
  }
}

function validReadiness(userId: string) {
  return {
    userId,
    date: '2026-05-18',
    sleep: 4,
    mood: 3,
    soreness: 2,
    createdAt: 1_790_000_000_000,
  }
}

function validActiveSession(userId: string, sessionId = 'session-1') {
  return {
    userId,
    sessionId,
    sessionRevision: 'revision-1',
    startedAt: 1_790_000_000_000,
    templateId: null,
    label: 'Push',
    updatedAt: 1_790_000_100_000,
    exercises: [validActiveExercise()],
  }
}

function closedSession(sessionId: string) {
  return {
    userId: 'alice',
    sessionId,
    outcome: 'discarded',
    workoutId: null,
    closedAt: 1_790_000_200_000,
  }
}

async function seedClosedSession(sessionId: string) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'closedSessions', sessionId), closedSession(sessionId))
  })
}

async function loadUserExerciseService(database: Firestore) {
  vi.resetModules()
  vi.doMock('../../src/lib/firebase', () => ({ db: database }))
  return import('../../src/lib/userExercisesService')
}

async function loadActiveSessionService(database: Firestore) {
  vi.resetModules()
  vi.doMock('../../src/lib/firebase', () => ({ db: database }))
  return import('../../src/lib/activeSessionService')
}

function activeWorkout(weight: string, startedAt: number): ActiveWorkout {
  return {
    sessionId: 'session-1',
    startedAt,
    templateId: null,
    label: 'Push',
    exercises: [{
      exerciseId: 'bench-press',
      exerciseSource: 'global',
      name: 'Bench Press',
      sets: [{ weight, reps: '5', done: true }],
    }],
  }
}

function validActiveExercise() {
  return {
    exerciseId: 'bench-press',
    exerciseSource: 'global',
    name: 'Bench Press',
    sets: [{ weight: '80.5', reps: '5', done: true }],
  }
}

function validProfile() {
  return {
    displayName: 'Patryk',
    weeklyGoal: 3,
    primaryGoal: 'hypertrophy',
    units: 'kg',
    createdAt: 1_790_000_000_000,
  }
}
