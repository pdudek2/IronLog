import { test, expect, type Page } from './fixtures'
import { deleteTemplateByName, discardActiveSession } from './support/accountCleanup'
import { expectAppReady } from './support/appReady'

const PASTED_PLAN_NAME = '_E2E Pasted plan_'
const PASTED = `${PASTED_PLAN_NAME}

Upper
T-bar row 3x8
Biceps 3x12 14 kg

Lower
Przysiad 4x6 90kg
Przywodziciele 3x12 50 kg`

async function chooseFor(page: Page, line: string, exercise: string): Promise<void> {
  await page.getByRole('button', { name: `Choose exercise for ${line}` }).click()
  const picker = page.getByRole('dialog', { name: `Choose for “${line}”` })
  await picker.locator('.exercise-picker-result').filter({ hasText: new RegExp(`^${exercise}`) }).first().click()
  await expect(picker).not.toBeVisible()
}

async function expectFirstSetTest(page: Page, exercise: string): Promise<void> {
  await expect(page.getByText('First set is a test', { exact: true })).toBeVisible({ timeout: 15_000 })
  const panel = page.getByRole('region', { name: 'Current set' })
  await panel.getByRole('spinbutton', { name: /^Weight,/ }).fill('60')
  await panel.getByRole('spinbutton', { name: /^Reps,/ }).fill('8')
  await panel.getByRole('button', { name: new RegExp(`^Log set 1 for ${exercise}`) }).click()
  await expect(page.getByText(/^From your first set: \d/)).toBeVisible()
}

test.describe('Plan from text', () => {
  test('a pasted plan resolves its open lines, saves, and starts with a first-set test', async ({ page, cleanup }) => {
    cleanup.add('discard active session', () => discardActiveSession(page))
    cleanup.add('delete pasted plan', () => deleteTemplateByName(page, PASTED_PLAN_NAME))

    await page.goto('/templates')
    await expectAppReady(page, '/templates')
    await page.getByRole('button', { name: 'Paste a plan' }).click()
    await page.getByRole('textbox', { name: 'Plan text' }).fill(PASTED)
    await page.getByRole('button', { name: 'Continue' }).click()

    await expectAppReady(page, '/templates/new')
    await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(PASTED_PLAN_NAME)
    const save = page.locator('button[type="submit"]:visible').filter({ hasText: 'Save plan' })
    await expect(page.getByText('Choose 2 exercises to save').locator('visible=true')).toHaveCount(1)
    await expect(save).toBeDisabled()

    await chooseFor(page, 'Biceps', 'Barbell Curl')
    await page.getByRole('tab', { name: /Lower/ }).click()
    await chooseFor(page, 'Przywodziciele', 'Hip Adduction')
    await expect(save).toBeEnabled()
    await save.click()

    await page.waitForURL('/templates', { timeout: 15_000 })
    await page.getByRole('button', { name: `Start day Upper from template ${PASTED_PLAN_NAME}` }).click()
    await page.waitForURL('/workout/new', { timeout: 15_000 })
    await expectFirstSetTest(page, 'T-Bar Row')
  })
})

test.describe('Starter plan', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('an empty Train adds the starter plan and starts day A with a first-set test', async ({ page, request }) => {
    test.skip(process.env.E2E_BACKEND !== 'emulator', 'Needs a fresh emulator account')
    const email = `starter-${Date.now()}@ironlog.local`
    const password = process.env.TEST_PASSWORD!
    const signUp = await request.post(
      'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key',
      { data: { email, password, returnSecureToken: true } },
    )
    expect(signUp.ok()).toBe(true)

    await page.goto('/login')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL('/onboarding', { timeout: 20_000 })
    await page.getByLabel('Name').fill('Starter E2E')
    await page.getByRole('button', { name: 'Save profile' }).click()
    await page.waitForURL('/dashboard', { timeout: 20_000 })

    await expect(page.getByRole('button', { name: 'Paste a plan' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Build a plan' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start empty workout' })).toBeVisible()
    await page.getByRole('button', { name: 'Use the starter plan' }).click()

    const start = page.getByRole('button', { name: 'Start Day A' })
    await expect(start).toBeVisible({ timeout: 15_000 })
    await start.click()
    await page.waitForURL('/workout/new', { timeout: 15_000 })
    await expectFirstSetTest(page, 'Squat')
  })
})
