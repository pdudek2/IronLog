import type { Page } from '@playwright/test'
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
