import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { auth } from './firebase'
import { useAuthStore } from '../store/authStore'

export function registerUser(email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email, password)
}

export function loginUser(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password)
}

export function logoutUser() {
  return signOut(auth)
}

let unsubscribe: (() => void) | null = null

export function initAuthListener() {
  if (unsubscribe) unsubscribe()
  const { setUser, setLoading } = useAuthStore.getState()
  unsubscribe = onAuthStateChanged(auth, (user) => {
    setUser(user)
    setLoading(false)
  })
  return unsubscribe
}
