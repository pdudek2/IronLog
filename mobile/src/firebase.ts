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
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
} from '@react-native-firebase/firestore'
import Constants from 'expo-constants'

import type { SubscribeToSession } from './activeSessionController'
import type { Units } from './session'

const backend = Constants.expoConfig?.extra?.firebaseBackend
const emulatorHost = Constants.expoConfig?.extra?.firebaseEmulatorHost

if (backend !== 'emulator' && backend !== 'production') {
  throw new Error('The Firebase backend was not configured at build time.')
}
if (backend === 'emulator' && typeof emulatorHost !== 'string') {
  throw new Error('The Firebase emulator host was not configured at build time.')
}

async function initializeServices() {
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

const services = initializeServices()

export type AuthUser = User

export function observeAuth(
  onChange: (user: AuthUser | null) => void,
  onError: (error: unknown) => void,
): () => void {
  let active = true
  let unsubscribe: (() => void) | undefined
  void services.then(
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
  const { auth } = await services
  await signInWithEmailAndPassword(auth, email.trim(), password)
}

export async function logout(): Promise<void> {
  const { auth } = await services
  await signOut(auth)
}

export const subscribeToActiveSession: SubscribeToSession = (uid, onChange, onError) => {
  let active = true
  let unsubscribe: (() => void) | undefined
  void services.then(
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

export async function readUnits(uid: string): Promise<Units> {
  const { firestore } = await services
  const snapshot = await getDoc(doc(firestore, 'users', uid))
  if (!snapshot.exists()) return 'kg'
  const units = snapshot.data()?.units
  if (units !== 'kg' && units !== 'lbs') throw new Error('The profile has invalid units.')
  return units
}
