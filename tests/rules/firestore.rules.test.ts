import { readFileSync } from 'node:fs'

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

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
  it('allows the owner to create a valid pending workout', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()

    await assertSucceeds(setDoc(doc(db, 'workouts', 'workout-valid'), validWorkout('alice')))
  })

  it('rejects workouts with unexpected top-level fields', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()

    await assertFails(setDoc(doc(db, 'workouts', 'workout-extra'), {
      ...validWorkout('alice'),
      debug: true,
    }))
  })

  it('rejects workouts with too many exercises or invalid set values', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()

    await assertFails(setDoc(doc(db, 'workouts', 'workout-large'), {
      ...validWorkout('alice'),
      exercises: Array.from({ length: 61 }, () => validFinishedExercise()),
    }))

    await assertFails(setDoc(doc(db, 'workouts', 'workout-bad-set'), {
      ...validWorkout('alice'),
      exercises: [{ ...validFinishedExercise(), sets: [{ weight: -1, reps: 5 }] }],
    }))
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
  it('allows valid active sessions and rejects oversized drafts', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()

    await assertSucceeds(setDoc(doc(db, 'activeSessions', 'alice'), validActiveSession('alice')))
    await assertFails(setDoc(doc(db, 'activeSessions', 'alice'), {
      ...validActiveSession('alice'),
      exercises: Array.from({ length: 61 }, () => validActiveExercise()),
    }))
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

function validActiveSession(userId: string) {
  return {
    userId,
    startedAt: 1_790_000_000_000,
    templateId: null,
    label: 'Push',
    updatedAt: 1_790_000_100_000,
    exercises: [validActiveExercise()],
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
