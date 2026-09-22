import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { auth } from './firebase'

export { getAuthErrorMessage } from '../shared/authErrors'
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
