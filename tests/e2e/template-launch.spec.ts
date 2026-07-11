import { test, expect, type Page } from './fixtures'
import { deleteTemplateByName, discardActiveSession } from './support/accountCleanup'
import { expectAppReady } from './support/appReady'

const REPLACE_TEMPLATE_NAME = '_E2E Launch Replace_'
const OFFLINE_TEMPLATE_NAME = '_E2E Launch Offline_'

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

async function createLaunchTemplate(page: Page, templateName: string): Promise<void> {
  await page.goto('/templates/new')
  await expectAppReady(page, '/templates/new')

  await page.getByPlaceholder('np. Upper / Lower 4 dni').fill(templateName)
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
  await expect(page.getByRole('heading', { name: templateName, exact: true }).first()).toBeVisible({ timeout: 10_000 })
}

async function startFreshSessionWithExercise(page: Page, exerciseName: string): Promise<void> {
  await discardActiveSession(page)
  await page.goto('/workout/new')
  await expectAppReady(page, '/workout/new', 25_000)
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
  test('cancel keeps the current session and confirm replaces it from dashboard', async ({ page, cleanup }) => {
    cleanup.add('delete replace template', () => deleteTemplateByName(page, REPLACE_TEMPLATE_NAME))
    cleanup.add('discard active session', () => discardActiveSession(page))
    await createLaunchTemplate(page, REPLACE_TEMPLATE_NAME)

    await startFreshSessionWithExercise(page, 'Bench Press')
    await page.goto('/dashboard')

    const launch = page.getByRole('button', {
      name: `Uruchom szablon ${REPLACE_TEMPLATE_NAME}`,
    }).first()
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

  test('offline launch fails on the source page without delayed hydration after reconnect', async ({
    context,
    page,
    cleanup,
    observedContextFactory,
  }) => {
    cleanup.add('delete offline template', () => deleteTemplateByName(page, OFFLINE_TEMPLATE_NAME))
    cleanup.add('discard active session', () => discardActiveSession(page))
    await createLaunchTemplate(page, OFFLINE_TEMPLATE_NAME)

    await page.goto('/templates')
    await expect(page.getByRole('heading', { name: 'Plany.', exact: true })).toBeVisible({ timeout: 15_000 })
    const launch = page.getByRole('button', {
      name: `Uruchom szablon ${OFFLINE_TEMPLATE_NAME}`,
    }).first()
    await expect(launch).toBeVisible({ timeout: 15_000 })

    await startFreshSessionWithExercise(page, 'Bench Press')
    const bottomNav = page.getByRole('navigation', { name: 'Nawigacja dolna' })
    const topNav = page.getByRole('navigation', { name: 'Nawigacja główna' })
    const plansNav = (await bottomNav.isVisible())
      ? bottomNav.getByRole('button', { name: 'Plany', exact: true })
      : topNav.getByRole('button', { name: 'Plany', exact: true })
    await plansNav.click()
    await expect(page.getByRole('heading', { name: 'Plany.', exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(launch).toBeVisible({ timeout: 15_000 })

    const dialog = page.getByRole('dialog').filter({ hasText: 'Zastąpić aktywną sesję?' })
    try {
      await launch.click()
      await expect(dialog).toBeVisible({ timeout: 5_000 })

      await context.setOffline(true)
      await dialog.getByRole('button', { name: 'Uruchom szablon' }).click()

      await expect(page.getByText('Nie udało się uruchomić szablonu.', { exact: true })).toBeVisible({ timeout: 15_000 })
      await expect(page).toHaveURL('/templates')
    } finally {
      await context.setOffline(false)
      await page.waitForTimeout(6_000)

      const verifyContext = await observedContextFactory.newContext({
        storageState: await context.storageState(),
      })
      const verifyPage = await verifyContext.newPage()
      await verifyPage.goto('/workout/new')
      await expectAppReady(verifyPage, '/workout/new', 25_000)
      await expect(verifyPage.getByText('Bench Press', { exact: true }).first()).toBeVisible({ timeout: 15_000 })
      await expect(verifyPage.getByText('Squat', { exact: true })).toHaveCount(0)
    }
  })
})
