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
  'auth/network-request-failed': 'Brak połączenia. Sprawdź internet i spróbuj ponownie.',
  'auth/too-many-requests': 'Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.',
}

const LOGIN_AUTH_ERRORS: Record<string, string> = {
  'auth/invalid-credential': 'Nieprawidłowy email lub hasło.',
  'auth/invalid-email': 'Nieprawidłowy email lub hasło.',
  'auth/user-not-found': 'Nieprawidłowy email lub hasło.',
  'auth/wrong-password': 'Nieprawidłowy email lub hasło.',
}

const REGISTER_AUTH_ERRORS: Record<string, string> = {
  'auth/email-already-in-use': 'Konto z tym adresem już istnieje.',
  'auth/invalid-email': 'Wpisz prawidłowy adres email.',
  'auth/weak-password': 'Hasło jest zbyt słabe. Użyj co najmniej 6 znaków.',
}

export function getAuthErrorMessage(error: unknown, action: AuthAction): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : ''

  return SHARED_AUTH_ERRORS[code]
    ?? (action === 'login' ? LOGIN_AUTH_ERRORS[code] : REGISTER_AUTH_ERRORS[code])
    ?? (action === 'login'
      ? 'Nie udało się zalogować. Spróbuj ponownie.'
      : 'Nie udało się utworzyć konta. Spróbuj ponownie.')
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
