import { test, expect, type Locator, type Page } from './fixtures'
import { isExpectedFirestoreOfflineDiagnostic } from './support/offlineDiagnostics'
import {
  cleanupProgressEmulatorState,
  closeProgressEmulator,
  seedProgressEmulatorState,
} from './support/progressEmulator'

const progressHeading = (page: Page) => page.getByRole('heading', { name: 'Postępy' })
const emulatorMode = process.env.E2E_BACKEND === 'emulator'

async function useHistoricalSessionClock(
  page: Page,
  fixedNowIso = '2026-04-07T12:00:00.000Z',
): Promise<void> {
  await page.addInitScript(`
    const NativeDate = Date
    const fixedNow = new NativeDate('${fixedNowIso}').valueOf()

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
  test.beforeEach(async ({ cleanup }) => {
    if (!emulatorMode) return

    cleanup.add('remove Phase 7 progress state', cleanupProgressEmulatorState)
    await cleanupProgressEmulatorState()
    await seedProgressEmulatorState()
  })

  test.afterAll(async () => {
    if (emulatorMode) await closeProgressEmulator()
  })

  test('loads a stable analytics board with all-time records', async ({ page }) => {
    await gotoProgressReady(page)

    await expect(page.locator('.progress-board')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Rekordy od początku' })).toBeVisible()
    await expect(page.locator('.progress-panel-head > div > p')).toHaveCount(0)
    await expect(page.locator('.progress-records-head > div > p')).toHaveCount(0)
    await page.screenshot({ path: 'test-results/progress-loaded.png', fullPage: true })
  })

  test('switches ranges locally while offline without remounting the board', async ({
    page,
    expectedBrowserDiagnostics,
  }) => {
    await gotoProgressReady(page)

    const progressPage = page.getByTestId('progress-page')
    const board = page.locator('.progress-board')
    const boardHandle = await board.elementHandle()
    const button30 = page.getByRole('button', { name: '30 dni' })
    const button90 = page.getByRole('button', { name: '90 dni' })
    const fullPageError = page.getByText('Nie udało się pobrać danych', { exact: true })

    expect(boardHandle).not.toBeNull()

    await expectedBrowserDiagnostics.during(
      'intentional offline progress range switch',
      isExpectedFirestoreOfflineDiagnostic,
      async () => {
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
          await page.waitForTimeout(1_000)
        }
      },
    )
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
    await expect(records.getByText('PR', { exact: true })).toHaveCount(0)
    for (let index = 0; index < await rows.count(); index += 1) {
      await expectNoHorizontalOverflow(rows.nth(index), viewport!.width)
    }

    const heatmapSummary = page.locator('.progress-heatmap-summary')
    await heatmapSummary.scrollIntoViewIfNeeded()
    await expect(heatmapSummary).toBeVisible()
    await expect(heatmapSummary).not.toBeEmpty()

    await page.screenshot({ path: 'test-results/progress-records.png', fullPage: true })
  })

  test('shows one selected strength exercise and switches it without comparing scales', async ({ page }) => {
    await useHistoricalSessionClock(page)
    await gotoProgressReady(page)

    const picker = page.getByRole('combobox', { name: 'Ćwiczenie na wykresie' })
    await expect(picker).toHaveValue(/bench/)
    await expect(page.locator('.recharts-line')).toHaveCount(1)
    await expect(picker.locator('option:checked')).toHaveText('Phase 7 Bench Press')
    await expect(page.getByLabel('Trend wybranego ćwiczenia')).toContainText('Ostatnio 80 kg')

    await picker.selectOption({ label: 'Phase 7 Squat' })
    await expect(page.locator('.recharts-line')).toHaveCount(1)
    await expect(page.getByLabel('Trend wybranego ćwiczenia')).toContainText('Ostatnio 110 kg')
  })

  test('shows a deliberate short-series state without an empty axis or false trend', async ({ page }) => {
    await useHistoricalSessionClock(page)
    await gotoProgressReady(page)

    await page.getByRole('combobox', { name: 'Ćwiczenie na wykresie' })
      .selectOption({ label: 'Phase 7 Short Series' })

    const strengthPanel = page.locator('.progress-panel').filter({
      has: page.getByRole('heading', { name: 'Progresja ciężaru' }),
    })
    await expect(strengthPanel.getByText('Do wykresu: jeszcze 2 dni z zapisanym ciężarem.')).toBeVisible()
    await expect(strengthPanel.getByLabel('1 z 3 dni do wykresu')).toBeVisible()
    await expect(strengthPanel.locator('.recharts-line')).toHaveCount(0)
    await expect(page.getByLabel('Trend wybranego ćwiczenia')).toHaveCount(0)
  })

  test('shows a deliberate empty-range state without analytics or a false trend', async ({ page }) => {
    await useHistoricalSessionClock(page, '2026-08-17T12:00:00.000Z')
    await gotoProgressReady(page)

    await expect(page.getByRole('status').filter({ hasText: 'W tym zakresie nie ma treningów' })).toBeVisible()
    await expect(page.locator('.progress-analysis-grid')).toHaveCount(0)
    await expect(page.getByLabel('Trend wybranego ćwiczenia')).toHaveCount(0)
  })

  test('mobile content exposes the strength selector and heatmap inspector without overflow', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) >= 1024, 'Mobile geometry is covered by the mobile project.')

    await useHistoricalSessionClock(page)

    for (const width of [320, 393]) {
      await page.setViewportSize({ width, height: 844 })
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

      const insight = page.getByLabel('Trend wybranego ćwiczenia')
      const strengthChart = page.locator('.progress-chart-frame--strength')
      await expect(insight).toBeVisible()
      await expect(strengthChart).toBeVisible()
      expect((await insight.boundingBox())!.y).toBeLessThan((await strengthChart.boundingBox())!.y)
      await expectNoHorizontalOverflow(insight, width)
      await clearNavigation(strengthChart)

      const strengthPicker = page.getByRole('combobox', { name: 'Ćwiczenie na wykresie' })
      await expect(strengthPicker).toBeVisible()
      expect((await strengthPicker.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      await expectNoHorizontalOverflow(strengthPicker, width)

      const heatmapPicker = page.getByRole('combobox', { name: 'Sprawdź dzień w kalendarzu' })
      await expect(heatmapPicker).toBeVisible()
      expect((await heatmapPicker.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      await expectNoHorizontalOverflow(heatmapPicker, width)
      await heatmapPicker.selectOption({ index: 1 })
      await expect(page.locator('.progress-heatmap-inspector [role="status"]')).not.toBeEmpty()

      await clearNavigation(page.locator('.progress-records'))
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
    }

    await page.screenshot({ path: 'test-results/progress-mobile.png', fullPage: true })
  })
})
