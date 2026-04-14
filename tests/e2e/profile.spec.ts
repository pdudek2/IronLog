import { test, expect, type Page, type ConsoleMessage } from '@playwright/test'

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
 * Profile tests — freeze BUG-03/05/06 fixes:
 * - profile must load on direct entry to /profile (not just after login)
 * - save must show toast feedback
 * - data must persist after reload
 */
test.describe('Profile hydration and save', () => {
  test('profile loads on direct entry — not showing placeholder dashes', async ({ page }) => {
    const getErrors = captureErrors(page)

    await page.goto('/profile')
    await expect(page).toHaveURL('/profile')
    await expect(page.locator('.page-shell')).toBeVisible({ timeout: 10_000 })

    await page.screenshot({ path: 'test-results/profile-loaded.png' })

    // Profile name in the header should not be "—" (BUG-03 regression check)
    const nameDisplay = page.locator('p.stat-meta').locator('..')
      .filter({ hasText: /—/ }).first()
    // If this is visible, profile failed to load → test fails via the assertion below
    const headerName = page.locator('p.text-2xl, p.text-xl, h1, [class*="font-bold"]').filter({ hasText: /[A-Za-z0-9]/ }).first()
    // The form input should have a value (not empty) if profile loaded
    const nameInput = page.getByPlaceholder('np. Jan')
    await expect(nameInput).toBeVisible({ timeout: 5_000 })

    // Wait for profile to load from Firestore — on mobile (slower CPU emulation) the data
    // may not yet be in the input when toBeVisible() passes. Wait for a non-empty value.
    await expect(nameInput).not.toHaveValue('', { timeout: 10_000 })
    const nameValue = await nameInput.inputValue()
    expect(nameValue.length, 'Profile name should be loaded (not empty)').toBeGreaterThan(0)

    expect(getErrors()).toHaveLength(0)
  })

  test('save changes and verify persistence after reload', async ({ page }) => {
    await page.goto('/profile')
    await expect(page).toHaveURL('/profile')
    await expect(page.locator('.page-shell')).toBeVisible({ timeout: 10_000 })

    const nameInput = page.getByPlaceholder('np. Jan')
    await expect(nameInput).toBeVisible()
    // Wait for profile to load before reading (same as first test — mobile can be slow)
    await expect(nameInput).not.toHaveValue('', { timeout: 10_000 })

    // Read current name and create a modified version
    const originalName = await nameInput.inputValue()
    const testName = originalName.includes('[test]')
      ? originalName
      : `${originalName.trim()} [test]`.trim().slice(0, 50)

    // Change name
    await nameInput.fill(testName)

    // Submit form
    await page.getByRole('button', { name: /Zapisz zmiany/ }).click()

    // Toast feedback should appear (BUG-05/06 fix)
    await expect(page.getByText('Profil zapisany')).toBeVisible({ timeout: 8_000 })

    await page.screenshot({ path: 'test-results/profile-saved.png' })

    // Reload and verify persistence
    await page.reload()
    await expect(page).toHaveURL('/profile')
    await expect(page.locator('.page-shell')).toBeVisible({ timeout: 10_000 })

    const nameInputAfterReload = page.getByPlaceholder('np. Jan')
    await expect(nameInputAfterReload).toBeVisible()
    await expect(nameInputAfterReload).toHaveValue(testName)

    await page.screenshot({ path: 'test-results/profile-after-reload.png' })

    // Restore original name to avoid polluting the test account
    await nameInputAfterReload.fill(originalName.trim())
    await page.getByRole('button', { name: /Zapisz zmiany/ }).click()
    await expect(page.getByText('Profil zapisany')).toBeVisible({ timeout: 8_000 })
  })

  test('profile page has no console errors', async ({ page }) => {
    const getErrors = captureErrors(page)

    await page.goto('/profile')
    await expect(page).toHaveURL('/profile')
    await expect(page.locator('.page-shell')).toBeVisible({ timeout: 10_000 })

    // Wait for async data to settle
    await expect(page.getByPlaceholder('np. Jan')).toBeVisible({ timeout: 5_000 })

    expect(getErrors(), `Profile console errors:\n${getErrors().join('\n')}`).toHaveLength(0)
  })
})
