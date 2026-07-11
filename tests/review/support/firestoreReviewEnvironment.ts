import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'

export async function createFirestoreReviewEnvironment(): Promise<RulesTestEnvironment> {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') {
    throw new Error('Workout review requires the local Firestore emulator.')
  }
  return initializeTestEnvironment({
    projectId: 'demo-ironlog',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  })
}
