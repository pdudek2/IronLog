import { test, expect } from './fixtures'
import { expectAppReady } from './support/appReady'
import { installMockAiRuntime } from './support/mockAiStream'
import { cleanupExerciseDetailEmulatorState, seedExerciseDetailEmulatorState, PROGRESS_DETAIL_EXERCISE_ID, closeProgressEmulator, seedProgressEmulatorState, cleanupProgressEmulatorState } from './support/progressEmulator'
import { deleteTemplateByName } from './support/accountCleanup'
import { cleanupWorkoutLifecycleState, seedLifecycleActiveSession } from './support/workoutLifecycleEmulator'

test.use({ deviceScaleFactor: 1 })

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile' || process.env.E2E_BACKEND !== 'emulator', 'Mobile emulator audit scenarios')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 393, height: 852 })
})
test.afterAll(closeProgressEmulator)

test('ten exercise volumes retain readable chronology', async ({ page, cleanup }, info) => {
  cleanup.add('remove detail fixture', cleanupExerciseDetailEmulatorState)
  await cleanupExerciseDetailEmulatorState()
  await seedExerciseDetailEmulatorState(10)
  await page.goto(`/exercises/user/${PROGRESS_DETAIL_EXERCISE_ID}`)
  await expect(page.getByRole('heading', { name: 'Phase 7 Volume Detail' })).toBeVisible()
  await expect(page.getByText('Powt. przy rekordzie', { exact: true })).toBeVisible()
  for (const width of [320, 393, 768]) {
    await page.setViewportSize({ width, height: 852 })
    await page.evaluate(() => document.fonts.ready)
    const chart = page.locator('.exercise-detail-volume-chart')
    await chart.scrollIntoViewIfNeeded()
    await expect(chart.getByRole('listitem')).toHaveCount(10)
    expect(await chart.locator('.exercise-detail-volume-track').evaluateAll((bars) => new Set(bars.map((bar) => Math.round(bar.getBoundingClientRect().bottom))).size)).toBe(1)
    await chart.getByRole('listitem').last().scrollIntoViewIfNeeded()
    await expect(chart.getByRole('listitem').last()).toBeInViewport()
    await chart.evaluate((element) => { element.scrollLeft = 0 })
    await page.screenshot({ path: info.outputPath(`volume-${width}.png`), fullPage: true })
  }
})

test('long template names and editor first action', async ({ page, cleanup }, info) => {
  const name = 'Powrót do regularnych treningów po dłuższej przerwie'
  cleanup.add('delete mobile audit template', () => deleteTemplateByName(page, name))
  await page.goto('/templates/new')
  await expectAppReady(page, '/templates/new')
  await page.screenshot({ path: info.outputPath('editor-empty.png'), fullPage: true })
  const add = page.getByRole('button', { name: 'Dodaj ćwiczenie', exact: true }).first()
  await add.focus()
  await page.keyboard.press('Enter')
  const picker = page.getByRole('dialog', { name: /Wybierz ćwiczenie/ })
  await expect(picker).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(picker).not.toBeVisible()
  await expect(add).toBeFocused()
  await add.click()
  await picker.getByPlaceholder('Szukaj ćwiczenia...').fill('Squat')
  await picker.getByRole('button').filter({ hasText: /Squat/ }).first().click()
  await expect(picker).not.toBeVisible()
  await page.screenshot({ path: info.outputPath('editor-missing-name.png'), fullPage: true })
  await page.getByPlaceholder('np. Upper / Lower 4 dni').fill(name)
  await page.locator('button[type="submit"]:visible').click()
  await expectAppReady(page, '/templates')
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 10000 })
  for (const width of [320, 393]) {
    await page.setViewportSize({ width, height: 852 })
    await settle(page)
    const title = await page.locator('.planner-template-title').boundingBox()
    const actions = await page.locator('.planner-template-actions').boundingBox()
    expect(actions!.y).toBeGreaterThanOrEqual(title!.y + title!.height)
    expect(title!.width).toBeGreaterThan(width * 0.85)
    await page.screenshot({ path: info.outputPath(`templates-${width}.png`), fullPage: true })
  }
})

test('coach plan preview and goal validation', async ({ page }, info) => {
  await installMockAiRuntime(page, [{ kind: 'plan', plan: {
    name: 'Powrót do regularnych treningów', summary: 'Trzy spokojne dni pracy nad siłą.',
    days: [{ name: 'Całe ciało', exercises: [{ exerciseId: 'squat', exerciseSource: 'global', name: 'Przysiad ze sztangą z pauzą na dole', sets: 3, targetReps: 8, targetWeight: 60 }] }],
  } }])
  await page.goto('/chat')
  await expectAppReady(page, '/chat')
  await page.getByRole('group', { name: 'Tryb AI Coacha' }).getByRole('button', { name: /^Plan/ }).click()
  await page.getByRole('button', { name: 'Generuj plan', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Cel planu' })).toBeFocused()
  await page.screenshot({ path: info.outputPath('coach-goal-validation.png') })
  await page.getByRole('textbox', { name: 'Cel planu' }).fill('Budowa siły')
  await page.getByRole('button', { name: 'Generuj plan', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Powrót do regularnych treningów' })).toBeVisible()
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 10000 })
  for (const width of [320, 393, 768]) {
    await page.setViewportSize({ width, height: 852 })
    await page.locator('.coach-plan-preview').scrollIntoViewIfNeeded()
    await settle(page)
    for (const stat of await page.locator('.coach-preview-stat').all()) {
      expect(await stat.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    }
    expect(await page.locator('.coach-preview-exercise').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    await page.locator('.coach-plan-preview').screenshot({ path: info.outputPath(`coach-preview-${width}.png`) })
  }
})

test('active ledger pending and completed controls', async ({ page, cleanup }, info) => {
  cleanup.add('remove ledger fixture', cleanupWorkoutLifecycleState)
  await cleanupWorkoutLifecycleState()
  await seedLifecycleActiveSession({ sessionId: 'phase-1-audit-mobile-ledger' })
  await page.goto('/workout/new')
  await expectAppReady(page, '/workout/new')
  await settle(page)
  await page.screenshot({ path: info.outputPath('ledger.png'), fullPage: true })
  await page.getByRole('button', { name: 'Odznacz serię 1 ćwiczenia Phase 1 Bench Press', exact: true }).click()
  const pending = page.getByRole('button', { name: 'Oznacz serię 1 ćwiczenia Phase 1 Bench Press', exact: true })
  await expect(pending).toBeVisible()
  await settle(page)
  await page.screenshot({ path: info.outputPath('ledger-pending.png'), fullPage: true })
  const add = page.getByRole('button', { name: 'Dodaj ćwiczenie', exact: true })
  await add.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: /Wybierz ćwiczenie/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(add).toBeFocused()

})

async function settle(page: import('@playwright/test').Page) {
  await page.evaluate(() => document.fonts.ready)
  await expect.poll(() => page.locator('.planner-template-row, .workout-exercise-card, .coach-plan-preview').evaluateAll((nodes) => nodes.every((node) => {
    let element: Element | null = node
    while (element) {
      if (Number(getComputedStyle(element).opacity) < 1) return false
      element = element.parentElement
    }
    return true
  }))).toBe(true)
}

test('progress summary', async ({ page, cleanup }, info) => {
  cleanup.add('remove progress fixture', cleanupProgressEmulatorState)
  await cleanupProgressEmulatorState()
  await seedProgressEmulatorState(Date.now() - Date.UTC(2026, 3, 25, 12))
  await page.goto('/progress')
  await expect(page.getByTestId('progress-page')).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('.progress-summary-grid')).toBeVisible()
  await page.getByRole('button', { name: '30 dni', exact: true }).click()
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByRole('group', { name: 'Sesje', exact: true })).toContainText('5')
  await expect(page.getByRole('group', { name: 'Objętość', exact: true })).toContainText('+105%')
  await page.screenshot({ path: info.outputPath('progress.png'), fullPage: true })
})

test('custom exercise validation', async ({ page }, info) => {
  await page.goto('/exercises')
  await expectAppReady(page, '/exercises')
  await page.getByRole('button', { name: 'Dodaj własne', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Dodaj ćwiczenie', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('textbox')).toBeFocused()
  await page.getByRole('dialog').screenshot({ path: info.outputPath('custom-validation.png') })
})
