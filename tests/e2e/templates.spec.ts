import { test, expect, type Page } from './fixtures'
import { deleteTemplateByName, discardActiveSession } from './support/accountCleanup'
import { expectAppReady } from './support/appReady'

const TEST_TEMPLATE_NAME = '_E2E Template Test_'

async function waitForTemplatesPageReady(page: Page): Promise<void> {
  await expectAppReady(page, '/templates')
}

test.describe('Templates CRUD', () => {
  test('template CRUD and launch lifecycle is isolated', async ({ page, cleanup }) => {
    cleanup.add('delete template', () => deleteTemplateByName(page, TEST_TEMPLATE_NAME))
    cleanup.add('discard active session', () => discardActiveSession(page))

    await page.goto('/templates/new')
    await expectAppReady(page, '/templates/new')
    await page.evaluate(() => document.fonts.ready)
    await expect(page.getByText('New plan · not saved yet', { exact: true })).toHaveCount(1)
    const emptyDay = page.locator('.template-day-empty')
    await expect(emptyDay).toBeVisible()
    const emptyStyle = await emptyDay.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        background: style.backgroundColor,
        border: style.borderTopWidth,
        radius: style.borderTopLeftRadius,
      }
    })
    expect(emptyStyle).toEqual({
      background: 'rgba(0, 0, 0, 0)',
      border: '0px',
      radius: '0px',
    })
    const createSave = page.locator('button[type="submit"]:visible').filter({ hasText: 'Save template' })
    await expect(createSave).toHaveCount(1)
    await expect(createSave).toBeDisabled()
    await page.getByPlaceholder('E.g. Upper / Lower 4 days').fill(TEST_TEMPLATE_NAME)
    const addExercise = page.getByRole('button', { name: 'Add exercise' }).first()
    await addExercise.scrollIntoViewIfNeeded()
    await expect(addExercise).toBeVisible()
    await expect(addExercise).toBeEnabled()
    await addExercise.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }))
    await addExercise.click()

    const picker = page.getByRole('dialog', { name: /Choose an exercise/i })
    await expect(picker).toBeVisible({ timeout: 5_000 })
    await page.getByPlaceholder('Search exercises...').fill('Squat')
    const firstResult = picker.locator('button').filter({ hasText: /squat/i }).first()
    await expect(firstResult).toBeVisible({ timeout: 5_000 })
    await firstResult.click()
    await expect(picker).not.toBeVisible({ timeout: 5_000 })
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
    await page.getByRole('textbox', { name: 'Day name 1' }).fill('Day siłowy')
    const saveChanges = page.locator('button[type="submit"]:visible').filter({ hasText: 'Save changes' })
    await expect(saveChanges).toHaveCount(1)
    await saveChanges.click()
    await page.waitForURL('/templates', { timeout: 10_000 })
    await page.screenshot({ path: 'test-results/templates-edited.png' })

    const dayLaunch = page.getByRole('button', {
      name: `Start day Day siłowy from template ${TEST_TEMPLATE_NAME}`,
      exact: true,
    })
    await expect(dayLaunch).toHaveCount(1)
    await dayLaunch.click()
    await expect(page).toHaveURL('/workout/new', { timeout: 10_000 })
    await expect(page.getByText('Squat', { exact: true }).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('region', { name: 'Active session: Day siłowy' })).toBeVisible()

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
