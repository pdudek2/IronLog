import { test, expect, type Locator, type Page } from './fixtures'
import { discardActiveSession } from './support/accountCleanup'
import { expectAppReady } from './support/appReady'

type WorkoutTerminalState = 'stale-session' | 'active-session' | 'empty-session' | 'ready-workout'

async function getWorkoutState(page: Page): Promise<WorkoutTerminalState | null> {
  const states: Array<[WorkoutTerminalState, Locator]> = [
    ['stale-session', page.getByRole('button', { name: 'Odrzuć i zacznij od nowa' })],
    ['active-session', page.getByRole('button', { name: 'Anuluj', exact: true }).first()],
    ['empty-session', page.getByRole('button', { name: 'Rozpocznij nową sesję' })],
    ['ready-workout', page.getByRole('button', { name: 'Dodaj ćwiczenie', exact: true }).first()],
  ]

  for (const [state, locator] of states) {
    if (await locator.isVisible().catch(() => false)) {
      return state
    }
  }

  return null
}

async function waitForWorkoutState(page: Page, timeout = 25_000): Promise<WorkoutTerminalState> {
  await expect.poll(
    async () => getWorkoutState(page),
    {
      timeout,
      message: 'Workout page did not reach any terminal ready state',
    },
  ).not.toBeNull()

  const state = await getWorkoutState(page)
  expect(state, 'Workout page should expose a terminal ready state after polling').not.toBeNull()
  return state
}

async function visibleCount(locator: Locator): Promise<number> {
  return locator.evaluateAll((elements) => elements.filter((element) => {
    const node = element as HTMLElement
    const rect = node.getBoundingClientRect()
    const style = window.getComputedStyle(node)
    return rect.width > 0
      && rect.height > 0
      && style.display !== 'none'
      && style.visibility !== 'hidden'
  }).length)
}

async function expectMinHitArea(locator: Locator, label: string) {
  const box = await locator.boundingBox()
  expect(box, `${label} should be visible`).not.toBeNull()
  expect(Math.round(box!.width), `${label} width`).toBeGreaterThanOrEqual(44)
  expect(Math.round(box!.height), `${label} height`).toBeGreaterThanOrEqual(44)
}

async function expectFullyInViewport(page: Page, locator: Locator, label: string) {
  const box = await locator.boundingBox()
  const viewport = page.viewportSize()
  expect(box, `${label} should be visible`).not.toBeNull()
  expect(viewport, 'Viewport should be available').not.toBeNull()
  expect(box!.x, `${label} left edge`).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width, `${label} right edge`).toBeLessThanOrEqual(viewport!.width)

  const lifecycleBar = page.locator('.workout-mobile-lifecycle-bar')
  const restSurface = page.locator('.workout-mobile-action-bar')
  let visibleTop = 0
  let visibleBottom = viewport!.height

  if (await lifecycleBar.isVisible().catch(() => false)) {
    const lifecycleBox = await lifecycleBar.boundingBox()
    expect(lifecycleBox, 'Lifecycle bar should have a bounding box when visible').not.toBeNull()
    visibleTop = Math.max(visibleTop, Math.ceil(lifecycleBox!.y + lifecycleBox!.height))
  }

  if (await restSurface.isVisible().catch(() => false)) {
    const restSurfaceBox = await restSurface.boundingBox()
    expect(restSurfaceBox, 'Rest surface should have a bounding box when visible').not.toBeNull()
    visibleBottom = Math.min(visibleBottom, Math.floor(restSurfaceBox!.y))
  }

  expect(box!.y, `${label} top edge`).toBeGreaterThanOrEqual(visibleTop)
  expect(box!.y + box!.height, `${label} bottom edge`).toBeLessThanOrEqual(visibleBottom)
}

interface ScrollIntoViewCall {
  tagName: string
  insideWorkoutSetRow: boolean
}

async function installScrollIntoViewSpy(page: Page): Promise<void> {
  await page.evaluate(() => {
    const testWindow = window as typeof window & { __workoutScrollIntoViewCalls: ScrollIntoViewCall[] }
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    testWindow.__workoutScrollIntoViewCalls = []
    HTMLElement.prototype.scrollIntoView = function (options?: boolean | ScrollIntoViewOptions) {
      testWindow.__workoutScrollIntoViewCalls.push({
        tagName: this.tagName,
        insideWorkoutSetRow: this.matches('.workout-focus-shell .workout-set-row input'),
      })
      originalScrollIntoView.call(this, options)
    }
  })
}

async function readScrollIntoViewCalls(page: Page): Promise<ScrollIntoViewCall[]> {
  return page.evaluate(() => (
    window as typeof window & { __workoutScrollIntoViewCalls: ScrollIntoViewCall[] }
  ).__workoutScrollIntoViewCalls)
}

async function clearScrollIntoViewCalls(page: Page): Promise<void> {
  await page.evaluate(() => {
    const testWindow = window as typeof window & { __workoutScrollIntoViewCalls: ScrollIntoViewCall[] }
    testWindow.__workoutScrollIntoViewCalls = []
  })
}

async function setVisualViewportBottomInset(page: Page, bottomInset: number): Promise<void> {
  await page.evaluate((inset) => {
    const viewport = window.visualViewport
    if (!viewport) throw new Error('visualViewport is required for this mobile contract')
    Object.defineProperty(viewport, 'height', {
      configurable: true,
      value: window.innerHeight - inset,
    })
    window.dispatchEvent(new Event('resize'))
    viewport.dispatchEvent(new Event('resize'))
  }, bottomInset)
  await page.evaluate(() => new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()))
  }))
}

async function restoreVisualViewportHeight(page: Page): Promise<void> {
  await page.evaluate(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    Reflect.deleteProperty(viewport, 'height')
    window.dispatchEvent(new Event('resize'))
    viewport.dispatchEvent(new Event('resize'))
  })
}

async function discardSessionIfPresent(page: Page): Promise<void> {
  await page.goto('/workout/new')
  await expectAppReady(page, '/workout/new', 25_000)

  const workoutState = await waitForWorkoutState(page)

  const staleDiscardButton = page.getByRole('button', { name: 'Odrzuć i zacznij od nowa' })
  const discardButton = page.getByRole('button', { name: 'Anuluj', exact: true }).first()
  const startButton = page.getByRole('button', { name: 'Rozpocznij nową sesję' })
  const addExerciseButton = page.getByRole('button', { name: 'Dodaj ćwiczenie', exact: true }).first()

  if (workoutState === 'stale-session') {
    await staleDiscardButton.click()
    await expect(addExerciseButton).toBeVisible({ timeout: 15_000 })
    return
  }

  if (workoutState === 'active-session') {
    await discardButton.click()
    const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Potwierdź akcję' })
    await expect(confirmDialog).toBeVisible({ timeout: 5_000 })
    await confirmDialog.getByRole('button', { name: 'Anuluj trening' }).click()
    await page.waitForURL('/dashboard', { timeout: 10_000 })
    return
  }

  if (workoutState === 'empty-session') {
    await startButton.click()
    await expect(addExerciseButton).toBeVisible({ timeout: 15_000 })
    await discardButton.click()
    const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Potwierdź akcję' })
    await expect(confirmDialog).toBeVisible({ timeout: 5_000 })
    await confirmDialog.getByRole('button', { name: 'Anuluj trening' }).click()
    await page.waitForURL('/dashboard', { timeout: 10_000 })
  }
}

async function goToFreshWorkout(page: Page): Promise<void> {
  await discardSessionIfPresent(page)
  await page.goto('/workout/new')
  await expectAppReady(page, '/workout/new', 25_000)
  const workoutState = await waitForWorkoutState(page)

  const startButton = page.getByRole('button', { name: 'Rozpocznij nową sesję' })
  if (workoutState === 'empty-session') {
    await startButton.click()
  }

  await expect(page.getByRole('button', { name: 'Dodaj ćwiczenie', exact: true }).first()).toBeVisible({ timeout: 15_000 })
}

async function addExercise(page: Page, search: string): Promise<void> {
  await page.getByRole('button', { name: 'Dodaj ćwiczenie', exact: true }).first().click()
  const picker = page.getByRole('dialog', { name: /Wybierz ćwiczenie/i })
  await expect(picker).toBeVisible({ timeout: 5_000 })
  await page.getByPlaceholder('Szukaj ćwiczenia...').fill(search)
  const result = picker.locator('button').filter({ hasText: new RegExp(search, 'i') }).first()
  await expect(result).toBeVisible({ timeout: 5_000 })
  await result.click()
  await expect(picker).not.toBeVisible({ timeout: 5_000 })
}

test.describe('Active workout shell reduction', () => {
  test.describe.configure({ timeout: 45_000 })

  test('mobile workout mounts a single elapsed timer and a single rest timer', async ({ page, cleanup }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')
    cleanup.add('discard active session', () => discardActiveSession(page))

    await page.setViewportSize({ width: 390, height: 844 })
    await goToFreshWorkout(page)
    await addExercise(page, 'Squat')

    await expect(page.getByTestId('elapsed-session-timer')).toHaveCount(1)

    await page.locator('.workout-set-row').first().locator('input').nth(0).fill('60')
    await page.locator('.workout-set-row').first().locator('input').nth(1).fill('8')
    await page.getByRole('button', { name: 'Oznacz serię 1' }).click()

    await expect(page.locator('.rest-timer-bar')).toHaveCount(1)

  })

  test('mobile workout keeps the compact shell and normal app navigation', async ({ page, cleanup }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')
    cleanup.add('discard active session', () => discardActiveSession(page))

    await page.setViewportSize({ width: 390, height: 844 })
    await goToFreshWorkout(page)

    await expect(page.locator('.top-nav')).not.toBeVisible()
    expect(await visibleCount(page.locator('.session-quick-link'))).toBe(0)
    await expect(page.getByRole('navigation', { name: 'Nawigacja dolna' })).toBeVisible()

    await addExercise(page, 'Squat')
    await page.getByRole('button', { name: 'Plany', exact: true }).click()
    await expect(page).toHaveURL('/templates')

    await page.goto('/workout/new')
    await expect.poll(
      () => page.getByRole('button', { name: 'Usuń ćwiczenie Squat' }).count(),
      { message: 'Squat should remain in the active session after route navigation' },
    ).toBeGreaterThan(0)

  })

  test('mobile workout keeps the first set visible and a single add action after adding an exercise', async ({ page, cleanup }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')
    cleanup.add('discard active session', () => discardActiveSession(page))

    await page.setViewportSize({ width: 390, height: 844 })
    await goToFreshWorkout(page)

    await addExercise(page, 'Squat')

    expect(await visibleCount(page.getByRole('button', { name: 'Dodaj ćwiczenie', exact: true }))).toBe(1)
    await expect(page.locator('.workout-set-row').first()).toBeVisible()
    await expectFullyInViewport(page, page.locator('.workout-set-row').first().locator('input').nth(0), 'First weight input')
    await expectFullyInViewport(page, page.locator('.workout-set-row').first().locator('input').nth(1), 'First reps input')

  })

  test('mobile workout shows steppers only for the focused incomplete set and keeps controls tappable', async ({ page, cleanup }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')
    cleanup.add('discard active session', () => discardActiveSession(page))

    await page.setViewportSize({ width: 390, height: 844 })
    await goToFreshWorkout(page)

    await addExercise(page, 'Squat')

    const doneButton = page.getByRole('button', { name: 'Oznacz serię 1' })
    const removeSetButton = page.getByRole('button', { name: 'Usuń serię 1' })
    const actionBar = page.locator('.workout-mobile-action-bar')

    await expectMinHitArea(doneButton, 'Done button')
    await expectMinHitArea(removeSetButton, 'Remove set button')
    await expect(actionBar).toHaveCount(0)

    await expect(page.getByRole('button', { name: /Dodaj serię/i })).toBeVisible()
    await page.getByRole('button', { name: /Dodaj serię/i }).click()

    const visibleStepperRows = page.locator('.set-stepper-row:visible')
    await expect(visibleStepperRows).toHaveCount(1)

    const visibleStepperButtons = page.locator('.set-stepper-row:visible .set-stepper-btn')
    await expect(visibleStepperButtons).toHaveCount(4)

    for (const [index, label] of ['Weight down stepper', 'Weight up stepper', 'Reps down stepper', 'Reps up stepper'].entries()) {
      await expectMinHitArea(visibleStepperButtons.nth(index), label)
    }

    await page.locator('.workout-set-row').first().locator('input').nth(0).fill('60')
    await page.locator('.workout-set-row').first().locator('input').nth(1).fill('8')
    await doneButton.click()

    const sessionTimerText = await page.locator('.workout-mobile-lifecycle-bar .tabular-nums').innerText()
    const addRestButton = actionBar.getByRole('button', { name: 'Dodaj 30 sekund' })
    const skipRestButton = actionBar.getByRole('button', { name: 'Pomiń przerwę' })
    await expect(actionBar).toBeVisible()
    await expect(addRestButton).toBeVisible()
    await expect(skipRestButton).toBeVisible()
    await expect(actionBar).not.toContainText(sessionTimerText)
    await expect(actionBar.getByRole('button', { name: 'Dodaj ćwiczenie', exact: true })).toHaveCount(0)

    const bottomNavigation = page.getByRole('navigation', { name: 'Nawigacja dolna' })
    const actionBarBox = await actionBar.boundingBox()
    const bottomNavigationBox = await bottomNavigation.boundingBox()
    expect(actionBarBox, 'Rest timer should have a bounding box').not.toBeNull()
    expect(bottomNavigationBox, 'Bottom navigation should have a bounding box').not.toBeNull()
    expect(
      Math.round(actionBarBox!.y + actionBarBox!.height),
      'Rest timer should end above the bottom navigation',
    ).toBeLessThanOrEqual(Math.round(bottomNavigationBox!.y))

    await expectFullyInViewport(page, page.locator('.workout-set-row').first().locator('input').nth(0), 'First weight input during rest')
    await expectFullyInViewport(page, page.locator('.workout-set-row').first().locator('input').nth(1), 'First reps input during rest')
    await expectMinHitArea(addRestButton, 'Add rest time button')
    await expectMinHitArea(skipRestButton, 'Skip rest button')

    const weightInput = page.locator('.workout-set-row').first().locator('input').nth(0)
    await weightInput.focus()
    await page.setViewportSize({ width: 390, height: 500 })
    await expect(actionBar).toHaveAttribute('data-variant', 'compact')
    await expect(actionBar.getByRole('button', { name: 'Dodaj 30 sekund' })).toHaveCount(0)
    await expect(actionBar.getByRole('button', { name: 'Pomiń przerwę' })).toBeVisible()

    const compactBox = await actionBar.boundingBox()
    const inputBox = await weightInput.boundingBox()
    expect(compactBox).not.toBeNull()
    expect(inputBox).not.toBeNull()
    expect(inputBox!.y).toBeGreaterThanOrEqual(compactBox!.y + compactBox!.height)
    expect(inputBox!.y + inputBox!.height).toBeLessThanOrEqual(500)

    await weightInput.blur()
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(actionBar).toHaveAttribute('data-variant', 'full')
    await expect(actionBar.getByRole('button', { name: 'Dodaj 30 sekund' })).toBeVisible()

    await skipRestButton.click()
    await expect(actionBar).toHaveCount(0)

  })

  test('mobile compact rest timer scrolls only the focused workout set input', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')

    await page.setViewportSize({ width: 390, height: 844 })
    await goToFreshWorkout(page)
    await addExercise(page, 'Squat')

    const firstSetRow = page.locator('.workout-set-row').first()
    const weightInput = firstSetRow.locator('input').nth(0)
    await weightInput.fill('60')
    await firstSetRow.locator('input').nth(1).fill('8')
    await firstSetRow.getByRole('button', { name: 'Oznacz serię 1' }).click()

    const actionBar = page.locator('.workout-mobile-action-bar')
    const skipRestButton = actionBar.getByRole('button', { name: 'Pomiń przerwę' })
    await expect(actionBar).toHaveAttribute('data-variant', 'full')
    await installScrollIntoViewSpy(page)

    await weightInput.focus()
    await page.setViewportSize({ width: 390, height: 500 })
    await expect(actionBar).toHaveAttribute('data-variant', 'compact')
    await expect.poll(async () => (await readScrollIntoViewCalls(page)).length).toBeGreaterThan(0)
    expect(await readScrollIntoViewCalls(page)).toEqual(
      expect.arrayContaining([{ tagName: 'INPUT', insideWorkoutSetRow: true }]),
    )

    await clearScrollIntoViewCalls(page)
    await weightInput.blur()
    await setVisualViewportBottomInset(page, 120)
    await expect(actionBar).toHaveAttribute('data-variant', 'compact')
    expect(await readScrollIntoViewCalls(page)).toEqual([])

    await skipRestButton.focus()
    await setVisualViewportBottomInset(page, 121)
    expect(await readScrollIntoViewCalls(page)).toEqual([])

    await skipRestButton.blur()
    await restoreVisualViewportHeight(page)
    await page.setViewportSize({ width: 390, height: 844 })

    await page.getByRole('button', { name: 'Anuluj', exact: true }).first().click()
    const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Potwierdź akcję' })
    await expect(confirmDialog).toBeVisible()
    await confirmDialog.getByRole('button', { name: 'Anuluj trening' }).click()
    await expectAppReady(page, '/dashboard')
  })

  test('desktop workout keeps shell chrome visible, mounts one rest timer, and preserves the remove exit contract', async ({ page, cleanup }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop-only contract')
    cleanup.add('discard active session', () => discardActiveSession(page))

    await goToFreshWorkout(page)

    await expect(page.getByTestId('elapsed-session-timer')).toHaveCount(1)
    await expect(page.locator('.top-nav')).toBeVisible()
    await expect(page.locator('aside .workout-control-panel')).toBeVisible()
    await expect(page.locator('.workout-session-hero')).toBeVisible()

    await addExercise(page, 'Squat')

    const firstSetRow = page.locator('.workout-set-row').first()
    await firstSetRow.locator('input').nth(0).fill('60')
    await firstSetRow.locator('input').nth(1).fill('8')
    await firstSetRow.getByRole('button', { name: 'Oznacz serię 1' }).click()

    const restTimerBar = page.locator('.rest-timer-bar')
    await expect(restTimerBar).toHaveCount(1)
    await page.getByRole('button', { name: 'Pomiń przerwę' }).click()
    await expect(restTimerBar).toHaveCount(0)

    const removeExerciseButton = page.getByRole('button', { name: 'Usuń ćwiczenie Squat' })
    await removeExerciseButton.click()

    const confirmDialog = page.getByRole('dialog').filter({ hasText: 'To usunie ćwiczenie wraz z wpisanymi seriami z aktywnej sesji.' })
    await expect(confirmDialog).toBeVisible({ timeout: 5_000 })
    await confirmDialog.getByRole('button', { name: 'Usuń ćwiczenie' }).click()

    await expect(removeExerciseButton).toHaveCount(1)
    await expect(removeExerciseButton).toHaveCount(0)
    await expect(page.locator('.workout-empty-card')).toBeVisible()

  })
})
