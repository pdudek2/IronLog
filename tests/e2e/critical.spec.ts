import { test, expect } from './fixtures'
import { discardActiveSession } from './support/accountCleanup'
import { expectAppReady } from './support/appReady'

test.describe('Critical application contract', () => {
  test('workout route reaches a terminal ready state', async ({ page, cleanup }) => {
    cleanup.add('discard active session', () => discardActiveSession(page))
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
    await page.getByRole('button', { name: /^(Nowy plan|Utwórz pierwszy plan)$/ }).click()
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

})

test.describe('Unauthenticated application contract', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('unauthenticated user is redirected to login', async ({ context }) => {
    const page = await context.newPage()
    await page.goto('/dashboard')
    await expect(page).toHaveURL('/login', { timeout: 10_000 })
    await expect(page.getByRole('button', { name: 'Zaloguj się' })).toBeVisible()
    await page.close()
  })
})
