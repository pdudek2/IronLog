import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
} from '@playwright/test'
import {
  formatBlockingDiagnostics,
  type BrowserDiagnostic,
} from './support/browserDiagnostics'
import {
  createBrowserDiagnosticsController,
  type BrowserDiagnosticsController,
} from './support/browserDiagnosticsController'
import { runCleanupActions, type CleanupAction } from './support/cleanupRegistry'

export interface CleanupRegistry {
  add(name: string, action: () => Promise<void>): void
}

export interface ObservedContextFactory {
  newContext(options?: Parameters<Browser['newContext']>[0]): Promise<BrowserContext>
}

export interface ExpectedBrowserDiagnostics {
  during<T>(
    name: string,
    predicate: (entry: BrowserDiagnostic) => boolean,
    action: () => Promise<T>,
  ): Promise<T>
}

interface IronLogFixtures {
  browserDiagnostics: BrowserDiagnostic[]
  cleanup: CleanupRegistry
  diagnosticsController: BrowserDiagnosticsController
  observeDefaultContext: void
  observedContextFactory: ObservedContextFactory
  expectedBrowserDiagnostics: ExpectedBrowserDiagnostics
}

export const test = base.extend<IronLogFixtures>({
  diagnosticsController: async ({ browserName }, fixtureUse) => {
    void browserName
    const controller = createBrowserDiagnosticsController()
    await fixtureUse(controller)
    controller.detachAll()
  },
  observeDefaultContext: [async ({ context, diagnosticsController }, use) => {
    diagnosticsController.observeContext(context)
    await use()
    diagnosticsController.detachContext(context)
  }, { auto: true }],
  browserDiagnostics: [async ({ diagnosticsController, observeDefaultContext }, use, testInfo) => {
    void observeDefaultContext
    const entries = diagnosticsController.entries

    await use(entries)

    if (entries.length > 0) {
      await testInfo.attach('browser-diagnostics.json', {
        body: Buffer.from(JSON.stringify(entries, null, 2)),
        contentType: 'application/json',
      })
    }

    const blocking = entries.filter((entry) => entry.blocking && !entry.expectedBy)
    expect.soft(blocking, formatBlockingDiagnostics(blocking)).toEqual([])
  }, { auto: true }],
  expectedBrowserDiagnostics: async ({ diagnosticsController }, fixtureUse) => {
    await fixtureUse({
      during: (name, predicate, action) => diagnosticsController.runExpectingDiagnostics(
        name,
        predicate,
        action,
      ),
    })
  },
  observedContextFactory: async ({ browser, diagnosticsController }, fixtureUse) => {
    const contexts: BrowserContext[] = []
    await fixtureUse({
      async newContext(options) {
        const context = await browser.newContext(options)
        diagnosticsController.observeContext(context)
        contexts.push(context)
        return context
      },
    })

    const closeFailures: string[] = []
    for (const context of contexts.reverse()) {
      try {
        await diagnosticsController.runInIntentionalTeardown(context, () => context.close())
      } catch (error) {
        closeFailures.push(error instanceof Error ? error.message : String(error))
      } finally {
        diagnosticsController.detachContext(context)
      }
    }
    expect.soft(closeFailures, closeFailures.join('\n')).toEqual([])
  },
  cleanup: async ({ page, diagnosticsController }, fixtureUse) => {
    const actions: CleanupAction[] = []
    await fixtureUse({ add: (name, action) => actions.push({ name, run: action }) })

    const failures = await diagnosticsController.runInIntentionalTeardown(
      page.context(),
      () => runCleanupActions(actions.map((action) => ({
        ...action,
        run: () => base.step(`cleanup: ${action.name}`, action.run),
      }))),
    )

    expect.soft(failures, failures.join('\n')).toEqual([])
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
