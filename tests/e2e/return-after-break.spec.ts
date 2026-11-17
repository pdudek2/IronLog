import type { APIRequestContext, Page } from '@playwright/test'
import { test, expect } from './fixtures'

const DAY_MS = 86_400_000

test.describe('Return after a break', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  async function freshAccount(page: Page, request: APIRequestContext): Promise<string> {
    const email = `return-${Date.now()}-${Math.round(Math.random() * 1e6)}@ironlog.local`
    const signUp = await request.post('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key', { data: { email, password: process.env.TEST_PASSWORD!, returnSecureToken: true } })
    expect(signUp.ok()).toBe(true)
    await page.goto('/login')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(process.env.TEST_PASSWORD!)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL('/onboarding', { timeout: 20_000 })
    await page.getByLabel('Name').fill('Return E2E')
    await page.getByRole('button', { name: 'Save profile' }).click()
    await page.waitForURL('/dashboard', { timeout: 20_000 })
    return (await signUp.json()).localId as string
  }

  async function launchedCompression(request: APIRequestContext, uid: string) {
    // The launch writes the active session before it navigates.
    const session = await request.get(`http://127.0.0.1:8080/v1/projects/demo-ironlog/databases/(default)/documents/activeSessions/${uid}`, { headers: { Authorization: 'Bearer owner' } })
    expect(session.ok()).toBe(true)
    return (await session.json()).fields.compression.mapValue.fields
  }

  test('the first workout after 40 days off starts with fewer sets, and Full sets keeps the plan', async ({ page, request }) => {
    test.skip(process.env.E2E_BACKEND !== 'emulator', 'Needs a fresh emulator account')
    const uid = await freshAccount(page, request)

    await page.goto('/history/import')
    await expect(page.getByText('Choose a CSV file')).toBeVisible({ timeout: 15_000 })
    const date = new Date(Date.now() - 41 * DAY_MS).toISOString().slice(0, 10)
    await page.locator('input[type=file]').setInputFiles({ name: 'old.csv', mimeType: 'text/csv', buffer: Buffer.from(`Date,Exercise,Reps,Weight (kg)\n${date},Squat,5,100\n`, 'utf8') })
    await page.getByRole('button', { name: 'Import 1 workout' }).click()
    await expect(page.getByRole('heading', { name: '1 workout imported' })).toBeVisible({ timeout: 30_000 })

    await page.goto('/dashboard')
    await page.getByRole('button', { name: 'Use the starter plan' }).click()
    const dock = page.getByRole('region', { name: 'Today' })
    await expect(dock.getByText(/^\d+ days since your last workout · fewer sets today$/)).toBeVisible({ timeout: 15_000 })
    await expect(dock.getByText(/First set is a test/)).toBeVisible()
    const line = dock.getByText(/ of \d+ sets/)
    const [kept, planned] = (await line.textContent())!.match(/(\d+) of (\d+) sets/)!.slice(1).map(Number)
    expect(kept).toBeLessThan(planned!)

    const fullSets = dock.getByRole('switch', { name: 'Full sets' })
    await fullSets.check()
    await expect(dock.getByText(/^\d+ days since your last workout$/)).toBeVisible()
    await expect(line).toContainText(`${planned} of ${planned} sets`)
    await fullSets.uncheck()
    await expect(line).toContainText(`${kept} of ${planned} sets`)

    await page.getByRole('button', { name: 'Start Day A' }).click()
    await page.waitForURL('/workout/new', { timeout: 15_000 })
    expect(Number((await launchedCompression(request, uid)).breakDays.integerValue)).toBeGreaterThanOrEqual(40)
  })

  test('a low check-in starts with fewer sets, and Full sets keeps the plan and the check-in', async ({ page, request }) => {
    test.skip(process.env.E2E_BACKEND !== 'emulator', 'Needs a fresh emulator account')
    const uid = await freshAccount(page, request)
    await page.getByRole('button', { name: 'Use the starter plan' }).click()
    const dock = page.getByRole('region', { name: 'Today' })
    await expect(dock.getByRole('button', { name: 'Start Day A' })).toBeVisible({ timeout: 15_000 })
    await expect(dock.getByRole('switch', { name: 'Full sets' })).toHaveCount(0)

    await dock.locator('[data-today-readiness]').click()
    for (const name of ['Sleep 1 of 5, Poor', 'Mood 1 of 5, Bad', 'Soreness 5 of 5, Severe']) await dock.getByRole('radio', { name }).check()
    await expect(dock.getByText('Saved for today')).toBeVisible({ timeout: 10_000 })
    await dock.locator('[data-today-readiness]').click()
    const line = dock.getByText(/ of \d+ sets/)
    const [kept, planned] = (await line.textContent())!.match(/(\d+) of (\d+) sets/)!.slice(1).map(Number)
    expect(kept).toBeLessThan(planned!)

    const fullSets = dock.getByRole('switch', { name: 'Full sets' })
    await fullSets.check()
    await expect(line).toContainText(`${planned} of ${planned} sets`)
    await expect(fullSets).toBeChecked()

    await page.getByRole('button', { name: 'Start Day A' }).click()
    await page.waitForURL('/workout/new', { timeout: 15_000 })
    expect((await launchedCompression(request, uid)).readiness.stringValue).toBe('low')
  })
})
