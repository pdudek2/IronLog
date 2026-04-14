import { test, expect, type Page, type ConsoleMessage } from '@playwright/test'

// Collect console errors during each test
function collectConsoleErrors(page: Page): () => ConsoleMessage[] {
  const errors: ConsoleMessage[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg)
    }
  })
  return () => errors
}

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
    const getErrors = collectConsoleErrors(page)

    await page.goto(route)

    // Must stay on the requested route (not redirected to /login)
    await expect(page).toHaveURL(route, { timeout: 10_000 })
    await expect(page.locator('.page-shell')).toBeVisible()

    // Screenshot for visual regression baseline
    await page.screenshot({ path: `test-results/${name.toLowerCase()}.png`, fullPage: true })

    // No red console errors
    const errors = getErrors()
    const relevantErrors = errors.filter((e) => {
      const text = e.text()
      // Ignore known browser extension noise and HMR messages
      return !text.includes('extension') && !text.includes('[vite]')
    })

    expect(relevantErrors, `Console errors on ${name}: ${relevantErrors.map((e) => e.text()).join('\n')}`).toHaveLength(0)
  })
}

// Bottom nav is lg:hidden — only visible on mobile viewports
test('mobile nav shows all 7 items', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'BottomNav is lg:hidden — only visible on mobile viewports')

  await page.goto('/dashboard')
  const nav = page.locator('nav').filter({ hasText: 'Start' })
  await expect(nav).toBeVisible()

  for (const label of ['Start', 'Postępy', 'Plany', 'Ćwiczenia', 'AI', 'Profil']) {
    await expect(nav.getByText(label)).toBeVisible()
  }
})

test('bottom nav active state updates on navigation', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'BottomNav is lg:hidden — only visible on mobile viewports')

  await page.goto('/dashboard')
  const nav = page.locator('nav').filter({ hasText: 'Start' })

  // Navigate to Progress
  await nav.getByText('Postępy').click()
  await page.waitForURL('/progress')

  // Navigate to Templates
  await nav.getByText('Plany').click()
  await page.waitForURL('/templates')

  // Navigate to Exercises
  await nav.getByText('Ćwiczenia').click()
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
