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

interface DiagnosticFixture {
  browserDiagnostics: BrowserDiagnostic[]
}

export const test = base.extend<DiagnosticFixture>({
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
