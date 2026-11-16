import type { Firestore } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from './firebaseAdmin.js'

// Order matters: the active session and the closure fences go first, so a late finalize or materialization
// finds nothing to build on and cannot bring a workout back.
export const DELETED_BY_USER_ID = [
  'activeSessions', 'closedSessions', 'workouts', 'exerciseSessions', 'records', 'templates', 'templateSaveOperations',
  'userExercises', 'userExerciseNames', 'exerciseCreateOperations', 'workoutMutationOperations', 'readiness', 'planSkips',
  'chatMessages',
] as const
export const DELETED_BY_ID = ['users'] as const
export const KEPT_ON_DELETION: Record<string, string> = {
  exercises: 'the global catalogue, not user data',
  dailyAiUsage: 'nothing writes it yet; point 4 (Coach on a shared key) adds it to the deleted list',
  aiRateLimits: 'ids are a hash of uid and IP, short-lived and not findable by uid; disclosed in the privacy policy',
}

const BATCH = 400

async function deleteWhereUserId(db: Firestore, collection: string, uid: string): Promise<void> {
  for (;;) {
    const page = await db.collection(collection).where('userId', '==', uid).limit(BATCH).get()
    if (page.empty) return
    const batch = db.batch()
    for (const doc of page.docs) batch.delete(doc.ref)
    await batch.commit()
  }
}

async function remaining(db: Firestore, uid: string): Promise<string[]> {
  const counts = await Promise.all(DELETED_BY_USER_ID.map(async (name) =>
    (await db.collection(name).where('userId', '==', uid).limit(1).get()).empty ? null : name))
  const own = await Promise.all(DELETED_BY_ID.map(async (name) => ((await db.collection(name).doc(uid).get()).exists ? name : null)))
  return [...counts, ...own].flatMap((name) => (name === null ? [] : [name as string]))
}

// Idempotent: a retry after a partial failure finishes the job; it also cleans up after an Auth user that is already gone.
export async function deleteAccountForUser(uid: string, options: { db?: Firestore; auth?: typeof adminAuth } = {}): Promise<void> {
  if (!uid) throw new Error('Missing user ID.')
  const db = options.db ?? adminDb
  const auth = options.auth ?? adminAuth
  for (const collection of DELETED_BY_USER_ID) await deleteWhereUserId(db, collection, uid)
  for (const collection of DELETED_BY_ID) await db.collection(collection).doc(uid).delete()
  const left = await remaining(db, uid)
  if (left.length) throw new Error(`Account data is still present in: ${left.join(', ')}`)
  try {
    await auth.deleteUser(uid)
  } catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error
  }
}
