import { test, expect } from './fixtures'
import { expectAppReady } from './support/appReady'

test.describe('Critical application contract', () => {
  test('workout route reaches a terminal ready state', async ({ page }) => {
    await page.goto('/workout/new')
    await expectAppReady(page, '/workout/new', 25_000)
  })

  test('history route reaches a loaded empty-or-data state', async ({ page }) => {
    await page.goto('/history')
    await expectAppReady(page, '/history')
  })

  test('template editor opens from the loaded templates screen', async ({ page }) => {
    await page.goto('/templates')
    await expectAppReady(page, '/templates')
    await page.getByRole('button', { name: 'Nowy plan' }).click()
    await expectAppReady(page, '/templates/new')
  })

  test('progress reaches an interactive loaded state', async ({ page }) => {
    await page.goto('/progress')
    await expectAppReady(page, '/progress', 20_000)
    await expect(page.getByRole('button', { name: '30 dni' })).toBeVisible()
  })

  test('dashboard exposes its primary workout action', async ({ page }) => {
    await page.goto('/dashboard')
    await expectAppReady(page, '/dashboard')
  })

  test('unauthenticated user is redirected to login', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await context.newPage()
    try {
      await page.goto('/dashboard')
      await expect(page).toHaveURL('/login', { timeout: 10_000 })
      await expect(page.getByRole('button', { name: 'Zaloguj się' })).toBeVisible()
    } finally {
      await context.close()
    }
  })
})
