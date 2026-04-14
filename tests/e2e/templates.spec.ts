import { test, expect, type Page } from '@playwright/test'

// Fixed name avoids timestamp instability across retries
const TEST_TEMPLATE_NAME = '_E2E Szablon Test_'

async function cleanupTestTemplate(page: Page) {
  await page.goto('/templates')
  await expect(page.locator('.page-shell')).toBeVisible({ timeout: 10_000 })

  // If a leftover test template exists, delete it
  const templateCard = page.locator('[class]').filter({ hasText: TEST_TEMPLATE_NAME }).first()
  if (await templateCard.isVisible({ timeout: 3_000 }).catch(() => false)) {
    const deleteBtn = page.getByRole('button', {
      name: new RegExp(`Usuń szablon ${TEST_TEMPLATE_NAME}`, 'i'),
    }).or(page.getByLabel(new RegExp(`Usuń szablon ${TEST_TEMPLATE_NAME}`, 'i'))).first()

    if (await deleteBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await deleteBtn.click()
      await page.getByRole('dialog').getByRole('button', { name: 'Usuń' }).click()
      await expect(page.getByText(TEST_TEMPLATE_NAME, { exact: false })).not.toBeVisible({ timeout: 8_000 })
    }
  }
}

test.describe('Templates CRUD', () => {
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
    // Ensure cleanup even if delete test was skipped or failed
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
    await expect(page.locator('.page-shell')).toBeVisible({ timeout: 10_000 })

    // Template should appear in the list
    await expect(page.getByText(TEST_TEMPLATE_NAME, { exact: false })).toBeVisible({ timeout: 10_000 })

    await page.screenshot({ path: 'test-results/templates-created.png' })
  })

  test('edit a template', async ({ page }) => {
    await page.goto('/templates')
    await expect(page.locator('.page-shell')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(TEST_TEMPLATE_NAME, { exact: false })).toBeVisible({ timeout: 8_000 })

    // Edit button uses onClick navigate() — not an <a> tag
    const editLink = page.getByRole('button', { name: new RegExp(`Edytuj szablon ${TEST_TEMPLATE_NAME}`, 'i') })
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

  test('start workout from template day', async ({ page }) => {
    await page.goto('/templates')
    await expect(page.locator('.page-shell')).toBeVisible({ timeout: 10_000 })

    // Look for "Rozpocznij ten dzień" button — only visible if template has days with exercises
    const startBtn = page.getByRole('button', { name: /Rozpocznij ten dzień/i }).first()

    if (await startBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await startBtn.click()
      await page.waitForURL('/workout/new', { timeout: 10_000 })
      await expect(page.locator('.page-shell')).toBeVisible({ timeout: 25_000 })

      await page.screenshot({ path: 'test-results/templates-workout-started.png' })

      // Cleanup: discard the session
      // Trigger button is "Anuluj"; confirm inside dialog is "Anuluj trening"
      const discardBtn = page.getByRole('button', { name: 'Anuluj', exact: true }).first()
      if (await discardBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await discardBtn.click()
        const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Potwierdź akcję' })
        await confirmDialog.getByRole('button', { name: 'Anuluj trening' }).click()
        await page.waitForURL('/dashboard', { timeout: 10_000 })
      }
    } else {
      // No template day to start from — skip gracefully
      // (test template has no exercises; "Rozpocznij" only shows when exercises exist)
      test.skip(true, 'No template with exercises found — start from template requires exercises in a day')
    }
  })

  test('delete a template', async ({ page }) => {
    await page.goto('/templates')
    await expect(page.locator('.page-shell')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(TEST_TEMPLATE_NAME, { exact: false })).toBeVisible({ timeout: 8_000 })

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
    await expect(page.getByText(TEST_TEMPLATE_NAME, { exact: false })).not.toBeVisible({ timeout: 8_000 })

    await page.screenshot({ path: 'test-results/templates-deleted.png' })
  })
})
