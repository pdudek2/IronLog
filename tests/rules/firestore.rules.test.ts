import { readFileSync } from 'node:fs'

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

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
  it('allows valid custom exercises and rejects invalid taxonomy values', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()

    await assertSucceeds(setDoc(doc(db, 'userExercises', 'custom-valid'), validUserExercise('alice')))
    await assertFails(setDoc(doc(db, 'userExercises', 'custom-invalid'), {
      ...validUserExercise('alice'),
      category: 'everything',
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
  it('allows valid active sessions containing a sessionId and rejects oversized drafts', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()

    await assertSucceeds(setDoc(doc(db, 'activeSessions', 'alice'), validActiveSession('alice')))
    await assertFails(setDoc(doc(db, 'activeSessions', 'alice'), {
      ...validActiveSession('alice'),
      exercises: Array.from({ length: 61 }, () => validActiveExercise()),
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
