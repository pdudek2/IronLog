import { expect, test, type Page } from '@playwright/test'

const ANALYTICS_VENDOR = /(?:google-analytics\.com|googletagmanager\.com|contentsquare\.net|hotjar\.com|hotjar\.io)/i

test.use({ storageState: { cookies: [], origins: [] } })

function captureAnalyticsRequests(page: Page): string[] {
  const requests: string[] = []
  page.on('request', (request) => {
    if (ANALYTICS_VENDOR.test(request.url())) requests.push(request.url())
  })
  return requests
}

test('public app has no analytics consent UI or vendor requests', async ({ page }) => {
  const analyticsRequests = captureAnalyticsRequests(page)
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/login')

  await expect(page.getByRole('button', { name: 'Zaloguj się' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Zgoda na analitykę' })).toHaveCount(0)
  expect(analyticsRequests).toEqual([])
})
