import { test, expect, type Locator, type Page } from './fixtures'

const progressHeading = (page: Page) => page.getByRole('heading', { name: 'Postępy.' })

async function useHistoricalSessionClock(page: Page): Promise<void> {
  await page.addInitScript(`
    const NativeDate = Date
    const fixedNow = new NativeDate('2026-04-07T12:00:00.000Z').valueOf()

    class FixedDate extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]))
      }

      static now() {
        return fixedNow
      }
    }

    window.Date = FixedDate
  `)
}

async function gotoProgressReady(page: Page): Promise<void> {
  await page.goto('/progress')
  await expect(page).toHaveURL('/progress')
  await expect(progressHeading(page)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('progress-page')).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 })
}

async function expectNoHorizontalOverflow(locator: Locator, viewportWidth: number): Promise<void> {
  const box = await locator.boundingBox()

  expect(box, 'expected a visible element for geometry verification').not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth + 1)
}

test.describe('Progress analytics', () => {
  test('loads a stable analytics board with all-time records', async ({ page }) => {
    await gotoProgressReady(page)

    await expect(page.locator('.progress-board')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Rekordy od początku' })).toBeVisible()
    await page.screenshot({ path: 'test-results/progress-loaded.png', fullPage: true })
  })

  test('switches ranges locally while offline without remounting the board', async ({ page }) => {
    await gotoProgressReady(page)

    const progressPage = page.getByTestId('progress-page')
    const board = page.locator('.progress-board')
    const boardHandle = await board.elementHandle()
    const button30 = page.getByRole('button', { name: '30 dni' })
    const button90 = page.getByRole('button', { name: '90 dni' })
    const fullPageError = page.getByText('Nie udało się pobrać danych', { exact: true })

    expect(boardHandle).not.toBeNull()

    await page.context().setOffline(true)
    try {
      await button30.click()
      await expect(button30).toHaveAttribute('aria-pressed', 'true')
      await expect(progressHeading(page)).toBeVisible()
      await expect(board).toBeVisible()
      await expect(progressPage).toHaveAttribute('aria-busy', 'false')
      await expect(fullPageError).toHaveCount(0)
      expect(await boardHandle!.evaluate((node) => node.isConnected)).toBe(true)

      await button90.click()
      await expect(button90).toHaveAttribute('aria-pressed', 'true')
      await expect(progressHeading(page)).toBeVisible()
      await expect(board).toBeVisible()
      await expect(progressPage).toHaveAttribute('aria-busy', 'false')
      await expect(fullPageError).toHaveCount(0)
      expect(await boardHandle!.evaluate((node) => node.isConnected)).toBe(true)
    } finally {
      await page.context().setOffline(false)
    }
  })

  test('keeps records readable and exposes any rendered heatmap summary without hover', async ({ page }) => {
    await useHistoricalSessionClock(page)
    await gotoProgressReady(page)

    const records = page.locator('.progress-records')
    await records.scrollIntoViewIfNeeded()
    await expect(page.getByRole('heading', { name: 'Rekordy od początku' })).toBeVisible()

    const viewport = page.viewportSize()
    expect(viewport).not.toBeNull()

    const rows = records.locator('.progress-record-feature, .progress-record-ledger-row')
    expect(await rows.count()).toBeGreaterThan(0)
    for (let index = 0; index < await rows.count(); index += 1) {
      await expectNoHorizontalOverflow(rows.nth(index), viewport!.width)
    }

    const heatmapSummary = page.locator('.progress-heatmap-summary')
    await heatmapSummary.scrollIntoViewIfNeeded()
    await expect(heatmapSummary).toBeVisible()
    await expect(heatmapSummary).not.toBeEmpty()

    await page.screenshot({ path: 'test-results/progress-records.png', fullPage: true })
  })

  test('mobile content clears the fixed navigation and keeps any strength legend readable', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) >= 1024, 'Mobile geometry is covered by the mobile project.')

    await useHistoricalSessionClock(page)
    await gotoProgressReady(page)

    const bottomNavigation = page.locator('.bottom-nav')
    await expect(bottomNavigation).toBeVisible()
    const bottomNavigationBox = await bottomNavigation.boundingBox()
    expect(bottomNavigationBox).not.toBeNull()

    const clearNavigation = async (section: Locator) => {
      await section.evaluate((element) => element.scrollIntoView({ block: 'center' }))
      const sectionBox = await section.boundingBox()
      expect(sectionBox, 'expected a visible section for mobile clearance verification').not.toBeNull()
      expect(sectionBox!.y + sectionBox!.height).toBeLessThanOrEqual(bottomNavigationBox!.y + 1)
    }

    const firstChart = page.locator('.progress-chart-frame').first()
    await expect(firstChart).toBeVisible()
    await clearNavigation(firstChart)

    await clearNavigation(page.locator('.progress-records'))

    const legend = page.locator('.progress-legend')
    if (await legend.count()) {
      await expect(legend).toBeVisible()
      const labels = legend.locator('small')
      for (let index = 0; index < await labels.count(); index += 1) {
        await expectNoHorizontalOverflow(labels.nth(index), page.viewportSize()!.width)
        expect(await labels.nth(index).evaluate((label) => label.scrollWidth <= label.clientWidth)).toBe(true)
      }
    }

    await page.screenshot({ path: 'test-results/progress-mobile.png', fullPage: true })
  })
})
