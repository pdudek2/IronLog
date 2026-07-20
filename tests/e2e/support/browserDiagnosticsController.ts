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
  runInIntentionalTeardown<T>(context: BrowserContext, action: () => Promise<T>): Promise<T>
  runExpectingDiagnostics<T>(
    name: string,
    predicate: (entry: BrowserDiagnostic) => boolean,
    action: () => Promise<T>,
  ): Promise<T>
}

export function createBrowserDiagnosticsController(): BrowserDiagnosticsController {
  const entries: BrowserDiagnostic[] = []
  const contextCleanups = new Map<BrowserContext, () => void>()
  const activeExpectations: Array<{
    name: string
    predicate: (entry: BrowserDiagnostic) => boolean
    matchCount: number
  }> = []
  const teardownDepthByContext = new Map<BrowserContext, number>()
  const activeRequestsByContext = new Map<BrowserContext, Set<Request>>()
  const intentionalNavigationRequests = new WeakSet<Request>()

  const record = (entry: BrowserDiagnostic) => {
    const expectation = activeExpectations.findLast(({ predicate }) => predicate(entry))
    if (expectation) {
      expectation.matchCount += 1
      entry.expectedBy = expectation.name
    }
    entries.push(entry)
  }

  const observeContext = (context: BrowserContext) => {
    if (contextCleanups.has(context)) return

    const contextActiveRequests = new Set<Request>()
    activeRequestsByContext.set(context, contextActiveRequests)
    const pageCleanups = new Map<Page, () => void>()
    const instrumentPage = (page: Page) => {
      if (pageCleanups.has(page)) return

      let documentNavigationInProgress = false
      const onRequest = (request: Request) => {
        contextActiveRequests.add(request)
        if (
          request.resourceType() === 'document'
          && request.isNavigationRequest()
          && request.frame() === page.mainFrame()
        ) {
          documentNavigationInProgress = true
        }
        if ((teardownDepthByContext.get(context) ?? 0) > 0) {
          intentionalNavigationRequests.add(request)
        }
      }
      const onRequestSettled = (request: Request) => {
        contextActiveRequests.delete(request)
        if (
          request.resourceType() === 'document'
          && request.isNavigationRequest()
          && request.frame() === page.mainFrame()
        ) {
          documentNavigationInProgress = false
        }
      }
      const onPageError = (error: Error) => {
        record({
          kind: 'pageerror',
          message: error.message,
          url: page.url(),
          blocking: true,
        })
      }
      const onConsole = (message: ConsoleMessage) => {
        if (message.type() !== 'error') return
        const text = message.text()
        const sourceUrl = message.location().url
        record({
          kind: 'console',
          message: text,
          url: sourceUrl || page.url(),
          blocking: isBlockingConsole(message.type(), text),
        })
      }
      const onRequestFailed = (request: Request) => {
        const errorText = request.failure()?.errorText ?? 'unknown request failure'
        record({
          kind: 'requestfailed',
          message: errorText,
          url: request.url(),
          method: request.method(),
          blocking: isBlockingRequestFailure(
            request.resourceType(),
            errorText,
            request.url(),
            intentionalNavigationRequests.has(request)
              || documentNavigationInProgress
              || (teardownDepthByContext.get(context) ?? 0) > 0,
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
      contextActiveRequests.clear()
    })
  }

  const detachContext = (context: BrowserContext) => {
    contextCleanups.get(context)?.()
    contextCleanups.delete(context)
    activeRequestsByContext.delete(context)
    teardownDepthByContext.delete(context)
  }

  return {
    entries,
    observeContext,
    detachContext,
    detachAll() {
      contextCleanups.forEach((removeListeners) => removeListeners())
      contextCleanups.clear()
      activeRequestsByContext.clear()
      teardownDepthByContext.clear()
    },
    async runInIntentionalTeardown<T>(context, action): Promise<T> {
      teardownDepthByContext.set(context, (teardownDepthByContext.get(context) ?? 0) + 1)
      activeRequestsByContext.get(context)?.forEach((request) => {
        intentionalNavigationRequests.add(request)
      })
      try {
        return await action()
      } finally {
        const remainingDepth = (teardownDepthByContext.get(context) ?? 1) - 1
        if (remainingDepth > 0) teardownDepthByContext.set(context, remainingDepth)
        else teardownDepthByContext.delete(context)
      }
    },
    async runExpectingDiagnostics<T>(name, predicate, action): Promise<T> {
      const expectation = { name, predicate, matchCount: 0 }
      activeExpectations.push(expectation)
      let result: T
      try {
        result = await action()
      } finally {
        const index = activeExpectations.lastIndexOf(expectation)
        if (index >= 0) activeExpectations.splice(index, 1)
      }
      if (expectation.matchCount === 0) {
        throw new Error(`Expected browser diagnostics were not observed: ${name}`)
      }
      return result
    },
  }
}
