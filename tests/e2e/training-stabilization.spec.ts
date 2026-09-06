import { test, expect, type Page } from './fixtures'
import { expectAppReady } from './support/appReady'
import {
  cleanupWorkoutLifecycleState,
  closeWorkoutLifecycleEmulator,
  readLifecycleActiveSession,
  readLifecycleExerciseSessions,
  readLifecycleWorkout,
  seedLifecycleActiveSession,
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

  test('unfinished-set confirmation preserves cancellation and saves only completed work', async ({ page }) => {
    const sessionId = 'phase-1-training-stabilization-finish'
    await seedLifecycleActiveSession({
      sessionId,
      label: 'Phase 1 training stabilization finish',
    })
    await page.goto('/workout/new')
    await expectAppReady(page, '/workout/new', 25_000)

    const firstWeight = page.getByLabel('Ciężar, Phase 1 Bench Press, seria 1, kg').first()
    const firstReps = page.getByLabel('Powtórzenia, Phase 1 Bench Press, seria 1').first()
    await expect(firstWeight).toHaveValue('80')
    await firstWeight.fill('60')
    await firstReps.fill('8')
    await page.getByRole('button', { name: 'Dodaj serię' }).click()
    await page.getByLabel('Ciężar, Phase 1 Bench Press, seria 2, kg').first().fill('60')
    await page.getByLabel('Powtórzenia, Phase 1 Bench Press, seria 2').first().fill('8')

    const finish = page.getByRole('button', { name: 'Zakończ' })
    await finish.click()
    let dialog = page.getByRole('dialog', { name: 'Finish workout?' })
    await expect(dialog).toContainText('Unfinished sets: 1. Only completed sets will be saved.')
    const continueWorkout = dialog.getByRole('button', { name: 'Continue workout' })
    await expect(continueWorkout).toBeFocused()
    await continueWorkout.click()
    await expect(dialog).toHaveCount(0)

    await expect.poll(async () => (await readLifecycleActiveSession())?.exercises?.[0]?.sets).toHaveLength(2)
    await finish.click()
    dialog = page.getByRole('dialog', { name: 'Finish workout?' })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    expect(await readLifecycleWorkout(sessionId)).toBeNull()

    await finish.click()
    dialog = page.getByRole('dialog', { name: 'Finish workout?' })
    await dialog.locator('..').click({ position: { x: 2, y: 2 } })
    await expect(dialog).toHaveCount(0)
    expect(await readLifecycleWorkout(sessionId)).toBeNull()

    await finish.click()
    dialog = page.getByRole('dialog', { name: 'Finish workout?' })
    await dialog.getByRole('button', { name: 'Save completed sets' }).click()
    await page.waitForURL('/dashboard', { timeout: 20_000 })

    const workout = await readLifecycleWorkout(sessionId)
    expect(workout?.exercises?.[0]?.sets).toEqual([{ weight: 60, reps: 8 }])
    await expect.poll(async () => (await readLifecycleExerciseSessions(sessionId))[0]?.totalVolume).toBe(480)
  })
})
