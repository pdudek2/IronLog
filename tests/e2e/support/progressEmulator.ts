import { deleteApp, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

const APP_NAME = 'phase-7-playwright-progress'
const PROJECT_ID = 'demo-ironlog'
const PREFIX = 'phase-7-progress-'
export const PROGRESS_DETAIL_EXERCISE_ID = 'phase-7-progress-detail'
const SESSION_DATES = [
  Date.UTC(2026, 3, 6, 12),
  Date.UTC(2026, 2, 30, 12),
  Date.UTC(2026, 2, 23, 12),
]
const DETAIL_VOLUMES = [1_200, 1_400, 900]

function assertProgressEmulator(): void {
  if (
    process.env.E2E_BACKEND !== 'emulator'
    || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080'
    || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
  ) {
    throw new Error('Progress Admin helper requires the local Auth and Firestore emulators.')
  }
}

function progressApp(): App {
  assertProgressEmulator()
  return getApps().find((candidate) => candidate.name === APP_NAME)
    ?? initializeApp({ projectId: PROJECT_ID }, APP_NAME)
}

async function progressUid(): Promise<string> {
  const email = process.env.TEST_EMAIL
  if (!email) throw new Error('TEST_EMAIL is required for the progress Admin helper.')
  return (await getAuth(progressApp()).getUserByEmail(email)).uid
}

export async function seedProgressEmulatorState(): Promise<void> {
  const uid = await progressUid()
  const database = getFirestore(progressApp())
  const batch = database.batch()

  SESSION_DATES.forEach((finishedAt, index) => {
    batch.set(database.doc(`exerciseSessions/${PREFIX}session-${index + 1}`), {
      userId: uid,
      workoutId: `${PREFIX}workout-${index + 1}`,
      exerciseId: `${PREFIX}bench`,
      exerciseSource: 'global',
      finishedAt,
      totalVolume: 400 + index * 50,
      totalSets: 1,
      bestSetWeight: 80 + index * 5,
      exerciseName: 'Phase 7 Bench Press',
      muscleGroups: ['chest'],
    })

    batch.set(database.doc(`exerciseSessions/${PREFIX}squat-session-${index + 1}`), {
      userId: uid,
      workoutId: `${PREFIX}squat-workout-${index + 1}`,
      exerciseId: `${PREFIX}squat`,
      exerciseSource: 'global',
      finishedAt,
      totalVolume: 500 + index * 50,
      totalSets: 1,
      bestSetWeight: 110 - index * 5,
      exerciseName: 'Phase 7 Squat',
      muscleGroups: ['quadriceps'],
    })
  })

  batch.set(database.doc(`records/${uid}_global_${PREFIX}bench`), {
    userId: uid,
    exerciseId: `${PREFIX}bench`,
    exerciseSource: 'global',
    exerciseName: 'Phase 7 Bench Press',
    maxWeight: 90,
    maxReps: 5,
    bestVolume: 450,
    totalSessions: SESSION_DATES.length,
    lastPerformedAt: SESSION_DATES[0],
  })

  await batch.commit()
}

export async function cleanupProgressEmulatorState(): Promise<void> {
  const uid = await progressUid()
  const database = getFirestore(progressApp())
  const references = [
    ...SESSION_DATES.map((_, index) => database.doc(`exerciseSessions/${PREFIX}session-${index + 1}`)),
    ...SESSION_DATES.map((_, index) => database.doc(`exerciseSessions/${PREFIX}squat-session-${index + 1}`)),
    database.doc(`records/${uid}_global_${PREFIX}bench`),
  ]
  await Promise.all(references.map((reference) => reference.delete()))
}

export async function seedExerciseDetailEmulatorState(): Promise<void> {
  const uid = await progressUid()
  const database = getFirestore(progressApp())
  const batch = database.batch()

  batch.set(database.doc(`userExercises/${PROGRESS_DETAIL_EXERCISE_ID}`), {
    userId: uid,
    name: 'Phase 7 Volume Detail',
    category: 'legs',
    equipment: 'barbell',
    muscles: ['quadriceps'],
  })

  SESSION_DATES.forEach((startedAt, index) => {
    const totalVolume = DETAIL_VOLUMES[index]
    batch.set(database.doc(`exerciseSessions/${PREFIX}detail-session-${index + 1}`), {
      userId: uid,
      workoutId: `${PREFIX}detail-workout-${index + 1}`,
      exerciseId: PROGRESS_DETAIL_EXERCISE_ID,
      exerciseSource: 'user',
      exerciseName: 'Phase 7 Volume Detail',
      startedAt,
      label: `Phase 7 detail ${index + 1}`,
      totalSets: 2,
      totalReps: 10,
      totalVolume,
      bestSetWeight: totalVolume / 10,
      bestSetReps: 5,
      sets: [
        { weight: totalVolume / 10, reps: 5 },
        { weight: totalVolume / 10, reps: 5 },
      ],
    })
  })

  await batch.commit()
}

export async function cleanupExerciseDetailEmulatorState(): Promise<void> {
  const database = getFirestore(progressApp())
  const references = [
    database.doc(`userExercises/${PROGRESS_DETAIL_EXERCISE_ID}`),
    ...SESSION_DATES.map((_, index) => database.doc(`exerciseSessions/${PREFIX}detail-session-${index + 1}`)),
  ]
  await Promise.all(references.map((reference) => reference.delete()))
}

export async function closeProgressEmulator(): Promise<void> {
  const app = getApps().find((candidate) => candidate.name === APP_NAME)
  if (app) await deleteApp(app)
}
