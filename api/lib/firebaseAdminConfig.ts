type FirebaseAdminEnvironment = Partial<Record<
  | 'FIREBASE_PROJECT_ID'
  | 'FIREBASE_CLIENT_EMAIL'
  | 'FIREBASE_PRIVATE_KEY'
  | 'FIREBASE_AUTH_EMULATOR_HOST'
  | 'FIRESTORE_EMULATOR_HOST'
  | 'GCLOUD_PROJECT',
  string
>>

export interface FirebaseAdminRuntime {
  projectId: string | undefined
  useConfiguredCredential: boolean
}

export function resolveFirebaseAdminRuntime(
  env: FirebaseAdminEnvironment,
): FirebaseAdminRuntime {
  const usesEmulator = Boolean(
    env.FIREBASE_AUTH_EMULATOR_HOST || env.FIRESTORE_EMULATOR_HOST,
  )

  return {
    projectId: usesEmulator
      ? env.GCLOUD_PROJECT ?? env.FIREBASE_PROJECT_ID
      : env.FIREBASE_PROJECT_ID,
    useConfiguredCredential: !usesEmulator,
  }
}
