import { test, expect } from './fixtures'
import { openLargeTemplateDraft } from './support/templateDraft'

test.describe('Phase 4 mobile ergonomics', () => {
  test('dirty template editor guards BottomNav and browser back', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')
    await page.setViewportSize({ width: 390, height: 844 })
    await openLargeTemplateDraft(page)

    const name = page.getByRole('textbox', { name: 'Nazwa' })
    await name.fill('Upper / Lower 4× zmieniony')
    await name.blur()

    await page.getByRole('button', { name: 'Start', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Opuścić edytor?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Zostań' }).click()
    await expect(page).toHaveURL(/\/templates\/new/)
    await expect(dialog).toBeHidden()
    await expect(name).toHaveValue('Upper / Lower 4× zmieniony')

    await page.evaluate(() => history.back())
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Opuść bez zapisu' }).click({ noWaitAfter: true })
    await expect(page).toHaveURL(/\/templates$/)
  })
})
