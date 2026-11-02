import { test, expect, type Locator, type Page } from './fixtures'
import { discardActiveSession, openWorkoutDiscardDialog } from './support/accountCleanup'
import { expectAppReady } from './support/appReady'
import { openExercisePicker } from './support/workoutActions'
import {
  readCachedActiveSessionWrite,
  readLocalActiveSessionRecovery,
} from './support/firestoreBrowserBridge'

type WorkoutTerminalState = 'stale-session' | 'active-session' | 'empty-session' | 'ready-workout'

async function getWorkoutState(page: Page): Promise<WorkoutTerminalState | null> {
  const states: Array<[WorkoutTerminalState, Locator]> = [
    ['stale-session', page.getByRole('button', { name: 'Discard and start again' })],
    ['active-session', page.getByRole('button', { name: 'Finish', exact: true }).first()],
    ['empty-session', page.getByRole('button', { name: 'Start a new session' })],
    ['ready-workout', page.getByRole('button', { name: 'Add exercise', exact: true }).first()],
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
  if (!state) throw new Error('Workout page should expose a terminal ready state after polling')
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

function currentSetPanel(page: Page): Locator {
  return page.getByRole('region', { name: 'Current set' })
}

async function fillCurrentSet(page: Page, weight: string, reps: string): Promise<void> {
  const panel = currentSetPanel(page)
  await panel.getByRole('spinbutton', { name: /^Weight,/ }).fill(weight)
  await panel.getByRole('spinbutton', { name: /^Reps,/ }).fill(reps)
}

async function expectMinHitArea(locator: Locator, label: string) {
  const box = await locator.boundingBox()
  expect(box, `${label} should be visible`).not.toBeNull()
  expect(Math.round(box!.width * 100) / 100, `${label} width`).toBeGreaterThanOrEqual(44)
  expect(Math.round(box!.height * 100) / 100, `${label} height`).toBeGreaterThanOrEqual(44)
}

async function expectFullyInViewport(page: Page, locator: Locator, label: string) {
  const box = await locator.boundingBox()
  const viewport = page.viewportSize()
  expect(box, `${label} should be visible`).not.toBeNull()
  expect(viewport, 'Viewport should be available').not.toBeNull()
  expect(box!.x, `${label} left edge`).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width, `${label} right edge`).toBeLessThanOrEqual(viewport!.width)

  const lifecycleBar = page.locator('.workout-mobile-lifecycle-bar')
  const panel = page.locator('.workout-set-panel')
  const insidePanel = await locator.evaluate((element) => element.closest('.workout-set-panel') !== null)
  let visibleTop = 0
  let visibleBottom = viewport!.height

  if (await lifecycleBar.isVisible().catch(() => false)) {
    const lifecycleBox = await lifecycleBar.boundingBox()
    expect(lifecycleBox, 'Lifecycle bar should have a bounding box when visible').not.toBeNull()
    visibleTop = Math.max(visibleTop, Math.ceil(lifecycleBox!.y + lifecycleBox!.height))
  }

  if (!insidePanel && await panel.isVisible().catch(() => false)) {
    const panelBox = await panel.boundingBox()
    expect(panelBox, 'Set panel should have a bounding box when visible').not.toBeNull()
    visibleBottom = Math.min(visibleBottom, Math.floor(panelBox!.y))
  }

  expect(box!.y, `${label} top edge`).toBeGreaterThanOrEqual(visibleTop)
  expect(box!.y + box!.height, `${label} bottom edge`).toBeLessThanOrEqual(visibleBottom)
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

async function discardActiveSessionAfterFontsSettle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready)
  await discardActiveSession(page)
}

async function discardSessionIfPresent(page: Page): Promise<void> {
  await page.goto('/workout/new')
  await expectAppReady(page, '/workout/new', 25_000)

  const workoutState = await waitForWorkoutState(page)

  const staleDiscardButton = page.getByRole('button', { name: 'Discard and start again' })
  const startButton = page.getByRole('button', { name: 'Start a new session' })
  const addExerciseButton = page.getByRole('button', { name: 'Add exercise', exact: true }).first()

  if (workoutState === 'stale-session') {
    await staleDiscardButton.click()
    await expect(addExerciseButton).toBeVisible({ timeout: 15_000 })
    return
  }

  if (workoutState === 'active-session') {
    const confirmDialog = await openWorkoutDiscardDialog(page)
    await expect(confirmDialog.getByRole('button', { name: 'Back', exact: true })).toBeVisible()
    const confirmDiscard = confirmDialog.getByRole('button', { name: 'Discard workout', exact: true })
    await expect(confirmDiscard).toBeVisible()
    await confirmDiscard.click()
    await page.waitForURL('/dashboard', { timeout: 10_000 })
    return
  }

  if (workoutState === 'empty-session') {
    await startButton.click()
    await expect(addExerciseButton).toBeVisible({ timeout: 15_000 })
    const confirmDialog = await openWorkoutDiscardDialog(page)
    await expect(confirmDialog.getByRole('button', { name: 'Back', exact: true })).toBeVisible()
    const confirmDiscard = confirmDialog.getByRole('button', { name: 'Discard workout', exact: true })
    await expect(confirmDiscard).toBeVisible()
    await confirmDiscard.click()
    await page.waitForURL('/dashboard', { timeout: 10_000 })
  }
}

async function goToFreshWorkout(page: Page): Promise<void> {
  await discardSessionIfPresent(page)
  await page.goto('/workout/new')
  await expectAppReady(page, '/workout/new', 25_000)
  const workoutState = await waitForWorkoutState(page)

  const startButton = page.getByRole('button', { name: 'Start a new session' })
  if (workoutState === 'empty-session') {
    await startButton.click()
  }

  await expect(page.getByRole('button', { name: 'Add exercise', exact: true }).first()).toBeVisible({ timeout: 15_000 })
}

async function addExercise(page: Page, search: string): Promise<void> {
  await openExercisePicker(page)
  const picker = page.getByRole('dialog', { name: 'Add exercise' })
  await expect(picker).toBeVisible({ timeout: 5_000 })
  await page.getByPlaceholder('Search exercises').fill(search)
  const result = picker.locator('button').filter({ hasText: new RegExp(search, 'i') }).first()
  await expect(result).toBeVisible({ timeout: 5_000 })
  await result.click()
  await expect(picker).not.toBeVisible({ timeout: 5_000 })
  await expect(page.getByRole('dialog', { name: 'Add exercise' })).toHaveCount(0, { timeout: 5_000 })
  await expect(page.locator('.bottom-sheet')).toHaveCount(0, { timeout: 5_000 })
}

test.describe('Active workout shell reduction', () => {
  test.describe.configure({ timeout: 45_000 })

  test('keeps active workout operational labels at 12px or larger', async ({ page, cleanup }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only typography contract')
    cleanup.add('discard active session', () => discardActiveSessionAfterFontsSettle(page))
    await page.setViewportSize({ width: 320, height: 844 })
    await goToFreshWorkout(page)
    await addExercise(page, 'Squat')

    const labels = page.locator('.workout-set-header span, .workout-set-previous, .workout-set-num small')
    expect(await labels.count()).toBeGreaterThan(0)
    for (const label of await labels.all()) {
      const size = await label.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))
      expect(size).toBeGreaterThanOrEqual(12)
    }
  })

  test('mobile workout mounts a single elapsed timer and a single rest timer', async ({ page, cleanup }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')
    cleanup.add('discard active session', () => discardActiveSessionAfterFontsSettle(page))

    await page.setViewportSize({ width: 430, height: 932 })
    await goToFreshWorkout(page)
    await addExercise(page, 'Squat')

    const exerciseCard = page.locator('.workout-exercise-card').first()
    const exerciseIndicatorLayout = await exerciseCard.evaluate((card) => {
      const cardBox = card.getBoundingClientRect()
      const headerBox = card.querySelector<HTMLElement>('.workout-exercise-head')?.getBoundingClientRect()
      return {
        sideIndicator: window.getComputedStyle(card, '::before').content,
        headerInset: headerBox ? headerBox.left - cardBox.left : undefined,
      }
    })
    expect(exerciseIndicatorLayout.sideIndicator).toBe('none')
    expect(exerciseIndicatorLayout.headerInset).toBeLessThanOrEqual(1)
    await expect(exerciseCard.locator('.workout-exercise-meta')).toBeVisible()

    await expect(page.getByTestId('elapsed-session-timer')).toHaveCount(1)
    await expect(page.locator('.workout-mobile-lifecycle-bar')).toHaveCSS(
      'background-color',
      'rgb(13, 11, 10)',
    )
    const readyLayout = await page.evaluate(() => {
      const sessionGrid = document.querySelector<HTMLElement>('.workout-session-grid')
      return {
        maxScroll: document.documentElement.scrollHeight - window.innerHeight,
        sessionGridBottomPadding: sessionGrid
          ? Number.parseFloat(window.getComputedStyle(sessionGrid).paddingBottom)
          : undefined,
      }
    })
    expect(readyLayout.maxScroll).toBeLessThanOrEqual(1)
    expect(readyLayout.sessionGridBottomPadding).toBeLessThanOrEqual(1)

    await fillCurrentSet(page, '60', '8')
    await page.getByRole('button', { name: 'Mark set 1 for Squat' }).click()

    await expect(page.locator('.rest-timer-bar')).toHaveCount(1)
    await expect(currentSetPanel(page).locator('.rest-timer-bar')).toHaveCount(1)
    expect(await page.evaluate(() => (
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    ))).toBe(0)

    await page.mouse.wheel(0, 600)
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    })
    await expect(page.locator('nav.bottom-nav')).toHaveAttribute('aria-hidden', 'true')
    const fixedUiGeometry = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('.workout-set-panel')
      const restTimer = document.querySelector<HTMLElement>('.rest-timer-bar')
      return {
        viewportHeight: window.innerHeight,
        panelBottom: panel?.getBoundingClientRect().bottom,
        restTimerHeight: restTimer?.getBoundingClientRect().height,
        restTimerPadding: restTimer
          ? Number.parseFloat(window.getComputedStyle(restTimer).padding)
          : undefined,
      }
    })
    expect(fixedUiGeometry.panelBottom).toBeLessThanOrEqual(fixedUiGeometry.viewportHeight)
    expect(fixedUiGeometry.restTimerHeight).toBeLessThanOrEqual(84)
    expect(fixedUiGeometry.restTimerPadding).toBe(0)
    await page.setViewportSize({ width: 390, height: 844 })
    await addExercise(page, 'Bench Press')
    const onlyCard = page.locator('.workout-exercise-card')
    await expect(onlyCard).toHaveCount(1)
    await expect(onlyCard).toContainText('Bench Press')
    await expect(page.getByRole('dialog', { name: 'Add exercise' })).toHaveCount(0)

    await page.getByRole('button', { name: /^Exercise 2 of 2/ }).click()
    await page.getByRole('dialog', { name: 'This workout' }).getByRole('button', { name: /^Squat/ }).click()
    await expect(onlyCard).toHaveCount(1)
    await expect(onlyCard).toContainText('Squat')
    await expect(page.getByRole('region', { name: 'Up next' }).getByRole('button')).toHaveCount(1)

    await currentSetPanel(page).getByRole('button', { name: 'Go to Bench Press' }).click()
    await expect(onlyCard).toContainText('Bench Press')
    await expect(currentSetPanel(page).getByRole('button', { name: /^Log set 1 for Bench Press/ })).toBeVisible()
  })

  test('mobile full rest timer keeps the final workout action above an opaque dock', async ({ page, cleanup }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')
    cleanup.add('discard active session', () => discardActiveSessionAfterFontsSettle(page))

    await page.setViewportSize({ width: 430, height: 932 })
    await goToFreshWorkout(page)
    await addExercise(page, 'Squat')

    // A second set keeps the panel at full height: rest timer, inputs and Log set.
    await page.getByRole('button', { name: /Add set/i }).click()
    await fillCurrentSet(page, '60', '8')
    await page.getByRole('button', { name: 'Mark set 1 for Squat' }).click()

    const restTimer = currentSetPanel(page).locator('.rest-timer-bar')
    await expect(restTimer).toBeVisible({ timeout: 10_000 })
    await expect(restTimer).toHaveAttribute('data-variant', 'full')
    await expect(currentSetPanel(page).getByRole('button', { name: 'Log set 2 for Squat' })).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await expect(page.locator('nav.bottom-nav')).toHaveAttribute('aria-hidden', 'true')

    const dockGeometry = await page.evaluate(() => {
      const bottomPadding = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector)
        return element ? Number.parseFloat(window.getComputedStyle(element).paddingBottom) : 0
      }
      const finalAction = document.querySelector<HTMLElement>('.workout-add-set')
      const panel = document.querySelector<HTMLElement>('.workout-set-panel')
      const finalActionBox = finalAction?.getBoundingClientRect()
      const panelBox = panel?.getBoundingClientRect()
      return {
        contentBottomPadding: bottomPadding('.page-shell')
          + bottomPadding('.workout-session-grid')
          + bottomPadding('.workout-session-list'),
        finalActionBottom: finalActionBox?.bottom,
        panelBackground: panel ? window.getComputedStyle(panel).backgroundImage : undefined,
        panelBottom: panelBox?.bottom,
        panelHeight: panelBox?.height,
        panelTop: panelBox?.top,
        viewportHeight: window.innerHeight,
      }
    })

    expect(dockGeometry.panelBackground).not.toBe('none')
    expect(dockGeometry.panelBackground).not.toMatch(/rgba|transparent/)
    expect(dockGeometry.panelBottom).toBeLessThanOrEqual(dockGeometry.viewportHeight)
    expect(dockGeometry.contentBottomPadding).toBeGreaterThanOrEqual(dockGeometry.panelHeight! + 16)
    expect(dockGeometry.finalActionBottom).toBeLessThanOrEqual(dockGeometry.panelTop! - 8)
  })

  test('mobile workout keeps the compact shell and leaves through Minimize', async ({ page, cleanup }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')
    cleanup.add('discard active session', () => discardActiveSessionAfterFontsSettle(page))

    await page.setViewportSize({ width: 390, height: 844 })
    await goToFreshWorkout(page)

    await expect(page.locator('.top-nav')).not.toBeVisible()
    await expect(page.locator('nav.bottom-nav')).toHaveAttribute('aria-hidden', 'true')

    await addExercise(page, 'Squat')
    const expectedSession = await readLocalActiveSessionRecovery(page)
    expect(expectedSession.sessionId, 'Active session should expose its stable session ID').not.toBeNull()
    expect(expectedSession.exerciseNames).toEqual(['Squat'])
    expect(expectedSession.reps).toBe('')

    await page.getByRole('button', { name: 'Minimize workout' }).click()
    await expect(page).toHaveURL('/dashboard')

    await expect.poll(
      () => readCachedActiveSessionWrite(page),
      {
        timeout: 20_000,
        message: 'Ordinary app navigation should flush the active-session snapshot',
      },
    ).toEqual({
      exists: true,
      hasPendingWrites: false,
      ...expectedSession,
    })

    await page.goto('/workout/new')
    await expect.poll(
      () => page.getByRole('button', { name: 'Remove exercise Squat' }).count(),
      { message: 'Squat should remain in the active session after route navigation' },
    ).toBeGreaterThan(0)

  })

  test('mobile keeps workout discard in the overflow menu', async ({ page, cleanup }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')
    cleanup.add('discard active session', () => discardActiveSessionAfterFontsSettle(page))

    await page.setViewportSize({ width: 390, height: 844 })
    await goToFreshWorkout(page)

    const lifecycleBar = page.locator('.workout-mobile-lifecycle-bar')
    await expect(lifecycleBar.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0)

    const optionsButton = lifecycleBar.getByRole('button', { name: 'More workout options' })
    await expect(optionsButton).toBeVisible()
    await expectMinHitArea(optionsButton, 'Workout options')
    await optionsButton.click()

    const sheet = page.getByRole('dialog', { name: 'Workout options' })
    await expect(sheet).toBeVisible()
    const discardItem = sheet.getByRole('button', { name: 'Discard workout' })
    await expect(discardItem).toHaveCSS('color', 'rgb(240, 167, 90)')
    await discardItem.click()
    const dialog = page.getByRole('dialog', { name: 'Discard workout?' })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })

  test('mobile workout keeps the first set and its panel visible after adding an exercise', async ({ page, cleanup }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')
    cleanup.add('discard active session', () => discardActiveSessionAfterFontsSettle(page))

    await page.setViewportSize({ width: 390, height: 844 })
    await goToFreshWorkout(page)

    await addExercise(page, 'Squat')

    expect(await visibleCount(page.getByRole('button', { name: 'Add exercise', exact: true }))).toBe(0)
    await expect(page.locator('.workout-set-row').first()).toBeVisible()
    await expectFullyInViewport(page, page.locator('.workout-set-row[data-current] .workout-set-today'), 'First set row')
    const panel = currentSetPanel(page)
    await expectFullyInViewport(page, panel.getByRole('spinbutton', { name: 'Weight, Squat, set 1, kg' }), 'First weight input')
    await expectFullyInViewport(page, panel.getByRole('spinbutton', { name: 'Reps, Squat, set 1' }), 'First reps input')
    await expectFullyInViewport(page, panel.getByRole('button', { name: 'Log set 1 for Squat' }), 'Log set button')

  })

  test('mobile workout protects populated sets without slowing empty-set removal', async ({ page, cleanup }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')
    cleanup.add('discard active session', () => discardActiveSessionAfterFontsSettle(page))

    await page.setViewportSize({ width: 390, height: 844 })
    await goToFreshWorkout(page)
    await addExercise(page, 'Squat')

    const setRows = page.locator('.workout-set-row')
    await page.getByRole('button', { name: /Add set/i }).click()
    await expect(setRows).toHaveCount(2)

    await page.getByRole('button', { name: 'Remove set 2' }).click()
    await expect(setRows).toHaveCount(1)
    await expect(page.getByRole('dialog', { name: 'Remove set?' })).toHaveCount(0)

    const populatedSet = setRows.first()
    await fillCurrentSet(page, '60', '8')
    await populatedSet.getByRole('button', { name: 'Remove set 1' }).click()

    const confirmDialog = page.getByRole('dialog', { name: 'Remove set?' })
    await expect(confirmDialog).toBeVisible()
    await expect(setRows).toHaveCount(1)
    await confirmDialog.getByRole('button', { name: 'Keep' }).click()
    await expect(confirmDialog).toHaveCount(0)
    await expect(setRows).toHaveCount(1)

    await populatedSet.getByRole('button', { name: 'Remove set 1' }).click()
    await expect(confirmDialog).toBeVisible()
    await confirmDialog.getByRole('button', { name: 'Remove set' }).click()
    await expect(setRows).toHaveCount(0)
  })

  test('mobile workout shows steppers only for the focused incomplete set and keeps controls tappable', async ({ page, cleanup }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')
    cleanup.add('discard active session', () => discardActiveSessionAfterFontsSettle(page))

    await page.setViewportSize({ width: 390, height: 844 })
    await goToFreshWorkout(page)

    await addExercise(page, 'Squat')

    const doneButton = page.getByRole('button', { name: 'Mark set 1 for Squat' })
    const removeSetButton = page.getByRole('button', { name: 'Remove set 1' })
    const panel = currentSetPanel(page)
    const restTimer = page.locator('.rest-timer-bar')

    await expectMinHitArea(doneButton, 'Done button')
    await expectMinHitArea(removeSetButton, 'Remove set button')
    await expect(restTimer).toHaveCount(0)

    await expect(page.getByRole('button', { name: /Add set/i })).toBeVisible()
    await page.getByRole('button', { name: /Add set/i }).click()

    await expect(page.locator('.workout-set-row[data-current]')).toHaveCount(1)
    await expect(page.locator('.workout-set-row input')).toHaveCount(0)
    await expect(panel.getByRole('spinbutton')).toHaveCount(2)

    const steppers = panel.locator('.workout-set-step')
    await expect(steppers).toHaveCount(4)
    for (const label of ['Adjust weight by -2.5', 'Adjust weight by 2.5', 'Adjust reps by -1', 'Adjust reps by 1']) {
      await expectMinHitArea(panel.getByRole('button', { name: label, exact: true }), label)
    }

    await page.getByRole('button', { name: 'More workout options' }).click()
    const options = page.getByRole('dialog', { name: 'Workout options' })
    await options.locator('.workout-label-chips > button').first().click()
    const activeLabel = options.locator('.workout-label-chips > button[aria-pressed="true"]')
    await expect(activeLabel).toHaveCount(1)
    await expect(activeLabel).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(activeLabel).toHaveCSS('border-radius', '0px')
    await options.getByRole('button', { name: 'Close' }).click()
    await expect(options).toHaveCount(0)

    await fillCurrentSet(page, '60', '8')
    const weightInput = panel.getByRole('spinbutton', { name: 'Weight, Squat, set 1, kg' })
    const repsInput = panel.getByRole('spinbutton', { name: 'Reps, Squat, set 1' })
    await panel.getByRole('button', { name: 'Adjust weight by 2.5', exact: true }).click()
    await expect(weightInput).toHaveValue('62.5')
    await panel.getByRole('button', { name: 'Adjust weight by -2.5', exact: true }).click()
    await expect(weightInput).toHaveValue('60')
    await panel.getByRole('button', { name: 'Adjust reps by 1', exact: true }).click()
    await expect(repsInput).toHaveValue('9')
    await panel.getByRole('button', { name: 'Adjust reps by -1', exact: true }).click()
    await expect(repsInput).toHaveValue('8')
    await panel.getByRole('button', { name: 'Log set 1 for Squat' }).click()
    await expect(page.getByRole('button', { name: 'Unmark set 1 for Squat' })).toHaveCSS('color', 'rgb(239, 231, 220)')

    const sessionTimerText = await page.locator('.workout-mobile-lifecycle-bar .tabular-nums').innerText()
    const addRestButton = panel.getByRole('button', { name: 'Add 30 seconds' })
    const skipRestButton = panel.getByRole('button', { name: 'Skip rest' })
    await expect(restTimer).toBeVisible()
    await expect(addRestButton).toHaveText('+30 s')
    await expect(skipRestButton).toHaveText('Skip')
    await expectMinHitArea(addRestButton, 'Add rest time button')
    await expectMinHitArea(skipRestButton, 'Skip rest button')
    await addRestButton.click()
    await expect(restTimer).not.toContainText(sessionTimerText)
    await expect(panel.getByRole('button', { name: 'Add exercise', exact: true })).toHaveCount(0)

    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      window.scrollTo(0, 0)
    })
    await expect(page.locator('nav.bottom-nav')).toHaveAttribute('aria-hidden', 'true')
    const panelBox = await panel.boundingBox()
    expect(panelBox, 'Set panel should have a bounding box').not.toBeNull()
    expect(
      panelBox!.y + panelBox!.height,
      'Set panel should end inside the viewport',
    ).toBeLessThanOrEqual(page.viewportSize()!.height)

    await expect.poll(
      () => readCachedActiveSessionWrite(page),
      { timeout: 20_000 },
    ).toMatchObject({
      exists: true,
      hasPendingWrites: false,
      exerciseNames: ['Squat'],
      reps: '8',
    })

    const undoButton = panel.getByRole('button', { name: 'Undo set 1' })
    await expectMinHitArea(undoButton, 'Undo set button')
    await undoButton.click()
    await expect(doneButton).toBeVisible()
    await expect(restTimer).toHaveCount(0)
    await expect(panel.getByRole('button', { name: 'Log set 1 for Squat' })).toBeVisible()
  })

  test('mobile rest timer compacts with the viewport and keeps the logged set', async ({ page, cleanup }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')
    cleanup.add('discard active session', () => discardActiveSessionAfterFontsSettle(page))

    await page.setViewportSize({ width: 390, height: 844 })
    await goToFreshWorkout(page)
    await addExercise(page, 'Squat')

    const initialWrite = await readCachedActiveSessionWrite(page)
    expect(initialWrite.exists, 'Active session should be present in the Firestore cache').toBe(true)
    expect(initialWrite.sessionId, 'Active session should expose its stable session ID').not.toBeNull()
    const sessionId = initialWrite.sessionId

    // A second set keeps the panel at full height.
    await page.getByRole('button', { name: /Add set/i }).click()
    const firstSetRow = page.locator('.workout-set-row').first()
    await fillCurrentSet(page, '60', '8')
    await firstSetRow.getByRole('button', { name: 'Mark set 1 for Squat' }).click()

    const panel = currentSetPanel(page)
    const restTimer = panel.locator('.rest-timer-bar')
    const skipRestButton = restTimer.getByRole('button', { name: 'Skip rest' })
    await expect(restTimer).toHaveAttribute('data-variant', 'full')

    const weightInput = panel.getByRole('spinbutton', { name: /^Weight,/ })
    await weightInput.focus()
    await page.setViewportSize({ width: 390, height: 500 })
    await expect(restTimer).toHaveAttribute('data-variant', 'compact')
    await expect(skipRestButton).toBeVisible()
    await expect(restTimer.getByRole('button', { name: 'Add 30 seconds' })).toHaveCount(0)
    await weightInput.blur()

    await expect(page.locator('html')).not.toHaveAttribute('data-mobile-input-focused', '')
    await page.evaluate(() => new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()))
    }))
    await setVisualViewportBottomInset(page, 120)
    await expect(restTimer).toHaveAttribute('data-variant', 'compact')
    await restoreVisualViewportHeight(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(restTimer).toHaveAttribute('data-variant', 'full')
    await expect(restTimer.getByRole('button', { name: 'Add 30 seconds' })).toBeVisible()

    await skipRestButton.click()
    await expect(restTimer).toHaveCount(0)

    await expect.poll(
      () => readCachedActiveSessionWrite(page),
      { timeout: 20_000 },
    ).toEqual({
      exists: true,
      hasPendingWrites: false,
      sessionId,
      exerciseNames: ['Squat'],
      reps: '8',
    })
  })

  test('mobile keyboard keeps the current set input and Log set above it', async ({ page, cleanup }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')
    cleanup.add('discard active session', () => discardActiveSessionAfterFontsSettle(page))

    await page.setViewportSize({ width: 390, height: 844 })
    await goToFreshWorkout(page)
    await addExercise(page, 'Squat')

    const panel = currentSetPanel(page)
    const weightInput = panel.getByRole('spinbutton', { name: 'Weight, Squat, set 1, kg' })
    await weightInput.focus()
    await setVisualViewportBottomInset(page, 300)

    // Fails until .workout-set-panel follows --mobile-viewport-bottom-inset, as the old rest bar did.
    const keyboardTop = 844 - 300
    await expect.poll(async () => {
      const box = await panel.getByRole('button', { name: 'Log set 1 for Squat' }).boundingBox()
      return box ? box.y + box.height : Number.POSITIVE_INFINITY
    }).toBeLessThanOrEqual(keyboardTop)
    const inputBox = await weightInput.boundingBox()
    expect(inputBox!.y + inputBox!.height).toBeLessThanOrEqual(keyboardTop)

    await restoreVisualViewportHeight(page)
  })

  test('desktop workout keeps shell chrome visible, mounts one rest timer, and preserves the remove exit contract', async ({ page, cleanup }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop-only contract')
    cleanup.add('discard active session', () => discardActiveSessionAfterFontsSettle(page))

    await goToFreshWorkout(page)

    await expect(page.getByTestId('elapsed-session-timer')).toHaveCount(1)
    await expect(page.locator('.top-nav')).toBeVisible()
    await expect(page.locator('.workout-desktop-bar')).toBeVisible()

    await addExercise(page, 'Squat')
    await page.getByRole('button', { name: /Add set/i }).click()
    const inlinePanel = page.locator('.workout-set-row[data-current="true"] + div').getByRole('region', { name: 'Current set' })
    await expect(inlinePanel).toBeVisible()

    await fillCurrentSet(page, '60', '8')
    await page.getByRole('button', { name: 'Log set 1 for Squat' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.workout-set-row').nth(1)).toHaveAttribute('data-current', 'true')
    await expect(inlinePanel).toBeVisible()
    await expect(page.getByRole('button', { name: 'Log set 2 for Squat' })).toBeFocused()

    const restTimerBar = page.locator('.rest-timer-bar')
    await expect(restTimerBar).toHaveCount(1)
    await expect(page.locator('.workout-set-list .rest-timer-bar')).toHaveCount(1)
    await page.getByRole('button', { name: 'More workout options' }).click()
    await expect(page.locator('.workout-options-summary')).toContainText('1/2 sets')
    await expect(page.locator('.workout-options-summary')).toContainText('heaviest 60 kg')
    await page.getByRole('button', { name: 'Close' }).click()
    await page.getByRole('button', { name: 'Skip rest' }).click()
    await expect(restTimerBar).toHaveCount(0)

    const removeExerciseButton = page.getByRole('button', { name: 'Remove exercise Squat' })
    await removeExerciseButton.click()

    const confirmDialog = page.getByRole('dialog').filter({ hasText: 'This will remove the exercise and its sets from the active session.' })
    await expect(confirmDialog).toBeVisible({ timeout: 5_000 })
    await confirmDialog.getByRole('button', { name: 'Remove exercise' }).click()

    await expect(removeExerciseButton).toHaveCount(1)
    await expect(removeExerciseButton).toHaveCount(0)
    const emptyState = page.locator('.workout-empty-state')
    await expect(emptyState).toBeVisible()
    await expect(page.locator('.workout-empty-rhythm')).toHaveCount(0)

    const emptyStyle = await emptyState.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        background: style.backgroundColor,
        borderLeft: style.borderLeftWidth,
        borderRight: style.borderRightWidth,
        radius: style.borderTopLeftRadius,
      }
    })

    expect(emptyStyle).toEqual({
      background: 'rgba(0, 0, 0, 0)',
      borderLeft: '0px',
      borderRight: '0px',
      radius: '0px',
    })

  })
})
