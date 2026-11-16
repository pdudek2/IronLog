import { EmailAuthProvider, reauthenticateWithCredential, reload, signOut, type User } from 'firebase/auth'
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

// The server function may run up to 60 s; a shorter client timeout would report a deletion that went through as failed.
const DELETE_TIMEOUT_MS = 65_000
const GONE = new Set(['auth/user-not-found', 'auth/user-token-expired', 'auth/user-disabled'])

async function accountIsGone(user: User): Promise<boolean> {
  try {
    await reload(user)
    return false
  } catch (error) {
    return GONE.has(code(error))
  }
}

export async function deleteAccount(password: string): Promise<void> {
  const user = auth.currentUser
  if (!user?.email) throw new Error('Sign in again to delete your account.')
  const uid = user.uid
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password))
    await user.getIdToken(true)
    await callAuthedApi<{ ok: true }>('/api/delete-account', { deleteAccount: true }, uid, DELETE_TIMEOUT_MS)
  } catch (error) {
    // A lost response, or a retry after one, finds the account already gone; the SDK reports that only on reload.
    if (!await accountIsGone(user)) throw error
  }
  clearLocalAccountData(uid)
  await signOut(auth).catch(() => undefined)
  // The Firestore cache holds the whole history; it can only be cleared once the instance is stopped.
  await terminate(db)
  await clearIndexedDbPersistence(db).catch(() => undefined)
  window.location.replace('/login?deleted=1')
}
