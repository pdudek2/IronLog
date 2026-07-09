import { test, expect, type Locator, type Page } from '@playwright/test'

async function waitForWorkoutState(page: Page): Promise<void> {
  await Promise.race([
    page.getByRole('button', { name: 'Odrzuć i zacznij od nowa' }).waitFor({ state: 'visible', timeout: 25_000 }),
    page.getByRole('button', { name: 'Anuluj', exact: true }).first().waitFor({ state: 'visible', timeout: 25_000 }),
    page.getByRole('button', { name: 'Rozpocznij nową sesję' }).waitFor({ state: 'visible', timeout: 25_000 }),
    page.getByRole('button', { name: 'Dodaj ćwiczenie', exact: true }).first().waitFor({ state: 'visible', timeout: 25_000 }),
  ])
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

async function discardSessionIfPresent(page: Page): Promise<void> {
  await page.goto('/workout/new')
  await expect(page).toHaveURL('/workout/new')
  await expect(page.locator('.page-shell')).toBeVisible({ timeout: 25_000 })

  await waitForWorkoutState(page)

  const staleDiscardButton = page.getByRole('button', { name: 'Odrzuć i zacznij od nowa' })
  const discardButton = page.getByRole('button', { name: 'Anuluj', exact: true }).first()
  const startButton = page.getByRole('button', { name: 'Rozpocznij nową sesję' })
  const addExerciseButton = page.getByRole('button', { name: 'Dodaj ćwiczenie', exact: true }).first()

  if (await staleDiscardButton.isVisible()) {
    await staleDiscardButton.click()
    await expect(addExerciseButton).toBeVisible({ timeout: 15_000 })
    return
  }

  if (await discardButton.isVisible()) {
    await discardButton.click()
    const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Potwierdź akcję' })
    await expect(confirmDialog).toBeVisible({ timeout: 5_000 })
    await confirmDialog.getByRole('button', { name: 'Anuluj trening' }).click()
    await page.waitForURL('/dashboard', { timeout: 10_000 })
    return
  }

  if (await startButton.isVisible()) {
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
  await expect(page).toHaveURL('/workout/new')
  await expect(page.locator('.page-shell')).toBeVisible({ timeout: 25_000 })
  await waitForWorkoutState(page)

  const startButton = page.getByRole('button', { name: 'Rozpocznij nową sesję' })
  if (await startButton.isVisible({ timeout: 1_500 }).catch(() => false)) {
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
  test('mobile workout mounts a single elapsed timer and a single rest timer', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')

    await page.setViewportSize({ width: 390, height: 844 })
    await goToFreshWorkout(page)
    await addExercise(page, 'Squat')

    await expect(page.getByTestId('elapsed-session-timer')).toHaveCount(1)

    await page.locator('.workout-set-row').first().locator('input').nth(0).fill('60')
    await page.locator('.workout-set-row').first().locator('input').nth(1).fill('8')
    await page.getByRole('button', { name: 'Oznacz serię 1' }).click()

    await expect(page.locator('.rest-timer-bar')).toHaveCount(1)

    await discardSessionIfPresent(page)
  })

  test('mobile workout removes duplicate shell controls in the empty state', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')

    await page.setViewportSize({ width: 390, height: 844 })
    await goToFreshWorkout(page)

    await expect(page.locator('.top-nav')).not.toBeVisible()
    expect(await visibleCount(page.locator('.session-quick-link'))).toBe(0)
    expect(await visibleCount(page.getByRole('button', { name: 'Dodaj ćwiczenie', exact: true }))).toBe(1)

    await discardSessionIfPresent(page)
  })

  test('mobile workout keeps the first set visible and a single add action after adding an exercise', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')

    await page.setViewportSize({ width: 390, height: 844 })
    await goToFreshWorkout(page)

    await addExercise(page, 'Squat')

    expect(await visibleCount(page.getByRole('button', { name: 'Dodaj ćwiczenie', exact: true }))).toBe(1)
    await expect(page.locator('.workout-set-row').first()).toBeVisible()
    await expectFullyInViewport(page, page.locator('.workout-set-row').first().locator('input').nth(0), 'First weight input')
    await expectFullyInViewport(page, page.locator('.workout-set-row').first().locator('input').nth(1), 'First reps input')

    await discardSessionIfPresent(page)
  })

  test('mobile workout shows steppers only for the focused incomplete set and keeps controls tappable', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')

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
    await expectFullyInViewport(page, page.locator('.workout-set-row').first().locator('input').nth(0), 'First weight input during rest')
    await expectFullyInViewport(page, page.locator('.workout-set-row').first().locator('input').nth(1), 'First reps input during rest')
    await expectMinHitArea(addRestButton, 'Add rest time button')
    await expectMinHitArea(skipRestButton, 'Skip rest button')
    await skipRestButton.click()
    await expect(actionBar).toHaveCount(0)

    await discardSessionIfPresent(page)
  })

  test('desktop workout keeps shell chrome visible, mounts one rest timer, and preserves the remove exit contract', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop-only contract')

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

    await discardSessionIfPresent(page)
  })
})
