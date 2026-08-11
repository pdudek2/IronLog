import { describe, expect, it } from 'vitest'

import { resolveFirebaseAdminRuntime } from '../firebaseAdminConfig'

describe('resolveFirebaseAdminRuntime', () => {
  it('uses REST transport outside the local emulators', () => {
    expect(resolveFirebaseAdminRuntime({
      FIREBASE_PROJECT_ID: 'production-project',
    })).toMatchObject({ preferRest: true })
  })

  it('prefers the Firebase CLI project and ignores configured credentials in emulator runtime', () => {
    expect(resolveFirebaseAdminRuntime({
      FIREBASE_PROJECT_ID: 'production-project',
      FIREBASE_CLIENT_EMAIL: 'service@example.com',
      FIREBASE_PRIVATE_KEY: 'private-key',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      GCLOUD_PROJECT: 'demo-ironlog',
    })).toEqual({
      projectId: 'demo-ironlog',
      preferRest: false,
      useConfiguredCredential: false,
    })
  })

  it('uses emulator mode when only the Firestore emulator is enabled', () => {
    expect(resolveFirebaseAdminRuntime({
      FIREBASE_PROJECT_ID: 'production-project',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      GCLOUD_PROJECT: 'demo-ironlog',
    })).toEqual({
      projectId: 'demo-ironlog',
      preferRest: false,
      useConfiguredCredential: false,
    })
  })

  it('falls back to the configured project when emulator project is missing or empty', () => {
    expect(resolveFirebaseAdminRuntime({
      FIREBASE_PROJECT_ID: 'production-project',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      GCLOUD_PROJECT: '',
    })).toEqual({
      projectId: 'production-project',
      preferRest: false,
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
      preferRest: true,
      useConfiguredCredential: true,
    })
  })
})
