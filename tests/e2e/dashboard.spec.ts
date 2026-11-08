import { test, expect, type Page } from './fixtures'
import { deleteTemplateByName, discardActiveSession } from './support/accountCleanup'
import { expectAppReady } from './support/appReady'
import { openTemplateDraft } from './support/templateDraft'
import {
  deleteLifecycleWorkout,
  seedLifecycleWorkout,
} from './support/workoutLifecycleEmulator'

const NEXT_SESSION_TEMPLATE_NAME = '_E2E Dashboard Next Session_'
const emulatorMode = process.env.E2E_BACKEND === 'emulator'

async function openDashboard(page: Page) {
  await page.goto('/dashboard')
  await expectAppReady(page, '/dashboard')
  await expect(page.getByRole('heading', { name: 'This week' })).toBeVisible({ timeout: 15_000 })
}

test.describe('Dashboard regressions', () => {
  test('exposes a 44px dashboard streak target at 320px', async ({ page, cleanup }, testInfo) => {
    test.skip(!emulatorMode, 'emulator-only deterministic fixture')
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only geometry contract')
    await page.setViewportSize({ width: 320, height: 844 })
    const sessionId = 'phase-1-5d-dashboard-hit-area'
    cleanup.add('remove dashboard hit-area workout', () => deleteLifecycleWorkout(sessionId))
    await deleteLifecycleWorkout(sessionId)
    await seedLifecycleWorkout({ sessionId, materialized: true, label: 'Phase 1 5D hit area' })
    await openDashboard(page)

    for (const control of [
      page.getByRole('button', { name: /Workout streak/ }),
    ]) {
      const box = await control.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.width).toBeGreaterThanOrEqual(44)
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }
  })

  test('renders one week summary without removed weekly surfaces', async ({ page }) => {
    await openDashboard(page)

    await expect(page.locator('.dashboard-metric-strip')).toHaveCount(0)
    await expect(page.locator('.dashboard-week-pulse')).toHaveCount(0)
    await expect(page.locator('.dashboard-overview-grid')).toHaveCount(0)
    await expect(page.locator('.train-days:visible')).toHaveCount(1)
  })

  test('leaves workout and plan lists to History and Plans', async ({ page, cleanup }) => {
    test.skip(!emulatorMode, 'emulator-only deterministic fixture')
    const sessionId = 'phase-1-dashboard-no-lists'
    cleanup.add('remove no-lists workout', () => deleteLifecycleWorkout(sessionId))
    await deleteLifecycleWorkout(sessionId)
    await seedLifecycleWorkout({ sessionId, materialized: true, label: 'Phase 1 no lists' })
    await openDashboard(page)

    await expect(page.getByRole('heading', { name: 'Recent workouts' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: /^(Plans|Other plans)$/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Delete workout/ })).toHaveCount(0)
  })

  test('keeps today in one dock with one Start on a narrow phone', async ({ page, cleanup }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only dock contract')
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
          ['db-lateral-raise', 'Lateral Raise', 3, 12, 10],
          ['db-curl', 'Dumbbell Curl', 3, 10, 14],
          ['tricep-pushdown', 'Tricep Pushdown', 3, 12, 25],
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
    await page.getByRole('button', { name: 'Save plan' }).click()
    await page.waitForURL('/templates', { timeout: 15_000 })
    cleanup.add('delete next-session template', () => deleteTemplateByName(page, NEXT_SESSION_TEMPLATE_NAME))

    await openDashboard(page)
    const dock = page.getByRole('region', { name: 'Today' })
    await expect(dock).toBeVisible({ timeout: 10_000 })
    await expect(dock.getByRole('button', { name: /^Start / })).toHaveCount(1)

    await dock.locator('[data-today-readiness]').click()
    await dock.getByRole('radio', { name: 'Sleep 2 of 5, Restless' }).check()
    await expect(dock.getByText('Saved for today')).toBeVisible({ timeout: 10_000 })
    await expect(dock.getByRole('button', { name: /^Start / })).toBeVisible()
    await dock.locator('[data-today-readiness]').click()

    await dock.getByRole('radio', { name: '30 min' }).click()
    await expect(dock.getByText(/of 20 sets/)).toBeVisible()
    expect(await page.evaluate(() => (
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    ))).toBe(0)

    await dock.getByRole('button', { name: /^Start / }).click()
    await expect(page).toHaveURL('/workout/new', { timeout: 15_000 })
    await expect(page.getByText('Bench Press', { exact: true }).first()).toBeVisible({ timeout: 15_000 })
  })

})
