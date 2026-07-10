import { test, expect, type Page } from '@playwright/test'

const LAUNCH_TEMPLATE_NAME = '_E2E Launch Contract_'

function workoutExerciseRow(page: Page, exerciseName: string) {
  return page.locator('.workout-exercise-card').filter({ hasText: exerciseName }).first()
}

async function waitForWorkoutState(page: Page): Promise<void> {
  await Promise.race([
    page.getByRole('button', { name: 'Odrzuć i zacznij od nowa' }).waitFor({ state: 'visible', timeout: 25_000 }),
    page.getByRole('button', { name: 'Anuluj', exact: true }).first().waitFor({ state: 'visible', timeout: 25_000 }),
    page.getByRole('button', { name: 'Rozpocznij nową sesję' }).waitFor({ state: 'visible', timeout: 25_000 }),
    page.getByRole('button', { name: 'Dodaj ćwiczenie', exact: true }).first().waitFor({ state: 'visible', timeout: 25_000 }),
  ])
}

async function discardActiveSession(page: Page): Promise<void> {
  await page.goto('/workout/new')
  await expect(page).toHaveURL('/workout/new')
  await expect(page.locator('.page-shell')).toBeVisible({ timeout: 25_000 })
  await waitForWorkoutState(page)

  const staleDiscardButton = page.getByRole('button', { name: 'Odrzuć i zacznij od nowa' })
  const discardButton = page.getByRole('button', { name: 'Anuluj', exact: true }).first()
  const addExerciseButton = page.getByRole('button', { name: 'Dodaj ćwiczenie', exact: true }).first()

  if (await staleDiscardButton.isVisible()) {
    await staleDiscardButton.click()
    await expect(addExerciseButton).toBeVisible({ timeout: 15_000 })
    await expect(discardButton).toBeVisible({ timeout: 15_000 })
  }

  if (await discardButton.isVisible()) {
    await discardButton.click()
    const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Potwierdź akcję' })
    await expect(confirmDialog).toBeVisible({ timeout: 5_000 })
    await confirmDialog.getByRole('button', { name: 'Anuluj trening' }).click()
    await page.waitForURL('/dashboard', { timeout: 10_000 })
  }
}

async function cleanupLaunchTemplate(page: Page): Promise<void> {
  await page.goto('/templates')
  await expect(page.getByRole('heading', { name: 'Plany.', exact: true })).toBeVisible({ timeout: 15_000 })

  const deleteButtons = page.getByRole('button', {
    name: `Usuń szablon ${LAUNCH_TEMPLATE_NAME}`,
  })

  while (await deleteButtons.count()) {
    const initialCount = await deleteButtons.count()
    await deleteButtons.first().click()
    await page.getByRole('dialog').getByRole('button', { name: 'Usuń' }).click()
    await expect(deleteButtons).toHaveCount(initialCount - 1, { timeout: 8_000 })
  }
}

async function createLaunchTemplate(page: Page): Promise<void> {
  await page.goto('/templates/new')
  await expect(page).toHaveURL('/templates/new')
  await expect(page.locator('.page-shell')).toBeVisible({ timeout: 15_000 })

  await page.getByPlaceholder('np. Upper / Lower 4 dni').fill(LAUNCH_TEMPLATE_NAME)
  await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).first().click()

  const picker = page.getByRole('dialog', { name: /Wybierz ćwiczenie/i })
  await expect(picker).toBeVisible({ timeout: 5_000 })
  await page.getByPlaceholder('Szukaj ćwiczenia...').fill('Squat')
  const squat = picker.locator('button').filter({ hasText: /squat/i }).first()
  await expect(squat).toBeVisible({ timeout: 5_000 })
  await squat.click()
  await expect(picker).not.toBeVisible({ timeout: 5_000 })

  await page.getByRole('button', { name: 'Zapisz szablon' }).click()
  await page.waitForURL('/templates', { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: LAUNCH_TEMPLATE_NAME, exact: true }).first()).toBeVisible({ timeout: 10_000 })
}

async function startFreshSessionWithExercise(page: Page, exerciseName: string): Promise<void> {
  await discardActiveSession(page)
  await page.goto('/workout/new')
  await expect(page).toHaveURL('/workout/new')
  await expect(page.locator('.page-shell')).toBeVisible({ timeout: 25_000 })
  await waitForWorkoutState(page)

  const startButton = page.getByRole('button', { name: 'Rozpocznij nową sesję' })
  if (await startButton.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await startButton.click()
  }

  const addExerciseButton = page.getByRole('button', { name: 'Dodaj ćwiczenie', exact: true }).first()
  await expect(addExerciseButton).toBeVisible({ timeout: 15_000 })
  await addExerciseButton.click()

  const picker = page.getByRole('dialog', { name: /Wybierz ćwiczenie/i })
  await expect(picker).toBeVisible({ timeout: 5_000 })
  await page.getByPlaceholder('Szukaj ćwiczenia...').fill(exerciseName)
  const exercise = picker.locator('button').filter({ hasText: new RegExp(exerciseName, 'i') }).first()
  await expect(exercise).toBeVisible({ timeout: 5_000 })
  await exercise.click()
  await expect(picker).not.toBeVisible({ timeout: 5_000 })
  await expect(workoutExerciseRow(page, exerciseName)).toBeVisible({ timeout: 8_000 })

  // Wait for the active-session debounce and Firestore write before leaving the page.
  await page.waitForTimeout(3_000)
}

test.describe('Template launch contract', () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'tests/e2e/.auth/user.json' })
    const page = await context.newPage()

    try {
      await cleanupLaunchTemplate(page)
      await discardActiveSession(page)
      await createLaunchTemplate(page)
    } finally {
      await context.close()
    }
  })

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'tests/e2e/.auth/user.json' })
    const page = await context.newPage()

    try {
      await discardActiveSession(page)
      await cleanupLaunchTemplate(page)
    } finally {
      await context.close()
    }
  })

  test('cancel keeps the current session and confirm replaces it from dashboard', async ({ page }) => {
    await startFreshSessionWithExercise(page, 'Bench Press')
    await page.goto('/dashboard')

    const launch = page.getByRole('button', {
      name: `Uruchom szablon ${LAUNCH_TEMPLATE_NAME}`,
    })
    await expect(launch).toBeVisible({ timeout: 15_000 })
    await launch.click()

    const dialog = page.getByRole('dialog').filter({ hasText: 'Zastąpić aktywną sesję?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Zostaw obecną' }).click()

    await page.goto('/workout/new')
    await expect(page.getByText('Bench Press', { exact: true }).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Squat', { exact: true })).toHaveCount(0)

    await page.goto('/dashboard')
    await launch.click()
    await dialog.getByRole('button', { name: 'Uruchom szablon' }).click()

    await expect(page).toHaveURL('/workout/new', { timeout: 10_000 })
    await expect(page.getByText('Squat', { exact: true }).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Bench Press', { exact: true })).toHaveCount(0)
  })
})
