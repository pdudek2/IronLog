import { test, expect } from './fixtures'
import { expectAppReady, type AppReadyRoute } from './support/appReady'
import {
  cleanupWorkoutLifecycleState,
  closeWorkoutLifecycleEmulator,
  seedLifecycleWorkout,
} from './support/workoutLifecycleEmulator'

function monthLabel(timestamp: number): string {
  const label = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' })
    .format(timestamp)
  return label.charAt(0).toLocaleUpperCase('pl-PL') + label.slice(1)
}

test.describe('History and list workbenches', () => {
  test.beforeEach(async () => cleanupWorkoutLifecycleState())
  test.afterEach(async () => cleanupWorkoutLifecycleState())
  test.afterAll(async () => closeWorkoutLifecycleEmulator())

  test('groups seeded history by month', async ({ page }) => {
    const now = new Date()
    const current = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    const previous = new Date(now.getFullYear(), now.getMonth() - 1, 15, 12).getTime()

    await seedLifecycleWorkout({
      sessionId: 'phase-1-history-current',
      materialized: true,
      label: 'Phase 1 current month',
      startedAt: current,
    })
    await seedLifecycleWorkout({
      sessionId: 'phase-1-history-previous',
      materialized: true,
      label: 'Phase 1 previous month',
      startedAt: previous,
    })

    await page.goto('/history')
    await expectAppReady(page, '/history')
    await expect(page.getByRole('heading', { level: 2, name: new RegExp(monthLabel(current)) }))
      .toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: new RegExp(monthLabel(previous)) }))
      .toBeVisible()
  })

  test('keeps workbench routes bounded without horizontal overflow', async ({ page }, testInfo) => {
    await page.setViewportSize(testInfo.project.name === 'desktop'
      ? { width: 1440, height: 900 }
      : { width: 393, height: 852 })

    const routes: AppReadyRoute[] = ['/history', '/templates', '/exercises']
    for (const route of routes) {
      await page.goto(route)
      await expectAppReady(page, route)
      const workbench = page.locator('.workbench-page')
      await expect(workbench).toBeVisible()
      const geometry = await workbench.evaluate((element) => {
        const box = element.getBoundingClientRect()
        return {
          left: box.left,
          right: box.right,
          width: box.width,
          viewport: document.documentElement.getBoundingClientRect().width,
          documentWidth: document.documentElement.scrollWidth,
        }
      })

      expect(geometry.documentWidth).toBe(geometry.viewport)
      if (testInfo.project.name === 'desktop') {
        expect(geometry.width).toBeLessThanOrEqual(1040)
        expect(Math.abs(geometry.left - (geometry.viewport - geometry.right)))
          .toBeLessThanOrEqual(2)
      }
    }
  })
})
