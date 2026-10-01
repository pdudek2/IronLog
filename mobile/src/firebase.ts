import { getApp, getApps, initializeApp, type FirebaseApp } from '@react-native-firebase/app'
import {
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from '@react-native-firebase/auth'
import {
  connectFirestoreEmulator,
  collection, getDocs, query, where, orderBy, limit, startAfter,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  runTransaction,
  type QuerySnapshot,
} from '@react-native-firebase/firestore'
import Constants from 'expo-constants'
import { parseProfile, updateExistingProfile, ProfileNotSubmittedError, type ProfileFields } from './profile'

import type { SubscribeToSession } from './activeSessionController'
import { parseSessionDocument, type ActiveWorkout, type Units, type ExerciseSource } from './session'
import { parsePreviousSets, type ExerciseMetadata, type ReadResult } from './scopedRead'
import { parseSavedWorkout, type SavedWorkout } from './history'
import { parseHomeProfile, type HomeProfile } from './home'
import { parseCatalogueExercise } from './exerciseCatalogue'
import { NativeActiveSessionConflictError, updateExistingActiveSession } from './activeSessionTransaction'
import { claimAbsentSession, parseTemplate, type BestSet, type LaunchResult, type WorkoutTemplate } from './workoutLaunch'
import { templateFingerprint } from '../../src/shared/templateFingerprint'
import type { PlanSaveRequest } from './planEditor'
import { compareProgressRecords, parseProgressRecord, parseProgressSession } from './progressData'
import type { ProgressRecordsResult, ProgressSessionsResult } from '../../src/shared/progress'

const backend = Constants.expoConfig?.extra?.firebaseBackend
const emulatorHost = Constants.expoConfig?.extra?.firebaseEmulatorHost
export const apiBaseUrl: string = Constants.expoConfig?.extra?.apiBaseUrl ?? ''

async function initializeServices() {
  if (backend !== 'emulator' && backend !== 'production') {
    throw new Error('The Firebase backend was not configured at build time.')
  }
  if (backend === 'emulator' && typeof emulatorHost !== 'string') {
    throw new Error('The Firebase emulator host was not configured at build time.')
  }

  let firebaseApp: FirebaseApp
  if (backend === 'emulator') {
    firebaseApp = getApps().find((app) => app.name === 'ironlog-emulator') ?? await initializeApp({
      apiKey: 'demo-ironlog',
      appId: 'demo-ironlog-android',
      databaseURL: 'http://127.0.0.1',
      messagingSenderId: 'demo-ironlog',
      projectId: 'demo-ironlog',
      storageBucket: 'demo-ironlog.appspot.com',
    }, 'ironlog-emulator')
  } else {
    firebaseApp = getApp()
  }
  const auth = getAuth(firebaseApp)
  const firestore = getFirestore(firebaseApp)
  if (backend === 'emulator') {
    connectAuthEmulator(auth, `http://${emulatorHost}:9099`)
    connectFirestoreEmulator(firestore, emulatorHost, 8080)
  }
  return { auth, firestore }
}

let services: ReturnType<typeof initializeServices> | undefined
export function getServices() {
  return services ??= initializeServices()
}

export type AuthUser = User

export function isNativeActiveSessionConflict(error: unknown): boolean {
  return error instanceof NativeActiveSessionConflictError
}

export function isTransientFirestoreError(error: unknown): boolean {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
  return ['unavailable', 'deadline-exceeded', 'aborted', 'internal', 'resource-exhausted']
    .some((value) => code.endsWith(value))
}

let revisionCounter = 0

export function createSessionRevision(): string {
  revisionCounter += 1
  return `native-${Date.now().toString(36)}-${revisionCounter.toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function observeAuth(
  onChange: (user: AuthUser | null) => void,
  onError: (error: unknown) => void,
): () => void {
  let active = true
  let unsubscribe: (() => void) | undefined
  void getServices().then(
    ({ auth }) => {
      if (active) unsubscribe = onAuthStateChanged(auth, onChange)
    },
    (error) => {
      if (active) onError(error)
    },
  )
  return () => {
    active = false
    unsubscribe?.()
  }
}

export async function login(email: string, password: string): Promise<void> {
  const { auth } = await getServices()
  await signInWithEmailAndPassword(auth, email.trim(), password)
}

export async function currentIdToken(uid: string): Promise<string> {
  const { auth } = await getServices()
  const user = auth.currentUser
  if (!user || user.uid !== uid) throw new Error('The signed-in account changed.')
  return user.getIdToken()
}

export async function logout(): Promise<void> {
  const { auth } = await getServices()
  await signOut(auth)
}

export const subscribeToActiveSession: SubscribeToSession = (uid, onChange, onError) => {
  let active = true
  let unsubscribe: (() => void) | undefined
  void getServices().then(
    ({ firestore }) => {
      if (!active) return
      unsubscribe = onSnapshot(
        doc(firestore, 'activeSessions', uid),
        { includeMetadataChanges: true },
        (snapshot) => onChange({
          exists: snapshot.exists(),
          data: snapshot.exists() ? snapshot.data() : null,
          fromCache: snapshot.metadata.fromCache,
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
        }),
        onError,
      )
    },
    (error) => {
      if (active) onError(error)
    },
  )
  return () => {
    active = false
    unsubscribe?.()
  }
}

export async function saveExistingActiveSession(
  uid: string,
  session: ActiveWorkout,
  expectedRevision: string | null,
  requestRevision: string,
): Promise<void> {
  const { firestore } = await getServices()
  const reference = doc(firestore, 'activeSessions', uid)
  const updatedAt = Date.now()
  await runTransaction(firestore, async (transaction) => {
    await updateExistingActiveSession({
      read: async () => {
        const snapshot = await transaction.get(reference)
        return { exists: snapshot.exists(), data: snapshot.exists() ? snapshot.data() : null }
      },
      update: (fields) => { transaction.update(reference, fields) },
    }, uid, session, expectedRevision, requestRevision, updatedAt)
  })
}

export async function readUnits(uid: string): Promise<Units> {
  const { firestore } = await getServices()
  const snapshot = await getDoc(doc(firestore, 'users', uid))
  if (!snapshot.exists()) return 'kg'
  const units = snapshot.data()?.units
  if (units !== 'kg' && units !== 'lbs') throw new Error('The profile has invalid units.')
  return units
}

export async function readProfile(uid: string, server = false) {
  const { auth, firestore } = await getServices()
  if (auth.currentUser?.uid !== uid) throw new ProfileNotSubmittedError('The signed-in account changed.')
  const reference = doc(firestore, 'users', uid)
  const snapshot = await (server ? getDocFromServer(reference) : getDoc(reference))
  if (auth.currentUser?.uid !== uid) throw new ProfileNotSubmittedError('The signed-in account changed.')
  return { data: snapshot.exists() ? parseProfile(uid, snapshot.data()) : null,
    fromCache: snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites }
}

export async function saveProfile(uid: string, input: ProfileFields): Promise<void> {
  const { auth, firestore } = await getServices()
  const reference = doc(firestore, 'users', uid)
  await runTransaction(firestore, async transaction => {
    if (auth.currentUser?.uid !== uid) throw new ProfileNotSubmittedError('The signed-in account changed.')
    await updateExistingProfile({
      read: async () => {
        const snapshot = await transaction.get(reference)
        if (auth.currentUser?.uid !== uid) throw new ProfileNotSubmittedError('The signed-in account changed.')
        return { exists: snapshot.exists(), data: snapshot.data() }
      },
      update: fields => { transaction.update(reference, fields) },
    }, uid, input)
  }, { maxAttempts: 1 })
}

export async function readHome(uid: string): Promise<ReadResult<{ profile: HomeProfile; workouts: SavedWorkout[] }>> {
  const { firestore } = await getServices()
  const [profileSnapshot, workoutsSnapshot] = await Promise.all([
    getDoc(doc(firestore, 'users', uid)),
    getDocs(query(collection(firestore, 'workouts'), where('userId', '==', uid), orderBy('startedAt', 'desc'), limit(50))),
  ])
  if (!profileSnapshot.exists()) throw new Error('Could not confirm profile')
  return {
    data: {
      profile: parseHomeProfile(uid, profileSnapshot.data()),
      workouts: workoutsSnapshot.docs.map((document) => parseSavedWorkout(document.id, uid, document.data())),
    },
    fromCache: profileSnapshot.metadata.fromCache || workoutsSnapshot.metadata.fromCache,
  }
}

export async function readTemplates(uid: string): Promise<ReadResult<WorkoutTemplate[]>> {
  const { firestore } = await getServices()
  const snapshot = await getDocs(query(collection(firestore, 'templates'), where('userId', '==', uid)))
  return {
    data: snapshot.docs.map((item) => parseTemplate(item.id, uid, item.data())).sort((a, b) => b.updatedAt - a.updatedAt),
    fromCache: snapshot.metadata.fromCache,
  }
}

export async function readTemplateFromServer(uid: string, id: string): Promise<WorkoutTemplate | null> {
  await currentIdToken(uid)
  const { firestore } = await getServices()
  const snapshot = await getDocFromServer(doc(firestore, 'templates', id))
  return snapshot.exists() ? parseTemplate(snapshot.id, uid, snapshot.data()) : null
}

export class PlanRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

export async function savePlan(uid: string, request: PlanSaveRequest): Promise<WorkoutTemplate> {
  const token = await currentIdToken(uid)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(`${apiBaseUrl}/api/save-template`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(request), signal: controller.signal,
    })
    const raw = await response.text()
    let result: unknown
    try { result = JSON.parse(raw) } catch { result = null }
    if (!response.ok) {
      const message = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string' ? result.error : 'Could not save plan.'
      throw new PlanRequestError(response.status, message)
    }
    if (!result || typeof result !== 'object') throw new Error('Invalid save response.')
    if (!('template' in result) || !result.template || typeof result.template !== 'object'
      || !('id' in result.template) || typeof result.template.id !== 'string') throw new Error('Invalid save response.')
    return parseTemplate(result.template.id, uid, result.template)
  } finally { clearTimeout(timeout) }
}

export async function deletePlanIfUnchanged(uid: string, id: string, baseline: string): Promise<'deleted' | 'absent'> {
  await currentIdToken(uid)
  const { firestore } = await getServices()
  const reference = doc(firestore, 'templates', id)
  return runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(reference)
    if (!snapshot.exists()) return 'absent'
    const template = parseTemplate(id, uid, snapshot.data())
    if (templateFingerprint(template) !== baseline) throw new PlanRequestError(409, 'Plan changed. Review it before deleting.')
    transaction.delete(reference)
    return 'deleted'
  })
}

export async function readTemplateBestSet(uid: string, exerciseId: string, source: ExerciseSource): Promise<BestSet | null> {
  const { firestore } = await getServices()
  const snapshot = await getDocs(query(collection(firestore, 'exerciseSessions'),
    where('userId', '==', uid), where('exerciseId', '==', exerciseId),
    where('exerciseSource', '==', source), orderBy('startedAt', 'desc'), limit(1)))
  if (snapshot.empty) return null
  const data = snapshot.docs[0]!.data()
  if (data.userId !== uid || data.exerciseId !== exerciseId || data.exerciseSource !== source) throw new Error('Invalid exercise history.')
  const bestSetWeight = typeof data.bestSetWeight === 'number' && Number.isFinite(data.bestSetWeight) ? data.bestSetWeight : 0
  const bestSetReps = typeof data.bestSetReps === 'number' && Number.isFinite(data.bestSetReps) ? data.bestSetReps : 0
  return { bestSetWeight, bestSetReps }
}

export async function readActiveFromServer(uid: string): Promise<ActiveWorkout | null> {
  await currentIdToken(uid)
  const { firestore } = await getServices()
  const snapshot = await getDocFromServer(doc(firestore, 'activeSessions', uid))
  return snapshot.exists() ? parseSessionDocument(uid, snapshot.data()) : null
}

export async function isLaunchSessionClosed(uid: string, sessionId: string): Promise<boolean> {
  const token = await currentIdToken(uid)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(`${apiBaseUrl}/api/session-launch-outcome`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }), signal: controller.signal,
    })
    if (!response.ok) throw new Error('Could not confirm the session outcome.')
    const payload: unknown = await response.json()
    if (!payload || typeof payload !== 'object' || !('status' in payload)
      || (payload.status !== 'closed' && payload.status !== 'open')) throw new Error('Invalid session outcome.')
    return payload.status === 'closed'
  } finally { clearTimeout(timeout) }
}

export async function claimNewActiveSession(uid: string, candidate: ActiveWorkout): Promise<LaunchResult> {
  await currentIdToken(uid)
  const { firestore } = await getServices()
  const reference = doc(firestore, 'activeSessions', uid)
  return runTransaction(firestore, async (transaction) => claimAbsentSession({
    read: async () => {
      const snapshot = await transaction.get(reference)
      return { exists: snapshot.exists(), data: snapshot.exists() ? snapshot.data() : null }
    },
    create: (data) => { transaction.set(reference, data) },
  }, uid, candidate, Math.max(Date.now(), candidate.startedAt)))
}

export async function readPreviousSets(uid: string, exerciseId: string, source: ExerciseSource) {
  const { firestore } = await getServices()
  const snapshot = await getDocs(query(collection(firestore, 'exerciseSessions'),
    where('userId', '==', uid), where('exerciseId', '==', exerciseId),
    where('exerciseSource', '==', source), orderBy('startedAt', 'desc'), limit(1)))
  return {
    data: snapshot.empty ? [] : parsePreviousSets(snapshot.docs[0]!.data(), uid, exerciseId, source),
    fromCache: snapshot.metadata.fromCache,
  }
}

export async function readExerciseMetadata(uid: string): Promise<ReadResult<ExerciseMetadata[]>> {
  const { firestore } = await getServices()
  const snapshot = await getDocs(query(collection(firestore, 'userExercises'), where('userId', '==', uid)))
  return {
    data: snapshot.docs.map((document) => parseCatalogueExercise(document.id, uid, document.data())),
    fromCache: snapshot.metadata.fromCache,
  }
}

const HISTORY_LIMIT = 2_000

export interface WorkoutHistoryData {
  workouts: SavedWorkout[]
  truncated: boolean
}

export async function readWorkoutHistory(uid: string): Promise<ReadResult<WorkoutHistoryData>> {
  const { firestore } = await getServices()
  const snapshot = await getDocs(query(
    collection(firestore, 'workouts'),
    where('userId', '==', uid),
    orderBy('startedAt', 'desc'),
    limit(HISTORY_LIMIT + 1),
  ))
  return {
    data: {
      workouts: snapshot.docs.slice(0, HISTORY_LIMIT).map((document) => parseSavedWorkout(document.id, uid, document.data())),
      truncated: snapshot.docs.length > HISTORY_LIMIT,
    },
    fromCache: snapshot.metadata.fromCache,
  }
}

export async function readRecentProgressWorkouts(uid: string): Promise<ReadResult<Array<{ id: string; materialized: boolean }>>> {
  await currentIdToken(uid)
  const { firestore } = await getServices()
  const snapshot = await getDocs(query(collection(firestore, 'workouts'), where('userId', '==', uid), orderBy('startedAt', 'desc'), limit(50)))
  return {
    data: snapshot.docs.map((document) => {
      const workout = parseSavedWorkout(document.id, uid, document.data())
      return { id: workout.id, materialized: workout.materialized }
    }),
    fromCache: snapshot.metadata.fromCache,
  }
}

export async function retryProgressMaterialization(uid: string, workoutId: string): Promise<void> {
  const token = await currentIdToken(uid)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(`${apiBaseUrl}/api/materialize-workout`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ workoutId }), signal: controller.signal,
    })
    if (!response.ok) throw new Error('Could not confirm recent workout data.')
    const result: unknown = await response.json()
    if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== true) throw new Error('Invalid workout sync response.')
  } finally { clearTimeout(timeout) }
}

export async function readProgressSessions(uid: string, fromMs: number): Promise<ReadResult<ProgressSessionsResult>> {
  await currentIdToken(uid)
  const { firestore } = await getServices()
  const sessions: ProgressSessionsResult['sessions'] = []
  let cursor: QuerySnapshot['docs'][number] | null = null
  let fromCache = false
  while (sessions.length < 5_001) {
    const currentLimit = Math.min(1_000, 5_001 - sessions.length)
    const base = [where('userId', '==', uid), where('finishedAt', '>=', fromMs), orderBy('finishedAt', 'desc')]
    const snapshot: QuerySnapshot = await getDocs(query(collection(firestore, 'exerciseSessions'), ...base,
      ...(cursor ? [startAfter(cursor)] : []), limit(currentLimit)))
    fromCache ||= snapshot.metadata.fromCache
    sessions.push(...snapshot.docs.map((document) => parseProgressSession(document.id, uid, document.data())))
    if (snapshot.docs.length < currentLimit) break
    cursor = snapshot.docs.at(-1) ?? null
    if (!cursor) break
  }
  return { data: { sessions: sessions.slice(0, 5_000), truncated: sessions.length > 5_000 }, fromCache }
}

export async function readProgressRecords(uid: string): Promise<ReadResult<ProgressRecordsResult>> {
  await currentIdToken(uid)
  const { firestore } = await getServices()
  const records: ProgressRecordsResult['records'] = []
  let cursor: QuerySnapshot['docs'][number] | null = null
  let fromCache = false
  while (records.length < 1_001) {
    const currentLimit = Math.min(1_000, 1_001 - records.length)
    const snapshot: QuerySnapshot = await getDocs(query(collection(firestore, 'records'), where('userId', '==', uid),
      ...(cursor ? [startAfter(cursor)] : []), limit(currentLimit)))
    fromCache ||= snapshot.metadata.fromCache
    records.push(...snapshot.docs.map((document) => parseProgressRecord(document.id, uid, document.data())))
    if (snapshot.docs.length < currentLimit) break
    cursor = snapshot.docs.at(-1) ?? null
    if (!cursor) break
  }
  return { data: { records: records.slice(0, 1_000).sort(compareProgressRecords), truncated: records.length > 1_000 }, fromCache }
}

export async function readSavedWorkout(uid: string, workoutId: string): Promise<ReadResult<SavedWorkout | null>> {
  const { firestore } = await getServices()
  const snapshot = await getDoc(doc(firestore, 'workouts', workoutId))
  return {
    data: snapshot.exists() ? parseSavedWorkout(snapshot.id, uid, snapshot.data()) : null,
    fromCache: snapshot.metadata.fromCache,
  }
}
