import { expect, test } from './fixtures'
import { expectAppReady } from './support/appReady'

test('empty templates page', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/templates')
  await expectAppReady(page, '/templates')
  await expect(page.getByText('Nie masz jeszcze planu')).toBeVisible()
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

test('new template editor empty state', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/templates/new')
  await expectAppReady(page, '/templates/new')
  await expect(page.getByRole('heading', { name: 'Nowy plan' })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  const headerStats = page.locator('.template-editor-heading .planner-mini-stats')
  const summary = page.locator('.template-editor-summary')
  await expect(page.locator('.template-editor-main .template-editor-bottom-actions')).toHaveCount(1)
  if (testInfo.project.name === 'desktop') {
    await expect(headerStats).toBeHidden()
    await expect(summary).toBeVisible()
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
  } else {
    await expect(headerStats).toBeVisible()
    await expect(headerStats).toContainText('1dzień')
    await expect(summary).toBeHidden()
  }

  await expect(page).toHaveScreenshot('template-editor-empty.png', {
    animations: 'disabled',
    fullPage: true,
  })
})
