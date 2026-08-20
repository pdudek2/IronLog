import { expect, test } from './fixtures'
import { expectAppReady } from './support/appReady'

function isProgressPageModule(url: string): boolean {
  const pathname = new URL(url).pathname
  return pathname === '/src/pages/ProgressPage.tsx'
    || /^\/assets\/ProgressPage-[A-Za-z0-9_-]+\.js$/.test(pathname)
}

test.describe('Protected application shell', () => {
  test('routes authenticated and anonymous root visits through the private boundary', async ({
    page,
    observedContextFactory,
  }) => {
    await page.goto('/')
    await expect(page).toHaveURL('/dashboard', { timeout: 15_000 })

    const anonymousContext = await observedContextFactory.newContext({
      storageState: { cookies: [], origins: [] },
    })
    const anonymousPage = await anonymousContext.newPage()
    await anonymousPage.goto('/')
    await expect(anonymousPage).toHaveURL('/login', { timeout: 15_000 })
  })

  test('keeps an authenticated unknown route inside the app shell', async ({ page }, testInfo) => {
    await page.goto('/definitely-missing')

    await expect(page).toHaveURL('/definitely-missing')
    await expect(page.getByRole('heading', { name: 'Ta strona nie istnieje' })).toBeVisible()
    await expect(page.getByRole('main')).toHaveCount(1)
    await expect(page.getByRole('main')).toBeFocused()

    const navigationName = testInfo.project.name === 'mobile'
      ? 'Nawigacja dolna'
      : 'Nawigacja główna'
    await expect(page.getByRole('navigation', { name: navigationName })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Wróć do panelu' })).toBeVisible()

    const geometry = await page.locator('.not-found-page').evaluate((element) => {
      const actionBox = element.querySelector('a')?.getBoundingClientRect()
      const bottomNav = document.querySelector('[aria-label="Nawigacja dolna"]')
        ?.getBoundingClientRect()
      return {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        actionHeight: actionBox?.height ?? 0,
        mobileClearance: bottomNav && actionBox ? bottomNav.top - actionBox.bottom : null,
      }
    })

    expect(geometry.documentWidth).toBe(geometry.viewportWidth)
    expect(geometry.documentHeight).toBeLessThanOrEqual(geometry.viewportHeight + 1)
    expect(geometry.actionHeight).toBeGreaterThanOrEqual(44)
    if (testInfo.project.name === 'mobile') {
      expect(geometry.mobileClearance).not.toBeNull()
      expect(geometry.mobileClearance as number).toBeGreaterThanOrEqual(16)
    }
  })

  test('routes an anonymous unknown URL through the private boundary', async ({ observedContextFactory }) => {
    const context = await observedContextFactory.newContext({
      storageState: { cookies: [], origins: [] },
    })
    const page = await context.newPage()

    await page.goto('/definitely-missing')
    await expect(page).toHaveURL('/login', { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Zaloguj się' })).toBeVisible()
  })

  test('provides one main landmark and moves focus after route navigation', async ({ page }, testInfo) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL('/dashboard', { timeout: 15_000 })

    const main = page.getByRole('main')
    await expect(main).toHaveCount(1)

    const navigationName = testInfo.project.name === 'mobile'
      ? 'Nawigacja dolna'
      : 'Nawigacja główna'
    const navigation = page.getByRole('navigation', { name: navigationName })
    await navigation.getByRole('button', { name: 'Historia', exact: true }).click()

    await expect(page).toHaveURL('/history')
    await expect(main).toBeFocused()
  })

  test('loads the Progress route only after navigation intent', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop navigation intent contract')

    const progressRequests: string[] = []
    page.on('request', (request) => {
      if (isProgressPageModule(request.url())) {
        progressRequests.push(request.url())
      }
    })

    await page.goto('/dashboard')
    await expect(page).toHaveURL('/dashboard', { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Ostatnie treningi' })).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(500)

    expect(progressRequests).toHaveLength(0)

    const navigation = page.getByRole('navigation', { name: 'Nawigacja główna' })
    await navigation.getByRole('button', { name: 'Postępy', exact: true }).hover()

    await expect.poll(() => progressRequests.length).toBeGreaterThan(0)
  })

  test('exposes a localized polite live region for app feedback', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL('/dashboard', { timeout: 15_000 })

    const liveRegion = page.locator('section[aria-live="polite"][aria-relevant="additions text"]')
    await expect(liveRegion).toHaveCount(1)
    await expect(liveRegion).toHaveAttribute('aria-label', /Powiadomienia/)
  })

  test('keeps exactly one main landmark on nested tool routes', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'shared semantic contract')

    const routes = [
      { path: '/exercises', ready: '.exercise-library-content' },
      { path: '/templates/new', ready: '.template-editor-main' },
      { path: '/workout/new', ready: null },
    ]

    for (const route of routes) {
      await page.goto(route.path)
      if (route.ready) await expect(page.locator(route.ready)).toBeVisible({ timeout: 25_000 })
      else await expectAppReady(page, '/workout/new', 25_000)
      await expect(page.getByRole('main')).toHaveCount(1)
    }
  })
})
