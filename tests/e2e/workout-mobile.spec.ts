import { test, expect, type Locator, type Page } from './fixtures'
import { discardActiveSession } from './support/accountCleanup'
import { expectAppReady } from './support/appReady'
import {
  readCachedActiveSessionWrite,
  readLocalActiveSessionRecovery,
} from './support/firestoreBrowserBridge'

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
  expect(box!.width, `${label} width`).toBeGreaterThanOrEqual(44)
  expect(box!.height, `${label} height`).toBeGreaterThanOrEqual(44)
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

async function discardActiveSessionAfterFontsSettle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready)
  await discardActiveSession(page)
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
    await expect(confirmDialog.getByRole('button', { name: 'Wróć', exact: true })).toBeVisible()
    const confirmDiscard = confirmDialog.getByRole('button', { name: 'Odrzuć trening', exact: true })
    await expect(confirmDiscard).toBeVisible()
    await confirmDiscard.click()
    await page.waitForURL('/dashboard', { timeout: 10_000 })
    return
  }

  if (workoutState === 'empty-session') {
    await startButton.click()
    await expect(addExerciseButton).toBeVisible({ timeout: 15_000 })
    await discardButton.click()
    const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Potwierdź akcję' })
    await expect(confirmDialog).toBeVisible({ timeout: 5_000 })
    await expect(confirmDialog.getByRole('button', { name: 'Wróć', exact: true })).toBeVisible()
    const confirmDiscard = confirmDialog.getByRole('button', { name: 'Odrzuć trening', exact: true })
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
    await expect(exerciseCard.locator('.workout-exercise-meta span')).toBeVisible()

    await expect(page.getByTestId('elapsed-session-timer')).toHaveCount(1)
    await expect(page.locator('.workout-section-head')).not.toBeVisible()
    await expect(page.locator('.workout-mobile-lifecycle-bar')).toHaveCSS(
      'background-color',
      'rgb(11, 10, 12)',
    )
    const readyLayout = await page.evaluate(() => {
      const ledger = document.querySelector<HTMLElement>('.workout-exercise-ledger')
      const sessionGrid = document.querySelector<HTMLElement>('.workout-session-grid')
      return {
        ledgerHeight: ledger?.getBoundingClientRect().height,
        maxScroll: document.documentElement.scrollHeight - window.innerHeight,
        sessionGridBottomPadding: sessionGrid
          ? Number.parseFloat(window.getComputedStyle(sessionGrid).paddingBottom)
          : undefined,
      }
    })
    expect(readyLayout.ledgerHeight).toBeLessThanOrEqual(52)
    expect(readyLayout.maxScroll).toBeLessThanOrEqual(1)
    expect(readyLayout.sessionGridBottomPadding).toBeLessThanOrEqual(1)

    await page.locator('.workout-set-row').first().locator('input').nth(0).fill('60')
    await page.locator('.workout-set-row').first().locator('input').nth(1).fill('8')
    await page.getByRole('button', { name: 'Oznacz serię 1' }).click()

    await expect(page.locator('.rest-timer-bar')).toHaveCount(1)
    expect(await page.evaluate(() => (
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    ))).toBe(0)

    await page.mouse.wheel(0, 600)
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    })
    const navigation = page.getByRole('navigation', { name: 'Nawigacja dolna' })
    await expect(navigation).toBeVisible()
    await expect(navigation).not.toHaveAttribute('aria-hidden', 'true')
    await expect.poll(() => navigation.evaluate((element) => (
      element.getBoundingClientRect().bottom <= window.innerHeight
    ))).toBe(true)
    const fixedUiGeometry = await page.evaluate(() => {
      const navigation = document.querySelector<HTMLElement>('nav.bottom-nav')
      const restTimer = document.querySelector<HTMLElement>('.workout-mobile-action-bar')
      const navigationBox = navigation?.getBoundingClientRect()
      const restTimerBox = restTimer?.getBoundingClientRect()
      return {
        viewportHeight: window.innerHeight,
        navigation: navigationBox && { top: navigationBox.top, bottom: navigationBox.bottom },
        restTimer: restTimerBox && {
          top: restTimerBox.top,
          bottom: restTimerBox.bottom,
          height: restTimerBox.height,
          surfacePadding: restTimer
            ? Number.parseFloat(window.getComputedStyle(restTimer.firstElementChild as HTMLElement).padding)
            : undefined,
        },
      }
    })
    expect(fixedUiGeometry.navigation?.top).toBeGreaterThanOrEqual(0)
    expect(fixedUiGeometry.navigation?.bottom).toBeLessThanOrEqual(fixedUiGeometry.viewportHeight)
    expect(fixedUiGeometry.restTimer?.bottom).toBeLessThanOrEqual(fixedUiGeometry.navigation!.top)
    expect(fixedUiGeometry.restTimer?.height).toBeLessThanOrEqual(84)
    expect(fixedUiGeometry.restTimer?.surfacePadding).toBe(0)
    await page.setViewportSize({ width: 390, height: 844 })
    await addExercise(page, 'Bench Press')
    await addExercise(page, 'Deadlift')
    const lastWeightInput = page.locator('.workout-exercise-card').last().locator('input').first()
    await lastWeightInput.evaluate((element) => element.scrollIntoView({ block: 'center' }))
    await expectFullyInViewport(page, lastWeightInput, 'Dense-session last weight input')

  })

  test('mobile full rest timer keeps the final workout action above an opaque dock', async ({ page, cleanup }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')
    cleanup.add('discard active session', () => discardActiveSessionAfterFontsSettle(page))

    await page.setViewportSize({ width: 430, height: 932 })
    await goToFreshWorkout(page)
    await addExercise(page, 'Squat')
    await addExercise(page, 'Bench Press')

    const firstSetRow = page.locator('.workout-set-row').first()
    await firstSetRow.locator('input').nth(0).fill('60')
    await firstSetRow.locator('input').nth(1).fill('8')
    await firstSetRow.getByRole('button', { name: 'Oznacz serię 1' }).click()

    const actionBar = page.locator('.workout-mobile-action-bar')
    await expect(actionBar).toHaveAttribute('data-variant', 'full')
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await expect(page.locator('nav.bottom-nav')).toHaveAttribute('aria-hidden', 'true')
    await expect.poll(() => actionBar.evaluate(
      (element) => window.innerHeight - element.getBoundingClientRect().bottom,
    )).toBeLessThanOrEqual(24)

    const dockGeometry = await page.evaluate(() => {
      const pageShell = document.querySelector<HTMLElement>('.page-shell')
      const sessionGrid = document.querySelector<HTMLElement>('.workout-session-grid')
      const finalAction = document.querySelector<HTMLElement>('.workout-mobile-inline-add')
      const actionBar = document.querySelector<HTMLElement>('.workout-mobile-action-bar')
      const restTimer = document.querySelector<HTMLElement>('.rest-timer-bar')
      const navigation = document.querySelector<HTMLElement>('nav.bottom-nav')
      const finalActionBox = finalAction?.getBoundingClientRect()
      const actionBarBox = actionBar?.getBoundingClientRect()
      const navigationBox = navigation?.getBoundingClientRect()
      return {
        actionBarBottom: actionBarBox?.bottom,
        actionBarHeight: actionBarBox?.height,
        finalActionBottom: finalActionBox?.bottom,
        navigationHeight: navigationBox?.height,
        pageShellBottomPadding: pageShell
          ? Number.parseFloat(window.getComputedStyle(pageShell).paddingBottom)
          : undefined,
        restTimerBackground: restTimer
          ? window.getComputedStyle(restTimer).backgroundColor
          : undefined,
        restTimerTop: actionBarBox?.top,
        sessionGridBottomPadding: sessionGrid
          ? Number.parseFloat(window.getComputedStyle(sessionGrid).paddingBottom)
          : undefined,
        viewportHeight: window.innerHeight,
      }
    })

    expect(dockGeometry.restTimerBackground).toBe('rgb(11, 10, 12)')
    expect(dockGeometry.viewportHeight - dockGeometry.actionBarBottom!).toBeLessThanOrEqual(24)
    expect(dockGeometry.pageShellBottomPadding! + dockGeometry.sessionGridBottomPadding!).toBeGreaterThanOrEqual(
      dockGeometry.actionBarHeight! + dockGeometry.navigationHeight! + 16,
    )
    expect(dockGeometry.finalActionBottom).toBeLessThanOrEqual(dockGeometry.restTimerTop! - 8)
  })

  test('mobile workout keeps the compact shell and normal app navigation', async ({ page, cleanup }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')
    cleanup.add('discard active session', () => discardActiveSessionAfterFontsSettle(page))

    await page.setViewportSize({ width: 390, height: 844 })
    await goToFreshWorkout(page)

    await expect(page.locator('.top-nav')).not.toBeVisible()
    expect(await visibleCount(page.locator('.session-quick-link'))).toBe(0)
    await expect(page.getByRole('navigation', { name: 'Nawigacja dolna' })).toBeVisible()

    await addExercise(page, 'Squat')
    const expectedSession = await readLocalActiveSessionRecovery(page)
    expect(expectedSession.sessionId, 'Active session should expose its stable session ID').not.toBeNull()
    expect(expectedSession.exerciseNames).toEqual(['Squat'])
    expect(expectedSession.reps).toBe('')

    await page.getByRole('button', { name: 'Plany', exact: true }).click()
    await expect(page).toHaveURL('/templates')

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
      () => page.getByRole('button', { name: 'Usuń ćwiczenie Squat' }).count(),
      { message: 'Squat should remain in the active session after route navigation' },
    ).toBeGreaterThan(0)

  })

  test('mobile workout keeps the first set visible and a single add action after adding an exercise', async ({ page, cleanup }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')
    cleanup.add('discard active session', () => discardActiveSessionAfterFontsSettle(page))

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
    cleanup.add('discard active session', () => discardActiveSessionAfterFontsSettle(page))

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
    await expectMinHitArea(addRestButton, 'Add rest time button')
    await expectMinHitArea(skipRestButton, 'Skip rest button')
    await addRestButton.click()
    await expect(actionBar).not.toContainText(sessionTimerText)
    await expect(actionBar.getByRole('button', { name: 'Dodaj ćwiczenie', exact: true })).toHaveCount(0)

    const bottomNavigation = page.getByRole('navigation', { name: 'Nawigacja dolna' })
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      window.scrollTo(0, 0)
    })
    await expect(bottomNavigation).toBeVisible()
    const actionBarBox = await actionBar.boundingBox()
    const bottomNavigationBox = await page.locator('.bottom-nav').boundingBox()
    expect(actionBarBox, 'Rest timer should have a bounding box').not.toBeNull()
    expect(bottomNavigationBox, 'Bottom navigation should have a bounding box').not.toBeNull()
    expect(
      actionBarBox!.y + actionBarBox!.height,
      'Rest timer should end above the bottom navigation',
    ).toBeLessThanOrEqual(bottomNavigationBox!.y)

  })

  test('mobile compact rest timer scrolls only the focused workout set input', async ({ page, cleanup }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')
    cleanup.add('discard active session', () => discardActiveSessionAfterFontsSettle(page))

    await page.setViewportSize({ width: 390, height: 844 })
    await goToFreshWorkout(page)
    await addExercise(page, 'Squat')

    const initialWrite = await readCachedActiveSessionWrite(page)
    expect(initialWrite.exists, 'Active session should be present in the Firestore cache').toBe(true)
    expect(initialWrite.sessionId, 'Active session should expose its stable session ID').not.toBeNull()
    const sessionId = initialWrite.sessionId

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
    await expect(skipRestButton).toBeVisible()
    await expect(actionBar.getByRole('button', { name: 'Dodaj 30 sekund' })).toHaveCount(0)
    await expect.poll(async () => (await readScrollIntoViewCalls(page)).length).toBeGreaterThan(0)
    const focusedInputScrollCalls = await readScrollIntoViewCalls(page)
    expect(focusedInputScrollCalls).toEqual(
      expect.arrayContaining([{ tagName: 'INPUT', insideWorkoutSetRow: true }]),
    )
    expect(focusedInputScrollCalls.filter(({ tagName }) => tagName === 'BODY' || tagName === 'BUTTON')).toEqual([])

    const compactActionBarBox = await actionBar.boundingBox()
    const focusedInputBox = await weightInput.boundingBox()
    expect(compactActionBarBox, 'Compact rest timer should have a bounding box').not.toBeNull()
    expect(focusedInputBox, 'Focused workout input should have a bounding box').not.toBeNull()
    expect(focusedInputBox!.y).toBeGreaterThanOrEqual(
      compactActionBarBox!.y + compactActionBarBox!.height,
    )
    expect(focusedInputBox!.y + focusedInputBox!.height).toBeLessThanOrEqual(500)

    await weightInput.blur()
    await expect(page.locator('html')).not.toHaveAttribute('data-mobile-input-focused', '')
    await page.evaluate(() => new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()))
    }))
    await clearScrollIntoViewCalls(page)
    await setVisualViewportBottomInset(page, 120)
    await expect(actionBar).toHaveAttribute('data-variant', 'compact')
    expect(await readScrollIntoViewCalls(page)).toEqual([])

    await skipRestButton.focus()
    await setVisualViewportBottomInset(page, 121)
    expect(await readScrollIntoViewCalls(page)).toEqual([])

    await skipRestButton.blur()
    await restoreVisualViewportHeight(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(actionBar).toHaveAttribute('data-variant', 'full')
    await expect(actionBar.getByRole('button', { name: 'Dodaj 30 sekund' })).toBeVisible()

    await skipRestButton.click()
    await expect(actionBar).toHaveCount(0)

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

  test('desktop workout keeps shell chrome visible, mounts one rest timer, and preserves the remove exit contract', async ({ page, cleanup }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop-only contract')
    cleanup.add('discard active session', () => discardActiveSessionAfterFontsSettle(page))

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
