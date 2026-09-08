import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { auth } from './firebase'

type AuthAction = 'login' | 'register'

const SHARED_AUTH_ERRORS: Record<string, string> = {
  'auth/network-request-failed': 'No connection. Check your internet and try again.',
  'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
}

const LOGIN_AUTH_ERRORS: Record<string, string> = {
  'auth/invalid-credential': 'Invalid email or password.',
  'auth/invalid-email': 'Invalid email or password.',
  'auth/user-not-found': 'Invalid email or password.',
  'auth/wrong-password': 'Invalid email or password.',
}

const REGISTER_AUTH_ERRORS: Record<string, string> = {
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/weak-password': 'This password is too weak. Use at least 6 characters.',
}

export function getAuthErrorMessage(error: unknown, action: AuthAction): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : ''

  return SHARED_AUTH_ERRORS[code]
    ?? (action === 'login' ? LOGIN_AUTH_ERRORS[code] : REGISTER_AUTH_ERRORS[code])
    ?? (action === 'login'
      ? 'Could not sign in. Try again.'
      : 'Could not create your account. Try again.')
}
import { useAuthStore } from '../store/authStore'
import { useDashboardStore } from '../store/dashboardStore'
import { useProfileStore } from '../store/profileStore'
import { useWorkoutStore } from '../store/workoutStore'

export function registerUser(email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email, password)
}

export function loginUser(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password)
}

export function resetPassword(email: string) {
  return sendPasswordResetEmail(auth, email)
}

export function logoutUser() {
  return signOut(auth)
}

let unsubscribe: (() => void) | null = null

export function initAuthListener() {
  if (unsubscribe) unsubscribe()
  const { setUser, setLoading } = useAuthStore.getState()
  let previousUid: string | null = auth.currentUser?.uid ?? null
  unsubscribe = onAuthStateChanged(auth, (user) => {
    const nextUid = user?.uid ?? null

    if (previousUid !== nextUid) {
      useWorkoutStore.getState().clearWorkout()
      useDashboardStore.getState().clearSnapshot()
      useProfileStore.getState().resetProfile()
    }

    previousUid = nextUid
    setUser(user)
    setLoading(false)
  })
  return unsubscribe
}
