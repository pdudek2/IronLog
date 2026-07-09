import { test, expect, type Page } from '@playwright/test'

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
 *   - discard only happens via the explicit "Anuluj" button → "Anuluj trening" confirm dialog flow
 *
 * Button naming in WorkoutPage:
 *   - Trigger button (on page): "Anuluj" (mobile top bar OR desktop sidebar)
 *   - Confirm button (inside dialog): "Anuluj trening"
 *   - Cancel button (inside dialog): "Anuluj"
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
  await expect(page).toHaveURL('/workout/new')
  await expect(page.locator('.page-shell')).toBeVisible({ timeout: 25_000 })

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
    await confirmDialog.getByRole('button', { name: 'Anuluj trening' }).click()
    await page.waitForURL('/dashboard', { timeout: 10_000 })
    // Return to workout
    await page.goto('/workout/new')
    await expect(page.locator('.page-shell')).toBeVisible({ timeout: 25_000 })
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
  test('navigating away preserves the session', async ({ page }) => {
    const exerciseName = await startFreshSession(page)

    // Navigate away via URL
    await page.goto('/dashboard')
    await expect(page).toHaveURL('/dashboard')
    await expect(page.locator('.page-shell')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: 'Wróć do sesji' })).toBeVisible({ timeout: 10_000 })

    await page.screenshot({ path: 'test-results/guard-navigated-away.png' })

    // Return to workout
    await page.goto('/workout/new')
    await expect(page).toHaveURL('/workout/new')
    await expect(page.locator('.page-shell')).toBeVisible({ timeout: 25_000 })

    // Session should be restored — exercise card is still visible
    // Firestore restore can take time on mobile/slow network — increase timeout
    await expect(workoutExerciseEntry(page, exerciseName)).toBeVisible({ timeout: 20_000 })

    await page.screenshot({ path: 'test-results/guard-session-restored.png' })

    // Cleanup: "Anuluj" triggers dialog, "Anuluj trening" confirms
    const cleanupBtn = page.getByRole('button', { name: 'Anuluj', exact: true }).first()
    await cleanupBtn.click()
    const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Potwierdź akcję' })
    await expect(confirmDialog).toBeVisible()
    await confirmDialog.getByRole('button', { name: 'Anuluj trening' }).click()
    await page.waitForURL('/dashboard', { timeout: 10_000 })
  })

  test('explicit discard clears session and redirects to dashboard', async ({ page }) => {
    const exerciseName = await startFreshSession(page)

    // Trigger discard via the "Anuluj" button
    const discardBtn = page.getByRole('button', { name: 'Anuluj', exact: true }).first()
    await expect(discardBtn).toBeVisible()
    await discardBtn.click()

    // Confirm dialog should appear
    const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Potwierdź akcję' })
    await expect(confirmDialog).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Anulować trening?')).toBeVisible()

    await page.screenshot({ path: 'test-results/guard-discard-dialog.png' })

    // Confirm discard
    await confirmDialog.getByRole('button', { name: 'Anuluj trening' }).click()

    // Should redirect to dashboard
    await page.waitForURL('/dashboard', { timeout: 10_000 })
    await expect(page).toHaveURL('/dashboard')

    // After discard, returning to /workout/new shows workout UI (hook auto-starts new empty session).
    // Verify the OLD session data (exerciseName) is gone — not that an empty screen shows.
    await page.goto('/workout/new')
    await expect(page.locator('.page-shell')).toBeVisible({ timeout: 25_000 })
    // Wait for workout UI to be ready
    const addExBtn = page.getByRole('button', { name: /Dodaj ćwiczenie/ }).first()
    await expect(addExBtn).toBeVisible({ timeout: 15_000 })
    // Old exercise should not be in the session
    await expect(workoutExerciseEntry(page, exerciseName)).not.toBeVisible({ timeout: 5_000 })
  })

  test('cancel in discard dialog keeps session active', async ({ page }) => {
    const exerciseName = await startFreshSession(page)

    // Click "Anuluj" to trigger dialog
    const discardBtn = page.getByRole('button', { name: 'Anuluj', exact: true }).first()
    await discardBtn.click()

    // Scope to ConfirmDialog specifically (ExercisePicker also has role="dialog" and may linger)
    const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Potwierdź akcję' })
    await expect(confirmDialog).toBeVisible()

    // Click "Anuluj" inside dialog (cancel — keeps session)
    await confirmDialog.getByRole('button', { name: 'Anuluj', exact: true }).click()

    // Dialog should close
    await expect(confirmDialog).not.toBeVisible({ timeout: 5_000 })

    // Still on workout page with session intact
    await expect(page).toHaveURL('/workout/new')
    await expect(workoutExerciseEntry(page, exerciseName)).toBeVisible()

    // Cleanup
    const cleanupBtn = page.getByRole('button', { name: 'Anuluj', exact: true }).first()
    await cleanupBtn.click()
    const cleanupDialog = page.getByRole('dialog').filter({ hasText: 'Potwierdź akcję' })
    await cleanupDialog.getByRole('button', { name: 'Anuluj trening' }).click()
    await page.waitForURL('/dashboard', { timeout: 10_000 })
  })
})
