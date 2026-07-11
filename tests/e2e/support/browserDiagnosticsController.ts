import type {
  BrowserContext,
  ConsoleMessage,
  Page,
  Request,
} from '@playwright/test'
import {
  isBlockingConsole,
  isBlockingRequestFailure,
  type BrowserDiagnostic,
} from './browserDiagnostics'

export interface BrowserDiagnosticsController {
  entries: BrowserDiagnostic[]
  observeContext(context: BrowserContext): void
  detachContext(context: BrowserContext): void
  detachAll(): void
  runInIntentionalTeardown<T>(action: () => Promise<T>): Promise<T>
}

export function createBrowserDiagnosticsController(): BrowserDiagnosticsController {
  const entries: BrowserDiagnostic[] = []
  const contextCleanups = new Map<BrowserContext, () => void>()
  let teardownDepth = 0

  const observeContext = (context: BrowserContext) => {
    if (contextCleanups.has(context)) return

    const pageCleanups = new Map<Page, () => void>()
    const instrumentPage = (page: Page) => {
      if (pageCleanups.has(page)) return

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
            documentNavigationInProgress || teardownDepth > 0,
          ),
        })
      }

      page.on('request', onRequest)
      page.on('requestfinished', onRequestSettled)
      page.on('requestfailed', onRequestSettled)
      page.on('pageerror', onPageError)
      page.on('console', onConsole)
      page.on('requestfailed', onRequestFailed)

      pageCleanups.set(page, () => {
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

    contextCleanups.set(context, () => {
      context.off('page', onPage)
      pageCleanups.forEach((removeListeners) => removeListeners())
      pageCleanups.clear()
    })
  }

  const detachContext = (context: BrowserContext) => {
    contextCleanups.get(context)?.()
    contextCleanups.delete(context)
  }

  return {
    entries,
    observeContext,
    detachContext,
    detachAll() {
      contextCleanups.forEach((removeListeners) => removeListeners())
      contextCleanups.clear()
    },
    async runInIntentionalTeardown<T>(action: () => Promise<T>): Promise<T> {
      teardownDepth += 1
      try {
        return await action()
      } finally {
        teardownDepth -= 1
      }
    },
  }
}
