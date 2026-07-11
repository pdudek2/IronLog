import {
  test as base,
  expect,
  type ConsoleMessage,
  type Request,
} from '@playwright/test'
import {
  formatBlockingDiagnostics,
  isBlockingConsole,
  isBlockingRequestFailure,
  type BrowserDiagnostic,
} from './support/browserDiagnostics'
import { runCleanupActions, type CleanupAction } from './support/cleanupRegistry'

export interface CleanupRegistry {
  add(name: string, action: () => Promise<void>): void
}

interface IronLogFixtures {
  browserDiagnostics: BrowserDiagnostic[]
  cleanup: CleanupRegistry
}

export const test = base.extend<IronLogFixtures>({
  browserDiagnostics: [async ({ page }, use, testInfo) => {
    const entries: BrowserDiagnostic[] = []

    const onPageError = (error: Error) => {
      entries.push({ kind: 'pageerror', message: error.message, blocking: true })
    }
    const onConsole = (message: ConsoleMessage) => {
      if (message.type() !== 'error') return
      const text = message.text()
      entries.push({
        kind: 'console',
        message: text,
        blocking: isBlockingConsole(message.type(), text),
      })
    }
    const onRequestFailed = (request: Request) => {
      const errorText = request.failure()?.errorText ?? 'unknown request failure'
      entries.push({
        kind: 'requestfailed',
        message: errorText,
        url: request.url(),
        method: request.method(),
        blocking: isBlockingRequestFailure(request.resourceType(), errorText),
      })
    }

    page.on('pageerror', onPageError)
    page.on('console', onConsole)
    page.on('requestfailed', onRequestFailed)

    await use(entries)

    page.off('pageerror', onPageError)
    page.off('console', onConsole)
    page.off('requestfailed', onRequestFailed)

    if (entries.length > 0) {
      await testInfo.attach('browser-diagnostics.json', {
        body: Buffer.from(JSON.stringify(entries, null, 2)),
        contentType: 'application/json',
      })
    }

    const blocking = entries.filter((entry) => entry.blocking)
    expect.soft(blocking, formatBlockingDiagnostics(blocking)).toEqual([])
  }, { auto: true }],
  cleanup: async ({ page }, fixtureUse, testInfo) => {
    const actions: CleanupAction[] = []
    await fixtureUse({ add: (name, action) => actions.push({ name, run: action }) })

    const failures = await runCleanupActions(actions.map((action) => ({
      ...action,
      run: () => testInfo.step(`cleanup: ${action.name}`, action.run),
    })))

    expect.soft(failures, failures.join('\n')).toEqual([])
    void page
  },
})

export { expect }
export type {
  APIRequestContext,
  Browser,
  ConsoleMessage,
  Locator,
  Page,
  Request,
} from '@playwright/test'
