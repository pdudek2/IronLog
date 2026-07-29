import { test, expect, type Page } from './fixtures'
import { deleteTemplateByName, discardActiveSession } from './support/accountCleanup'
import { expectAppReady } from './support/appReady'
import type { BrowserDiagnostic } from './support/browserDiagnostics'
import { isExpectedFirestoreOfflineDiagnostic } from './support/offlineDiagnostics'

const REPLACE_TEMPLATE_NAME = '_E2E Launch Replace_'
const OFFLINE_TEMPLATE_NAME = '_E2E Launch Offline_'
const CLEARDOT_URL = 'https://www.google.com/images/cleardot.gif'

function isExpectedTemplateLaunchOfflineDiagnostic(entry: BrowserDiagnostic): boolean {
  if (isExpectedFirestoreOfflineDiagnostic(entry)) return true

  if (entry.kind === 'console' && (
    entry.message === '[useTemplateWorkoutLaunch] launch failed FirebaseError: Connection failed.'
    || entry.message === '[useTemplateWorkoutLaunch] launch failed FirebaseError: Failed to get document because the client is offline.'
  )) return true

  return entry.kind === 'requestfailed'
    && (entry.message === 'net::ERR_INTERNET_DISCONNECTED' || entry.message === 'csp')
    && Boolean(entry.url?.startsWith(CLEARDOT_URL))
    || entry.kind === 'console'
      && entry.message === 'Failed to load resource: net::ERR_INTERNET_DISCONNECTED'
      && Boolean(entry.url?.startsWith(CLEARDOT_URL))
    || entry.kind === 'console'
      && new RegExp(
        `^Loading the image '${CLEARDOT_URL.replaceAll('.', '\\.')}\\?[^']+' `
        + 'violates the following Content Security Policy directive: '
        + `"img-src 'self' data:". The action has been blocked\\.$`,
      ).test(entry.message)
}

function workoutExerciseRow(page: Page, exerciseName: string) {
  return page.locator('.workout-exercise-card').filter({ hasText: exerciseName }).first()
}

async function openExercisePicker(page: Page): Promise<void> {
  const addExerciseButton = page.getByRole('button', { name: 'Dodaj ćwiczenie', exact: true }).first()
  await addExerciseButton.scrollIntoViewIfNeeded()
  await expect(addExerciseButton).toBeVisible({ timeout: 15_000 })
  await expect(addExerciseButton).toBeEnabled()
  await addExerciseButton.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }))
  await addExerciseButton.click()
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
  await openExercisePicker(page)

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

  await openExercisePicker(page)

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

  test('offline launch stays retryable on the source page and preserves its target', async ({
    context,
    page,
    cleanup,
    expectedBrowserDiagnostics,
  }) => {
    test.setTimeout(60_000)

    cleanup.add('delete offline template', () => deleteTemplateByName(page, OFFLINE_TEMPLATE_NAME))
    cleanup.add('discard active session', () => discardActiveSession(page))
    await createLaunchTemplate(page, OFFLINE_TEMPLATE_NAME)

    await page.goto('/templates')
    await expectAppReady(page, '/templates')
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
    await expectAppReady(page, '/templates')
    await expect(launch).toBeVisible({ timeout: 15_000 })

    const dialog = page.getByRole('dialog').filter({ hasText: 'Zastąpić aktywną sesję?' })
    await expectedBrowserDiagnostics.during(
      'intentional offline template launch',
      isExpectedTemplateLaunchOfflineDiagnostic,
      async () => {
        try {
          await launch.click()
          await expect(dialog).toBeVisible({ timeout: 5_000 })

          await context.setOffline(true)
          await dialog.getByRole('button', { name: 'Uruchom szablon' }).click()

          const matchingCard = page.locator('article').filter({
            has: page.getByRole('heading', { name: OFFLINE_TEMPLATE_NAME, exact: true }),
          })
          await expect(matchingCard.getByRole('alert')).toHaveText(
            /Nie udało się uruchomić planu\./,
            { timeout: 15_000 },
          )
          await expect(page).toHaveURL('/templates')
        } finally {
          await context.setOffline(false)
          await page.waitForTimeout(6_000)
        }
      },
    )

    const matchingCard = page.locator('article').filter({
      has: page.getByRole('heading', { name: OFFLINE_TEMPLATE_NAME, exact: true }),
    })
    await matchingCard.getByRole('button', { name: 'Spróbuj ponownie' }).click()

    await expect(page).toHaveURL('/workout/new', { timeout: 15_000 })
    await expect(page.getByText('Squat', { exact: true }).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Bench Press', { exact: true })).toHaveCount(0)
  })
})
