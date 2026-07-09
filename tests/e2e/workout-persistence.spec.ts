import { test, expect, type Page, type ConsoleMessage } from '@playwright/test'

async function waitForWorkoutState(page: Page): Promise<void> {
  await Promise.race([
    page.getByRole('button', { name: 'Odrzuć i zacznij od nowa' }).waitFor({ state: 'visible', timeout: 25_000 }),
    page.getByRole('button', { name: 'Anuluj', exact: true }).first().waitFor({ state: 'visible', timeout: 25_000 }),
    page.getByRole('button', { name: 'Rozpocznij nową sesję' }).waitFor({ state: 'visible', timeout: 25_000 }),
    page.getByRole('button', { name: /Dodaj ćwiczenie/ }).first().waitFor({ state: 'visible', timeout: 25_000 }),
  ])
}

function captureErrors(page: Page): () => string[] {
  const errors: string[] = []
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      if (!text.includes('extension') && !text.includes('[vite]')) {
        errors.push(text)
      }
    }
  })
  return () => errors
}

/**
 * Ensures no active session exists at the start of a test.
 * Navigates to workout, discards session if one exists.
 */
async function discardActiveSession(page: Page) {
  await page.goto('/workout/new')
  await expect(page).toHaveURL('/workout/new')
  await expect(page.locator('.page-shell')).toBeVisible({ timeout: 25_000 })

  const staleDiscardBtn = page.getByRole('button', { name: 'Odrzuć i zacznij od nowa' })
  const discardBtn = page.getByRole('button', { name: 'Anuluj', exact: true }).first()
  const addExBtn = page.getByRole('button', { name: /Dodaj ćwiczenie/ }).first()

  await waitForWorkoutState(page)

  if (await staleDiscardBtn.isVisible()) {
    await staleDiscardBtn.click()
    await expect(addExBtn).toBeVisible({ timeout: 15_000 })
  } else if (await discardBtn.isVisible()) {
    await discardBtn.click()
    const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Potwierdź akcję' })
    await expect(confirmDialog).toBeVisible({ timeout: 5_000 })
    await confirmDialog.getByRole('button', { name: 'Anuluj trening' }).click()
    await page.waitForURL('/dashboard', { timeout: 10_000 })
  }
}

test.describe('Workout persistence', () => {
  test('active session survives page refresh', async ({ page }) => {
    const getErrors = captureErrors(page)

    await discardActiveSession(page)

    // Navigate fresh to workout page
    await page.goto('/workout/new')
    await expect(page).toHaveURL('/workout/new')
    await expect(page.locator('.page-shell')).toBeVisible({ timeout: 25_000 })

    // Start session if not already active
    const startBtn = page.getByRole('button', { name: 'Rozpocznij nową sesję' })
    if (await startBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await startBtn.click()
    }

    // Wait for workout UI to be ready
    const addExBtn = page.getByRole('button', { name: /Dodaj ćwiczenie/ }).first()
    await expect(addExBtn).toBeVisible({ timeout: 15_000 })

    await page.screenshot({ path: 'test-results/workout-ready.png' })

    // Open exercise picker
    await addExBtn.click()
    await expect(page.getByRole('dialog', { name: /Wybierz ćwiczenie/i })).toBeVisible({ timeout: 5_000 })

    // Search and select first matching exercise
    await page.getByPlaceholder('Szukaj ćwiczenia...').fill('Bench Press')
    const firstResult = page.getByRole('dialog').locator('button').filter({ hasText: /bench press/i }).first()
    await expect(firstResult).toBeVisible({ timeout: 5_000 })
    // Get just the exercise name (first <p> in button, not full textContent which includes equipment)
    const exerciseName = (await firstResult.locator('p').first().textContent())?.trim() ?? 'Bench Press'
    await firstResult.click()

    // Picker should close
    await expect(page.getByRole('dialog', { name: /Wybierz ćwiczenie/i })).not.toBeVisible({ timeout: 5_000 })

    // Exercise name appears in the workout card header
    await expect(page.getByText(exerciseName, { exact: false }).first()).toBeVisible({ timeout: 5_000 })

    // Wait for Firestore debounce (400ms) + server round-trip to complete.
    // Uses 3s because fresh test contexts have no IndexedDB cache — write must reach server.
    await page.waitForTimeout(3_000)

    await page.screenshot({ path: 'test-results/workout-before-reload.png' })

    // Reload
    await page.reload()
    await expect(page).toHaveURL('/workout/new')

    // Session should restore from Firestore
    await expect(page.locator('.page-shell')).toBeVisible({ timeout: 25_000 })
    await expect(page.getByText(exerciseName, { exact: false }).first()).toBeVisible({ timeout: 20_000 })

    await page.screenshot({ path: 'test-results/workout-after-reload.png' })

    // No console errors during the whole flow
    expect(getErrors(), `Console errors: ${getErrors().join('\n')}`).toHaveLength(0)

    // Cleanup: "Anuluj" triggers dialog, "Anuluj trening" confirms. Scope to ConfirmDialog.
    const cleanupBtn = page.getByRole('button', { name: 'Anuluj', exact: true }).first()
    await cleanupBtn.click()
    const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Potwierdź akcję' })
    await expect(confirmDialog).toBeVisible()
    await confirmDialog.getByRole('button', { name: 'Anuluj trening' }).click()
    await page.waitForURL('/dashboard', { timeout: 10_000 })
  })
})
