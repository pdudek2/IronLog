import { deleteApp, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import {
  FieldPath,
  getFirestore,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore'

const APP_NAME = 'phase-1-playwright-workout-lifecycle'
const PROJECT_ID = 'demo-ironlog'
const PHASE_1_PREFIX = 'phase-1-'
const POLL_INTERVAL_MS = 100
const DEFAULT_POLL_TIMEOUT_MS = 10_000
const ACTIVE_SESSION_SETTLE_MS = 800

export interface LifecycleActiveSession extends DocumentData {
  userId: string
  sessionId: string
  startedAt: number
}

export interface LifecycleWorkout extends DocumentData {
  userId: string
  sessionId: string
  materialized: boolean
}

export interface LifecycleClosedSession extends DocumentData {
  userId: string
  sessionId: string
  outcome: 'finished' | 'discarded'
  workoutId: string | null
}

interface SeedActiveSessionOptions {
  sessionId: string
  startedAt?: number
  label?: string
  reps?: string
}

interface SeedWorkoutOptions {
  sessionId: string
  materialized: boolean
  label?: string
  startedAt?: number
}

function assertPhase1Id(value: string, resource: string): void {
  if (!value.startsWith(PHASE_1_PREFIX)) {
    throw new Error(`${resource} IDs must begin with ${PHASE_1_PREFIX}.`)
  }
}

function assertWorkoutLifecycleEmulator(): void {
  if (
    process.env.E2E_BACKEND !== 'emulator'
    || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080'
    || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
  ) {
    throw new Error('Workout lifecycle Admin helper requires the local Auth and Firestore emulators.')
  }
}

function getWorkoutLifecycleApp(): App {
  assertWorkoutLifecycleEmulator()
  return getApps().find((candidate) => candidate.name === APP_NAME)
    ?? initializeApp({ projectId: PROJECT_ID }, APP_NAME)
}

function database(): Firestore {
  return getFirestore(getWorkoutLifecycleApp())
}

async function getLifecycleUid(): Promise<string> {
  assertWorkoutLifecycleEmulator()
  const email = process.env.TEST_EMAIL
  if (!email) throw new Error('TEST_EMAIL is required for the workout lifecycle Admin helper.')
  return (await getAuth(getWorkoutLifecycleApp()).getUserByEmail(email)).uid
}

function activeSessionDocument(
  uid: string,
  { sessionId, startedAt = Date.now() - 5 * 60_000, label = 'Phase 1 active session', reps = '5' }: SeedActiveSessionOptions,
) {
  assertPhase1Id(sessionId, 'Active session')
  if (!label.startsWith('Phase 1')) throw new Error('Active session labels must begin with Phase 1.')
  return {
    userId: uid,
    sessionId,
    startedAt,
    templateId: null,
    label,
    exercises: [{
      exerciseId: 'phase-1-bench-press',
      exerciseSource: 'global' as const,
      name: 'Phase 1 Bench Press',
      sets: [{ weight: '80', reps, done: true }],
    }],
    updatedAt: Date.now(),
  }
}

function workoutDocument(
  uid: string,
  { sessionId, materialized, label = 'Phase 1 completed workout', startedAt = Date.now() - 5 * 60_000 }: SeedWorkoutOptions,
) {
  assertPhase1Id(sessionId, 'Workout')
  if (!label.startsWith('Phase 1')) throw new Error('Workout labels must begin with Phase 1.')
  return {
    userId: uid,
    sessionId,
    startedAt,
    finishedAt: startedAt + 5 * 60_000,
    templateId: null,
    label,
    materialized,
    exercises: [{
      exerciseId: 'phase-1-bench-press',
      exerciseSource: 'global' as const,
      name: 'Phase 1 Bench Press',
      sets: [{ weight: 80, reps: 5 }],
    }],
  }
}

export async function seedLifecycleActiveSession(options: SeedActiveSessionOptions): Promise<void> {
  const uid = await getLifecycleUid()
  await database().doc(`activeSessions/${uid}`).set(activeSessionDocument(uid, options))
}

export async function seedLifecycleWorkout(options: SeedWorkoutOptions): Promise<void> {
  const uid = await getLifecycleUid()
  await database().doc(`workouts/${options.sessionId}`).set(workoutDocument(uid, options))
}

export async function deleteLifecycleWorkout(sessionId: string): Promise<void> {
  assertPhase1Id(sessionId, 'Workout')
  await database().doc(`workouts/${sessionId}`).delete()
}

export async function commitPendingLifecycleFinalization(options: SeedWorkoutOptions): Promise<void> {
  const uid = await getLifecycleUid()
  const db = database()
  const batch = db.batch()
  batch.set(db.doc(`workouts/${options.sessionId}`), workoutDocument(uid, {
    ...options,
    materialized: false,
  }))
  batch.set(db.doc(`closedSessions/${options.sessionId}`), {
    userId: uid,
    sessionId: options.sessionId,
    outcome: 'finished',
    workoutId: options.sessionId,
    closedAt: Date.now(),
  })
  batch.delete(db.doc(`activeSessions/${uid}`))
  await batch.commit()
}

export async function readLifecycleActiveSession(): Promise<LifecycleActiveSession | null> {
  const uid = await getLifecycleUid()
  const snapshot = await database().doc(`activeSessions/${uid}`).get()
  return snapshot.exists ? snapshot.data() as LifecycleActiveSession : null
}

export async function readLifecycleWorkout(sessionId: string): Promise<LifecycleWorkout | null> {
  assertPhase1Id(sessionId, 'Workout')
  const snapshot = await database().doc(`workouts/${sessionId}`).get()
  return snapshot.exists ? snapshot.data() as LifecycleWorkout : null
}

export async function readLifecycleClosedSession(sessionId: string): Promise<LifecycleClosedSession | null> {
  assertPhase1Id(sessionId, 'Closed session')
  const snapshot = await database().doc(`closedSessions/${sessionId}`).get()
  return snapshot.exists ? snapshot.data() as LifecycleClosedSession : null
}

export async function readLifecycleWorkouts(sessionId: string): Promise<LifecycleWorkout[]> {
  assertPhase1Id(sessionId, 'Workout')
  const uid = await getLifecycleUid()
  const snapshot = await database().collection('workouts')
    .where('userId', '==', uid)
    .where('sessionId', '==', sessionId)
    .get()
  return snapshot.docs.map((document) => document.data() as LifecycleWorkout)
}

export async function readLifecycleExerciseSessions(sessionId: string): Promise<DocumentData[]> {
  assertPhase1Id(sessionId, 'Workout')
  const snapshot = await database().collection('exerciseSessions')
    .where('workoutId', '==', sessionId)
    .get()
  return snapshot.docs.map((document) => document.data())
}

export async function readLifecycleRecords(): Promise<DocumentData[]> {
  const uid = await getLifecycleUid()
  const snapshot = await database().collection('records').where('userId', '==', uid).get()
  return snapshot.docs
    .filter((document) => String(document.get('exerciseId')).startsWith(PHASE_1_PREFIX))
    .map((document) => document.data())
}

export async function waitForLifecycleActiveSession(
  predicate: (session: LifecycleActiveSession | null) => boolean,
  timeoutMs = DEFAULT_POLL_TIMEOUT_MS,
): Promise<LifecycleActiveSession | null> {
  const deadline = Date.now() + timeoutMs
  let session = await readLifecycleActiveSession()
  while (!predicate(session) && Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    session = await readLifecycleActiveSession()
  }
  if (!predicate(session)) {
    throw new Error(`Timed out waiting for the Phase 1 active session after ${timeoutMs} ms.`)
  }
  return session
}

export async function waitForSettledLifecycleActiveSession(
  predicate: (session: LifecycleActiveSession | null) => boolean,
  timeoutMs = DEFAULT_POLL_TIMEOUT_MS,
): Promise<LifecycleActiveSession | null> {
  const deadline = Date.now() + timeoutMs
  let matchingSince: number | null = null
  let session = await readLifecycleActiveSession()
  while (Date.now() < deadline) {
    if (predicate(session)) {
      matchingSince ??= Date.now()
      if (Date.now() - matchingSince >= ACTIVE_SESSION_SETTLE_MS) return session
    } else {
      matchingSince = null
    }
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    session = await readLifecycleActiveSession()
  }
  throw new Error(`Timed out waiting for a settled Phase 1 active session after ${timeoutMs} ms.`)
}

async function phase1Documents(
  collectionName: 'workouts' | 'closedSessions' | 'exerciseSessions' | 'records',
  uid: string,
) {
  const snapshot = await database().collection(collectionName)
    .where('userId', '==', uid)
    .orderBy(FieldPath.documentId())
    .get()
  return snapshot.docs.filter((document) => (
    document.id.startsWith(PHASE_1_PREFIX)
    || String(document.get('sessionId') ?? '').startsWith(PHASE_1_PREFIX)
    || String(document.get('workoutId') ?? '').startsWith(PHASE_1_PREFIX)
    || String(document.get('exerciseId') ?? '').startsWith(PHASE_1_PREFIX)
    || String(document.get('label') ?? '').startsWith('Phase 1')
  ))
}

export async function cleanupWorkoutLifecycleState(): Promise<void> {
  const uid = await getLifecycleUid()
  const db = database()
  const collectionResults = await Promise.allSettled([
    phase1Documents('workouts', uid),
    phase1Documents('closedSessions', uid),
    phase1Documents('exerciseSessions', uid),
    phase1Documents('records', uid),
  ])
  const lookupFailures = collectionResults.flatMap((result) => (
    result.status === 'rejected' ? [result.reason] : []
  ))
  const documents = collectionResults.flatMap((result) => (
    result.status === 'fulfilled' ? result.value : []
  ))
  const cleanupResults = await Promise.allSettled([
    db.doc(`activeSessions/${uid}`).delete(),
    ...documents.map((document) => document.ref.delete()),
  ])
  const deleteFailures = cleanupResults.flatMap((result) => (
    result.status === 'rejected' ? [result.reason] : []
  ))
  const verificationResults = await Promise.allSettled([
    db.doc(`activeSessions/${uid}`).get(),
    phase1Documents('workouts', uid),
    phase1Documents('closedSessions', uid),
    phase1Documents('exerciseSessions', uid),
    phase1Documents('records', uid),
  ])
  const verificationFailures = verificationResults.flatMap((result, index) => {
    if (result.status === 'rejected') return [result.reason]
    const remaining = index === 0
      ? (result.value as DocumentSnapshot).exists ? 1 : 0
      : (result.value as QueryDocumentSnapshot[]).length
    return remaining > 0 ? [new Error(`Workout lifecycle cleanup left ${remaining} document(s) in check ${index}.`)] : []
  })
  const failures = [...lookupFailures, ...deleteFailures, ...verificationFailures]
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Workout lifecycle cleanup failed.')
  }
}

export async function closeWorkoutLifecycleEmulator(): Promise<void> {
  assertWorkoutLifecycleEmulator()
  const app = getApps().find((candidate) => candidate.name === APP_NAME)
  if (app) await deleteApp(app)
}
