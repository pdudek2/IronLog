import { test, expect } from './fixtures'
import { expectAppReady } from './support/appReady'

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
test('mobile nav shows all primary items', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'BottomNav is lg:hidden — only visible on mobile viewports')

  await page.goto('/dashboard')
  const nav = page.getByLabel('Nawigacja dolna')
  await expect(nav).toBeVisible()

  for (const label of ['Start', 'Postępy', 'Plany', 'Ćwiczenia', 'Historia', 'AI']) {
    await expect(nav.getByRole('button', { name: label, exact: true })).toBeVisible()
  }
  await expect(nav.getByRole('button', {
    name: /^(?:Rozpocznij nowy trening|Wznów trening)$/,
  })).toBeVisible()
})

test('desktop nav shows an approved workout entry label', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'TopNav is the desktop workout entry')

  await page.goto('/dashboard')
  await expect(page.locator('header.top-nav')
    .getByRole('button', { name: /^(?:Rozpocznij nowy trening|Wznów trening)$/ }))
    .toHaveText(/^(?:Nowy trening|Wznów trening)$/)
})

test('bottom nav active state updates on navigation', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'BottomNav is lg:hidden — only visible on mobile viewports')

  await page.goto('/dashboard')
  const nav = page.getByLabel('Nawigacja dolna')

  // Navigate to Progress
  await nav.getByRole('button', { name: 'Postępy', exact: true }).click()
  await page.waitForURL('/progress')

  // Navigate to Templates
  await nav.getByRole('button', { name: 'Plany', exact: true }).click()
  await page.waitForURL('/templates')

  // Navigate to Exercises
  await nav.getByRole('button', { name: 'Ćwiczenia', exact: true }).click()
  await page.waitForURL('/exercises')
})

test('page shell settles to a single element after load', async ({ page }) => {
  // During Suspense lazy-loading, ShellSkeleton + page content can briefly both have .page-shell.
  // This test verifies the DOM stabilizes to exactly one .page-shell after the page is loaded.
  await page.goto('/dashboard')
  await page.waitForURL('/dashboard')

  // Wait for the lazy chunk to load and Suspense to resolve
  await expect(page.locator('.page-shell')).toHaveCount(1, { timeout: 10_000 })
})
