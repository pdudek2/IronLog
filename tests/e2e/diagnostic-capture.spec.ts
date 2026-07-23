/**
 * Visual audit screenshot capture script.
 * Run with: npx playwright test tests/e2e/diagnostic-capture.spec.ts --project=desktop --retries=0
 * Captures each key screen at desktop (1280x800) and mobile (390x844).
 * These images are inspection artifacts, not visual-regression baselines.
 */
import { expect } from '@playwright/test'
import { test } from './fixtures'
import { expectAppReady, type AppReadyRoute } from './support/appReady'

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

for (const screen of SCREENS) {
  for (const vp of VIEWPORTS) {
    test(`${screen.name} [${vp.name}]`, async ({ page, observedContextFactory }, testInfo) => {
      if (!screen.requiresAuth) {
        const anonymousContext = await observedContextFactory.newContext({
          storageState: { cookies: [], origins: [] },
          viewport: { width: vp.width, height: vp.height },
          reducedMotion: 'reduce',
        })
        page = await anonymousContext.newPage()
      }

      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto(screen.path)
      // Let async data settle
      await expectAppReady(page, screen.path as AppReadyRoute)
      await page.evaluate(() => document.fonts.ready)
      await page.screenshot({
        path: testInfo.outputPath('diagnostic', `${screen.name}-${vp.name}.png`),
        fullPage: true,
      })

      // For dashboard and exercises — also capture after scroll
      if (['dashboard', 'exercises', 'progress'].includes(screen.name)) {
        await page.evaluate(() => window.scrollTo(0, 600))
        await page.evaluate(() => new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => resolve())
        }))
        await page.screenshot({
          path: testInfo.outputPath('diagnostic', `${screen.name}-${vp.name}-scrolled.png`),
          fullPage: false,
        })
        await page.evaluate(() => window.scrollTo(0, 0))
      }
    })
  }
}

// Additional: exercise detail (global)
for (const vp of VIEWPORTS) {
  test(`exercise-detail [${vp.name}]`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/exercises')
    await expectAppReady(page, '/exercises')
    // Click the first global exercise card
    const card = page
      .locator('section')
      .filter({ hasText: 'Katalog globalny' })
      .getByRole('button', { name: /^Otwórz ćwiczenie / })
      .first()
    await expect(card).toBeVisible()
    await card.click()
    await expect(page).toHaveURL(/\/exercises\/global\/[^/]+$/)
    const detailRoute = new URL(page.url()).pathname as AppReadyRoute
    await expectAppReady(page, detailRoute)
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({
      path: testInfo.outputPath('diagnostic', `exercise-detail-${vp.name}.png`),
      fullPage: true,
    })
  })
}
