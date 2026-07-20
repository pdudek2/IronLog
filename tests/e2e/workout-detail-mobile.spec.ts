import { test, expect, type Locator } from './fixtures'
import {
  cleanupWorkoutLifecycleState,
  closeWorkoutLifecycleEmulator,
  seedLifecycleWorkout,
} from './support/workoutLifecycleEmulator'

const WORKOUT_ID = 'phase-1-mobile-detail-actions'

async function countVisibleFocusableButtons(pageButtons: Locator, label: string) {
  return pageButtons.evaluateAll((buttons, expectedLabel) => buttons.filter((button) => {
    if (!(button instanceof HTMLButtonElement)) return false
    if (button.textContent?.trim() !== expectedLabel) return false

    const style = window.getComputedStyle(button)
    return button.getClientRects().length > 0
      && style.display !== 'none'
      && style.visibility !== 'hidden'
      && !button.disabled
      && button.tabIndex >= 0
  }).length, label)
}

async function actionClearanceDeltaFromCssTarget(actions: Locator) {
  return actions.evaluate((element) => {
    const probe = document.createElement('div')
    probe.style.position = 'fixed'
    probe.style.bottom = `calc(
      var(--workout-detail-bottom-nav-clearance)
      + var(--workout-detail-safe-area-clearance)
    )`
    element.append(probe)
    const targetBottom = Number.parseFloat(window.getComputedStyle(probe).bottom) || 0
    probe.remove()

    const clearance = window.innerHeight - element.getBoundingClientRect().bottom
    return Math.abs(clearance - targetBottom)
  })
}

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

test('mobile workout actions adapt between inline content and the fixed viewport dock', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Mobile adaptive-action layout only')

  await page.goto(`/workout/${WORKOUT_ID}`)
  await expect(page.getByRole('heading', { name: /Phase 1 mobile detail actions/ })).toBeVisible()

  const navigation = page.locator('nav.bottom-nav')
  const summary = page.locator('.workout-summary-panel')
  const anchor = page.locator('.workout-detail-mobile-actions-anchor')
  const actions = page.locator('.workout-detail-mobile-actions')
  const exerciseList = page.locator('.workout-exercise-list')
  const allButtons = page.locator('button')

  await expect(actions).toHaveAttribute('data-placement', 'inline')
  await expect(navigation).not.toHaveAttribute('aria-hidden', 'true')
  await expect.poll(async () => {
    const [summaryBox, actionsBox] = await Promise.all([
      summary.boundingBox(),
      actions.boundingBox(),
    ])
    if (!summaryBox || !actionsBox) return false
    return summaryBox.y + summaryBox.height <= actionsBox.y
  }).toBe(true)
  expect(await countVisibleFocusableButtons(allButtons, 'Edytuj')).toBe(1)
  expect(await countVisibleFocusableButtons(allButtons, 'Usuń trening')).toBe(1)

  await anchor.scrollIntoViewIfNeeded()
  await expect(actions).toHaveAttribute('data-placement', 'inline')
  const distancePastTop = await anchor.evaluate((element) => (
    element.getBoundingClientRect().top + 48
  ))
  await page.mouse.wheel(0, distancePastTop)
  await expect(actions).toHaveAttribute('data-placement', 'fixed')

  await page.mouse.wheel(0, -24)
  await expect(navigation).not.toHaveAttribute('aria-hidden', 'true')
  await expect(actions).toHaveAttribute('data-placement', 'fixed')
  await expect.poll(() => actionClearanceDeltaFromCssTarget(actions)).toBeLessThanOrEqual(1)
  const visibleNavClearance = await actions.evaluate((element) => (
    window.innerHeight - element.getBoundingClientRect().bottom
  ))

  await page.mouse.wheel(0, 24)
  await expect(navigation).toHaveAttribute('aria-hidden', 'true')
  await expect.poll(() => actionClearanceDeltaFromCssTarget(actions)).toBeLessThanOrEqual(1)
  const hiddenNavGeometry = await actions.evaluate((element) => {
    const probe = document.createElement('div')
    probe.style.position = 'fixed'
    probe.style.paddingBottom = 'env(safe-area-inset-bottom, 0px)'
    document.body.append(probe)
    const safeArea = Number.parseFloat(window.getComputedStyle(probe).paddingBottom) || 0
    probe.remove()

    return {
      clearance: window.innerHeight - element.getBoundingClientRect().bottom,
      computedBottom: Number.parseFloat(window.getComputedStyle(element).bottom) || 0,
      safeArea,
    }
  })
  expect(visibleNavClearance).toBeGreaterThan(hiddenNavGeometry.clearance + 80)
  expect(Math.abs(hiddenNavGeometry.clearance - hiddenNavGeometry.safeArea)).toBeLessThanOrEqual(1)
  expect(Math.abs(hiddenNavGeometry.computedBottom - hiddenNavGeometry.safeArea)).toBeLessThanOrEqual(1)
  expect(await countVisibleFocusableButtons(allButtons, 'Edytuj')).toBe(1)
  expect(await countVisibleFocusableButtons(allButtons, 'Usuń trening')).toBe(1)

  await anchor.scrollIntoViewIfNeeded()
  await expect(actions).toHaveAttribute('data-placement', 'inline')

  const finalDistancePastTop = await anchor.evaluate((element) => (
    element.getBoundingClientRect().top + 48
  ))
  await page.mouse.wheel(0, finalDistancePastTop)
  await expect(actions).toHaveAttribute('data-placement', 'fixed')
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await expect(navigation).toHaveAttribute('aria-hidden', 'true')

  await expect.poll(async () => {
    const [contentBox, actionsBox] = await Promise.all([
      exerciseList.locator('.workout-exercise-panel').last().boundingBox(),
      actions.boundingBox(),
    ])
    if (!contentBox || !actionsBox) return false
    return contentBox.y + contentBox.height <= actionsBox.y
  }).toBe(true)
})
