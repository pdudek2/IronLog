import { EmailAuthProvider, reauthenticateWithCredential, signOut } from 'firebase/auth'
import { clearIndexedDbPersistence, terminate } from 'firebase/firestore'
import { auth, db } from './firebase'
import { callAuthedApi } from './authedApi'

// Everything this account left in the browser; other accounts' recovery keys on a shared browser stay.
export function clearLocalAccountData(uid: string, local: Storage = window.localStorage, session: Storage = window.sessionStorage): void {
  for (const key of [
    `ironlog-active-session-backup:${uid}`,
    `ironlog:workout-closure:${uid}`,
    `ironlog:workout-delete-recovery:${uid}`,
    `ironlog.openrouterApiKey:${uid}`,
    'ironlog.openrouterModel',
    'ironlog:landing-plan',
    'ironlog:train-cover-played',
  ]) local.removeItem(key)
  session.removeItem('ironlog:template-draft')
}

const code = (error: unknown) => (typeof error === 'object' && error && 'code' in error ? String(error.code) : '')

export async function deleteAccount(password: string): Promise<void> {
  const user = auth.currentUser
  if (!user?.email) throw new Error('Sign in again to delete your account.')
  const uid = user.uid
  let alreadyDeleted = false
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password))
  } catch (error) {
    // A retry after a lost response finds the account already gone.
    if (code(error) !== 'auth/user-not-found' && code(error) !== 'auth/user-token-expired') throw error
    alreadyDeleted = true
  }
  if (!alreadyDeleted) {
    await user.getIdToken(true)
    await callAuthedApi<{ ok: true }>('/api/delete-account', { deleteAccount: true }, uid)
  }
  clearLocalAccountData(uid)
  await signOut(auth).catch(() => undefined)
  // The Firestore cache holds the whole history; it can only be cleared once the instance is stopped.
  await terminate(db)
  await clearIndexedDbPersistence(db).catch(() => undefined)
  window.location.replace('/login?deleted=1')
}
