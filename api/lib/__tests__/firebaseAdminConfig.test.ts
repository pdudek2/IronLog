import { describe, expect, it } from 'vitest'

import { resolveFirebaseAdminRuntime } from '../firebaseAdminConfig'

describe('resolveFirebaseAdminRuntime', () => {
  it('prefers the Firebase CLI project and ignores configured credentials in emulator runtime', () => {
    expect(resolveFirebaseAdminRuntime({
      FIREBASE_PROJECT_ID: 'production-project',
      FIREBASE_CLIENT_EMAIL: 'service@example.com',
      FIREBASE_PRIVATE_KEY: 'private-key',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      GCLOUD_PROJECT: 'demo-ironlog',
    })).toEqual({
      projectId: 'demo-ironlog',
      useConfiguredCredential: false,
    })
  })

  it('uses configured production project and credentials outside emulators', () => {
    expect(resolveFirebaseAdminRuntime({
      FIREBASE_PROJECT_ID: 'production-project',
      FIREBASE_CLIENT_EMAIL: 'service@example.com',
      FIREBASE_PRIVATE_KEY: 'private-key',
    })).toEqual({
      projectId: 'production-project',
      useConfiguredCredential: true,
    })
  })
})
