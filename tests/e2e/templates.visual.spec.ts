import { expect, test } from './fixtures'
import { expectAppReady } from './support/appReady'

test('empty templates page', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/templates')
  await expectAppReady(page, '/templates')
  await expect(page.getByText('Nie masz jeszcze szablonów')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect(page).toHaveScreenshot('templates-empty.png', {
    animations: 'disabled',
    fullPage: true,
  })
})
