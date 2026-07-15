import { test, expect, type Page } from './fixtures'
import { deleteTemplateByName, discardActiveSession } from './support/accountCleanup'
import { expectAppReady } from './support/appReady'

const TEST_TEMPLATE_NAME = '_E2E Szablon Test_'

async function waitForTemplatesPageReady(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Plany.', exact: true })).toBeVisible({ timeout: 15_000 })
}

test.describe('Templates CRUD', () => {
  test('template CRUD and launch lifecycle is isolated', async ({ page, cleanup }) => {
    cleanup.add('delete template', () => deleteTemplateByName(page, TEST_TEMPLATE_NAME))
    cleanup.add('discard active session', () => discardActiveSession(page))

    await page.goto('/templates/new')
    await expectAppReady(page, '/templates/new')
    await page.evaluate(() => document.fonts.ready)
    await page.getByPlaceholder('np. Upper / Lower 4 dni').fill(TEST_TEMPLATE_NAME)
    const addExercise = page.getByRole('button', { name: 'Dodaj ćwiczenie' }).first()
    await addExercise.scrollIntoViewIfNeeded()
    await expect(addExercise).toBeVisible()
    await expect(addExercise).toBeEnabled()
    await addExercise.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }))
    await addExercise.click()

    const picker = page.getByRole('dialog', { name: /Wybierz ćwiczenie/i })
    await expect(picker).toBeVisible({ timeout: 5_000 })
    await page.getByPlaceholder('Szukaj ćwiczenia...').fill('Squat')
    const firstResult = picker.locator('button').filter({ hasText: /squat/i }).first()
    await expect(firstResult).toBeVisible({ timeout: 5_000 })
    await firstResult.click()
    await expect(picker).not.toBeVisible({ timeout: 5_000 })

    await page.screenshot({ path: 'test-results/templates-editor.png' })
    await page.getByRole('button', { name: 'Zapisz szablon' }).click()
    await page.waitForURL('/templates', { timeout: 15_000 })
    await waitForTemplatesPageReady(page)
    await expect(page.getByRole('heading', { name: TEST_TEMPLATE_NAME, exact: true }).first()).toBeVisible({ timeout: 10_000 })
    await page.screenshot({ path: 'test-results/templates-created.png' })

    const editButton = page.getByRole('button', { name: new RegExp(`Edytuj szablon ${TEST_TEMPLATE_NAME}`, 'i') }).first()
    await expect(editButton).toBeVisible({ timeout: 5_000 })
    await editButton.click()
    await expect(page).toHaveURL(/\/templates\/.*\/edit/, { timeout: 5_000 })
    await expect(page.getByPlaceholder('np. Upper / Lower 4 dni')).toHaveValue(TEST_TEMPLATE_NAME)
    await page.getByRole('textbox', { name: 'Dzień 1' }).fill('Dzień siłowy')
    const saveChanges = page.locator('button[type="submit"]:visible').filter({ hasText: 'Zapisz zmiany' })
    await expect(saveChanges).toHaveCount(1)
    await saveChanges.click()
    await page.waitForURL('/templates', { timeout: 10_000 })
    await page.screenshot({ path: 'test-results/templates-edited.png' })

    await page.getByRole('button', { name: `Uruchom szablon ${TEST_TEMPLATE_NAME}` }).click()
    await expect(page).toHaveURL('/workout/new', { timeout: 10_000 })
    await expect(page.getByText('Squat', { exact: true }).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('region', { name: 'Aktywna sesja: Dzień siłowy' })).toBeVisible()

    await discardActiveSession(page)
    await page.goto('/templates')
    await waitForTemplatesPageReady(page)
    const deleteButton = page.getByRole('button', { name: `Usuń szablon ${TEST_TEMPLATE_NAME}` }).first()
    await expect(deleteButton).toBeVisible({ timeout: 5_000 })
    await page.screenshot({ path: 'test-results/templates-before-delete.png' })
    await deleteButton.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText(/Usunąć szablon/i)).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: 'Usuń' }).click()
    await expect(page.getByRole('heading', { name: TEST_TEMPLATE_NAME, exact: true })).toHaveCount(0, { timeout: 8_000 })
    await page.screenshot({ path: 'test-results/templates-deleted.png' })
  })
})
