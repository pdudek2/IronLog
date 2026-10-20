import { expect, type Page } from '@playwright/test'
import type {
  CachedActiveSessionWrite,
  EmulatorTestBridge,
  LocalActiveSessionRecovery,
} from '../../../src/lib/emulatorTestBridge'

async function waitForBridge(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.__ironlogEmulatorTestBridge))
}

export async function readCachedActiveSessionWrite(
  page: Page,
): Promise<CachedActiveSessionWrite> {
  await waitForBridge(page)
  return page.evaluate(() => (
    window.__ironlogEmulatorTestBridge as EmulatorTestBridge
  ).readCachedActiveSessionWrite())
}

export async function readLocalActiveSessionRecovery(
  page: Page,
): Promise<LocalActiveSessionRecovery> {
  await waitForBridge(page)
  return page.evaluate(() => (
    window.__ironlogEmulatorTestBridge as EmulatorTestBridge
  ).readLocalActiveSessionRecovery())
}

export async function setFirestoreNetworkEnabled(
  page: Page,
  enabled: boolean,
): Promise<void> {
  await waitForBridge(page)
  await page.evaluate((nextEnabled) => (
    window.__ironlogEmulatorTestBridge as EmulatorTestBridge
  ).setFirestoreNetworkEnabled(nextEnabled), enabled)
}

// Waits until the active session with this exercise has left the local write queue instead of sleeping. Live runs
// have no emulator bridge, so they keep a fixed wait for the debounce and the server write.
export async function waitForActiveSessionWrite(page: Page, exerciseName: string): Promise<void> {
  if (!await page.evaluate(() => Boolean(window.__ironlogEmulatorTestBridge))) {
    await page.waitForTimeout(3_000)
    return
  }
  await expect.poll(async () => {
    const write = await readCachedActiveSessionWrite(page)
    return write.exists && !write.hasPendingWrites && write.exerciseNames.includes(exerciseName)
  }, { timeout: 10_000 }).toBe(true)
}
