import { test, expect, type Locator } from './fixtures'
import { discardActiveSession } from './support/accountCleanup'
import { expectAppReady } from './support/appReady'
import { openLargeTemplateDraft } from './support/templateDraft'

async function expectMinHitArea(locator: Locator, label: string) {
  const box = await locator.boundingBox()
  expect(box, `${label} should be visible`).not.toBeNull()
  expect(box!.width, `${label} width`).toBeGreaterThanOrEqual(44)
  expect(box!.height, `${label} height`).toBeGreaterThanOrEqual(44)
}

test.describe('Phase 4 mobile ergonomics', () => {
  test('keeps template editor operational labels at 12px or larger', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only typography contract')
    await page.setViewportSize({ width: 320, height: 844 })
    await openLargeTemplateDraft(page)

    const labels = page.locator([
      '.template-name-panel .planner-kicker',
      '.template-day-editor-head .planner-kicker',
      '.template-exercise-columns span:visible',
    ].join(', '))
    expect(await labels.count()).toBeGreaterThan(0)
    for (const label of await labels.all()) {
      const size = await label.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))
      expect(size).toBeGreaterThanOrEqual(12)
    }
  })

  test('preserves the 44px desktop picker close control', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop-only geometry contract')
    await openLargeTemplateDraft(page)
    await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).first().click()

    const close = page.getByRole('dialog', { name: /Wybierz ćwiczenie/ })
      .getByRole('button', { name: 'Zamknij wybór ćwiczenia' })
    const box = await close.boundingBox()
    expect(box, 'picker close should be visible').not.toBeNull()
    expect(box!.width).toBe(44)
    expect(box!.height).toBe(44)
  })

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

    await expect.poll(async () => {
      const inputBox = await input.boundingBox()
      const dockBox = await page.getByTestId('template-save-dock').boundingBox()
      if (!inputBox || !dockBox) return Number.POSITIVE_INFINITY
      return inputBox.y + inputBox.height - dockBox.y
    }).toBeLessThanOrEqual(0)
  })

  test('dirty template editor guards BottomNav and browser back', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')
    await page.setViewportSize({ width: 390, height: 844 })
    await openLargeTemplateDraft(page)

    const name = page.getByRole('textbox', { name: 'Nazwa', exact: true })
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

  test('exposes 44px BottomNav, picker and template-editor targets at 320px', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')
    await page.setViewportSize({ width: 320, height: 844 })
    await openLargeTemplateDraft(page)

    const navBoxes = []
    const navItems = [
      ['Start', /^Start$/],
      ['Postępy', /^Postępy$/],
      ['Plany', /^Plany$/],
      ['Ćwiczenia', /^Ćwiczenia$/],
      ['wejście do treningu', /^(?:Rozpocznij nowy trening|Wznów trening)$/],
      ['Historia', /^Historia$/],
      ['AI', /^AI$/],
    ] as const
    for (const [label, accessibleName] of navItems) {
      const item = page.getByRole('button', { name: accessibleName })
      await expectMinHitArea(item, `BottomNav ${label}`)
      navBoxes.push((await item.boundingBox())!)
    }
    for (let index = 1; index < navBoxes.length; index += 1) {
      expect(navBoxes[index].x).toBeGreaterThanOrEqual(navBoxes[index - 1].x + navBoxes[index - 1].width)
    }
    await expectMinHitArea(page.getByRole('button', { name: /Usuń ćwiczenie Bench Press/ }).first(), 'template delete')

    await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).first().click()
    const picker = page.getByRole('dialog', { name: /Wybierz ćwiczenie/ })
    await expectMinHitArea(picker.getByRole('button', { name: 'Zamknij wybór ćwiczenia' }), 'picker close')
    await expectMinHitArea(picker.getByRole('button', { name: 'Wszystkie' }), 'picker category')
  })

  test('exposes 44px route filter targets at 320px', async ({ page, cleanup }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')
    await page.setViewportSize({ width: 320, height: 844 })

    await page.goto('/exercises')
    await expectAppReady(page, '/exercises')
    await page.getByRole('button', { name: 'Filtry' }).click()
    await expectMinHitArea(
      page.getByRole('group', { name: 'Kategoria ćwiczenia' }).getByRole('button', { name: 'Wszystkie', exact: true }),
      'exercise category',
    )

    await page.getByRole('button', { name: 'Dodaj własne' }).click()
    const muscleButton = page.getByRole('group', { name: 'Grupy mięśniowe' })
      .getByRole('button', { name: 'Klatka', exact: true })
    await expectMinHitArea(
      muscleButton,
      'exercise form muscle',
    )
    expect(await muscleButton.evaluate((element) => getComputedStyle(element).cursor)).toBe('pointer')
    expect(await muscleButton.evaluate((element) => getComputedStyle(element).transitionProperty)).not.toContain('all')
    await page.getByRole('button', { name: 'Zamknij formularz' }).click()

    await page.goto('/history')
    await expectAppReady(page, '/history')
    await expectMinHitArea(page.getByRole('button', { name: 'Wszystko', exact: true }), 'history range')
    const historySearch = page.getByLabel('Szukaj w historii treningów')
    await historySearch.fill('bench')
    expect(await page.evaluate(() => Array.from(document.styleSheets).some((sheet) => {
      try {
        return Array.from(sheet.cssRules).some((rule) => (
          rule instanceof CSSStyleRule
          && rule.selectorText === '.history-search-input::-webkit-search-cancel-button'
          && (rule.style.appearance === 'none' || rule.style.getPropertyValue('-webkit-appearance') === 'none')
        ))
      } catch {
        return false
      }
    }))).toBe(true)
    await expectMinHitArea(page.getByRole('button', { name: 'Wyczyść wyszukiwanie' }), 'history clear search')

    await page.goto('/progress')
    await expectAppReady(page, '/progress')
    await expectMinHitArea(page.getByRole('button', { name: '30 dni', exact: true }), 'progress range')

    await page.goto('/chat')
    await expectAppReady(page, '/chat')
    await page.getByRole('group', { name: 'Tryb AI Coacha' }).getByRole('button', { name: 'Plan', exact: true }).click()
    await expectMinHitArea(
      page.getByRole('group', { name: 'Liczba dni treningowych w tygodniu' }).getByRole('button', { name: '3 dni' }),
      'coach plan days',
    )

    cleanup.add('discard active session', () => discardActiveSession(page))
    await page.goto('/workout/new')
    await expectAppReady(page, '/workout/new', 25_000)
    const staleSession = page.getByRole('button', { name: 'Odrzuć i zacznij od nowa' })
    if (await staleSession.isVisible().catch(() => false)) {
      await staleSession.click()
    }
    const startSession = page.getByRole('button', { name: 'Rozpocznij nową sesję' })
    if (await startSession.isVisible().catch(() => false)) {
      await startSession.click()
    }
    await expectMinHitArea(page.getByRole('button', { name: 'Push', exact: true }), 'workout type')
  })
})
