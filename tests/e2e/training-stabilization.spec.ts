import { test, expect, type Page } from './fixtures'
import { expectAppReady } from './support/appReady'
import {
  cleanupWorkoutLifecycleState,
  closeWorkoutLifecycleEmulator,
} from './support/workoutLifecycleEmulator'

async function countFocusEvents(page: Page, durationMs = 1_000): Promise<number> {
  return page.evaluate((duration) => new Promise<number>((resolve) => {
    let count = 0
    const onFocusIn = () => { count += 1 }
    document.addEventListener('focusin', onFocusIn)
    window.setTimeout(() => {
      document.removeEventListener('focusin', onFocusIn)
      resolve(count)
    }, duration)
  }), durationMs)
}

test.afterAll(closeWorkoutLifecycleEmulator)

test.describe('training stabilization', () => {
  test.beforeEach(async ({ cleanup }) => {
    cleanup.add('remove training stabilization state', cleanupWorkoutLifecycleState)
    await cleanupWorkoutLifecycleState()
  })

  test('exercise picker focus settles for empty and populated sessions', async ({ page }) => {
    await page.goto('/workout/new')
    await expectAppReady(page, '/workout/new', 25_000)
    await page.getByRole('button', { name: 'Rozpocznij nową sesję' }).click()

    const addExercise = page.getByRole('button', { name: 'Dodaj ćwiczenie', exact: true }).first()
    await expect(addExercise).toBeVisible({ timeout: 15_000 })
    await addExercise.click()

    const picker = page.getByRole('dialog', { name: /Wybierz ćwiczenie/i })
    const search = picker.getByRole('textbox', { name: 'Szukaj ćwiczenia' })
    await expect(search).toBeFocused()
    expect(await countFocusEvents(page)).toBe(0)

    await search.fill('Bench Press')
    await expect(search).toBeFocused()
    expect(await countFocusEvents(page)).toBe(0)

    await picker.locator('button').filter({ hasText: /^Bench Press/ }).first().click()
    await expect(picker).toHaveCount(0)
    await expect(addExercise).toBeFocused()

    await addExercise.click()
    await expect(search).toBeFocused()
    expect(await countFocusEvents(page)).toBe(0)
    await page.keyboard.press('Escape')
    await expect(picker).toHaveCount(0)
    await expect(addExercise).toBeFocused()
  })
})
