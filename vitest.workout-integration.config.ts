import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    fileParallelism: false,
    // The emulator holds a contended transaction about 3.5 s, so a race test can need two of those.
    testTimeout: 30_000,
    include: ['tests/integration/**/*.integration.test.ts'],
    env: {
      VITE_FIREBASE_API_KEY: 'phase-r-test-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'demo-ironlog.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'demo-ironlog',
      VITE_FIREBASE_STORAGE_BUCKET: 'demo-ironlog.appspot.com',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789',
      VITE_FIREBASE_APP_ID: '1:123456789:web:phase-r',
    },
  },
})
