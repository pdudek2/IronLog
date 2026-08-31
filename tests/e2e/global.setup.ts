import { test as setup, expect, type APIRequestContext } from './fixtures'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const emulatorMode = process.env.E2E_BACKEND === 'emulator'
const authFile = path.join(
  __dirname,
  emulatorMode ? '.auth/emulator-user.json' : '.auth/user.json',
)

async function ensureEmulatorUser(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<void> {
  const response = await request.post(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key',
    { data: { email, password, returnSecureToken: true } },
  )

  if (response.ok()) return
  const body = await response.json() as { error?: { message?: string } }
  if (body.error?.message !== 'EMAIL_EXISTS') {
    throw new Error(`Auth emulator user bootstrap failed: ${JSON.stringify(body)}`)
  }
}

setup('authenticate', async ({ page, request }) => {
  const email = process.env.TEST_EMAIL
  const password = process.env.TEST_PASSWORD
  if (!email || !password) {
    throw new Error('TEST_EMAIL and TEST_PASSWORD must be provided by the selected E2E backend')
  }

  if (emulatorMode) await ensureEmulatorUser(request, email, password)

  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Hasło').fill(password)
  await page.getByRole('button', { name: 'Zaloguj się' }).click()
  await page.waitForURL('/dashboard', { timeout: 20_000 })

  if (emulatorMode) {
    const onboardingHeading = page.getByRole('heading', { name: 'Ustaw profil' })
    await expect(page).toHaveURL('/onboarding', { timeout: 20_000 })
    await expect(onboardingHeading).toBeVisible({ timeout: 20_000 })
    await page.getByLabel('Imię').fill('IronLog E2E')
    await page.getByRole('button', { name: 'Zapisz profil' }).click()
    await page.waitForURL('/dashboard', { timeout: 20_000 })
  }

  await page.waitForTimeout(1_000)
  await page.context().storageState({ path: authFile })
})
