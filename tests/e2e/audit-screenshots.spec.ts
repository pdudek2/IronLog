/**
 * Visual audit screenshot capture script.
 * Run with: npx playwright test tests/e2e/audit-screenshots.ts --headed=false
 * Captures each key screen at desktop (1280x800) and mobile (390x844).
 */
import { test } from './fixtures'

const SCREENS = [
  { name: 'login', path: '/login', requiresAuth: false },
  { name: 'dashboard', path: '/dashboard', requiresAuth: true },
  { name: 'workout', path: '/workout/new', requiresAuth: true },
  { name: 'exercises', path: '/exercises', requiresAuth: true },
  { name: 'templates', path: '/templates', requiresAuth: true },
  { name: 'progress', path: '/progress', requiresAuth: true },
  { name: 'chat', path: '/chat', requiresAuth: true },
  { name: 'profile', path: '/profile', requiresAuth: true },
]

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
]

test.use({ storageState: 'tests/e2e/.auth/user.json' })

for (const screen of SCREENS) {
  for (const vp of VIEWPORTS) {
    test(`${screen.name} [${vp.name}]`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto(screen.path)
      await page.locator('.page-shell').waitFor({ timeout: 25_000 })
      // Let async data settle
      await page.waitForTimeout(2_500)
      await page.screenshot({
        path: `test-results/audit/${screen.name}-${vp.name}.png`,
        fullPage: true,
      })

      // For dashboard and exercises — also capture after scroll
      if (['dashboard', 'exercises', 'progress'].includes(screen.name)) {
        await page.evaluate(() => window.scrollTo(0, 600))
        await page.waitForTimeout(500)
        await page.screenshot({
          path: `test-results/audit/${screen.name}-${vp.name}-scrolled.png`,
          fullPage: false,
        })
        await page.evaluate(() => window.scrollTo(0, 0))
      }
    })
  }
}

// Additional: exercise detail (global)
for (const vp of VIEWPORTS) {
  test(`exercise-detail [${vp.name}]`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto('/exercises')
    await page.locator('.page-shell').waitFor({ timeout: 15_000 })
    await page.waitForTimeout(1_500)
    // Click the first global exercise card
    const card = page.locator('section').filter({ hasText: 'Katalog globalny' }).locator('[role="button"]').first()
    if (await card.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await card.click()
      await page.locator('.page-shell').waitFor({ timeout: 10_000 })
      await page.waitForTimeout(1_500)
    }
    await page.screenshot({
      path: `test-results/audit/exercise-detail-${vp.name}.png`,
      fullPage: true,
    })
  })
}
