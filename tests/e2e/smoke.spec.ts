import { test, expect } from './fixtures'
import { expectAppReady } from './support/appReady'
import { cleanupWorkoutLifecycleState, seedLifecycleActiveSession } from './support/workoutLifecycleEmulator'

// Pages to smoke-test: [name, path]
const PAGES = [
  ['Dashboard', '/dashboard'],
  ['Progress', '/progress'],
  ['Templates', '/templates'],
  ['Exercises', '/exercises'],
  ['Chat', '/chat'],
  ['Profile', '/profile'],
] as const

for (const [name, route] of PAGES) {
  test(`${name} page loads without console errors`, async ({ page }) => {
    await page.goto(route)

    await expectAppReady(page, route)
  })
}

// Bottom nav is lg:hidden — only visible on mobile viewports
test('mobile nav shows four usable primary items at 360px and 390px', async ({ page, isMobile }, testInfo) => {
  test.skip(!isMobile, 'BottomNav is lg:hidden — only visible on mobile viewports')

  await page.goto('/dashboard')
  await expectAppReady(page, '/dashboard')
  await expect(page.getByRole('heading', { name: /^(Recent workouts|History)$/ })).toBeVisible()
  const nav = page.getByLabel('Bottom navigation')
  await expect(nav).toBeVisible()

  for (const label of ['Train', 'History', 'Progress', 'Coach']) {
    await expect(nav.getByRole('button', { name: label, exact: true })).toBeVisible()
  }
  await expect(nav.getByRole('button')).toHaveCount(4)

  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 800 })
    const buttons = await nav.getByRole('button').all()
    for (const button of buttons) {
      const box = await button.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.width).toBeGreaterThanOrEqual(44)
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await page.screenshot({ path: testInfo.outputPath(`mobile-nav-${width}.png`) })
  }
})

test('desktop nav shows Resume workout only during an active session', async ({ page, cleanup }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'TopNav is the desktop workout entry')
  test.skip(process.env.E2E_BACKEND !== 'emulator', 'emulator-only active session fixture')
  cleanup.add('remove active session fixture', cleanupWorkoutLifecycleState)
  await cleanupWorkoutLifecycleState()

  await page.goto('/dashboard')
  await expectAppReady(page, '/dashboard')
  const workoutEntry = page.locator('header.top-nav .top-nav-cta')
  await expect(workoutEntry).toHaveCount(0)

  await seedLifecycleActiveSession({ sessionId: 'phase-1-top-nav-resume', label: 'Phase 1 top nav resume' })
  await page.reload()
  await expectAppReady(page, '/dashboard')
  await expect(workoutEntry).toHaveText('Resume workout')
})

test('bottom nav active state updates on navigation', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'BottomNav is lg:hidden — only visible on mobile viewports')

  await page.goto('/dashboard')
  const nav = page.getByLabel('Bottom navigation')

  await page.getByRole('button', { name: 'View history', exact: true }).click()
  await page.waitForURL('/history')
  await expect(nav.getByRole('button', { name: 'History', exact: true })).toHaveAttribute('aria-current', 'page')
  await nav.getByRole('button', { name: 'Train', exact: true }).click()
  await page.waitForURL('/dashboard')

  // Navigate to Progress
  await nav.getByRole('button', { name: 'Progress', exact: true }).click()
  await page.waitForURL('/progress')

  // Navigate to Templates through Train
  await nav.getByRole('button', { name: 'Train', exact: true }).click()
  await page.waitForURL('/dashboard')
  await page.getByRole('button', { name: 'Plans', exact: true }).click()
  await page.waitForURL('/templates')
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1)
  await expect(nav.getByRole('button', { name: 'Train', exact: true })).toHaveAttribute('aria-current', 'page')

  // Navigate to Exercises
  await page.getByRole('link', { name: 'Exercises', exact: true }).click()
  await page.waitForURL('/exercises')
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1)
  await expect(nav.getByRole('button', { name: 'Train', exact: true })).toHaveAttribute('aria-current', 'page')

  await nav.getByRole('button', { name: 'History', exact: true }).click()
  await page.waitForURL('/history')
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1)
  await expect(nav.getByRole('button', { name: 'History', exact: true })).toHaveAttribute('aria-current', 'page')
})

test('page shell settles to a single element after load', async ({ page }) => {
  // During Suspense lazy-loading, ShellSkeleton + page content can briefly both have .page-shell.
  // This test verifies the DOM stabilizes to exactly one .page-shell after the page is loaded.
  await page.goto('/dashboard')
  await page.waitForURL('/dashboard')

  // Wait for the lazy chunk to load and Suspense to resolve
  await expect(page.locator('.page-shell')).toHaveCount(1, { timeout: 10_000 })
})
