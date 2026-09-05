import {
  test,
  expect,
  type BrowserContext,
  type ObservedContextFactory,
  type Page,
} from './fixtures'
import { expectAppReady } from './support/appReady'
import { openWorkoutDiscardDialog } from './support/accountCleanup'
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
  seedLifecycleExerciseSession,
  seedLifecycleWorkout,
  waitForLifecycleActiveSession,
  waitForSettledLifecycleActiveSession,
} from './support/workoutLifecycleEmulator'
import {
  isExpectedWorkoutLifecycleAckLossDiagnostic,
  isExpectedWorkoutLifecycleProjectionDiagnostic,
} from './support/workoutLifecycleDiagnostics'
import { MAX_ACTIVE_SESSION_AGE_MS } from '../../src/lib/sessionDuration'

const RESPONSE_TIMEOUT_MS = 20_000

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
  const dialog = await openWorkoutDiscardDialog(page)
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
  test('mobile shows every set from the previous workout beside the active ledger', async ({
    context,
    cleanup,
    observedContextFactory,
    viewport,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Mobile ledger contract')
    cleanup.add('remove Phase 1 workout lifecycle state', cleanupWorkoutLifecycleState)
    await cleanupWorkoutLifecycleState()
    await seedLifecycleExerciseSession({
      sessionId: phase1Id('mobile-previous-benchmark-history'),
      startedAt: Date.UTC(2026, 7, 27, 12),
      sets: [
        { weight: 80, reps: 8 },
        { weight: 80, reps: 8 },
        { weight: 77.5, reps: 10 },
        { weight: 75, reps: 10 },
        { weight: 70, reps: 12 },
      ],
    })
    await seedLifecycleActiveSession({
      sessionId: phase1Id('mobile-previous-benchmark'),
      label: 'Phase 1 mobile previous benchmark',
    })

    const { page } = await openWorkoutClient(observedContextFactory, await context.storageState())
    expect(page.viewportSize()).toEqual(viewport)
    expect(page.viewportSize()!.width).toBeLessThan(1024)
    await expect(page.getByRole('navigation', { name: 'Nawigacja dolna' })).toBeVisible()
    const addSet = page.getByRole('button', { name: 'Dodaj serię' })
    for (let index = 0; index < 4; index += 1) await addSet.click()

    const previousSets = page.locator('.workout-set-previous')
    await expect(previousSets).toHaveCount(5)
    await expect(previousSets.first()).toHaveText('80×8')
    await expect(previousSets.last()).toHaveText('70×12')
    await expect(page.locator('.workout-previous-session')).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('inline-previous-mobile.png'), fullPage: true })
  })

  test('shows every set from the previous workout for the focused exercise', async ({
    context,
    cleanup,
    observedContextFactory,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Desktop session instrument contract')
    const sessionId = phase1Id('previous-benchmark')
    cleanup.add('remove Phase 1 workout lifecycle state', cleanupWorkoutLifecycleState)
    await cleanupWorkoutLifecycleState()
    await seedLifecycleExerciseSession({
      sessionId: phase1Id('previous-benchmark-history'),
      sets: [
        { weight: 77.5, reps: 8 },
        { weight: 75, reps: 10 },
        { weight: 70, reps: 12 },
      ],
    })
    await seedLifecycleActiveSession({ sessionId, label: 'Phase 1 previous benchmark' })

    const { page } = await openWorkoutClient(observedContextFactory, await context.storageState())
    const currentWeight = page.getByLabel('Ciężar, Phase 1 Bench Press, seria 1, kg')
    const addSet = page.getByRole('button', { name: 'Dodaj serię' })
    await addSet.click()
    await addSet.click()

    const previousSets = page.locator('.workout-set-previous')
    await expect(previousSets).toHaveCount(3)
    await expect(previousSets).toHaveText(['77.5×8', '75×10', '70×12'])
    expect(await currentWeight.evaluate((element) => element.getBoundingClientRect().bottom <= window.innerHeight)).toBe(true)
  })

  test('mobile keeps unavailable previous-workout context neutral in the active ledger', async ({
    context,
    cleanup,
    observedContextFactory,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Mobile ledger contract')
    cleanup.add('remove Phase 1 workout lifecycle state', cleanupWorkoutLifecycleState)
    await cleanupWorkoutLifecycleState()
    await seedLifecycleActiveSession({
      sessionId: phase1Id('empty-benchmark'),
      label: 'Phase 1 empty benchmark',
    })

    const { page } = await openWorkoutClient(observedContextFactory, await context.storageState())

    await expect(page.locator('.workout-set-previous')).toHaveText('—')
  })

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
    expect(await readLifecycleWorkout(sessionId)).toMatchObject({
      sessionId,
      materialized: true,
      label: 'Phase 1 normal finish',
      exercises: [{
        exerciseId: 'phase-1-bench-press',
        exerciseSource: 'global',
        name: 'Phase 1 Bench Press',
        sets: [{ weight: 80, reps: 5 }],
      }],
    })
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

    const failedConsole = page.waitForEvent('console', (message) => (
      message.text() === 'Failed to load resource: net::ERR_FAILED'
      && new URL(message.location().url).pathname === '/api/discard-session'
    ))
    await expectedBrowserDiagnostics.during(
      'intentional Phase 1 discard acknowledgement loss',
      isExpectedWorkoutLifecycleAckLossDiagnostic,
      async () => {
        await confirmOrdinaryDiscard(page)
        await expect(page).toHaveURL(/\/workout\/new$/)
        await expect(page.getByRole('alert')).toContainText('Nie udało się potwierdzić zamknięcia sesji.')
        await failedRequest
        await failedConsole
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

  test('concurrent clients expose one explicit active-session conflict and reload the winner', async ({
    context,
    cleanup,
    expectedBrowserDiagnostics,
    observedContextFactory,
  }, testInfo) => {
    const sessionId = phase1Id('concurrent-edit')
    cleanup.add('remove Phase 1 workout lifecycle state', cleanupWorkoutLifecycleState)
    await cleanupWorkoutLifecycleState()
    await seedLifecycleActiveSession({ sessionId, label: 'Phase 1 concurrent edit' })
    const storageState = await context.storageState()
    const clientA = await openWorkoutClient(observedContextFactory, storageState)
    const clientB = await openWorkoutClient(observedContextFactory, storageState)
    const repsA = clientA.page.getByLabel('Powtórzenia, Phase 1 Bench Press, seria 1').first()
    const repsB = clientB.page.getByLabel('Powtórzenia, Phase 1 Bench Press, seria 1').first()
    await expect(repsA).toHaveValue('5')
    await expect(repsB).toHaveValue('5')

    const conflictMessage = 'Sesja zmieniła się na innym urządzeniu.'
    await expectedBrowserDiagnostics.during(
      'expected active-session CAS rejection',
      (entry) => entry.kind === 'console'
        && entry.message.includes('400 (Bad Request)')
        && entry.url?.includes('/documents:commit') === true,
      async () => {
        await Promise.all([repsA.fill('6'), repsB.fill('7')])
        await expect.poll(async () => (
          await clientA.page.getByText(conflictMessage, { exact: true }).count()
          + await clientB.page.getByText(conflictMessage, { exact: true }).count()
        ), { timeout: RESPONSE_TIMEOUT_MS }).toBe(1)
      },
    )

    const conflictedPage = await clientA.page.getByText(conflictMessage, { exact: true }).count()
      ? clientA.page
      : clientB.page
    await conflictedPage.screenshot({ path: testInfo.outputPath('session-conflict.png'), fullPage: true })
    const storedReps = (await readLifecycleActiveSession())?.exercises?.[0]?.sets?.[0]?.reps
    expect(['6', '7']).toContain(storedReps)
    await conflictedPage.getByRole('button', { name: 'Wczytaj nowszą wersję' }).click()
    await expect(conflictedPage.getByLabel('Powtórzenia, Phase 1 Bench Press, seria 1').first())
      .toHaveValue(storedReps)
    await expect(conflictedPage.getByText(conflictMessage, { exact: true })).not.toBeVisible()
  })

  test('offline client edit stays local and cannot resurrect a session closed by another client', async ({
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
        || (entry.kind === 'console'
          && entry.message.includes('400 (Bad Request)')
          && entry.url?.includes('/documents:commit') === true),
      async () => {
        await setFirestoreNetworkEnabled(clientB.page, false)
        await clientB.page.getByLabel('Powtórzenia, Phase 1 Bench Press, seria 1').first().fill('6')
        await expect(clientB.page.getByLabel('Powtórzenia, Phase 1 Bench Press, seria 1').first()).toHaveValue('6')
        expect(await readLocalActiveSessionRecovery(clientB.page)).toEqual({
          sessionId,
          exerciseNames: ['Phase 1 Bench Press'],
          reps: '6',
        })
        await commitPendingLifecycleFinalization({
          sessionId,
          materialized: true,
          label: 'Phase 1 offline closed',
        })
        expect(await readLifecycleActiveSession()).toBeNull()
        await setFirestoreNetworkEnabled(clientB.page, true)
        await expect(clientB.page.getByRole('heading', { name: 'Nowy trening' })).toBeVisible()
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
        await expect(clientB.page.getByRole('heading', { name: 'Nowy trening' })).toBeVisible()
        await expect.poll(() => readLifecycleActiveSession()).toBeNull()
        await clientB.context.close()
        await clientA.context.close()
      },
    )
    await waitForSettledLifecycleActiveSession((session) => session === null)
    expect(await readLifecycleActiveSession()).toBeNull()
    expect(await readLifecycleWorkouts(sessionId)).toHaveLength(1)
  })

  test('offline old write cannot replace the newer session observed by a third client', async ({
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
        || (entry.kind === 'console'
          && entry.message.includes('400 (Bad Request)')
          && entry.url?.includes('/documents:commit') === true),
      async () => {
        await setFirestoreNetworkEnabled(clientB.page, false)
        await clientB.page.getByLabel('Powtórzenia, Phase 1 Bench Press, seria 1').first().fill('6')
        expect(await readLocalActiveSessionRecovery(clientB.page)).toEqual({
          sessionId: oldSessionId,
          exerciseNames: ['Phase 1 Bench Press'],
          reps: '6',
        })
        await commitPendingLifecycleFinalization({
          sessionId: oldSessionId,
          materialized: true,
          label: 'Phase 1 offline old',
        })
        await seedLifecycleActiveSession({ sessionId: newSessionId, label: 'Phase 1 offline new' })
        const clientC = await openWorkoutClient(observedContextFactory, storageState, '/dashboard')
        await expect(clientC.page.getByText('Aktywna sesja: Phase 1 offline new • 1 ćwiczenie', { exact: true })).toBeVisible({
          timeout: RESPONSE_TIMEOUT_MS,
        })
        await setFirestoreNetworkEnabled(clientB.page, true)
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
    await waitForSettledLifecycleActiveSession((session) => session?.sessionId === newSessionId)
    expect(await readLifecycleActiveSession()).toMatchObject({
      sessionId: newSessionId,
      label: 'Phase 1 offline new',
    })
  })
})


test('exercise confirmation cannot delete a remotely rehydrated exercise', async ({ page, cleanup }, testInfo) => {
  cleanup.add('remove exercise identity fixture', cleanupWorkoutLifecycleState)
  await cleanupWorkoutLifecycleState()
  const sessionId = phase1Id('exercise-removal-identity')
  await seedLifecycleActiveSession({ sessionId })
  await page.goto('/workout/new')
  await expectAppReady(page, '/workout/new')
  await page.getByRole('button', { name: 'Usuń ćwiczenie Phase 1 Bench Press' }).click()
  const dialog = page.getByRole('dialog', { name: 'Usunąć ćwiczenie?' })
  await expect(dialog).toBeVisible()
  await seedLifecycleActiveSession({ sessionId, reps: '9' })
  await expect.poll(() => page.getByLabel('Powtórzenia, Phase 1 Bench Press, seria 1').evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))).toEqual(['9'])
  await dialog.getByRole('button', { name: 'Usuń ćwiczenie', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect.poll(() => page.getByLabel('Powtórzenia, Phase 1 Bench Press, seria 1').evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))).toEqual(['9'])
  expect((await readLifecycleActiveSession())?.exercises).toHaveLength(1)
  await page.screenshot({ path: testInfo.outputPath('exercise-removal-identity.png'), fullPage: true })
})


for (const source of ['dashboard', 'detail'] as const) {
  test(`lost delete acknowledgement survives ${source} reload and retries idempotently`, async ({ page, cleanup, expectedBrowserDiagnostics }, testInfo) => {
    cleanup.add('remove delete recovery fixture', cleanupWorkoutLifecycleState)
    await cleanupWorkoutLifecycleState()
    const sessionId = phase1Id(`delete-ack-${source}`)
    await seedLifecycleWorkout({ sessionId, materialized: true, label: 'Phase 1 delete acknowledgement' })
    let interrupted = false
    await page.route('**/api/delete-workout', async (route) => {
      if (interrupted) return route.continue()
      interrupted = true
      const response = await route.fetch()
      expect(response.ok()).toBe(true)
      await route.abort('failed')
    })
    const routePath = source === 'dashboard' ? '/dashboard' : `/workout/${sessionId}`
    await page.goto(routePath)
    await expect(page).toHaveURL(routePath)
    if (source === 'dashboard') await expectAppReady(page, '/dashboard')
    const remove = source === 'dashboard'
      ? page.getByRole('button', { name: /Usuń trening Phase 1 delete acknowledgement/ })
      : page.getByRole('button', { name: 'Usuń trening', exact: true })
    await remove.click()
    const failedRequest = page.waitForEvent('requestfailed', (request) => new URL(request.url()).pathname === '/api/delete-workout')
    const unknown = 'Nie udało się potwierdzić usunięcia treningu. Ponów usunięcie.'
    await expectedBrowserDiagnostics.during('intentional delete acknowledgement loss', isExpectedWorkoutLifecycleAckLossDiagnostic, async () => {
      await page.getByRole('dialog').getByRole('button', { name: /Usuń/ }).click()
      await failedRequest
      await expect(page.getByText(unknown, { exact: true })).toBeVisible()
    })
    expect(await readLifecycleWorkout(sessionId)).toBeNull()
    await page.reload()
    await expect(page.getByText(unknown, { exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`delete-${source}-recovery.png`), fullPage: true })
    await page.getByRole('button', { name: 'Spróbuj ponownie' }).click()
    await expect(page.getByText(unknown, { exact: true })).not.toBeVisible()
    expect(await readLifecycleWorkout(sessionId)).toBeNull()
    expect(await readLifecycleExerciseSessions(sessionId)).toHaveLength(0)
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('ironlog:workout-delete-recovery:')))).toEqual([])
  })
}
