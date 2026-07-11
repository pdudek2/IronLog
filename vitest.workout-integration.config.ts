import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    fileParallelism: false,
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
