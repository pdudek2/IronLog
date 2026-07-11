import {
  test as base,
  expect,
  type ConsoleMessage,
  type Page,
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
  browserDiagnostics: [async ({ context }, use, testInfo) => {
    const entries: BrowserDiagnostic[] = []
    const instrumentedPages = new Map<Page, () => void>()
    let teardownStarted = false

    const instrumentPage = (page: Page) => {
      if (instrumentedPages.has(page)) return

      let documentNavigationInProgress = false
      const onRequest = (request: Request) => {
        if (
          request.resourceType() === 'document'
          && request.isNavigationRequest()
          && request.frame() === page.mainFrame()
        ) {
          documentNavigationInProgress = true
        }
      }
      const onRequestSettled = (request: Request) => {
        if (
          request.resourceType() === 'document'
          && request.isNavigationRequest()
          && request.frame() === page.mainFrame()
        ) {
          documentNavigationInProgress = false
        }
      }
      const onPageError = (error: Error) => {
        entries.push({
          kind: 'pageerror',
          message: error.message,
          url: page.url(),
          blocking: true,
        })
      }
      const onConsole = (message: ConsoleMessage) => {
        if (message.type() !== 'error') return
        const text = message.text()
        entries.push({
          kind: 'console',
          message: text,
          url: page.url(),
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
          blocking: isBlockingRequestFailure(
            request.resourceType(),
            errorText,
            request.url(),
            documentNavigationInProgress || teardownStarted,
          ),
        })
      }

      page.on('request', onRequest)
      page.on('requestfinished', onRequestSettled)
      page.on('requestfailed', onRequestSettled)
      page.on('pageerror', onPageError)
      page.on('console', onConsole)
      page.on('requestfailed', onRequestFailed)

      instrumentedPages.set(page, () => {
        page.off('request', onRequest)
        page.off('requestfinished', onRequestSettled)
        page.off('requestfailed', onRequestSettled)
        page.off('pageerror', onPageError)
        page.off('console', onConsole)
        page.off('requestfailed', onRequestFailed)
      })
    }

    const onPage = (page: Page) => instrumentPage(page)
    context.pages().forEach(instrumentPage)
    context.on('page', onPage)

    await use(entries)

    teardownStarted = true
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    context.off('page', onPage)
    instrumentedPages.forEach((removeListeners) => removeListeners())
    instrumentedPages.clear()

    if (entries.length > 0) {
      await testInfo.attach('browser-diagnostics.json', {
        body: Buffer.from(JSON.stringify(entries, null, 2)),
        contentType: 'application/json',
      })
    }

    const blocking = entries.filter((entry) => entry.blocking)
    expect.soft(blocking, formatBlockingDiagnostics(blocking)).toEqual([])
  }, { auto: true }],
  cleanup: async ({ page }, fixtureUse) => {
    const actions: CleanupAction[] = []
    await fixtureUse({ add: (name, action) => actions.push({ name, run: action }) })

    const failures = await runCleanupActions(actions.map((action) => ({
      ...action,
      run: () => base.step(`cleanup: ${action.name}`, action.run),
    })))

    expect.soft(failures, failures.join('\n')).toEqual([])
    void page
  },
})

export { expect }
export type {
  APIRequestContext,
  Browser,
  BrowserContext,
  ConsoleMessage,
  Locator,
  Page,
  Request,
} from '@playwright/test'
