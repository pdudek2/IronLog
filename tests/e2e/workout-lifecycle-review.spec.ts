import {
  test,
  expect,
  type BrowserContext,
  type ObservedContextFactory,
  type Page,
} from './fixtures'
import { expectAppReady } from './support/appReady'
import { isExpectedFirestoreOfflineDiagnostic } from './support/offlineDiagnostics'
import {
  cleanupWorkoutReviewState,
  closeWorkoutReviewEmulator,
  readReviewActiveSession,
  seedReviewActiveSession,
  seedReviewWorkout,
  waitForReviewActiveSession,
  waitForSettledReviewActiveSession,
} from './support/workoutReviewEmulator'
import { isExpectedWorkoutReviewProjectionDiagnostic } from './support/workoutReviewDiagnostics'
import { MAX_ACTIVE_SESSION_AGE_MS } from '../../src/lib/sessionDuration'

async function openIndependentWorkoutClient(
  observedContextFactory: ObservedContextFactory,
  storageState: Awaited<ReturnType<BrowserContext['storageState']>>,
) {
  const context = await observedContextFactory.newContext({ storageState })
  const page = await context.newPage()
  await page.goto('/workout/new')
  await expectAppReady(page, '/workout/new', 25_000)
  return { context, page }
}

async function discardCurrentWorkout(page: Page) {
  await page.getByRole('button', { name: 'Anuluj', exact: true }).first().click()
  const dialog = page.getByRole('dialog').filter({ hasText: 'Potwierdź akcję' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Anuluj trening' }).click()
  await page.waitForURL('/dashboard', { timeout: 15_000 })
  await waitForReviewActiveSession((session) => session === null)
}

test.afterAll(closeWorkoutReviewEmulator)

test.describe('Workout lifecycle review evidence', () => {
  test('offline second client resurrects the deleted active session', async ({
    context,
    cleanup,
    expectedBrowserDiagnostics,
    observedContextFactory,
  }, testInfo) => {
    cleanup.add('remove Phase R workout review state', cleanupWorkoutReviewState)
    await cleanupWorkoutReviewState()
    await seedReviewActiveSession()
    await waitForReviewActiveSession()

    const storageState = await context.storageState()
    const clientA = await openIndependentWorkoutClient(observedContextFactory, storageState)
    const clientB = await openIndependentWorkoutClient(observedContextFactory, storageState)
    const reps = clientB.page.getByLabel('Powtórzenia, Bench Press, seria 1')

    await reps.fill('6')
    let resultingSession: Awaited<ReturnType<typeof waitForSettledReviewActiveSession>> = null
    await expectedBrowserDiagnostics.during(
      'intentional Phase R second-client offline write',
      isExpectedFirestoreOfflineDiagnostic,
      async () => {
        await clientB.context.setOffline(true)
        await clientA.page.route('**/api/materialize-workout', (route) => route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '{"ok":true}',
        }))
        await clientA.page.getByRole('button', { name: 'Zakończ' }).click()
        await clientA.page.waitForURL('/dashboard', { timeout: 15_000 })
        await waitForReviewActiveSession((session) => session === null)
        await clientB.context.setOffline(false)
        resultingSession = await waitForSettledReviewActiveSession()
      },
    )

    await testInfo.attach('phase-r-two-client-state.json', {
      body: Buffer.from(JSON.stringify(resultingSession, null, 2)),
      contentType: 'application/json',
    })
    expect(resultingSession?.exercises[0]?.sets[0]?.reps).toBe('6')

    await clientB.page.route('**/api/materialize-workout', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"ok":true}',
    }))
    await discardCurrentWorkout(clientB.page)
  })

  test('continuing a stale session refreshes and persists its timer', async ({
    context,
    cleanup,
    observedContextFactory,
  }) => {
    const staleStartedAt = Date.now() - MAX_ACTIVE_SESSION_AGE_MS - 60_000
    cleanup.add('remove Phase R workout review state', cleanupWorkoutReviewState)
    await cleanupWorkoutReviewState()
    await seedReviewActiveSession(staleStartedAt)
    await waitForReviewActiveSession((session) => session?.startedAt === staleStartedAt)

    const { page } = await openIndependentWorkoutClient(
      observedContextFactory,
      await context.storageState(),
    )
    await expect(page.getByRole('heading', { name: 'Wrócić do starej sesji?' })).toBeVisible()
    await page.getByRole('button', { name: 'Kontynuuj' }).click()
    await expect(page.getByText('Bench Press', { exact: true }).first()).toBeVisible()

    const session = await waitForReviewActiveSession((candidate) => (
      candidate !== null
      && candidate.startedAt > staleStartedAt
      && Date.now() - candidate.startedAt <= MAX_ACTIVE_SESSION_AGE_MS
    ))
    expect(session?.exercises).toHaveLength(1)
    await discardCurrentWorkout(page)
  })

  test('discarding a stale session persists an empty current replacement', async ({
    context,
    cleanup,
    observedContextFactory,
  }) => {
    const staleStartedAt = Date.now() - MAX_ACTIVE_SESSION_AGE_MS - 60_000
    cleanup.add('remove Phase R workout review state', cleanupWorkoutReviewState)
    await cleanupWorkoutReviewState()
    await seedReviewActiveSession(staleStartedAt)
    await waitForReviewActiveSession((session) => session?.startedAt === staleStartedAt)

    const { page } = await openIndependentWorkoutClient(
      observedContextFactory,
      await context.storageState(),
    )
    await expect(page.getByRole('heading', { name: 'Wrócić do starej sesji?' })).toBeVisible()
    await page.getByRole('button', { name: 'Odrzuć i zacznij od nowa' }).click()
    await expect(page.getByText('Bench Press', { exact: true })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Dodaj ćwiczenie', exact: true }).first()).toBeVisible()

    const session = await waitForReviewActiveSession((candidate) => (
      candidate !== null
      && candidate.startedAt > staleStartedAt
      && candidate.exercises.length === 0
    ))
    expect(session?.exercises).toEqual([])
    await discardCurrentWorkout(page)
  })

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
