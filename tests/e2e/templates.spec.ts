import { test, expect, type Page } from './fixtures'
import { deleteTemplateByName, discardActiveSession } from './support/accountCleanup'
import { expectAppReady } from './support/appReady'

const TEST_TEMPLATE_NAME = '_E2E Template Test_'

async function waitForTemplatesPageReady(page: Page): Promise<void> {
  await expectAppReady(page, '/templates')
}

async function addExercise(page: Page, name: string): Promise<void> {
  const addButton = page.getByRole('button', { name: 'Add exercise' }).first()
  await addButton.scrollIntoViewIfNeeded()
  await addButton.click()
  const picker = page.getByRole('dialog', { name: /Choose an exercise/i })
  await page.getByPlaceholder('Search exercises...').fill(name)
  const result = picker.locator('button').filter({ hasText: new RegExp(name, 'i') }).first()
  await expect(result).toBeVisible({ timeout: 5_000 })
  await result.click()
  await expect(picker).not.toBeVisible({ timeout: 5_000 })
}

test.describe('Templates CRUD', () => {
  test('template CRUD and launch lifecycle is isolated', async ({ page, cleanup }) => {
    cleanup.add('delete template', () => deleteTemplateByName(page, TEST_TEMPLATE_NAME))
    cleanup.add('discard active session', () => discardActiveSession(page))

    await page.goto('/templates/new')
    await expectAppReady(page, '/templates/new')
    await page.evaluate(() => document.fonts.ready)
    await expect(page.getByText('New plan · not saved yet', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Add the first exercise to this day.', { exact: true })).toHaveCount(0)
    const createSave = page.locator('button[type="submit"]:visible').filter({ hasText: 'Save plan' })
    await expect(createSave).toHaveCount(1)
    await expect(createSave).toBeDisabled()
    await page.getByPlaceholder('E.g. Upper / Lower 4 days').fill(TEST_TEMPLATE_NAME)
    await page.getByRole('textbox', { name: 'Day name 1' }).fill('Lower')
    await addExercise(page, 'Squat')
    await page.getByRole('button', { name: 'Add day' }).click()
    await page.getByRole('textbox', { name: 'Day name 2' }).fill('Upper')
    await addExercise(page, 'Bench Press')
    await page.getByRole('button', { name: 'Add day' }).click()
    await page.getByRole('textbox', { name: 'Day name 3' }).fill('Recovery')
    await expect(page.getByText('Unsaved changes', { exact: true })).toHaveCount(1)
    await expect(createSave).toBeEnabled()

    await page.screenshot({ path: 'test-results/templates-editor.png' })
    await createSave.click()
    await page.waitForURL('/templates', { timeout: 15_000 })
    await waitForTemplatesPageReady(page)
    await expect(page.getByRole('heading', { name: TEST_TEMPLATE_NAME, exact: true }).first()).toBeVisible({ timeout: 10_000 })
    await page.screenshot({ path: 'test-results/templates-created.png' })

    const editButton = page.getByRole('button', { name: new RegExp(`Edit template ${TEST_TEMPLATE_NAME}`, 'i') }).first()
    await expect(editButton).toBeVisible({ timeout: 5_000 })
    await editButton.click()
    await expect(page).toHaveURL(/\/templates\/.*\/edit/, { timeout: 5_000 })
    await expect(page.getByPlaceholder('E.g. Upper / Lower 4 days')).toHaveValue(TEST_TEMPLATE_NAME)
    await expect(page.getByRole('tab')).toHaveCount(3)
    await page.getByRole('textbox', { name: 'Day name 1' }).fill('Lower strength')
    const saveChanges = page.locator('button[type="submit"]:visible').filter({ hasText: 'Save plan' })
    await expect(saveChanges).toHaveCount(1)
    await saveChanges.click()
    await page.waitForURL('/templates', { timeout: 10_000 })
    await page.screenshot({ path: 'test-results/templates-edited.png' })

    await page.reload()
    await waitForTemplatesPageReady(page)
    const savedCard = page.getByRole('article').filter({
      has: page.getByRole('heading', { name: TEST_TEMPLATE_NAME, exact: true }),
    })
    await expect(savedCard.getByText('3 days', { exact: true })).toBeVisible()
    await expect(savedCard.getByText('Lower strength', { exact: true })).toBeVisible()
    await expect(savedCard.getByText('Upper', { exact: true })).toBeVisible()
    await expect(savedCard.getByText('Recovery', { exact: true })).toBeVisible()
    await expect(savedCard.getByText('Squat', { exact: true })).toBeVisible()
    await expect(savedCard.getByText('Bench Press', { exact: true })).toBeVisible()

    const dayLaunch = page.getByRole('button', {
      name: `Start day Lower strength from template ${TEST_TEMPLATE_NAME}`,
      exact: true,
    })
    await expect(dayLaunch).toHaveCount(1)
    await dayLaunch.click()
    await expect(page).toHaveURL('/workout/new', { timeout: 10_000 })
    await expect(page.getByText('Squat', { exact: true }).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('region', { name: 'Active session: Lower strength' })).toBeVisible()

    await discardActiveSession(page)
    await page.goto('/templates')
    await waitForTemplatesPageReady(page)
    const deleteButton = page.getByRole('button', { name: `Delete template ${TEST_TEMPLATE_NAME}` }).first()
    await expect(deleteButton).toBeVisible({ timeout: 5_000 })
    await page.screenshot({ path: 'test-results/templates-before-delete.png' })
    await deleteButton.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText(/Delete template/i)).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByRole('heading', { name: TEST_TEMPLATE_NAME, exact: true })).toHaveCount(0, { timeout: 8_000 })
    await page.screenshot({ path: 'test-results/templates-deleted.png' })
  })
})
