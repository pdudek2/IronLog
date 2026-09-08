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

async function finishWorkout(page: Page, workoutId: string): Promise<void> {
  await page.getByRole('button', { name: 'Finish' }).click()
  await page.waitForURL(`/workout/${workoutId}`, { timeout: RESPONSE_TIMEOUT_MS })
}

async function confirmOrdinaryDiscard(page: Page): Promise<void> {
  const dialog = await openWorkoutDiscardDialog(page)
  await expect(dialog.getByRole('button', { name: 'Back', exact: true })).toBeVisible()
  const confirmDiscard = dialog.getByRole('button', { name: 'Discard workout', exact: true })
  await expect(confirmDiscard).toBeVisible()
  await confirmDiscard.click()
}

function phase1Id(scenario: string): string {
  return `phase-1-${scenario}`
}

test.afterAll(closeWorkoutLifecycleEmulator)

test.describe('Workout lifecycle Phase 1 regressions', () => {
  test('mobile returns to the same explicitly started empty session after minimize', async ({
    page,
    cleanup,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Mobile empty-session return contract')
    cleanup.add('remove empty workout lifecycle state', cleanupWorkoutLifecycleState)
    await cleanupWorkoutLifecycleState()

    await page.goto('/dashboard')
    await expectAppReady(page, '/dashboard')
    await page.getByRole('button', { name: 'Start new workout' }).first().click()
    await expectAppReady(page, '/workout/new')
    const started = await waitForSettledLifecycleActiveSession((session) => (
      session !== null && session.exercises.length === 0 && !session.label
    ))
    expect(started).not.toBeNull()

    await page.getByRole('button', { name: 'Minimize workout' }).click()
    await expect(page).toHaveURL('/dashboard')
    const returnBar = page.getByRole('region', { name: 'Active workout' })
    await expect(returnBar).toBeVisible()
    await expect(page.getByRole('button', { name: 'Resume workout' }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start new workout' })).toHaveCount(0)

    await returnBar.getByRole('button', { name: 'Return to workout' }).click()
    await expectAppReady(page, '/workout/new')
    const returned = await readLifecycleActiveSession()
    expect(returned).toMatchObject({
      sessionId: started!.sessionId,
      startedAt: started!.startedAt,
      exercises: [],
    })
  })

  test('mobile minimizes, browses secondary screens, and returns to the same running session', async ({
    page,
    cleanup,
    expectedBrowserDiagnostics,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Mobile browse-and-return contract')
    const sessionId = phase1Id('browse-return')
    const historyId = phase1Id('browse-return-history')
    const startedAt = Date.now() - 5 * 60_000
    cleanup.add('remove Phase 1 workout lifecycle state', cleanupWorkoutLifecycleState)
    await cleanupWorkoutLifecycleState()
    await seedLifecycleActiveSession({
      sessionId,
      startedAt,
      label: 'Phase 1 browse and return with a deliberately long label',
    })
    await seedLifecycleWorkout({
      sessionId: historyId,
      materialized: true,
      label: 'Phase 1 browse history detail',
    })
    await seedLifecycleExerciseSession({
      sessionId: historyId,
      sets: [{ weight: 80, reps: 5 }],
    })

    await page.goto('/workout/new')
    await expectAppReady(page, '/workout/new')
    const reps = page.getByLabel('Reps, Phase 1 Bench Press, set 1').first()
    await page.getByRole('button', { name: 'Unmark set 1 for Phase 1 Bench Press' }).click()
    await reps.fill('6')
    await page.getByRole('button', { name: 'Mark set 1 for Phase 1 Bench Press' }).click()
    await expect(page.locator('.rest-timer-bar')).toContainText('Rest')
    await waitForSettledLifecycleActiveSession((session) => (
      session?.sessionId === sessionId && session.exercises[0]?.sets[0]?.reps === '6'
    ))

    await page.getByRole('button', { name: 'Minimize workout' }).click()
    await expect(page).toHaveURL('/dashboard')
    const returnBar = page.getByRole('region', { name: 'Active workout' })
    await expect(returnBar).toContainText('Workout in progress')
    await expect(returnBar).toContainText('Phase 1 browse and return with a deliberately long label')

    await page.getByRole('navigation', { name: 'Bottom navigation' }).getByRole('button', { name: 'Plans' }).click()
    await expect(page).toHaveURL('/templates')
    await expect(returnBar).toBeVisible()
    await page.getByRole('link', { name: 'Exercises' }).click()
    await expect(page).toHaveURL('/exercises')
    await expect(returnBar).toBeVisible()

    await page.getByRole('navigation', { name: 'Bottom navigation' }).getByRole('button', { name: 'Progress' }).click()
    await expect(page).toHaveURL('/progress')
    await page.getByRole('link', { name: 'View history' }).click()
    await expect(page).toHaveURL('/history')
    await page.getByRole('button', { name: /Phase 1 browse history detail/ }).click()
    await expect(page).toHaveURL(`/workout/${historyId}`)
    await expect(returnBar).toBeVisible()

    await page.getByRole('button', { name: 'Profile' }).click()
    await expect(page).toHaveURL('/profile')
    const nameInput = page.getByLabel('Name')
    await nameInput.focus()
    await expect(returnBar).toBeVisible()
    expect(await page.evaluate(() => {
      const bar = document.querySelector('.active-workout-return-bar')
      const input = document.activeElement
      return bar instanceof HTMLElement
        && input instanceof HTMLElement
        && bar.getBoundingClientRect().bottom <= input.getBoundingClientRect().top
    })).toBe(true)

    await nameInput.blur()
    await page.getByRole('navigation', { name: 'Bottom navigation' }).getByRole('button', { name: 'Coach' }).click()
    await expect(page).toHaveURL('/chat')
    await returnBar.getByRole('button', { name: 'Return to workout' }).click()
    await expect(page).toHaveURL('/workout/new')
    await expect(reps).toHaveValue('6')
    await expect(page.locator('.rest-timer-bar')).toContainText('Rest')

    expect(await readLifecycleActiveSession()).toMatchObject({
      sessionId,
      startedAt,
      exercises: [{ sets: [{ reps: '6', done: true }] }],
    })

    await expectedBrowserDiagnostics.during(
      'intentional pending browse-and-return edit',
      isExpectedFirestoreOfflineDiagnostic,
      async () => {
        await setFirestoreNetworkEnabled(page, false)
        await reps.fill('7')
        await page.getByRole('button', { name: 'Minimize workout' }).click()
        await expect(returnBar).toBeVisible()
        await expect(returnBar).not.toContainText(/saved|cloud/i)
        await returnBar.getByRole('button', { name: 'Return to workout' }).click()
        await expect(reps).toHaveValue('7')
        await expect(page.locator('.rest-timer-bar')).toContainText('Rest')
        await setFirestoreNetworkEnabled(page, true)
      },
    )
    await waitForSettledLifecycleActiveSession((session) => (
      session?.sessionId === sessionId && session.exercises[0]?.sets[0]?.reps === '7'
    ))

    await page.getByRole('button', { name: 'Minimize workout' }).click()
    await expect(returnBar).toBeVisible()
    await commitPendingLifecycleFinalization({
      sessionId,
      materialized: true,
      label: 'Phase 1 browse and return with a deliberately long label',
    })
    await expect(returnBar).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Start new workout' }).first()).toBeVisible()
  })

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
    await expect(page.getByRole('navigation', { name: 'Bottom navigation' })).toBeVisible()
    const addSet = page.getByRole('button', { name: 'Add set' })
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
    const currentWeight = page.getByLabel('Weight, Phase 1 Bench Press, set 1, kg')
    const addSet = page.getByRole('button', { name: 'Add set' })
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
    await finishWorkout(page, sessionId)

    await expect(page.getByRole('heading', { name: 'Workout saved' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Phase 1 normal finish' })).toBeVisible()
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
    await expect(page).toHaveURL(`/workout/${sessionId}`)
    await expect(page.getByRole('heading', { name: 'Phase 1 normal finish' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Workout saved' })).toHaveCount(0)
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
        await page.getByRole('button', { name: 'Finish' }).click()
        await expect(page.getByRole('alert')).toContainText('Could not confirm session closure.')
        await failedRequest
        await expect.poll(() => browserDiagnostics.some((entry) => (
          entry.kind === 'console' && isExpectedWorkoutLifecycleAckLossDiagnostic(entry)
        ))).toBe(true)
      },
    )

    expect(await readLifecycleWorkouts(sessionId)).toHaveLength(1)
    expect(await readLifecycleActiveSession()).toBeNull()
    await page.reload()
    await expect(page.getByRole('alert')).toContainText('Could not confirm session closure.')
    await page.getByRole('button', { name: 'Try again' }).click()
    await page.waitForURL(`/workout/${sessionId}`, { timeout: RESPONSE_TIMEOUT_MS })
    await expect(page.getByRole('heading', { name: 'Workout saved' })).toBeVisible()
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
        await expect(page.getByRole('alert')).toContainText('Could not confirm session closure.')
        await failedRequest
        await failedConsole
      },
    )
    expect(await readLifecycleActiveSession()).toBeNull()
    expect(await readLifecycleClosedSession(sessionId)).toMatchObject({ outcome: 'discarded' })
    expect(await readLifecycleWorkout(sessionId)).toBeNull()

    await page.getByRole('button', { name: 'Try again' }).click()
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
    await expect(page.getByRole('heading', { name: 'Resume an old session?' })).toBeVisible()

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

    await page.getByRole('button', { name: 'Discard and start again' }).click()
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
        await finishWorkout(page, sessionId)
        await expect(page.getByRole('heading', { name: 'Workout saved' })).toBeVisible()
        await expect(page.getByText('Stats are still syncing.', { exact: true })).toBeVisible()
        await page.getByRole('button', { name: 'Back to Home' }).click()
        await expectAppReady(page, '/dashboard')
        const row = page.locator('.dashboard-history-row').filter({ hasText: 'Phase 1 projection pending' })
        await expect(row).toContainText('Stats are waiting to sync.')
        await expect(row.getByRole('button', { name: 'Retry sync' })).toBeVisible()
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
        await expect(row).toContainText('Automatic sync failed.')
      },
    )
    await row.getByRole('button', { name: 'Retry sync' }).click()
    await expect(row.getByText('Stats are waiting to sync.')).not.toBeVisible()
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
    const repsA = clientA.page.getByLabel('Reps, Phase 1 Bench Press, set 1').first()
    const repsB = clientB.page.getByLabel('Reps, Phase 1 Bench Press, set 1').first()
    await expect(repsA).toHaveValue('5')
    await expect(repsB).toHaveValue('5')

    const conflictMessage = 'The session changed on another device.'
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
    await conflictedPage.getByRole('button', { name: 'Load newer version' }).click()
    await expect(conflictedPage.getByLabel('Reps, Phase 1 Bench Press, set 1').first())
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
        await clientB.page.getByLabel('Reps, Phase 1 Bench Press, set 1').first().fill('6')
        await expect(clientB.page.getByLabel('Reps, Phase 1 Bench Press, set 1').first()).toHaveValue('6')
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
        await expect(clientB.page.getByRole('heading', { name: 'New workout' })).toBeVisible()
        await expect(clientB.page.getByText('Could not sync the active session.', { exact: true })).not.toBeVisible()
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
        await expect(clientB.page.getByRole('heading', { name: 'New workout' })).toBeVisible()
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
        await clientB.page.getByLabel('Reps, Phase 1 Bench Press, set 1').first().fill('6')
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
        await expect(clientC.page.getByText('Active session: Phase 1 offline new • 1 exercise', { exact: true })).toBeVisible({
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
        await expect(clientB.page.getByLabel('Reps, Phase 1 Bench Press, set 1').first()).toHaveValue('5')
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
  await page.getByRole('button', { name: 'Remove exercise Phase 1 Bench Press' }).click()
  const dialog = page.getByRole('dialog', { name: 'Remove exercise?' })
  await expect(dialog).toBeVisible()
  await seedLifecycleActiveSession({ sessionId, reps: '9' })
  await expect.poll(() => page.getByLabel('Reps, Phase 1 Bench Press, set 1').evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))).toEqual(['9'])
  await dialog.getByRole('button', { name: 'Remove exercise', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect.poll(() => page.getByLabel('Reps, Phase 1 Bench Press, set 1').evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))).toEqual(['9'])
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
      ? page.getByRole('button', { name: /Delete workout Phase 1 delete acknowledgement/ })
      : page.getByRole('button', { name: 'Delete workout', exact: true })
    await remove.click()
    await expect(page.getByRole('dialog', { name: 'Delete workout?' })).toContainText('Phase 1 delete acknowledgement')
    await page.getByRole('dialog').screenshot({ path: testInfo.outputPath(`delete-${source}-confirmation.png`) })
    const failedRequest = page.waitForEvent('requestfailed', (request) => new URL(request.url()).pathname === '/api/delete-workout')
    const unknown = 'Could not confirm workout deletion. Retry deletion.'
    await expectedBrowserDiagnostics.during('intentional delete acknowledgement loss', isExpectedWorkoutLifecycleAckLossDiagnostic, async () => {
      await page.getByRole('dialog').getByRole('button', { name: /Delete/ }).click()
      await failedRequest
      await expect(page.getByText(unknown, { exact: true })).toBeVisible()
    })
    expect(await readLifecycleWorkout(sessionId)).toBeNull()
    await page.reload()
    await expect(page.getByText(unknown, { exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`delete-${source}-recovery.png`), fullPage: true })
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByText(unknown, { exact: true })).not.toBeVisible()
    expect(await readLifecycleWorkout(sessionId)).toBeNull()
    expect(await readLifecycleExerciseSessions(sessionId)).toHaveLength(0)
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('ironlog:workout-delete-recovery:')))).toEqual([])
  })
}
