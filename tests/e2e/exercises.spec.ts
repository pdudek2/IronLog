import { test, expect, type Page } from './fixtures'
import { expectAppReady } from './support/appReady'

// Fixed name avoids timestamp instability across retries
const TEST_EXERCISE_NAME = '_E2E Curl Test_'

async function cleanupTestExercise(page: Page) {
  await page.goto('/exercises')
  await expectAppReady(page, '/exercises')

  await page.getByLabel('Szukaj ćwiczenia').fill(TEST_EXERCISE_NAME)

  // Find and delete the test exercise if it exists
  const deleteButton = page.getByRole('button', { name: `Usuń ćwiczenie ${TEST_EXERCISE_NAME}` })
  const hasDeleteButton = await deleteButton.waitFor({ state: 'visible', timeout: 8_000 })
    .then(() => true)
    .catch(() => false)
  if (hasDeleteButton) {
    await deleteButton.click()
    await page.getByRole('dialog').getByRole('button', { name: 'Usuń' }).click()
    await expect(page.getByText(TEST_EXERCISE_NAME, { exact: false })).not.toBeVisible({ timeout: 8_000 })
  }
}

test.describe('Exercises CRUD', () => {
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'tests/e2e/.auth/user.json' })
    const page = await ctx.newPage()
    try {
      await cleanupTestExercise(page)
    } catch {
      // Best-effort
    } finally {
      await ctx.close()
    }
  })

  test.afterAll(async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'tests/e2e/.auth/user.json' })
    const page = await ctx.newPage()
    try {
      await cleanupTestExercise(page)
    } catch {
      // Best-effort
    } finally {
      await ctx.close()
    }
  })

  test('create user exercise with valid data', async ({ page }) => {
    await page.goto('/exercises')
    await expectAppReady(page, '/exercises')

    await page.screenshot({ path: 'test-results/exercises-list.png' })

    // Open create form
    const addBtn = page.getByRole('button', { name: /Dodaj własne/i })
      .or(page.getByRole('button', { name: /Nowe ćwiczenie/i }))
      .first()
    await expect(addBtn).toBeVisible({ timeout: 5_000 })
    await addBtn.click()

    // Form should appear — check the placeholder is visible (form is open)
    await expect(page.getByPlaceholder('np. Banded Pull-apart')).toBeVisible({ timeout: 5_000 })

    // Fill name
    await page.getByPlaceholder('np. Banded Pull-apart').fill(TEST_EXERCISE_NAME)

    // Submit
    await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).click()

    // Form should close (placeholder gone)
    await expect(page.getByPlaceholder('np. Banded Pull-apart')).not.toBeVisible({ timeout: 8_000 })
    await expect(page.getByText(TEST_EXERCISE_NAME, { exact: false })).toBeVisible({ timeout: 8_000 })

    await page.screenshot({ path: 'test-results/exercises-created.png' })

  })

  test('duplicate name is prevented (BUG-07 freeze)', async ({ page }) => {
    await page.goto('/exercises')
    await expectAppReady(page, '/exercises')

    // Open create form
    const addBtn = page.getByRole('button', { name: /Dodaj własne/i })
      .or(page.getByRole('button', { name: /Nowe ćwiczenie/i }))
      .first()
    await expect(addBtn).toBeVisible()
    await addBtn.click()
    // Form is open when placeholder is visible (getByText would match multiple elements)
    await expect(page.getByPlaceholder('np. Banded Pull-apart')).toBeVisible({ timeout: 5_000 })

    // Try to create exercise with the same name as the one created above
    await page.getByPlaceholder('np. Banded Pull-apart').fill(TEST_EXERCISE_NAME)
    await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).click()

    // Should show an error message (duplicate prevention)
    await expect(page.getByText(/już istnieje|duplicate|ta nazwa|taka nazwa/i)).toBeVisible({ timeout: 8_000 })

    // Form should remain open
    // Form should remain open (placeholder still visible)
    await expect(page.getByPlaceholder('np. Banded Pull-apart')).toBeVisible()

    // Close form
    await page.getByLabel('Zamknij formularz').click()
  })

  test('edit user exercise', async ({ page }) => {
    await page.goto('/exercises')
    await expectAppReady(page, '/exercises')

    // Find test exercise card and click edit
    const editButton = page.getByRole('button', { name: `Edytuj ćwiczenie ${TEST_EXERCISE_NAME}` })
    await expect(editButton).toBeVisible({ timeout: 8_000 })
    await editButton.click()
    // Form is open when placeholder is visible
    const nameInput = page.getByPlaceholder('np. Banded Pull-apart')
    await expect(nameInput).toBeVisible({ timeout: 5_000 })
    await expect(nameInput).toHaveValue(TEST_EXERCISE_NAME)

    // Change category (verifies form works)
    await page.getByRole('combobox').first().selectOption('back')

    // Save
    await page.getByRole('button', { name: 'Zapisz zmiany' }).click()
    await expect(nameInput).not.toBeVisible({ timeout: 8_000 })

    // Exercise still visible in list
    await expect(page.getByText(TEST_EXERCISE_NAME, { exact: false })).toBeVisible()

    await page.screenshot({ path: 'test-results/exercises-edited.png' })
  })

  test('delete user exercise with confirmation', async ({ page }) => {
    await page.goto('/exercises')
    await expectAppReady(page, '/exercises')

    // Find test exercise and delete
    const deleteButton = page.getByRole('button', { name: `Usuń ćwiczenie ${TEST_EXERCISE_NAME}` })
    await expect(deleteButton).toBeVisible({ timeout: 8_000 })
    await deleteButton.click()

    // Confirm dialog
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Potwierdź akcję')).toBeVisible()

    await page.screenshot({ path: 'test-results/exercises-delete-confirm.png' })

    await page.getByRole('dialog').getByRole('button', { name: 'Usuń' }).click()

    // Exercise should be gone
    await expect(page.getByText(TEST_EXERCISE_NAME, { exact: false })).not.toBeVisible({ timeout: 8_000 })

    await page.screenshot({ path: 'test-results/exercises-deleted.png' })
  })

  test('global exercise detail page is reachable', async ({ page }) => {
    await page.goto('/exercises')
    await expectAppReady(page, '/exercises')

    // ExerciseCard uses role="button" with onClick navigation (not <a> tags).
    // The global section is identified by "Katalog globalny" heading.
    const globalSection = page.locator('section').filter({ hasText: 'Katalog globalny' })
    const firstGlobalCard = globalSection.locator('.exercise-library-row-main').first()
    await expect(firstGlobalCard).toBeVisible({ timeout: 8_000 })
    await firstGlobalCard.click()

    await expect(page).toHaveURL(/\/exercises\/global\//, { timeout: 5_000 })
    await expect(page.locator('.hero-editorial-name')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Nie udało się wczytać ćwiczenia', { exact: true })).toHaveCount(0)

    await page.screenshot({ path: 'test-results/exercises-detail.png' })

  })
})
