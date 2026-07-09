import { test, expect, type Page } from '@playwright/test'

async function openDashboard(page: Page) {
  await page.goto('/dashboard')
  await expect(page).toHaveURL('/dashboard', { timeout: 15_000 })
  await expect(page.locator('.page-shell')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Ostatnie treningi' })).toBeVisible({ timeout: 15_000 })
}

test.describe('Dashboard regressions', () => {
  test('renders one weekly analysis sheet without removed weekly surfaces', async ({ page }) => {
    await openDashboard(page)

    await expect(page.locator('.dashboard-metric-strip')).toHaveCount(0)
    await expect(page.locator('.dashboard-week-pulse')).toHaveCount(0)
    await expect(page.locator('.dashboard-overview-grid:visible')).toHaveCount(1)
  })

  test('delete action on recent workout stays on dashboard when activated with Enter', async ({ page }) => {
    await openDashboard(page)

    const recentWorkouts = page.locator('.dashboard-history-row')
    const workoutCount = await recentWorkouts.count()
    test.skip(workoutCount === 0, 'No workout rows available for the authenticated test account')

    const deleteButton = page.locator('.dashboard-history-row button[aria-label*="Usuń trening"]').first()
    await expect(deleteButton).toBeVisible()
    await deleteButton.focus()
    await expect(deleteButton).toBeFocused()

    await page.keyboard.press('Enter')

    const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Usunąć ten trening?' })
    await expect(confirmDialog).toBeVisible({ timeout: 5_000 })
    await expect(page).toHaveURL('/dashboard')

    await confirmDialog.getByRole('button', { name: 'Anuluj', exact: true }).click()
    await expect(confirmDialog).not.toBeVisible({ timeout: 5_000 })
  })
})
