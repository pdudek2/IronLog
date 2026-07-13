import { expect, test } from './fixtures'
import { expectAppReady } from './support/appReady'

test.describe('Phase 3 navigation accessibility', () => {
  test('hidden mobile navigation leaves the focus order and returns safely', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only hidden navigation contract')

    await page.goto('/profile')
    await expectAppReady(page, '/profile')

    const nav = page.locator('nav.bottom-nav')
    const start = nav.locator('button[aria-label="Start"]')
    await expect(nav).not.toHaveAttribute('aria-hidden', 'true')

    await page.getByLabel('Imię').focus()
    await expect(nav).toHaveAttribute('aria-hidden', 'true')
    await expect.poll(() => nav.evaluate((element) => (element as HTMLElement).inert)).toBe(true)

    await start.evaluate((element) => element.focus())
    await expect(start).not.toBeFocused()

    await page.getByRole('main').focus()
    await expect(nav).not.toHaveAttribute('aria-hidden', 'true')
    await start.focus()
    await expect(start).toBeFocused()
  })

  test('scroll-hidden mobile navigation transfers focus without reopening', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only scroll focus contract')

    await page.goto('/profile')
    await expectAppReady(page, '/profile')

    const main = page.getByRole('main')
    const nav = page.locator('nav.bottom-nav')
    const start = nav.locator('button[aria-label="Start"]')

    await start.focus()
    await expect(start).toBeFocused()
    await page.mouse.wheel(0, 600)

    await expect(main).toBeFocused()
    await expect(nav).toHaveAttribute('aria-hidden', 'true')
    await expect.poll(() => nav.evaluate((element) => (element as HTMLElement).inert)).toBe(true)

    await page.mouse.wheel(0, -600)
    await expect(nav).not.toHaveAttribute('aria-hidden', 'true')
    await expect.poll(() => nav.evaluate((element) => (element as HTMLElement).inert)).toBe(false)
  })

  test('desktop profile action communicates the current page', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop profile navigation contract')

    await page.goto('/profile')
    await expectAppReady(page, '/profile')
    await expect(page.getByRole('button', { name: 'Profil' })).toHaveAttribute('aria-current', 'page')
  })

  test('mobile workout action communicates the current page', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile workout navigation contract')

    await page.goto('/workout/new')
    await expectAppReady(page, '/workout/new', 25_000)
    await expect(page.locator('nav.bottom-nav').getByRole('button', {
      name: 'Rozpocznij nowy trening',
    })).toHaveAttribute('aria-current', 'page')
  })
})
