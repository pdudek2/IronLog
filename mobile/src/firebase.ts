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
  collection, getDocs, query, where, orderBy, limit,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  runTransaction,
} from '@react-native-firebase/firestore'
import Constants from 'expo-constants'

import type { SubscribeToSession } from './activeSessionController'
import type { ActiveWorkout, Units, ExerciseSource } from './session'
import { parsePreviousSets, type ExerciseMetadata, type ReadResult } from './scopedRead'
import { EXERCISE_CATEGORY_LABELS } from '../../src/lib/exerciseLabels'
import { EQUIPMENT_LABELS } from '../../src/shared/workoutDisplay'
import { NativeActiveSessionConflictError, updateExistingActiveSession } from './activeSessionTransaction'

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
function getServices() {
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
    data: snapshot.docs.map((document) => {
      const data = document.data()
      if (data.userId !== uid || typeof data.category !== 'string' || !(data.category in EXERCISE_CATEGORY_LABELS)
        || typeof data.equipment !== 'string' || !(data.equipment in EQUIPMENT_LABELS)
        || typeof data.name !== 'string' || !data.name.trim()) throw new Error('Invalid exercise metadata')
      const muscles: unknown[] = Array.isArray(data.muscles) ? data.muscles : []
      return {
        id: document.id, name: data.name, category: data.category, equipment: data.equipment,
        muscles: muscles.filter((muscle): muscle is string => typeof muscle === 'string'),
      }
    }),
    fromCache: snapshot.metadata.fromCache,
  }
}
