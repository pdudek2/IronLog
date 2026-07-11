import { defineConfig, devices } from '@playwright/test'
import { config } from 'dotenv'

const emulatorMode = process.env.E2E_BACKEND === 'emulator'
const storageStatePath = emulatorMode
  ? 'tests/e2e/.auth/emulator-user.json'
  : 'tests/e2e/.auth/user.json'
const webServerUrl = emulatorMode
  ? 'http://localhost:5174'
  : 'http://localhost:5173'

if (!emulatorMode) {
  config({ path: '.env.test' })
}

const emulatorWebEnv = {
  E2E_BACKEND: 'emulator',
  VITE_FIREBASE_API_KEY: 'demo-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-ironlog.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-ironlog',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo-ironlog.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789',
  VITE_FIREBASE_APP_ID: '1:123456789:web:demo',
  VITE_FIREBASE_USE_EMULATORS: 'true',
}

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: webServerUrl,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },

  projects: [
    // Auth setup runs first, saves storage state for reuse
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },
    // Desktop tests
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        storageState: storageStatePath,
      },
      dependencies: ['setup'],
    },
    // Mobile tests (Pixel 5 viewport)
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 5'],
        storageState: storageStatePath,
      },
      dependencies: ['setup'],
    },
  ],

  webServer: {
    command: emulatorMode ? 'npm run dev -- --port 5174' : 'npm run dev',
    url: webServerUrl,
    reuseExistingServer: !emulatorMode && !process.env.CI,
    timeout: 30_000,
    env: emulatorMode ? emulatorWebEnv : undefined,
  },
})
