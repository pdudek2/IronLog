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
  readCachedActiveSessionWrite,
  readLocalActiveSessionRecovery,
  setFirestoreNetworkEnabled,
} from './support/firestoreBrowserBridge'
import {
  cleanupWorkoutLifecycleState,
  closeWorkoutLifecycleEmulator,
  commitPendingLifecycleFinalization,
  readLifecycleActiveSession,
  readLifecycleClosedSession,
  readLifecycleExerciseSessions,
  readLifecycleRecords,
  readLifecycleWorkout,
  readLifecycleWorkouts,
  seedLifecycleActiveSession,
  seedLifecycleWorkout,
  waitForLifecycleActiveSession,
  waitForSettledLifecycleActiveSession,
} from './support/workoutLifecycleEmulator'
import {
  isExpectedWorkoutLifecycleAckLossDiagnostic,
  isExpectedWorkoutLifecycleProjectionDiagnostic,
  isExpectedWorkoutLifecycleTombstoneDiagnostic,
} from './support/workoutLifecycleDiagnostics'
import { MAX_ACTIVE_SESSION_AGE_MS } from '../../src/lib/sessionDuration'

const RESPONSE_TIMEOUT_MS = 20_000

async function expectQueuedActiveSessionEdit(
  page: Page,
  expected: { sessionId: string; exerciseNames: string[]; reps: string },
): Promise<void> {
  await expect.poll(
    () => readCachedActiveSessionWrite(page),
    { timeout: RESPONSE_TIMEOUT_MS },
  ).toEqual({
    exists: true,
    hasPendingWrites: true,
    sessionId: expected.sessionId,
    exerciseNames: expected.exerciseNames,
    reps: expected.reps,
  })
}

async function openWorkoutClient(
  observedContextFactory: ObservedContextFactory,
  storageState: Awaited<ReturnType<BrowserContext['storageState']>>,
  path = '/workout/new',
) {
  const context = await observedContextFactory.newContext({ storageState })
  const page = await context.newPage()
  await page.goto(path)
  await expectAppReady(page, path, 25_000)
  return { context, page }
}

async function finishWorkout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Zakończ' }).click()
  await page.waitForURL('/dashboard', { timeout: RESPONSE_TIMEOUT_MS })
}

async function confirmOrdinaryDiscard(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Anuluj', exact: true }).first().click()
  const dialog = page.getByRole('dialog').filter({ hasText: 'Potwierdź akcję' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Wróć', exact: true })).toBeVisible()
  const confirmDiscard = dialog.getByRole('button', { name: 'Odrzuć trening', exact: true })
  await expect(confirmDiscard).toBeVisible()
  await confirmDiscard.click()
}

function phase1Id(scenario: string): string {
  return `phase-1-${scenario}`
}

test.afterAll(closeWorkoutLifecycleEmulator)

test.describe('Workout lifecycle Phase 1 regressions', () => {
  test('normal finish commits one workout and remains closed after reload', async ({
    context,
    cleanup,
    observedContextFactory,
  }) => {
    const sessionId = phase1Id('normal-finish')
    cleanup.add('remove Phase 1 workout lifecycle state', cleanupWorkoutLifecycleState)
    await cleanupWorkoutLifecycleState()
    await seedLifecycleActiveSession({ sessionId, label: 'Phase 1 normal finish' })

    const { page } = await openWorkoutClient(observedContextFactory, await context.storageState())
    await expect(page.getByText('Phase 1 Bench Press', { exact: true }).first()).toBeVisible()
    await finishWorkout(page)

    await expect(page.getByText('Trening zapisany!', { exact: true })).toBeVisible()
    expect(await readLifecycleWorkouts(sessionId)).toHaveLength(1)
    expect(await readLifecycleWorkout(sessionId)).toMatchObject({ sessionId, materialized: true })
    expect(await readLifecycleClosedSession(sessionId)).toMatchObject({
      sessionId,
      outcome: 'finished',
      workoutId: sessionId,
    })
    expect(await readLifecycleActiveSession()).toBeNull()

    await page.reload()
    await expectAppReady(page, '/dashboard')
    await expect(page.getByRole('button', { name: 'Rozpocznij nowy trening' }).first()).toBeVisible()
    expect(await readLifecycleActiveSession()).toBeNull()
  })

  test('lost finalize acknowledgement keeps recovery intent and retry creates exactly one workout', async ({
    browserDiagnostics,
    context,
    cleanup,
    expectedBrowserDiagnostics,
    observedContextFactory,
  }) => {
    const sessionId = phase1Id('finish-ack-loss')
    cleanup.add('remove Phase 1 workout lifecycle state', cleanupWorkoutLifecycleState)
    await cleanupWorkoutLifecycleState()
    await seedLifecycleActiveSession({ sessionId, label: 'Phase 1 finish ack loss' })
    const { page } = await openWorkoutClient(observedContextFactory, await context.storageState())
    let aborted = false

    await page.route('**/api/finalize-workout', async (route) => {
      if (aborted) return route.continue()
      aborted = true
      await route.fetch()
      await route.abort('failed')
    })
    const failedRequest = page.waitForEvent('requestfailed', (request) => (
      new URL(request.url()).pathname === '/api/finalize-workout'
    ))

    await expectedBrowserDiagnostics.during(
      'intentional Phase 1 finalize acknowledgement loss',
      isExpectedWorkoutLifecycleAckLossDiagnostic,
      async () => {
        await page.getByRole('button', { name: 'Zakończ' }).click()
        await expect(page.getByRole('alert')).toContainText('Nie udało się potwierdzić zamknięcia sesji.')
        await failedRequest
        await expect.poll(() => browserDiagnostics.some((entry) => (
          entry.kind === 'console' && isExpectedWorkoutLifecycleAckLossDiagnostic(entry)
        ))).toBe(true)
      },
    )

    expect(await readLifecycleWorkouts(sessionId)).toHaveLength(1)
    expect(await readLifecycleActiveSession()).toBeNull()
    await page.reload()
    await expect(page.getByRole('alert')).toContainText('Nie udało się potwierdzić zamknięcia sesji.')
    await page.getByRole('button', { name: 'Spróbuj ponownie' }).click()
    await page.waitForURL('/dashboard', { timeout: RESPONSE_TIMEOUT_MS })
    expect(await readLifecycleWorkouts(sessionId)).toHaveLength(1)
    expect(await readLifecycleClosedSession(sessionId)).toMatchObject({ outcome: 'finished' })
  })

  test('lost ordinary discard acknowledgement stays on workout and succeeds on retry', async ({
    context,
    cleanup,
    expectedBrowserDiagnostics,
    observedContextFactory,
  }) => {
    const sessionId = phase1Id('discard-ack-loss')
    cleanup.add('remove Phase 1 workout lifecycle state', cleanupWorkoutLifecycleState)
    await cleanupWorkoutLifecycleState()
    await seedLifecycleActiveSession({ sessionId, label: 'Phase 1 discard ack loss' })
    const { page } = await openWorkoutClient(observedContextFactory, await context.storageState())
    let aborted = false
    await page.route('**/api/discard-session', async (route) => {
      if (aborted) return route.continue()
      aborted = true
      await route.fetch()
      await route.abort('failed')
    })
    const failedRequest = page.waitForEvent('requestfailed', (request) => (
      new URL(request.url()).pathname === '/api/discard-session'
    ))

    await expectedBrowserDiagnostics.during(
      'intentional Phase 1 discard acknowledgement loss',
      isExpectedWorkoutLifecycleAckLossDiagnostic,
      async () => {
        await confirmOrdinaryDiscard(page)
        await expect(page).toHaveURL(/\/workout\/new$/)
        await expect(page.getByRole('alert')).toContainText('Nie udało się potwierdzić zamknięcia sesji.')
        await failedRequest
      },
    )
    expect(await readLifecycleActiveSession()).toBeNull()
    expect(await readLifecycleClosedSession(sessionId)).toMatchObject({ outcome: 'discarded' })
    expect(await readLifecycleWorkout(sessionId)).toBeNull()

    await page.getByRole('button', { name: 'Spróbuj ponownie' }).click()
    await page.waitForURL('/dashboard', { timeout: RESPONSE_TIMEOUT_MS })
    expect(await readLifecycleClosedSession(sessionId)).toMatchObject({ outcome: 'discarded' })
    expect(await readLifecycleWorkout(sessionId)).toBeNull()
  })

  test('stale discard creates a different replacement only after confirmed success', async ({
    context,
    cleanup,
    observedContextFactory,
  }) => {
    const sessionId = phase1Id('stale-discard')
    const startedAt = Date.now() - MAX_ACTIVE_SESSION_AGE_MS - 60_000
    cleanup.add('remove Phase 1 workout lifecycle state', cleanupWorkoutLifecycleState)
    await cleanupWorkoutLifecycleState()
    await seedLifecycleActiveSession({ sessionId, startedAt, label: 'Phase 1 stale discard' })
    const { page } = await openWorkoutClient(observedContextFactory, await context.storageState())
    await expect(page.getByRole('heading', { name: 'Wrócić do starej sesji?' })).toBeVisible()

    let releaseRequest!: () => void
    let markRequestSeen!: () => void
    const requestSeen = new Promise<void>((resolve) => { markRequestSeen = resolve })
    const release = new Promise<void>((resolve) => { releaseRequest = resolve })
    await page.route('**/api/discard-session', async (route) => {
      markRequestSeen()
      await release
      const response = await route.fetch()
      await route.fulfill({ response })
    })

    await page.getByRole('button', { name: 'Odrzuć i zacznij od nowa' }).click()
    await requestSeen
    expect(await readLifecycleActiveSession()).toMatchObject({ sessionId })

    releaseRequest()
    const replacement = await waitForLifecycleActiveSession((session) => (
      session !== null && session.sessionId !== sessionId && session.exercises.length === 0
    ))
    expect(replacement?.sessionId).not.toBe(sessionId)
    expect(await readLifecycleClosedSession(sessionId)).toMatchObject({ outcome: 'discarded' })
  })

  test('projection_pending reflects committed closure and remains visible on dashboard', async ({
    context,
    cleanup,
    expectedBrowserDiagnostics,
    observedContextFactory,
  }) => {
    const sessionId = phase1Id('projection-pending')
    cleanup.add('remove Phase 1 workout lifecycle state', cleanupWorkoutLifecycleState)
    await cleanupWorkoutLifecycleState()
    await seedLifecycleActiveSession({ sessionId, label: 'Phase 1 projection pending' })
    const { page } = await openWorkoutClient(observedContextFactory, await context.storageState())

    await page.route('**/api/finalize-workout', async (route) => {
      await commitPendingLifecycleFinalization({
        sessionId,
        materialized: false,
        label: 'Phase 1 projection pending',
      })
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ workoutId: sessionId, status: 'projection_pending' }),
      })
    })
    await page.route('**/api/materialize-workout', (route) => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"error":"Phase 1 projection failure"}',
    }))

    await expectedBrowserDiagnostics.during(
      'intentional Phase 1 pending projection failure',
      isExpectedWorkoutLifecycleProjectionDiagnostic,
      async () => {
        await finishWorkout(page)
        await expect(page.getByText('Trening zapisany. Statystyki oczekują na synchronizację.', { exact: true })).toBeVisible()
        const row = page.locator('.dashboard-history-row').filter({ hasText: 'Phase 1 projection pending' })
        await expect(row).toContainText('Statystyki oczekują na synchronizację.')
        await expect(row.getByRole('button', { name: 'Ponów synchronizację' })).toBeVisible()
      },
    )
    expect(await readLifecycleWorkout(sessionId)).toMatchObject({ materialized: false })
    expect(await readLifecycleClosedSession(sessionId)).toMatchObject({ outcome: 'finished' })
    expect(await readLifecycleActiveSession()).toBeNull()
  })

  test('failed dashboard materialization offers retry and later success clears the failure', async ({
    context,
    cleanup,
    expectedBrowserDiagnostics,
    observedContextFactory,
  }) => {
    const sessionId = phase1Id('projection-retry')
    cleanup.add('remove Phase 1 workout lifecycle state', cleanupWorkoutLifecycleState)
    await cleanupWorkoutLifecycleState()
    await seedLifecycleWorkout({
      sessionId,
      materialized: false,
      label: 'Phase 1 projection retry',
    })
    const dashboardContext = await observedContextFactory.newContext({
      storageState: await context.storageState(),
    })
    const page = await dashboardContext.newPage()
    let attempts = 0
    await page.route('**/api/materialize-workout', async (route) => {
      attempts += 1
      if (attempts === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"error":"Phase 1 projection failure"}',
        })
        return
      }
      const response = await route.fetch()
      await route.fulfill({ response })
    })

    const row = page.locator('.dashboard-history-row').filter({ hasText: 'Phase 1 projection retry' })
    await expectedBrowserDiagnostics.during(
      'intentional Phase 1 first projection failure',
      isExpectedWorkoutLifecycleProjectionDiagnostic,
      async () => {
        await page.goto('/dashboard')
        await expectAppReady(page, '/dashboard')
        await expect(row).toContainText('Automatyczna synchronizacja nie powiodła się.')
      },
    )
    await row.getByRole('button', { name: 'Ponów synchronizację' }).click()
    await expect(row.getByText('Statystyki oczekują na synchronizację.')).not.toBeVisible()
    expect(await readLifecycleWorkout(sessionId)).toMatchObject({ materialized: true })
    expect(await readLifecycleExerciseSessions(sessionId)).toHaveLength(1)
    expect(await readLifecycleRecords()).toHaveLength(1)
  })

  test('offline client write cannot resurrect a session closed by another client', async ({
    browserDiagnostics,
    context,
    cleanup,
    expectedBrowserDiagnostics,
    observedContextFactory,
  }) => {
    const sessionId = phase1Id('offline-closed')
    cleanup.add('remove Phase 1 workout lifecycle state', cleanupWorkoutLifecycleState)
    await cleanupWorkoutLifecycleState()
    await seedLifecycleActiveSession({ sessionId, label: 'Phase 1 offline closed' })
    const storageState = await context.storageState()
    const clientA = await openWorkoutClient(observedContextFactory, storageState)
    const clientB = await openWorkoutClient(observedContextFactory, storageState)

    await expectedBrowserDiagnostics.during(
      'intentional Phase 1 Firestore network suspension',
      (entry) => isExpectedFirestoreOfflineDiagnostic(entry)
        || isExpectedWorkoutLifecycleTombstoneDiagnostic(entry),
      async () => {
        await setFirestoreNetworkEnabled(clientB.page, false)
        await clientB.page.getByLabel('Powtórzenia, Phase 1 Bench Press, seria 1').first().fill('6')
        await expectQueuedActiveSessionEdit(clientB.page, {
          sessionId,
          exerciseNames: ['Phase 1 Bench Press'],
          reps: '6',
        })
        await expect(clientB.page.getByLabel('Powtórzenia, Phase 1 Bench Press, seria 1').first()).toHaveValue('6')
        expect(await readLocalActiveSessionRecovery(clientB.page)).toEqual({
          sessionId,
          exerciseNames: ['Phase 1 Bench Press'],
          reps: '6',
        })
        await finishWorkout(clientA.page)
        expect(await readLifecycleActiveSession()).toBeNull()
        await expectedBrowserDiagnostics.during(
          'exact Phase 1 closed-session tombstone rejection',
          isExpectedWorkoutLifecycleTombstoneDiagnostic,
          async () => {
            const previousRejections = browserDiagnostics.filter(
              isExpectedWorkoutLifecycleTombstoneDiagnostic,
            ).length
            await setFirestoreNetworkEnabled(clientB.page, true)
            await expect.poll(() => browserDiagnostics.filter(
              isExpectedWorkoutLifecycleTombstoneDiagnostic,
            ).length).toBeGreaterThan(previousRejections)
            await expect(clientB.page.getByText('Nie ma aktywnej sesji', { exact: true })).toBeVisible()
            await expect(clientB.page.getByText('Nie udało się zsynchronizować aktywnej sesji.', { exact: true })).not.toBeVisible()
            await expect.poll(() => readCachedActiveSessionWrite(clientB.page)).toEqual({
              exists: false,
              hasPendingWrites: false,
              sessionId: null,
              exerciseNames: [],
              reps: null,
            })
            expect(await readLocalActiveSessionRecovery(clientB.page)).toEqual({
              sessionId: null,
              exerciseNames: [],
              reps: null,
            })
            await clientB.page.reload()
            await expectAppReady(clientB.page, '/workout/new', 25_000)
            await expect(clientB.page.getByText('Nie ma aktywnej sesji', { exact: true })).toBeVisible()
            await expect.poll(() => readLifecycleActiveSession()).toBeNull()
            await clientB.context.close()
            await clientA.context.close()
          },
        )
      },
    )
    await waitForSettledLifecycleActiveSession((session) => session === null)
    expect(await readLifecycleActiveSession()).toBeNull()
    expect(await readLifecycleWorkouts(sessionId)).toHaveLength(1)
  })

  test('offline old write cannot replace the newer session observed by a third client', async ({
    browserDiagnostics,
    context,
    cleanup,
    expectedBrowserDiagnostics,
    observedContextFactory,
  }) => {
    const oldSessionId = phase1Id('offline-old')
    const newSessionId = phase1Id('offline-new')
    cleanup.add('remove Phase 1 workout lifecycle state', cleanupWorkoutLifecycleState)
    await cleanupWorkoutLifecycleState()
    await seedLifecycleActiveSession({ sessionId: oldSessionId, label: 'Phase 1 offline old' })
    const storageState = await context.storageState()
    const clientA = await openWorkoutClient(observedContextFactory, storageState)
    const clientB = await openWorkoutClient(observedContextFactory, storageState)

    await expectedBrowserDiagnostics.during(
      'intentional Phase 1 stale Firestore network suspension',
      (entry) => isExpectedFirestoreOfflineDiagnostic(entry)
        || isExpectedWorkoutLifecycleTombstoneDiagnostic(entry),
      async () => {
        await setFirestoreNetworkEnabled(clientB.page, false)
        await clientB.page.getByLabel('Powtórzenia, Phase 1 Bench Press, seria 1').first().fill('6')
        await expectQueuedActiveSessionEdit(clientB.page, {
          sessionId: oldSessionId,
          exerciseNames: ['Phase 1 Bench Press'],
          reps: '6',
        })
        expect(await readLocalActiveSessionRecovery(clientB.page)).toEqual({
          sessionId: oldSessionId,
          exerciseNames: ['Phase 1 Bench Press'],
          reps: '6',
        })
        await finishWorkout(clientA.page)
        await seedLifecycleActiveSession({ sessionId: newSessionId, label: 'Phase 1 offline new' })
        const clientC = await openWorkoutClient(observedContextFactory, storageState, '/dashboard')
        await expect(clientC.page.getByText('Aktywna sesja: Phase 1 offline new • 1 ćwiczenie', { exact: true })).toBeVisible({
          timeout: RESPONSE_TIMEOUT_MS,
        })
        await expectedBrowserDiagnostics.during(
          'exact Phase 1 stale-session tombstone rejection',
          isExpectedWorkoutLifecycleTombstoneDiagnostic,
          async () => {
            const previousRejections = browserDiagnostics.filter(
              isExpectedWorkoutLifecycleTombstoneDiagnostic,
            ).length
            await setFirestoreNetworkEnabled(clientB.page, true)
            await expect.poll(() => browserDiagnostics.filter(
              isExpectedWorkoutLifecycleTombstoneDiagnostic,
            ).length).toBeGreaterThan(previousRejections)
            await expect.poll(() => readCachedActiveSessionWrite(clientB.page)).toMatchObject({
              exists: true,
              hasPendingWrites: false,
              sessionId: newSessionId,
              exerciseNames: ['Phase 1 Bench Press'],
              reps: '5',
            })
            expect(await readLocalActiveSessionRecovery(clientB.page)).toEqual({
              sessionId: newSessionId,
              exerciseNames: ['Phase 1 Bench Press'],
              reps: '5',
            })
            await expect(clientB.page.getByLabel('Powtórzenia, Phase 1 Bench Press, seria 1').first()).toHaveValue('5')
            await clientC.context.close()
            await clientB.context.close()
            await clientA.context.close()
          },
        )
      },
    )
    await waitForSettledLifecycleActiveSession((session) => session?.sessionId === newSessionId)
    expect(await readLifecycleActiveSession()).toMatchObject({
      sessionId: newSessionId,
      label: 'Phase 1 offline new',
    })
  })
})
