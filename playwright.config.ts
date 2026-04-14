import { defineConfig, devices } from '@playwright/test'
import { config } from 'dotenv'

// Load test credentials from .env.test (gitignored — copy from .env.test.example)
config({ path: '.env.test' })

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: 'http://localhost:5173',
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
        storageState: 'tests/e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    // Mobile tests (Pixel 5 viewport)
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 5'],
        storageState: 'tests/e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
