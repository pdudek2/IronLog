import { expect, test } from './fixtures'
import { expectAppReady } from './support/appReady'

test('empty templates page', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/templates')
  await expectAppReady(page, '/templates')
  await expect(page.getByText('Nie masz jeszcze szablonów')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  if (testInfo.project.name === 'desktop') {
    await page.addStyleTag({
      content: `
        html {
          scrollbar-gutter: auto !important;
          scrollbar-width: none !important;
        }

        html::-webkit-scrollbar {
          display: none !important;
        }
      `,
    })
  }

  const scrollGeometry = await page.evaluate(() => ({
    windowScrollX: window.scrollX,
    bodyScrollLeft: document.body.scrollLeft,
    htmlScrollLeft: document.documentElement.scrollLeft,
    bodyScrollWidth: document.body.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
    htmlScrollWidth: document.documentElement.scrollWidth,
    htmlClientWidth: document.documentElement.clientWidth,
  }))

  expect(scrollGeometry.windowScrollX).toBe(0)
  expect(scrollGeometry.bodyScrollLeft).toBe(0)
  expect(scrollGeometry.htmlScrollLeft).toBe(0)
  expect(scrollGeometry.bodyScrollWidth).toBe(scrollGeometry.bodyClientWidth)
  expect(scrollGeometry.htmlScrollWidth).toBe(scrollGeometry.htmlClientWidth)

  await expect(page).toHaveScreenshot('templates-empty.png', {
    animations: 'disabled',
    fullPage: true,
  })
})
