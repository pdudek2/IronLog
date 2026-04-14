import { initializeApp, getApps } from 'firebase/app'
import { getAuth, initializeAuth, browserLocalPersistence } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)

// Use localStorage persistence so Playwright storageState captures auth tokens.
// initializeAuth sets persistence BEFORE the first auth-state check (unlike setPersistence).
// The try/catch handles HMR: auth is already initialized on hot-reload.
export const auth = (() => {
  try {
    return initializeAuth(app, { persistence: [browserLocalPersistence] })
  } catch {
    return getAuth(app)
  }
})()
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})
