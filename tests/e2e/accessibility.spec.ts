import { writeFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures'
import { expectAppReady } from './support/appReady'

const PHASE_3_AXE_RULES = [
  'aria-allowed-attr',
  'aria-command-name',
  'aria-dialog-name',
  'aria-hidden-focus',
  'aria-input-field-name',
  'aria-required-attr',
  'aria-roles',
  'aria-valid-attr-value',
  'button-name',
  'duplicate-id-aria',
  'form-field-multiple-labels',
  'label',
  'nested-interactive',
  'select-name',
] as const

const AXE_ROUTES = [
  '/dashboard',
  '/templates/new',
  '/exercises',
  '/chat',
] as const

function formatViolations(violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']) {
  return violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.flatMap((node) => node.target),
  }))
}

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

  test('scroll-hidden mobile navigation transfers focus and ignores direction jitter', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only scroll navigation contract')

    await page.goto('/profile')
    await expectAppReady(page, '/profile')

    const main = page.getByRole('main')
    const nav = page.locator('nav.bottom-nav')
    const start = nav.locator('button[aria-label="Start"]')

    await start.focus()
    await page.mouse.wheel(0, 600)
    await expect(main).toBeFocused()
    await expect(nav).toHaveAttribute('aria-hidden', 'true')
    await expect.poll(() => nav.evaluate((element) => (element as HTMLElement).inert)).toBe(true)

    await page.mouse.wheel(0, -8)
    await expect(nav).toHaveAttribute('aria-hidden', 'true')

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
      name: /^(?:Rozpocznij nowy trening|Wznów trening)$/,
    })).toHaveAttribute('aria-current', 'page')
  })
})

test('primary mobile controls expose at least 44px hit areas', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile-only hit-area contract')
  await page.goto('/dashboard')
  await expectAppReady(page, '/dashboard')

  const controls = [
    page.getByRole('button', { name: 'IronLog — strona główna' }),
    page.getByRole('slider', { name: 'Gotowość: Sen' }),
  ]

  for (const control of controls) {
    const box = await control.boundingBox()
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  }
})

test.describe('Phase 3 targeted Axe smoke', () => {
  for (const route of AXE_ROUTES) {
    test(`${route} has no Phase 3 Axe violations`, async ({ page }) => {
      await page.goto(route)
      await expectAppReady(page, route)

      const results = await new AxeBuilder({ page })
        .withRules([...PHASE_3_AXE_RULES])
        .analyze()

      expect(results.violations, JSON.stringify(formatViolations(results.violations), null, 2))
        .toEqual([])
    })
  }
})

test('attaches route accessibility snapshots for manual review', async ({ page }, testInfo) => {
  for (const route of AXE_ROUTES) {
    await page.goto(route)
    await expectAppReady(page, route)

    const regions = {
      navigation: testInfo.project.name === 'mobile'
        ? page.locator('nav.bottom-nav')
        : page.getByRole('navigation', { name: 'Nawigacja główna' }),
      main: page.getByRole('main'),
    }

    for (const [regionName, locator] of Object.entries(regions)) {
      const snapshot = await locator.ariaSnapshot()
      const routeName = route === '/dashboard' ? 'dashboard' : route.slice(1).replaceAll('/', '-')
      const snapshotPath = testInfo.outputPath(`${routeName}-${regionName}.aria.yml`)
      await writeFile(snapshotPath, snapshot, 'utf8')
      await testInfo.attach(`${routeName}-${regionName}.aria.yml`, {
        path: snapshotPath,
        contentType: 'text/yaml',
      })
    }
  }
})
