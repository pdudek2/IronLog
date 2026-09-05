import { randomUUID } from 'node:crypto'
import { test, expect, type Page } from './fixtures'
import { expectAppReady } from './support/appReady'
import { installMockAiRuntime } from './support/mockAiStream'
import { assertLocalQaEmulators } from '../../scripts/qaSafety'

const AUTH_EMULATOR = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1'
const KEY_A = 'sk-ant-test-only-isolation-persisted-account-a'

async function openCoach(page: Page, projectName: string) {
  const navigation = page.getByRole('navigation', {
    name: projectName === 'mobile' ? 'Nawigacja dolna' : 'Nawigacja główna',
  })
  await navigation.getByRole('button', {
    name: projectName === 'mobile' ? 'AI' : 'AI Coach', exact: true,
  }).click()
  await expectAppReady(page, '/chat')
}

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Wyloguj', exact: true }).click()
  await expectAppReady(page, '/login')
}

test('isolates Claude keys through A → logout → B → A without adopting legacy storage', async ({
  page, context, request, cleanup, expectedBrowserDiagnostics,
}, testInfo) => {
  test.setTimeout(60_000)
  assertLocalQaEmulators(process.env)
  const emailA = process.env.TEST_EMAIL
  const passwordA = process.env.TEST_PASSWORD
  if (!emailA || !passwordA) throw new Error('Seeded emulator account credentials are required.')
  const emailB = `ai-key-isolation-${randomUUID()}@ironlog.local`
  const passwordB = 'ironlog-isolation-test-only'
  const escapedAiRequests: string[] = []
  await context.route(/\/api\/|api\.anthropic\.com/, async (route) => {
    escapedAiRequests.push(route.request().url())
    await route.abort('blockedbyclient')
  })

  await expectedBrowserDiagnostics.during('Firestore channel cancellation across explicit auth changes', (entry) => {
    if (entry.kind !== 'requestfailed' || entry.message !== 'net::ERR_ABORTED' || !entry.url) return false
    const url = new URL(entry.url)
    return url.origin === 'http://127.0.0.1:8080'
      && /^\/google\.firestore\.v1\.Firestore\/(Listen|Write)\/channel$/.test(url.pathname)
  }, async () => {
  await page.goto('/chat')
  await expectAppReady(page, '/chat')
  await page.waitForFunction(() => Boolean(window.__ironlogEmulatorTestBridge?.readAuthenticatedUid()))
  const uidA = await page.evaluate(() => window.__ironlogEmulatorTestBridge!.readAuthenticatedUid()!)
  await page.evaluate(() => window.localStorage.setItem('ironlog.claudeApiKey', 'sk-ant-test-only-unowned-legacy'))
  await page.reload()
  await expectAppReady(page, '/chat')
  await expect(page.getByText('Dodaj lokalny klucz Claude', { exact: true })).toBeVisible()
  expect(await page.evaluate((uid) => ({
    legacy: window.localStorage.getItem('ironlog.claudeApiKey'),
    account: window.localStorage.getItem(`ironlog.claudeApiKey:${uid}`),
  }), uidA)).toEqual({ legacy: null, account: null })

  await installMockAiRuntime(page, [])
  await page.goto('/chat')
  await expectAppReady(page, '/chat')
  await page.getByRole('button', { name: 'Ustawienia', exact: true }).click()
  await page.getByLabel('Twój klucz', { exact: true }).fill(KEY_A)
  await page.getByRole('button', { name: 'Zaktualizuj klucz', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Model Claude' })).toBeEnabled()
  expect(await page.evaluate((uid) => window.localStorage.getItem(`ironlog.claudeApiKey:${uid}`), uidA)).toBe(KEY_A)

  // Use real auth and UI navigation; the mock never overwrites an existing account key.
  await logout(page)
  await page.getByRole('link', { name: 'Załóż konto', exact: true }).click()
  await expect(page).toHaveURL('/register')
  await expect(page.getByRole('heading', { name: 'Załóż konto', exact: true })).toBeVisible()
  await page.getByLabel('Email', { exact: true }).fill(emailB)
  await page.getByLabel('Hasło', { exact: true }).fill(passwordB)
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(emailB)
  await expect(page.getByLabel('Hasło', { exact: true })).toHaveValue(passwordB)
  const [registrationResponse] = await Promise.all([
    page.waitForResponse((response) => {
      const url = new URL(response.url())
      return response.request().method() === 'POST'
        && url.origin === 'http://127.0.0.1:9099'
        && url.pathname === '/identitytoolkit.googleapis.com/v1/accounts:signUp'
    }),
    page.getByRole('button', { name: 'Zarejestruj się', exact: true }).click(),
  ])
  expect(registrationResponse.ok()).toBe(true)
  const { idToken, localId: uidB } = await registrationResponse.json() as { idToken: string; localId: string }
  cleanup.add('remove isolated emulator profile and account B', async () => {
    assertLocalQaEmulators(process.env)
    const profile = await request.delete(
      `http://127.0.0.1:8080/v1/projects/demo-ironlog/databases/(default)/documents/users/${encodeURIComponent(uidB)}`,
      { headers: { Authorization: 'Bearer owner' } },
    )
    const account = await request.post(`${AUTH_EMULATOR}/accounts:delete?key=demo-api-key`, { data: { idToken } })
    expect(profile.ok() || profile.status() === 404).toBe(true)
    expect(account.ok()).toBe(true)
  })
  await expect(page.getByRole('heading', { name: 'Ustaw profil' })).toBeVisible()
  await page.getByLabel('Imię', { exact: true }).fill('Izolacja klucza B')
  await page.getByRole('button', { name: 'Zapisz profil', exact: true }).click()
  await expectAppReady(page, '/dashboard')
  await openCoach(page, testInfo.project.name)
  await expect.poll(() => page.evaluate(() => window.__ironlogEmulatorTestBridge?.readAuthenticatedUid())).toBe(uidB)
  await expect(page.getByText('Dodaj lokalny klucz Claude', { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Wiadomość do AI Coacha' })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('account-b-key-gate.png'), fullPage: true })
  await page.getByRole('button', { name: 'Skonfiguruj klucz', exact: true }).click()
  await expect(page.getByLabel('Twój klucz', { exact: true })).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Usuń lokalnie zapisany klucz' })).toBeDisabled()
  expect(await page.evaluate((uid) => window.localStorage.getItem(`ironlog.claudeApiKey:${uid}`), uidB)).toBeNull()

  await logout(page)
  await page.getByLabel('Email', { exact: true }).fill(emailA)
  await page.getByLabel('Hasło', { exact: true }).fill(passwordA)
  await page.getByRole('button', { name: 'Zaloguj się', exact: true }).click()
  await expectAppReady(page, '/dashboard')
  await openCoach(page, testInfo.project.name)
  await expect.poll(() => page.evaluate(() => window.__ironlogEmulatorTestBridge?.readAuthenticatedUid())).toBe(uidA)
  await expect(page.getByRole('textbox', { name: 'Wiadomość do AI Coacha' })).toBeEnabled()
  await page.getByRole('button', { name: 'Ustawienia', exact: true }).click()
  await expect(page.getByLabel('Twój klucz', { exact: true })).toHaveValue(KEY_A)
  await expect(page.getByLabel('Twój klucz', { exact: true })).toHaveAttribute('type', 'password')
  await page.screenshot({ path: testInfo.outputPath('account-a-key-restored.png'), fullPage: true })
  expect(escapedAiRequests).toEqual([])
  })
})
