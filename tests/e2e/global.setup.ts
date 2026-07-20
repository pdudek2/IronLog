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
    const onboardingHeading = page.getByRole('heading', { name: 'Skonfiguruj profil' })
    const dashboardAction = page.getByRole('button', {
      name: /^(?:Rozpocznij nowy trening|Wznów trening)$/,
    }).first()
    await expect(onboardingHeading.or(dashboardAction).first()).toBeVisible({ timeout: 20_000 })
    if (await dashboardAction.isVisible()) {
      await page.evaluate(() => {
        const currentState = history.state as { idx?: number } | null
        history.pushState({
          ...currentState,
          key: 'e2e-onboarding',
          idx: (currentState?.idx ?? 0) + 1,
        }, '', '/onboarding')
        window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }))
      })
    }
    await expect(onboardingHeading).toBeVisible()
    await page.getByLabel('Jak mamy się do Ciebie zwracać?').fill('IronLog E2E')
    await page.getByRole('button', { name: 'Zaczynajmy' }).click()
    await page.waitForURL('/dashboard', { timeout: 20_000 })
  }

  await page.waitForTimeout(1_000)
  await page.context().storageState({ path: authFile })
})
