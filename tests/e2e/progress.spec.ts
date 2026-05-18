import { test, expect, type Page, type ConsoleMessage } from '@playwright/test'

function captureErrors(page: Page): () => string[] {
  const errors: string[] = []
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      if (!text.includes('extension') && !text.includes('[vite]')) {
        errors.push(text)
      }
    }
  })
  return () => errors
}

test.describe('Progress analytics', () => {
  test('page loads and shows charts without console errors', async ({ page }) => {
    const getErrors = captureErrors(page)

    await page.goto('/progress')
    await expect(page).toHaveURL('/progress')
    await expect(page.locator('.page-shell')).toBeVisible({ timeout: 10_000 })

    // Wait for async data fetch and chart render
    await page.waitForTimeout(2_000)

    await page.screenshot({ path: 'test-results/progress-loaded.png' })

    // Recharts renders SVG — verify at least one svg is present (charts loaded)
    const charts = page.locator('svg.recharts-surface')
    await expect(charts.first()).toBeVisible({ timeout: 8_000 })

    // No console errors
    const errors = getErrors()
    expect(errors, `Progress console errors:\n${errors.join('\n')}`).toHaveLength(0)
  })

  test('range toggle 90d → 30d → 90d works without errors', async ({ page }) => {
    const getErrors = captureErrors(page)

    await page.goto('/progress')
    await expect(page.locator('.page-shell')).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(1_500)

    // "90 dni" is the default range (useState(90)), so "90 dni" button starts disabled.
    // We must click "30 dni" first to activate it, then switch back to "90 dni".
    const btn30 = page.getByRole('button', { name: '30 dni' })
    const btn90 = page.getByRole('button', { name: '90 dni' })
    await expect(btn30).toBeVisible()
    await expect(btn90).toBeVisible()

    // Switch to 30 dni (btn90 starts disabled — this enables it).
    // handleRangeChange sets loading=true which unmounts buttons (renders LoadingState).
    // Must wait for charts to reappear (= loading finished) before clicking btn90.
    await btn30.click()
    await expect(page.locator('svg.recharts-surface').first()).toBeVisible({ timeout: 15_000 })

    await page.screenshot({ path: 'test-results/progress-30d.png' })

    // btn90 is now enabled (rangeDays === 30) — verify before clicking
    await expect(btn90).toBeEnabled({ timeout: 5_000 })
    await btn90.click()
    await expect(page.locator('svg.recharts-surface').first()).toBeVisible({ timeout: 15_000 })

    await page.screenshot({ path: 'test-results/progress-90d.png' })

    expect(getErrors(), `Progress range toggle errors:\n${getErrors().join('\n')}`).toHaveLength(0)
  })

  test('records section is visible', async ({ page }) => {
    await page.goto('/progress')
    await expect(page.locator('.page-shell')).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(2_000)

    // Scroll down to find records section
    await page.getByText('Rekordy osobiste').scrollIntoViewIfNeeded()
    await expect(page.getByText('Rekordy osobiste')).toBeVisible()

    await page.screenshot({ path: 'test-results/progress-records.png' })
  })

  test('layout: charts are in viewport and not clipped on desktop', async ({ page }) => {
    test.skip(!!page.viewportSize()?.width && page.viewportSize()!.width < 1024,
      'Layout test only for desktop viewports')

    await page.goto('/progress')
    await expect(page.locator('.page-shell')).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(2_000)

    // Verify the first chart has a stable rendered size and can be brought fully into view.
    const firstChart = page.locator('svg.recharts-surface').first()
    await firstChart.scrollIntoViewIfNeeded()
    await expect(firstChart).toBeInViewport({ ratio: 0.5 })

    const box = await firstChart.boundingBox()
    expect(box?.width).toBeGreaterThan(300)
    expect(box?.height).toBeGreaterThan(150)
  })
})
