import { test, expect, type Page } from './fixtures'
import { deleteTemplateByName, discardActiveSession } from './support/accountCleanup'
import { expectAppReady } from './support/appReady'
import { openTemplateDraft } from './support/templateDraft'

const NEXT_SESSION_TEMPLATE_NAME = '_E2E Dashboard Next Session_'

async function openDashboard(page: Page) {
  await page.goto('/dashboard')
  await expectAppReady(page, '/dashboard')
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

  test('opens the compact next-session plan with Start before Edit on mobile', async ({ page, cleanup }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only quick-look contract')
    await page.setViewportSize({ width: 320, height: 844 })
    cleanup.add('discard active session', () => discardActiveSession(page))

    await discardActiveSession(page)
    await openTemplateDraft(page, {
      name: NEXT_SESSION_TEMPLATE_NAME,
      days: [{
        name: 'Upper A',
        exercises: [
          ['bench-press', 'Bench Press', 4, 8, 70],
          ['barbell-row', 'Barbell Row', 4, 8, 65],
          ['ohp', 'Overhead Press', 3, 10, 40],
        ].map(([exerciseId, name, sets, targetReps, targetWeight]) => ({
          exerciseId: String(exerciseId),
          exerciseSource: 'global' as const,
          name: String(name),
          sets: Number(sets),
          targetReps: Number(targetReps),
          targetWeight: Number(targetWeight),
        })),
      }],
    })
    await page.getByRole('button', { name: 'Zapisz szablon' }).click()
    await page.waitForURL('/templates', { timeout: 15_000 })
    cleanup.add('delete next-session template', () => deleteTemplateByName(page, NEXT_SESSION_TEMPLATE_NAME))

    await openDashboard(page)
    const readinessSave = page.getByRole('button', { name: 'Zapisz wynik' })
    if (await readinessSave.isVisible().catch(() => false)) {
      await readinessSave.click()
    }

    const recommendation = page.getByRole('region', { name: 'Dzisiejszy trening' })
    await expect(recommendation).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: 'Edytuj' })).toBeHidden()
    expect(await page.evaluate(() => (
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    ))).toBe(0)

    await recommendation.getByRole('button', { name: 'Podejrzyj dzisiejszy plan' }).click()
    const dialog = page.getByRole('dialog', { name: 'Upper A' })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.dashboard-plan-popover-actions > button')).toHaveText([
      'Rozpocznij',
      'Edytuj',
    ])

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    await recommendation.getByRole('button', { name: 'Podejrzyj dzisiejszy plan' }).click()
    await dialog.getByRole('button', { name: 'Rozpocznij' }).click()
    await expect(dialog).toBeHidden()
    await expect(page).toHaveURL('/workout/new', { timeout: 15_000 })
    await expect(page.getByText('Bench Press', { exact: true }).first()).toBeVisible({ timeout: 15_000 })
  })
})
