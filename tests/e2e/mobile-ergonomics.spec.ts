import { test, expect } from './fixtures'
import { openLargeTemplateDraft } from './support/templateDraft'

test.describe('Phase 4 mobile ergonomics', () => {
  for (const width of [320, 375, 390]) {
    test(`keeps the save dock visible without horizontal overflow at ${width}px`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')
      await page.setViewportSize({ width, height: 844 })
      await openLargeTemplateDraft(page)

      const dock = page.getByTestId('template-save-dock')
      await expect(dock).toBeVisible()
      const dockBox = await dock.boundingBox()
      expect(dockBox).not.toBeNull()
      expect(dockBox!.y + dockBox!.height).toBeLessThanOrEqual(844)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
    })
  }

  test('keeps the dock and focused input separated at 150% text and reduced viewport', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')
    await page.setViewportSize({ width: 320, height: 844 })
    await openLargeTemplateDraft(page)
    await page.evaluate(() => { document.documentElement.style.fontSize = '150%' })

    const input = page.locator('input[type="number"]').last()
    await input.focus()
    await page.setViewportSize({ width: 320, height: 500 })
    await input.scrollIntoViewIfNeeded()

    const inputBox = await input.boundingBox()
    const dockBox = await page.getByTestId('template-save-dock').boundingBox()
    expect(inputBox).not.toBeNull()
    expect(dockBox).not.toBeNull()
    expect(inputBox!.y + inputBox!.height).toBeLessThanOrEqual(dockBox!.y)
  })

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
