import { deleteApp, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const APP_NAME = 'phase-r-workout-review'

export function getReviewAdminDatabase() {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') {
    throw new Error('Admin workout review requires the local Firestore emulator.')
  }
  const app = getApps().find((candidate) => candidate.name === APP_NAME)
    ?? initializeApp({ projectId: 'demo-ironlog' }, APP_NAME)
  return getFirestore(app)
}

export async function clearReviewAdminDatabase(): Promise<void> {
  const response = await fetch(
    'http://127.0.0.1:8080/emulator/v1/projects/demo-ironlog/databases/(default)/documents',
    { method: 'DELETE' },
  )
  if (!response.ok) throw new Error(`Firestore emulator clear failed: ${response.status}`)
}

export async function closeReviewAdminDatabase(): Promise<void> {
  const app = getApps().find((candidate) => candidate.name === APP_NAME)
  if (app) await deleteApp(app)
}
