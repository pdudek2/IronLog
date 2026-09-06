import { test, expect, type Page } from './fixtures'
import { expectAppReady } from './support/appReady'
import {
  cleanupWorkoutLifecycleState,
  closeWorkoutLifecycleEmulator,
  readLifecycleActiveSession,
  readLifecycleExerciseSessions,
  readLifecycleWorkout,
  seedLifecycleActiveSession,
  seedLifecycleWorkout,
} from './support/workoutLifecycleEmulator'
import {
  cleanupExerciseDetailEmulatorState,
  cleanupProgressEmulatorState,
  closeProgressEmulator,
  PROGRESS_DETAIL_EXERCISE_ID,
  seedExerciseDetailEmulatorState,
  seedProgressEmulatorState,
} from './support/progressEmulator'

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

async function setProfileUnits(page: Page, units: 'kg' | 'lbs'): Promise<void> {
  await page.goto('/profile')
  await expectAppReady(page, '/profile')
  const choice = page.getByRole('button', { name: units, exact: true })
  await choice.click()
  await page.getByRole('button', { name: 'Zapisz zmiany' }).click()
  await expect(page.getByText('Profil zapisany')).toBeVisible({ timeout: 8_000 })
  await expect(choice).toHaveAttribute('aria-pressed', 'true')
}

test.afterAll(async () => {
  await closeWorkoutLifecycleEmulator()
  await closeProgressEmulator()
})

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

  test('kg and lbs presentation preserves completed-workout storage while editing', async ({ page, cleanup }) => {
    const sessionId = 'phase-1-training-stabilization-units'
    cleanup.add('remove progress unit fixtures', async () => {
      await cleanupProgressEmulatorState()
      await cleanupExerciseDetailEmulatorState()
    })
    await cleanupProgressEmulatorState()
    await cleanupExerciseDetailEmulatorState()
    await seedProgressEmulatorState(Date.now() - Date.UTC(2026, 3, 6, 12))
    await seedExerciseDetailEmulatorState()
    await seedLifecycleWorkout({
      sessionId,
      materialized: true,
      label: 'Phase 1 training stabilization units',
      exercises: [{
        exerciseId: 'bench-press',
        exerciseSource: 'global',
        name: 'Bench Press',
        sets: [{ weight: 65, reps: 8 }],
      }],
    })

    await page.goto('/profile')
    await expectAppReady(page, '/profile')
    const originalUnits = await page.getByRole('button', { name: 'lbs', exact: true }).getAttribute('aria-pressed') === 'true'
      ? 'lbs'
      : 'kg'
    cleanup.add('restore profile units', () => setProfileUnits(page, originalUnits))
    await setProfileUnits(page, 'lbs')

    await page.goto('/dashboard')
    await expectAppReady(page, '/dashboard')
    await expect(page.getByText('1.1k lbs').first()).toBeVisible({ timeout: 15_000 })

    await page.goto('/history')
    await expectAppReady(page, '/history')
    const historyRow = page.getByRole('button', { name: /Phase 1 training stabilization units/i })
    await expect(historyRow).toContainText('1.1k lbs')
    await historyRow.click()

    const detailTable = page.getByRole('table', { name: 'Serie: Bench Press' })
    await expect(detailTable.getByRole('columnheader', { name: 'Ciężar lbs' })).toBeVisible()
    await expect(detailTable.getByRole('cell', { name: '143.3' })).toBeVisible()
    const visibleEdit = page.locator('button:visible').filter({ hasText: /^Edytuj trening$/ }).first()
    await visibleEdit.click()
    const weightInput = page.getByRole('spinbutton', { name: 'Ciężar, Bench Press, seria 1, lbs' })
    await expect(weightInput).toHaveValue('143.3')
    await page.locator('button:visible').filter({ hasText: /^Zapisz$/ }).first().click()
    await expect(weightInput).toHaveCount(0)
    expect((await readLifecycleWorkout(sessionId))?.exercises?.[0]?.sets?.[0]?.weight).toBe(65)

    await page.locator('button:visible').filter({ hasText: /^Edytuj trening$/ }).first().click()
    const fractionalWeight = page.getByRole('spinbutton', { name: 'Ciężar, Bench Press, seria 1, lbs' })
    await fractionalWeight.fill('')
    await fractionalWeight.pressSequentially('100.5')
    await expect(fractionalWeight).toHaveValue('100.5')
    await page.locator('button:visible').filter({ hasText: /^Zapisz$/ }).first().click()
    await expect(fractionalWeight).toHaveCount(0)
    const storedWeight = (await readLifecycleWorkout(sessionId))?.exercises?.[0]?.sets?.[0]?.weight
    expect(storedWeight).toBeCloseTo(100.5 / 2.2046226218, 4)

    await page.goto(`/exercises/user/${PROGRESS_DETAIL_EXERCISE_ID}`)
    await expect(page.getByRole('heading', { name: 'Phase 7 Volume Detail' })).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.exercise-detail-volume-summary')).toContainText('lbs')

    await page.goto('/progress')
    await expectAppReady(page, '/progress')
    await expect(page.getByText('lbs', { exact: false }).first()).toBeVisible({ timeout: 15_000 })

    await setProfileUnits(page, 'kg')
    await page.goto(`/workout/${sessionId}`)
    await expect(page.getByRole('table', { name: 'Serie: Bench Press' }).getByRole('columnheader', { name: 'Ciężar kg' })).toBeVisible()
  })
})
