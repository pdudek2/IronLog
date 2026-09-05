import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import base from '../../../playwright.config'
const root = process.cwd()
export default defineConfig({
  ...base,
  testDir: root,
  testIgnore: [],
  reporter: 'list',
  projects: [
    { name: 'setup', testMatch: /tests\/e2e\/global\.setup\.ts/ },
    { name: 'mobile', testMatch: /nightly-convergence-20260905\/progress-density\.spec\.ts/,
      use: { ...devices['Pixel 5'], storageState: path.join(root, 'tests/e2e/.auth/emulator-user.json') }, dependencies: ['setup'] },
  ],
})
