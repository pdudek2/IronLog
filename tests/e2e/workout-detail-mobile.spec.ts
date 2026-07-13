import { test, expect } from './fixtures'
import {
  cleanupWorkoutLifecycleState,
  closeWorkoutLifecycleEmulator,
  seedLifecycleWorkout,
} from './support/workoutLifecycleEmulator'

const WORKOUT_ID = 'phase-1-mobile-detail-actions'

test.beforeEach(async () => {
  await cleanupWorkoutLifecycleState()
  await seedLifecycleWorkout({
    sessionId: WORKOUT_ID,
    materialized: true,
    label: 'Phase 1 mobile detail actions',
  })
})

test.afterEach(async () => {
  await cleanupWorkoutLifecycleState()
})

test.afterAll(async () => {
  await closeWorkoutLifecycleEmulator()
})

test('mobile detail actions dock to the viewport when bottom navigation hides', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Mobile fixed-action layout only')

  await page.goto(`/workout/${WORKOUT_ID}`)
  await expect(page.getByRole('heading', { name: /Phase 1 mobile detail actions/ })).toBeVisible()

  const navigation = page.locator('nav.bottom-nav')
  const actions = page.locator('div.fixed.left-0.right-0.z-40').filter({
    has: page.getByRole('button', { name: 'Edytuj' }),
  })
  await expect(actions).toBeVisible()
  await expect(navigation).not.toHaveAttribute('aria-hidden', 'true')
  await expect.poll(async () => actions.evaluate((element) => (
    window.innerHeight - element.getBoundingClientRect().bottom
  ))).toBeGreaterThanOrEqual(100)

  await page.evaluate(() => {
    document.body.style.minHeight = '2400px'
  })
  await page.mouse.wheel(0, 700)
  await expect(navigation).toHaveAttribute('aria-hidden', 'true')

  await expect.poll(async () => actions.evaluate((element) => (
    window.innerHeight - element.getBoundingClientRect().bottom
  ))).toBeLessThanOrEqual(24)
})
