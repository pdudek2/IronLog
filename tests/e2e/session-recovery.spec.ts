import { test, expect } from './fixtures'
import { expectAppReady } from './support/appReady'
import { readLocalActiveSessionRecovery, setFirestoreNetworkEnabled } from './support/firestoreBrowserBridge'
import { isExpectedFirestoreOfflineDiagnostic } from './support/offlineDiagnostics'
import {
  cleanupWorkoutLifecycleState, closeWorkoutLifecycleEmulator,
  readLifecycleActiveSession, seedLifecycleActiveSession,
} from './support/workoutLifecycleEmulator'

const repsLabel = 'Powtórzenia, Phase 1 Bench Press, seria 1'
const serverReps = async () => (await readLifecycleActiveSession())?.exercises?.[0]?.sets?.[0]?.reps

test.afterAll(closeWorkoutLifecycleEmulator)
test.beforeEach(async ({ cleanup }) => {
  cleanup.add('remove session recovery fixture', cleanupWorkoutLifecycleState)
  await cleanupWorkoutLifecycleState()
  await seedLifecycleActiveSession({ sessionId: 'phase-1-recovery', label: 'Phase 1 recovery' })
})

test('offline edit survives a full reload through Dashboard and can finish', async ({ page, expectedBrowserDiagnostics }, testInfo) => {
  await page.goto('/workout/new')
  await expectAppReady(page, '/workout/new')
  await expect(page.getByLabel(repsLabel)).toHaveValue('5')
  await expectedBrowserDiagnostics.during('intentional offline recovery', isExpectedFirestoreOfflineDiagnostic, async () => {
    await setFirestoreNetworkEnabled(page, false)
    await page.getByLabel(repsLabel).fill('7')
    await expect.poll(async () => (await readLocalActiveSessionRecovery(page)).reps).toBe('7')
    expect(await serverReps()).toBe('5')
    // A document navigation destroys Zustand and pending JS writes; Firebase starts online again.
    await page.goto('/dashboard')
    await expectAppReady(page, '/dashboard')
  })
  await page.getByRole('main').getByRole('button', { name: 'Wznów trening' }).click()
  await expect(page.getByLabel(repsLabel)).toHaveValue('7')
  await expect.poll(serverReps, { timeout: 20_000 }).toBe('7')
  await expect(page.getByText('Sesja zmieniła się na innym urządzeniu.', { exact: true })).not.toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('recovered-session.png'), fullPage: true })
  await page.getByRole('button', { name: 'Zakończ', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByText('Trening zapisany!', { exact: true })).toBeVisible()
  expect(await readLifecycleActiveSession()).toBeNull()
})

test('navigation before debounce saves the last edit and resumes without a false conflict', async ({ page }, testInfo) => {
  await page.goto('/workout/new')
  await expectAppReady(page, '/workout/new')
  await expect(page.getByLabel(repsLabel)).toHaveValue('5')
  // Dispatch the edit and normal client navigation in one browser task, below the 400ms debounce.
  await page.evaluate((label) => {
    const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '9')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const history = [...document.querySelectorAll<HTMLButtonElement>('nav button')]
      .find((element) => (element.getAttribute('aria-label') === 'Historia' || element.textContent?.trim() === 'Historia')
        && element.getBoundingClientRect().width > 0)!
    history.click()
  }, repsLabel)
  await expect(page).toHaveURL(/\/history$/)
  await expect.poll(serverReps, { timeout: 20_000 }).toBe('9')
  await page.goto('/workout/new')
  await expect(page.getByLabel(repsLabel)).toHaveValue('9')
  await expect(page.getByText('Sesja zmieniła się na innym urządzeniu.', { exact: true })).not.toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('navigation-recovered.png'), fullPage: true })
})
