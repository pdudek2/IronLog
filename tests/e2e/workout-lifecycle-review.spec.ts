import { test, expect } from './fixtures'
import { expectAppReady } from './support/appReady'
import {
  cleanupWorkoutReviewState,
  closeWorkoutReviewEmulator,
  readReviewActiveSession,
  seedReviewActiveSession,
  seedReviewWorkout,
  waitForReviewActiveSession,
} from './support/workoutReviewEmulator'
import { isExpectedWorkoutReviewProjectionDiagnostic } from './support/workoutReviewDiagnostics'

test.afterAll(closeWorkoutReviewEmulator)

test.describe('Workout lifecycle review evidence', () => {
  test('shows a completed workout while restoring its residual active session in an independent client', async ({
    context,
    page,
    cleanup,
    observedContextFactory,
  }) => {
    const startedAt = Date.now() - 10 * 60_000
    cleanup.add('remove Phase R workout review state', cleanupWorkoutReviewState)
    await cleanupWorkoutReviewState()

    await seedReviewWorkout({
      id: `phase-r-residual-${Date.now()}`,
      label: 'Phase R completed residual',
      materialized: true,
      startedAt,
    })
    await seedReviewActiveSession(startedAt)
    await waitForReviewActiveSession((session) => session?.startedAt === startedAt)

    await page.goto('/dashboard')
    await expectAppReady(page, '/dashboard')
    await expect(page.getByText('Phase R completed residual', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Wróć do sesji' })).toBeVisible()

    const independentContext = await observedContextFactory.newContext({
      storageState: await context.storageState(),
    })
    const independentPage = await independentContext.newPage()
    await independentPage.goto('/workout/new')
    await expectAppReady(independentPage, '/workout/new')
    await expect(independentPage.getByText('Bench Press', { exact: true }).first()).toBeVisible()
    expect((await readReviewActiveSession())?.startedAt).toBe(startedAt)
  })

  test('shows only the sync badge while materialization remains pending', async ({
    page,
    cleanup,
    expectedBrowserDiagnostics,
  }) => {
    cleanup.add('remove Phase R workout review state', cleanupWorkoutReviewState)
    await cleanupWorkoutReviewState()
    await seedReviewWorkout({
      id: `phase-r-pending-${Date.now()}`,
      label: 'Phase R pending projection',
      materialized: false,
    })

    await page.route('**/api/materialize-workout', (route) => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"error":"phase-r projection failure"}',
    }))

    const pendingRow = page.locator('.dashboard-history-row').filter({
      hasText: 'Phase R pending projection',
    })
    const projectionFailureResponse = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return url.pathname === '/api/materialize-workout' && response.status() === 503
    })

    await expectedBrowserDiagnostics.during(
      'intentional Phase R projection failure',
      isExpectedWorkoutReviewProjectionDiagnostic,
      async () => {
        await page.goto('/dashboard')
        await expectAppReady(page, '/dashboard')
        await projectionFailureResponse
        await expect(pendingRow).toBeVisible()
        await expect(pendingRow.getByText('sync', { exact: true })).toBeVisible()
      },
    )
    await expect(pendingRow).not.toContainText(/spróbuj ponownie|oczekuje|błąd synchronizacji/i)
  })
})
