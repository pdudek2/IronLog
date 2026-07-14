import { describe, expect, it } from 'vitest'
import { EventEmitter } from 'node:events'
import { isBlockingConsole, isBlockingRequestFailure } from './browserDiagnostics'
import { createBrowserDiagnosticsController } from './browserDiagnosticsController'
import {
  isExpectedWorkoutLifecycleAckLossDiagnostic,
  isExpectedWorkoutLifecycleProjectionDiagnostic,
  isExpectedWorkoutLifecycleTombstoneDiagnostic,
} from './workoutLifecycleDiagnostics'
import { isExpectedFirestoreOfflineDiagnostic } from './offlineDiagnostics'
import type { BrowserContext, ConsoleMessage, Page } from '@playwright/test'

describe('browser diagnostics classification', () => {
  it('blocks application console errors but ignores Vite and extension-origin noise', () => {
    expect(isBlockingConsole('error', '[DashboardPage] load failed')).toBe(true)
    expect(isBlockingConsole('warning', 'layout warning')).toBe(false)
    expect(isBlockingConsole('error', '[vite] reconnecting')).toBe(false)
    expect(isBlockingConsole('error', 'chrome-extension://example failed')).toBe(false)
    expect(isBlockingConsole('error', 'moz-extension://example failed')).toBe(false)
    expect(isBlockingConsole('error', '[DashboardPage] extension lookup failed')).toBe(true)
  })

  it('blocks failed requests except cancelled document navigation', () => {
    expect(isBlockingRequestFailure('fetch', 'net::ERR_FAILED')).toBe(true)
    expect(isBlockingRequestFailure('document', 'net::ERR_ABORTED')).toBe(false)
    expect(isBlockingRequestFailure('script', 'net::ERR_ABORTED')).toBe(true)
  })

  it('ignores only aborted emulator Firestore channels in an intentional navigation or teardown window', () => {
    const writeChannelUrl = 'http://127.0.0.1:8080/google.firestore.v1.Firestore/Write/channel?VER=8'
    const listenChannelUrl = 'http://127.0.0.1:8080/google.firestore.v1.Firestore/Listen/channel?VER=8'

    expect(isBlockingRequestFailure('xhr', 'net::ERR_ABORTED', writeChannelUrl)).toBe(true)
    expect(isBlockingRequestFailure('xhr', 'net::ERR_ABORTED', writeChannelUrl, false)).toBe(true)
    expect(isBlockingRequestFailure('xhr', 'net::ERR_ABORTED', writeChannelUrl, true)).toBe(false)
    expect(isBlockingRequestFailure('xhr', 'net::ERR_ABORTED', listenChannelUrl, true)).toBe(false)
    expect(isBlockingRequestFailure('fetch', 'net::ERR_ABORTED', writeChannelUrl, true)).toBe(false)
    expect(isBlockingRequestFailure('fetch', 'net::ERR_ABORTED', listenChannelUrl, true)).toBe(false)
    expect(isBlockingRequestFailure('xhr', 'net::ERR_FAILED', writeChannelUrl, true)).toBe(true)
    expect(isBlockingRequestFailure('fetch', 'net::ERR_FAILED', writeChannelUrl)).toBe(true)
    expect(isBlockingRequestFailure('xhr', 'net::ERR_ABORTED', 'https://firestore.googleapis.com/channel', true)).toBe(true)
    expect(isBlockingRequestFailure('xhr', 'net::ERR_ABORTED', 'http://127.0.0.1:8080/google.firestore.v1.Firestore/Commit', true)).toBe(true)
    expect(isBlockingRequestFailure('script', 'net::ERR_ABORTED', writeChannelUrl, true)).toBe(true)
  })

  it('ignores aborted local Vite source modules only during intentional navigation or teardown', () => {
    const viteModuleUrl = 'http://localhost:5174/src/components/ReadinessWidget.tsx'

    expect(isBlockingRequestFailure('script', 'net::ERR_ABORTED', viteModuleUrl)).toBe(true)
    expect(isBlockingRequestFailure('script', 'net::ERR_ABORTED', viteModuleUrl, false)).toBe(true)
    expect(isBlockingRequestFailure('script', 'net::ERR_ABORTED', viteModuleUrl, true)).toBe(false)
    expect(isBlockingRequestFailure('script', 'net::ERR_FAILED', viteModuleUrl, true)).toBe(true)
    expect(isBlockingRequestFailure('script', 'net::ERR_ABORTED', 'http://localhost:5174/assets/app.js', true)).toBe(true)
    expect(isBlockingRequestFailure('script', 'net::ERR_ABORTED', 'https://example.com/src/app.ts', true)).toBe(true)
  })
})

describe('browser diagnostics controller', () => {
  it('observes future context pages and detaches every listener', () => {
    const context = new EventEmitter() as EventEmitter & { pages(): Page[] }
    context.pages = () => []
    const page = new EventEmitter() as EventEmitter & Pick<Page, 'url' | 'mainFrame'>
    page.url = () => 'http://localhost/secondary'
    page.mainFrame = () => ({}) as ReturnType<Page['mainFrame']>

    const controller = createBrowserDiagnosticsController()
    controller.observeContext(context as unknown as BrowserContext)
    context.emit('page', page as unknown as Page)
    page.emit('console', {
      type: () => 'error',
      text: () => '[secondary] failed',
      location: () => ({ url: '' }),
    } as ConsoleMessage)

    expect(controller.entries).toEqual([{
      kind: 'console',
      message: '[secondary] failed',
      url: 'http://localhost/secondary',
      blocking: true,
    }])

    controller.detachAll()
    expect(context.listenerCount('page')).toBe(0)
    expect(page.eventNames()).toEqual([])
  })

  it('records the console message source URL and falls back to the page URL', () => {
    const context = new EventEmitter() as EventEmitter & { pages(): Page[] }
    const page = new EventEmitter() as EventEmitter & Pick<Page, 'url' | 'mainFrame'>
    context.pages = () => [page as unknown as Page]
    page.url = () => 'http://localhost:5174/dashboard'
    page.mainFrame = () => ({}) as ReturnType<Page['mainFrame']>
    const controller = createBrowserDiagnosticsController()
    controller.observeContext(context as unknown as BrowserContext)

    page.emit('console', {
      type: () => 'error',
      text: () => 'materialization failed',
      location: () => ({ url: 'http://localhost:5174/api/materialize-workout' }),
    } as ConsoleMessage)
    page.emit('console', {
      type: () => 'error',
      text: () => 'dashboard failed',
      location: () => ({ url: '' }),
    } as ConsoleMessage)

    expect(controller.entries.map((entry) => entry.url)).toEqual([
      'http://localhost:5174/api/materialize-workout',
      'http://localhost:5174/dashboard',
    ])
  })

  it('marks only predicate matches emitted inside an explicit expectation scope', async () => {
    const context = new EventEmitter() as EventEmitter & { pages(): Page[] }
    const page = new EventEmitter() as EventEmitter & Pick<Page, 'url' | 'mainFrame'>
    context.pages = () => [page as unknown as Page]
    page.url = () => 'http://localhost/templates'
    page.mainFrame = () => ({}) as ReturnType<Page['mainFrame']>
    const controller = createBrowserDiagnosticsController()
    controller.observeContext(context as unknown as BrowserContext)

    await controller.runExpectingDiagnostics(
      'intentional offline failure',
      (entry) => entry.message === 'expected offline error',
      async () => {
        page.emit('console', {
          type: () => 'error',
          text: () => 'expected offline error',
          location: () => ({ url: '' }),
        } as ConsoleMessage)
        page.emit('console', {
          type: () => 'error',
          text: () => 'unexpected error',
          location: () => ({ url: '' }),
        } as ConsoleMessage)
      },
    )
    page.emit('console', {
      type: () => 'error',
      text: () => 'expected offline error',
      location: () => ({ url: '' }),
    } as ConsoleMessage)

    expect(controller.entries.map((entry) => entry.expectedBy)).toEqual([
      'intentional offline failure',
      undefined,
      undefined,
    ])
  })

  it('expects the projection 503 only from its exact endpoint source URL', async () => {
    const context = new EventEmitter() as EventEmitter & { pages(): Page[] }
    const page = new EventEmitter() as EventEmitter & Pick<Page, 'url' | 'mainFrame'>
    context.pages = () => [page as unknown as Page]
    page.url = () => 'http://localhost:5174/dashboard'
    page.mainFrame = () => ({}) as ReturnType<Page['mainFrame']>
    const controller = createBrowserDiagnosticsController()
    controller.observeContext(context as unknown as BrowserContext)
    const message = 'Failed to load resource: the server responded with a status of 503 (Service Unavailable)'

    await controller.runExpectingDiagnostics(
      'intentional projection failure',
      isExpectedWorkoutLifecycleProjectionDiagnostic,
      async () => {
        page.emit('console', {
          type: () => 'error',
          text: () => message,
          location: () => ({ url: 'http://localhost:5174/api/materialize-workout' }),
        } as ConsoleMessage)
        page.emit('console', {
          type: () => 'error',
          text: () => message,
          location: () => ({ url: 'http://localhost:5174/api/unrelated' }),
        } as ConsoleMessage)
      },
    )

    expect(controller.entries.map((entry) => entry.expectedBy)).toEqual([
      'intentional projection failure',
      undefined,
    ])
    expect(controller.entries[1]).toMatchObject({
      url: 'http://localhost:5174/api/unrelated',
      blocking: true,
    })
  })

  it('matches acknowledgement loss only for aborted closure POST requests', () => {
    expect(isExpectedWorkoutLifecycleAckLossDiagnostic({
      kind: 'requestfailed',
      message: 'net::ERR_FAILED',
      method: 'POST',
      url: 'http://localhost:5174/api/finalize-workout',
      blocking: true,
    })).toBe(true)
    expect(isExpectedWorkoutLifecycleAckLossDiagnostic({
      kind: 'requestfailed',
      message: 'net::ERR_FAILED',
      method: 'POST',
      url: 'http://localhost:5174/api/materialize-workout',
      blocking: true,
    })).toBe(false)
  })

  it('matches only the active-session tombstone rule rejection', () => {
    const ruleFailure = "[active session save error] FirebaseError: PERMISSION_DENIED: false for 'create' @ L478"
    expect(isExpectedWorkoutLifecycleTombstoneDiagnostic({
      kind: 'console',
      message: ruleFailure,
      blocking: true,
    })).toBe(true)
    expect(isExpectedWorkoutLifecycleTombstoneDiagnostic({
      kind: 'console',
      message: '[profile save error] FirebaseError: PERMISSION_DENIED: missing permissions',
      blocking: true,
    })).toBe(false)
  })

  it('matches offline resource console errors only for Firestore request URLs', () => {
    const message = 'Failed to load resource: net::ERR_INTERNET_DISCONNECTED'
    expect(isExpectedFirestoreOfflineDiagnostic({
      kind: 'console',
      message,
      url: 'http://127.0.0.1:8080/google.firestore.v1.Firestore/Write/channel?VER=8',
      blocking: true,
    })).toBe(true)
    expect(isExpectedFirestoreOfflineDiagnostic({
      kind: 'console',
      message,
      url: 'http://127.0.0.1:8080/v1/projects/demo-ironlog/databases/(default)/documents:batchGet?key=x',
      blocking: true,
    })).toBe(true)
    expect(isExpectedFirestoreOfflineDiagnostic({
      kind: 'console',
      message,
      url: 'http://localhost:5174/assets/unrelated.js',
      blocking: true,
    })).toBe(false)
    expect(isExpectedFirestoreOfflineDiagnostic({
      kind: 'console',
      message,
      blocking: true,
    })).toBe(false)
  })

  it('rejects an expectation scope that did not observe a matching diagnostic', async () => {
    const controller = createBrowserDiagnosticsController()
    await expect(controller.runExpectingDiagnostics(
      'missing expected failure',
      () => true,
      async () => undefined,
    )).rejects.toThrow('missing expected failure')
  })
})
