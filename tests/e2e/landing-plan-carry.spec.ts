import { test, expect } from './fixtures'

const PLAN = 'Push\nBench press 4x6 80\nOverhead press 3x8 40\n\nPull\nDeadlift 3x5 140\nLat pulldown 3x10 60'

test.describe('Plan pasted on the landing', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('goes with the visitor into the new account and is saved after review', async ({ page }) => {
    test.skip(process.env.E2E_BACKEND !== 'emulator', 'Needs a fresh emulator account')
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Create an account with this plan' })).toHaveCount(0)
    await page.getByLabel('Your plan', { exact: true }).fill(PLAN)
    await page.getByRole('button', { name: 'Show my short day' }).click()
    await page.getByRole('link', { name: 'Create an account with this plan' }).click()

    await expect(page).toHaveURL('/register')
    await page.getByLabel('Email').fill(`carry-${Date.now()}-${Math.round(Math.random() * 1e6)}@ironlog.local`)
    await page.getByLabel('Password').fill(process.env.TEST_PASSWORD!)
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page).toHaveURL('/onboarding', { timeout: 20_000 })
    await page.getByLabel('Name').fill('Carry E2E')
    await page.getByRole('button', { name: 'Save profile' }).click()
    await page.waitForURL('/dashboard', { timeout: 20_000 })

    await expect(page.getByRole('button', { name: 'Paste a plan' })).toHaveCount(0)
    await expect(page.getByText('The plan you pasted is ready. Check it, then save it.')).toBeVisible()
    await page.getByRole('button', { name: 'Save your pasted plan' }).click()
    await expect(page).toHaveURL('/templates/new')
    await expect(page.getByText('2 days · 4 exercises · 13 sets')).toBeVisible()
    await page.locator('button[type="submit"]:visible').filter({ hasText: 'Save plan' }).click()
    // A plan saved from Train goes back to Train, ready to start.
    await expect(page).toHaveURL('/dashboard', { timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Start Push' })).toBeVisible({ timeout: 15_000 })
    expect(await page.evaluate(() => localStorage.getItem('ironlog:landing-plan'))).toBeNull()

    // An account that already has a plan is not offered one from the landing.
    await page.evaluate((plan) => localStorage.setItem('ironlog:landing-plan', plan), PLAN)
    await page.goto('/dashboard')
    await expect(page.getByRole('button', { name: 'Start Push' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Save your pasted plan' })).toHaveCount(0)
  })
})
