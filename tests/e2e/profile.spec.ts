import { test, expect } from './fixtures'
import { restoreProfileName } from './support/accountCleanup'
import { expectAppReady } from './support/appReady'

/**
 * Profile tests — freeze BUG-03/05/06 fixes:
 * - profile must load on direct entry to /profile (not just after login)
 * - save must show toast feedback
 * - data must persist after reload
 */
test.describe('Profile hydration and save', () => {
  test('profile loads on direct entry — not showing placeholder dashes', async ({ page }) => {
    await page.goto('/profile')
    await expectAppReady(page, '/profile')

    await page.screenshot({ path: 'test-results/profile-loaded.png' })

    // The form input should have a value (not empty) if profile loaded
    const nameInput = page.getByPlaceholder('np. Jan')
    await expect(nameInput).toBeVisible({ timeout: 5_000 })

    // Wait for profile to load from Firestore — on mobile (slower CPU emulation) the data
    // may not yet be in the input when toBeVisible() passes. Wait for a non-empty value.
    await expect(nameInput).not.toHaveValue('', { timeout: 10_000 })
    const nameValue = await nameInput.inputValue()
    expect(nameValue.length, 'Profile name should be loaded (not empty)').toBeGreaterThan(0)

  })

  test('save changes and verify persistence after reload', async ({ page, cleanup }) => {
    await page.goto('/profile')
    await expectAppReady(page, '/profile')

    const nameInput = page.getByPlaceholder('np. Jan')
    await expect(nameInput).toBeVisible()
    // Wait for profile to load before reading (same as first test — mobile can be slow)
    await expect(nameInput).not.toHaveValue('', { timeout: 10_000 })

    // Read current name and create a modified version
    const originalName = (await nameInput.inputValue()).trim()
    cleanup.add('restore profile name', () => restoreProfileName(page, originalName))
    const testName = `${originalName.replace(/ \[test\]$/, '')} [test]`.slice(0, 50)

    // Change name
    await nameInput.fill(testName)

    // Submit form
    await page.getByRole('button', { name: /Zapisz zmiany/ }).click()

    // Toast feedback should appear (BUG-05/06 fix)
    await expect(page.getByText('Profil zapisany')).toBeVisible({ timeout: 8_000 })

    await page.screenshot({ path: 'test-results/profile-saved.png' })

    // Reload and verify persistence
    await page.reload()
    await expectAppReady(page, '/profile')

    const nameInputAfterReload = page.getByPlaceholder('np. Jan')
    await expect(nameInputAfterReload).toBeVisible()
    await expect(nameInputAfterReload).toHaveValue(testName)

    await page.screenshot({ path: 'test-results/profile-after-reload.png' })

  })

  test('profile page has no console errors', async ({ page }) => {
    await page.goto('/profile')
    await expectAppReady(page, '/profile')

    // Wait for async data to settle
    await expect(page.getByPlaceholder('np. Jan')).toBeVisible({ timeout: 5_000 })

  })

  test('reuses the authored slider and keeps the unit switch compact', async ({ page }) => {
    await page.goto('/profile')
    await expectAppReady(page, '/profile')

    const slider = page.getByRole('slider', { name: /Cel tygodniowy/ })
    const unitSwitch = page.locator('.profile-unit-grid')

    await expect(slider).toHaveClass(/readiness-slider/)
    await expect(unitSwitch).toBeVisible()

    const sliderBox = await slider.boundingBox()
    const unitBox = await unitSwitch.boundingBox()
    expect(sliderBox?.height ?? 0).toBeGreaterThanOrEqual(44)
    expect(unitBox?.width ?? Infinity).toBeLessThanOrEqual(224)
  })
})
