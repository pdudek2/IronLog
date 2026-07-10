import { test, expect, type Page } from '@playwright/test'

// Fixed name avoids timestamp instability across retries
const TEST_TEMPLATE_NAME = '_E2E Szablon Test_'

async function waitForTemplatesPageReady(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Plany.', exact: true })).toBeVisible({ timeout: 15_000 })
}

async function cleanupTestTemplate(page: Page) {
  await page.goto('/templates')
  await waitForTemplatesPageReady(page)

  const deleteButtons = page.getByRole('button', {
    name: `Usuń szablon ${TEST_TEMPLATE_NAME}`,
  })

  while (await deleteButtons.count()) {
    const initialCount = await deleteButtons.count()
    await deleteButtons.first().click()
    await page.getByRole('dialog').getByRole('button', { name: 'Usuń' }).click()
    await expect(deleteButtons).toHaveCount(initialCount - 1, { timeout: 8_000 })
  }
}

async function discardActiveSession(page: Page): Promise<void> {
  await page.goto('/workout/new')
  await expect(page).toHaveURL('/workout/new')
  await expect(page.locator('.page-shell')).toBeVisible({ timeout: 25_000 })

  const staleDiscardButton = page.getByRole('button', { name: 'Odrzuć i zacznij od nowa' })
  const discardButton = page.getByRole('button', { name: 'Anuluj', exact: true }).first()
  const startButton = page.getByRole('button', { name: 'Rozpocznij nową sesję' })
  const addExerciseButton = page.getByRole('button', { name: 'Dodaj ćwiczenie', exact: true }).first()

  await Promise.race([
    staleDiscardButton.waitFor({ state: 'visible', timeout: 25_000 }),
    discardButton.waitFor({ state: 'visible', timeout: 25_000 }),
    startButton.waitFor({ state: 'visible', timeout: 25_000 }),
    addExerciseButton.waitFor({ state: 'visible', timeout: 25_000 }),
  ])

  if (await staleDiscardButton.isVisible()) {
    await staleDiscardButton.click()
    await expect(addExerciseButton).toBeVisible({ timeout: 15_000 })
  } else if (await startButton.isVisible()) {
    await startButton.click()
    await expect(addExerciseButton).toBeVisible({ timeout: 15_000 })
  }

  if (await discardButton.isVisible()) {
    await discardButton.click()
    const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Potwierdź akcję' })
    await expect(confirmDialog).toBeVisible({ timeout: 5_000 })
    await confirmDialog.getByRole('button', { name: 'Anuluj trening' }).click()
    await page.waitForURL('/dashboard', { timeout: 10_000 })
  } else {
    await expect(startButton).toBeVisible({ timeout: 5_000 })
  }
}

test.describe('Templates CRUD', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async ({ browser }) => {
    // Clean up any leftover test template from previous runs
    const ctx = await browser.newContext({ storageState: 'tests/e2e/.auth/user.json' })
    const page = await ctx.newPage()
    try {
      await cleanupTestTemplate(page)
    } catch {
      // Best-effort
    } finally {
      await ctx.close()
    }
  })

  test.afterAll(async ({ browser }) => {
    // Ensure cleanup even if lifecycle assertions were skipped or failed.
    const ctx = await browser.newContext({ storageState: 'tests/e2e/.auth/user.json' })
    const page = await ctx.newPage()
    try {
      try {
        await discardActiveSession(page)
      } catch {
        // Best-effort
      } finally {
        try {
          await cleanupTestTemplate(page)
        } catch {
          // Best-effort
        }
      }
    } finally {
      await ctx.close()
    }
  })

  test('create a template', async ({ page }) => {
    await page.goto('/templates/new')
    await expect(page).toHaveURL('/templates/new')
    await expect(page.locator('.page-shell')).toBeVisible({ timeout: 10_000 })

    // Fill template name
    await page.getByPlaceholder('np. Upper / Lower 4 dni').fill(TEST_TEMPLATE_NAME)

    // Add at least one exercise — required by form validation
    await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).first().click()
    await expect(page.getByRole('dialog', { name: /Wybierz ćwiczenie/i })).toBeVisible({ timeout: 5_000 })
    await page.getByPlaceholder('Szukaj ćwiczenia...').fill('Squat')
    const firstResult = page.getByRole('dialog').locator('button').filter({ hasText: /squat/i }).first()
    await expect(firstResult).toBeVisible({ timeout: 5_000 })
    await firstResult.click()
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 })

    await page.screenshot({ path: 'test-results/templates-editor.png' })

    // Save — button type=submit inside <form>
    await page.getByRole('button', { name: 'Zapisz szablon' }).click()

    // Wait for redirect to EXACTLY /templates (not /templates/new or /templates/:id/edit)
    await page.waitForURL('/templates', { timeout: 15_000 })
    await expect(page).toHaveURL('/templates')
    await waitForTemplatesPageReady(page)

    // Template should appear in the list
    await expect(page.getByRole('heading', { name: TEST_TEMPLATE_NAME, exact: true }).first()).toBeVisible({ timeout: 10_000 })

    await page.screenshot({ path: 'test-results/templates-created.png' })
  })

  test('edit a template', async ({ page }) => {
    await page.goto('/templates')
    await waitForTemplatesPageReady(page)
    await expect(page.getByRole('heading', { name: TEST_TEMPLATE_NAME, exact: true }).first()).toBeVisible({ timeout: 8_000 })

    // Edit button uses onClick navigate() — not an <a> tag
    const editLink = page.getByRole('button', { name: new RegExp(`Edytuj szablon ${TEST_TEMPLATE_NAME}`, 'i') }).first()
    await expect(editLink).toBeVisible({ timeout: 5_000 })
    await editLink.click()

    await expect(page).toHaveURL(/\/templates\/.*\/edit/, { timeout: 5_000 })
    await expect(page.locator('.page-shell')).toBeVisible({ timeout: 10_000 })

    // Verify template name is loaded in editor
    await expect(page.getByPlaceholder('np. Upper / Lower 4 dni')).toHaveValue(TEST_TEMPLATE_NAME)

    // Save without changes (just verify it works)
    await page.getByRole('button', { name: 'Zapisz zmiany' }).click()

    await page.waitForURL('/templates', { timeout: 10_000 })
    await expect(page).toHaveURL('/templates')

    await page.screenshot({ path: 'test-results/templates-edited.png' })
  })

  test('start workout from the created template', async ({ page }) => {
    await discardActiveSession(page)
    await page.goto('/templates')
    await waitForTemplatesPageReady(page)
    await expect(page.getByRole('heading', { name: TEST_TEMPLATE_NAME, exact: true }).first()).toBeVisible({ timeout: 8_000 })

    await page.getByRole('button', {
      name: `Uruchom szablon ${TEST_TEMPLATE_NAME}`,
    }).click()

    await expect(page).toHaveURL('/workout/new', { timeout: 10_000 })
    await expect(page.getByText('Squat', { exact: true }).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('region', { name: 'Aktywna sesja: Dzień 1' })).toBeVisible()

    await discardActiveSession(page)
  })

  test('delete a template', async ({ page }) => {
    await page.goto('/templates')
    await waitForTemplatesPageReady(page)
    await expect(page.getByRole('heading', { name: TEST_TEMPLATE_NAME, exact: true }).first()).toBeVisible({ timeout: 8_000 })

    // Find delete button for our template
    const deleteBtn = page.getByRole('button', {
      name: new RegExp(`Usuń szablon ${TEST_TEMPLATE_NAME}`, 'i'),
    }).or(page.getByLabel(new RegExp(`Usuń szablon ${TEST_TEMPLATE_NAME}`, 'i'))).first()

    await expect(deleteBtn).toBeVisible({ timeout: 5_000 })

    await page.screenshot({ path: 'test-results/templates-before-delete.png' })

    await deleteBtn.click()

    // Confirm dialog
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText(/Usunąć szablon/i)).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: 'Usuń' }).click()

    // Template should be gone
    await expect(page.getByRole('heading', { name: TEST_TEMPLATE_NAME, exact: true })).toHaveCount(0, { timeout: 8_000 })

    await page.screenshot({ path: 'test-results/templates-deleted.png' })
  })
})
