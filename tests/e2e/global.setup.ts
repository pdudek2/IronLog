import { test as setup, expect } from './fixtures'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const authFile = path.join(__dirname, '.auth/user.json')

setup('authenticate', async ({ page }) => {
  const email = process.env.TEST_EMAIL
  const password = process.env.TEST_PASSWORD

  if (!email || !password) {
    throw new Error('TEST_EMAIL and TEST_PASSWORD must be set in .env.test')
  }

  await page.goto('/login')

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Hasło').fill(password)
  await page.getByRole('button', { name: 'Zaloguj się' }).click()

  // Firebase Auth triggers onAuthStateChanged → PublicRoute redirects to /dashboard
  await page.waitForURL('/dashboard', { timeout: 20_000 })
  await expect(page).toHaveURL('/dashboard')

  // Wait for Firebase to flush auth tokens to localStorage (setPersistence is async)
  await page.waitForTimeout(1_000)

  // Save storage state — localStorage now contains Firebase Auth tokens
  await page.context().storageState({ path: authFile })
})
