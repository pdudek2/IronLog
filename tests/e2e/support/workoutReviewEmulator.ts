import { deleteApp, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldPath, getFirestore, type DocumentData } from 'firebase-admin/firestore'

const APP_NAME = 'phase-r-playwright-workout-review'
const PROJECT_ID = 'demo-ironlog'
const POLL_INTERVAL_MS = 100
const DEFAULT_POLL_TIMEOUT_MS = 10_000

interface SeedReviewWorkoutOptions {
  id: string
  label: string
  materialized: boolean
  startedAt?: number
}

export interface ReviewActiveSession extends DocumentData {
  userId: string
  startedAt: number
}

function assertWorkoutReviewEmulator(): void {
  if (
    process.env.E2E_BACKEND !== 'emulator'
    || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080'
    || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
  ) {
    throw new Error('Workout review Admin helper requires the local Auth and Firestore emulators.')
  }
}

function getWorkoutReviewApp(): App {
  assertWorkoutReviewEmulator()
  return getApps().find((candidate) => candidate.name === APP_NAME)
    ?? initializeApp({ projectId: PROJECT_ID }, APP_NAME)
}

async function getReviewUid(): Promise<string> {
  assertWorkoutReviewEmulator()
  const email = process.env.TEST_EMAIL
  if (!email) throw new Error('TEST_EMAIL is required for the workout review Admin helper.')
  return (await getAuth(getWorkoutReviewApp()).getUserByEmail(email)).uid
}

export function reviewActiveSession(uid: string, startedAt = Date.now()) {
  return {
    userId: uid,
    startedAt,
    templateId: null,
    label: 'Phase R active session',
    exercises: [{
      exerciseId: 'bench-press',
      exerciseSource: 'global' as const,
      name: 'Bench Press',
      sets: [{ weight: '80', reps: '5', done: true }],
    }],
    updatedAt: Date.now(),
  }
}

export async function seedReviewActiveSession(startedAt = Date.now()): Promise<void> {
  const app = getWorkoutReviewApp()
  const uid = await getReviewUid()
  await getFirestore(app).doc(`activeSessions/${uid}`).set(reviewActiveSession(uid, startedAt))
}

export async function seedReviewWorkout({
  id,
  label,
  materialized,
  startedAt = Date.now() - 5 * 60_000,
}: SeedReviewWorkoutOptions): Promise<void> {
  if (!id.startsWith('phase-r-')) throw new Error('Review workout IDs must begin with phase-r-.')
  if (!label.startsWith('Phase R')) throw new Error('Review workout labels must begin with Phase R.')

  const app = getWorkoutReviewApp()
  const uid = await getReviewUid()
  await getFirestore(app).doc(`workouts/${id}`).set({
    userId: uid,
    startedAt,
    finishedAt: startedAt + 5 * 60_000,
    templateId: null,
    label,
    materialized,
    exercises: [{
      exerciseId: 'bench-press',
      exerciseSource: 'global' as const,
      name: 'Bench Press',
      sets: [{ weight: 80, reps: 5 }],
    }],
  })
}

export async function readReviewActiveSession(): Promise<ReviewActiveSession | null> {
  const app = getWorkoutReviewApp()
  const uid = await getReviewUid()
  const snapshot = await getFirestore(app).doc(`activeSessions/${uid}`).get()
  return snapshot.exists ? snapshot.data() as ReviewActiveSession : null
}

export async function waitForReviewActiveSession(
  predicate: (session: ReviewActiveSession | null) => boolean = (session) => session !== null,
  timeoutMs = DEFAULT_POLL_TIMEOUT_MS,
): Promise<ReviewActiveSession | null> {
  assertWorkoutReviewEmulator()
  const deadline = Date.now() + timeoutMs
  let session = await readReviewActiveSession()

  while (!predicate(session) && Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    session = await readReviewActiveSession()
  }

  if (!predicate(session)) {
    throw new Error(`Timed out waiting for the Phase R active session after ${timeoutMs} ms.`)
  }
  return session
}

export async function cleanupWorkoutReviewState(): Promise<void> {
  const app = getWorkoutReviewApp()
  const uid = await getReviewUid()
  const database = getFirestore(app)
  const workouts = await database.collection('workouts')
    .where('userId', '==', uid)
    .orderBy(FieldPath.documentId())
    .get()
  const reviewWorkouts = workouts.docs.filter((snapshot) => snapshot.id.startsWith('phase-r-'))

  const cleanupResults = await Promise.allSettled([
    database.doc(`activeSessions/${uid}`).delete(),
    ...reviewWorkouts.map((snapshot) => snapshot.ref.delete()),
  ])
  const failures = cleanupResults.flatMap((result) => (
    result.status === 'rejected' ? [result.reason] : []
  ))
  if (failures.length > 0) throw new AggregateError(failures, 'Workout review cleanup failed.')
}

export async function closeWorkoutReviewEmulator(): Promise<void> {
  assertWorkoutReviewEmulator()
  const app = getApps().find((candidate) => candidate.name === APP_NAME)
  if (app) await deleteApp(app)
}
