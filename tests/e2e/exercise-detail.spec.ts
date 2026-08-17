import { test, expect } from './fixtures'
import {
  cleanupExerciseDetailEmulatorState,
  closeProgressEmulator,
  PROGRESS_DETAIL_EXERCISE_ID,
  seedExerciseDetailEmulatorState,
} from './support/progressEmulator'

const emulatorMode = process.env.E2E_BACKEND === 'emulator'

test.describe('Exercise detail analytics', () => {
  test.beforeEach(async ({ cleanup }) => {
    if (!emulatorMode) return

    cleanup.add('remove Phase 7 exercise detail state', cleanupExerciseDetailEmulatorState)
    await cleanupExerciseDetailEmulatorState()
    await seedExerciseDetailEmulatorState()
  })

  test.afterAll(async () => {
    if (emulatorMode) await closeProgressEmulator()
  })

  test('keeps explicit volume values and the semantic chart readable on desktop and mobile', async ({ page }, testInfo) => {
    test.skip(!emulatorMode, 'emulator-only deterministic fixture')

    const widths = testInfo.project.name === 'mobile' ? [320, 393] : [1440]
    for (const width of widths) {
      await page.setViewportSize({ width, height: testInfo.project.name === 'mobile' ? 844 : 900 })
      await page.goto(`/exercises/user/${PROGRESS_DETAIL_EXERCISE_ID}`)
      await expect(page.getByRole('heading', { name: 'Phase 7 Volume Detail' })).toBeVisible({ timeout: 15_000 })

      const summary = page.locator('.exercise-detail-volume-summary')
      await expect(summary.getByText('Ostatnio', { exact: true })).toBeVisible()
      await expect(summary.getByText('Maksimum', { exact: true })).toBeVisible()
      await expect(summary.locator('strong')).toHaveText(['1.2k kg', '1.4k kg'])

      const chart = page.locator('.exercise-detail-volume-chart')
      await expect(chart).toBeVisible()
      await expect(chart).toHaveAttribute('role', 'list')
      const chartBox = await chart.boundingBox()
      expect(chartBox, `expected chart geometry at ${width}px`).not.toBeNull()
      expect(chartBox!.height).toBeGreaterThanOrEqual(144)
      expect(chartBox!.x).toBeGreaterThanOrEqual(0)
      expect(chartBox!.x + chartBox!.width).toBeLessThanOrEqual(width + 1)
      expect(await chart.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
    }
  })
})
