import { test, expect, type Page } from './fixtures'
import { discardActiveSession } from './support/accountCleanup'
import { expectAppReady } from './support/appReady'

async function waitForWorkoutState(page: Page): Promise<void> {
  await Promise.race([
    page.getByRole('button', { name: 'Odrzuć i zacznij od nowa' }).waitFor({ state: 'visible', timeout: 25_000 }),
    page.getByRole('button', { name: 'Anuluj', exact: true }).first().waitFor({ state: 'visible', timeout: 25_000 }),
    page.getByRole('button', { name: 'Rozpocznij nową sesję' }).waitFor({ state: 'visible', timeout: 25_000 }),
    page.getByRole('button', { name: /Dodaj ćwiczenie/ }).first().waitFor({ state: 'visible', timeout: 25_000 }),
  ])
}

function workoutExerciseEntry(page: Page, exerciseName: string) {
  return page.locator('.workout-exercise-card').filter({ hasText: exerciseName }).first()
}

/**
 * Workout Guard tests — updated contract after removal of useBlocker.
 *
 * useBlocker was removed (2026-04-14) because it requires createBrowserRouter
 * and the app uses <BrowserRouter>. The new contract:
 *   - navigating AWAY from workout does NOT discard the session
 *   - session persists in Firestore (activeSessions/{uid})
 *   - returning to /workout/new restores the session
 *   - discard only happens via the explicit "Anuluj" button → "Odrzuć trening" confirm dialog flow
 *
 * Button naming in WorkoutPage:
 *   - Trigger button (on page): "Anuluj" (mobile top bar OR desktop sidebar)
 *   - Confirm button (inside dialog): "Odrzuć trening"
 *   - Cancel button (inside dialog): "Wróć"
 *
 * Important: useActiveSession auto-starts a new empty session when no backup/Firestore doc
 * exists on fresh navigation. "Rozpocznij nową sesję" never appears after discard.
 * After discard, verify the OLD session data (exercises) are gone instead.
 *
 * Important: ExercisePicker has role="dialog" and may linger in DOM during exit animation.
 * Always scope dialog queries with filter({ hasText }) to target the specific dialog.
 */

async function startFreshSession(page: Page): Promise<string> {
  await page.goto('/workout/new')
  await expectAppReady(page, '/workout/new', 25_000)

  const staleDiscardBtn = page.getByRole('button', { name: 'Odrzuć i zacznij od nowa' })
  const discardBtn = page.getByRole('button', { name: 'Anuluj', exact: true }).first()
  const startBtn = page.getByRole('button', { name: 'Rozpocznij nową sesję' })
  const addExBtn = page.getByRole('button', { name: /Dodaj ćwiczenie/ }).first()

  await waitForWorkoutState(page)

  if (await staleDiscardBtn.isVisible()) {
    await staleDiscardBtn.click()
    await expect(addExBtn).toBeVisible({ timeout: 15_000 })
  } else if (await discardBtn.isVisible()) {
    await discardBtn.click()
    // Target ConfirmDialog specifically (not ExercisePicker which also has role="dialog")
    const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Potwierdź akcję' })
    await expect(confirmDialog).toBeVisible()
    await expect(confirmDialog.getByRole('button', { name: 'Wróć', exact: true })).toBeVisible()
    const confirmDiscard = confirmDialog.getByRole('button', { name: 'Odrzuć trening', exact: true })
    await expect(confirmDiscard).toBeVisible()
    await confirmDiscard.click()
    await page.waitForURL('/dashboard', { timeout: 10_000 })
    // Return to workout
    await page.goto('/workout/new')
    await expectAppReady(page, '/workout/new', 25_000)
    await waitForWorkoutState(page)
  }

  if (await startBtn.isVisible()) {
    await startBtn.click()
  }

  await expect(addExBtn).toBeVisible({ timeout: 15_000 })

  // Add one exercise to make the session meaningful
  await addExBtn.click()
  await expect(page.getByRole('dialog', { name: /Wybierz ćwiczenie/i })).toBeVisible()
  await page.getByPlaceholder('Szukaj ćwiczenia...').fill('Squat')
  const firstResult = page.getByRole('dialog').filter({ hasText: 'Wybierz ćwiczenie' }).locator('button').filter({ hasText: /squat/i }).first()
  await expect(firstResult).toBeVisible({ timeout: 5_000 })
  // Get just the exercise name text (not full textContent which includes equipment)
  const exerciseName = (await firstResult.locator('p').first().textContent())?.trim() ?? 'Squat'
  await firstResult.click()
  // Wait for picker to fully exit DOM (not just be invisible — Framer Motion keeps it during animation)
  await expect(page.getByRole('dialog', { name: /Wybierz ćwiczenie/i })).not.toBeVisible({ timeout: 5_000 })

  // Wait for exercise to appear in workout UI (confirms Zustand state update)
  await expect(workoutExerciseEntry(page, exerciseName)).toBeVisible({ timeout: 8_000 })

  // Wait for Firestore debounce (400ms) + server write to commit before navigating away.
  // Uses 3s because fresh test contexts have no IndexedDB cache — write must reach server.
  await page.waitForTimeout(3_000)

  return exerciseName
}

test.describe('Workout navigation guard', () => {
  test('navigating away preserves the session', async ({ page, cleanup }) => {
    cleanup.add('discard active session', () => discardActiveSession(page))
    const exerciseName = await startFreshSession(page)

    // Navigate away via URL
    await page.goto('/dashboard')
    await expectAppReady(page, '/dashboard')
    await expect(page.locator('.dashboard-home-actions').getByRole('button', {
      name: 'Wznów trening',
      exact: true,
    })).toBeVisible({ timeout: 10_000 })

    await page.screenshot({ path: 'test-results/guard-navigated-away.png' })

    // Return to workout
    await page.goto('/workout/new')
    await expectAppReady(page, '/workout/new', 25_000)

    // Session should be restored — exercise card is still visible
    // Firestore restore can take time on mobile/slow network — increase timeout
    await expect(workoutExerciseEntry(page, exerciseName)).toBeVisible({ timeout: 20_000 })

    await page.screenshot({ path: 'test-results/guard-session-restored.png' })

  })

  test('explicit discard clears session and redirects to dashboard', async ({
    page,
    cleanup,
    diagnosticsController,
  }) => {
    let discardCompleted = false
    cleanup.add('discard active session', async () => {
      if (!discardCompleted) await discardActiveSession(page)
    })
    await startFreshSession(page)

    // Trigger discard via the "Anuluj" button
    const discardBtn = page.getByRole('button', { name: 'Anuluj', exact: true }).first()
    await expect(discardBtn).toBeVisible()
    await discardBtn.click()

    // Confirm dialog should appear
    const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Potwierdź akcję' })
    await expect(confirmDialog).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Anulować trening?')).toBeVisible()
    await expect(confirmDialog.getByRole('button', { name: 'Wróć', exact: true })).toBeVisible()
    const confirmDiscard = confirmDialog.getByRole('button', { name: 'Odrzuć trening', exact: true })
    await expect(confirmDiscard).toBeVisible()

    await page.screenshot({ path: 'test-results/guard-discard-dialog.png' })

    // Confirm discard
    await diagnosticsController.runInIntentionalTeardown(page.context(), async () => {
      await confirmDiscard.click()
      await page.waitForURL('/dashboard', { timeout: 10_000 })
      await expect(page).toHaveURL('/dashboard')
      await expect(page.getByRole('button', {
        name: 'Rozpocznij nowy trening',
        exact: true,
      }).first()).toBeVisible({ timeout: 10_000 })
    })
    discardCompleted = true
  })

  test('cancel in discard dialog keeps session active', async ({ page, cleanup }) => {
    cleanup.add('discard active session', () => discardActiveSession(page))
    const exerciseName = await startFreshSession(page)

    // Click "Anuluj" to trigger dialog
    const discardBtn = page.getByRole('button', { name: 'Anuluj', exact: true }).first()
    await discardBtn.click()

    // Scope to ConfirmDialog specifically (ExercisePicker also has role="dialog" and may linger)
    const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Potwierdź akcję' })
    await expect(confirmDialog).toBeVisible()

    await expect(confirmDialog.getByRole('button', { name: 'Odrzuć trening', exact: true })).toBeVisible()
    const returnButton = confirmDialog.getByRole('button', { name: 'Wróć', exact: true })
    await expect(returnButton).toBeVisible()

    // Click "Wróć" inside dialog (cancel — keeps session)
    await returnButton.click()

    // Dialog should close
    await expect(confirmDialog).not.toBeVisible({ timeout: 5_000 })

    // Still on workout page with session intact
    await expect(page).toHaveURL('/workout/new')
    await expect(workoutExerciseEntry(page, exerciseName)).toBeVisible()

  })
})
