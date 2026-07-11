import { describe, expect, it } from 'vitest'
import { isBlockingConsole, isBlockingRequestFailure } from './browserDiagnostics'

describe('browser diagnostics classification', () => {
  it('blocks application console errors but ignores Vite and extension noise', () => {
    expect(isBlockingConsole('error', '[DashboardPage] load failed')).toBe(true)
    expect(isBlockingConsole('warning', 'layout warning')).toBe(false)
    expect(isBlockingConsole('error', '[vite] reconnecting')).toBe(false)
    expect(isBlockingConsole('error', 'chrome-extension://example failed')).toBe(false)
  })

  it('blocks failed requests except cancelled document navigation', () => {
    expect(isBlockingRequestFailure('fetch', 'net::ERR_FAILED')).toBe(true)
    expect(isBlockingRequestFailure('document', 'net::ERR_ABORTED')).toBe(false)
    expect(isBlockingRequestFailure('script', 'net::ERR_ABORTED')).toBe(true)
  })

  it('ignores only aborted emulator Firestore channels during intentional navigation', () => {
    const writeChannelUrl = 'http://127.0.0.1:8080/google.firestore.v1.Firestore/Write/channel?VER=8'
    const listenChannelUrl = 'http://127.0.0.1:8080/google.firestore.v1.Firestore/Listen/channel?VER=8'

    expect(isBlockingRequestFailure('xhr', 'net::ERR_ABORTED', writeChannelUrl)).toBe(false)
    expect(isBlockingRequestFailure('xhr', 'net::ERR_ABORTED', listenChannelUrl)).toBe(false)
    expect(isBlockingRequestFailure('fetch', 'net::ERR_ABORTED', writeChannelUrl)).toBe(false)
    expect(isBlockingRequestFailure('fetch', 'net::ERR_ABORTED', listenChannelUrl)).toBe(false)
    expect(isBlockingRequestFailure('xhr', 'net::ERR_FAILED', writeChannelUrl)).toBe(true)
    expect(isBlockingRequestFailure('fetch', 'net::ERR_FAILED', writeChannelUrl)).toBe(true)
    expect(isBlockingRequestFailure('xhr', 'net::ERR_ABORTED', 'https://firestore.googleapis.com/channel')).toBe(true)
    expect(isBlockingRequestFailure('xhr', 'net::ERR_ABORTED', 'http://127.0.0.1:8080/google.firestore.v1.Firestore/Commit')).toBe(true)
    expect(isBlockingRequestFailure('script', 'net::ERR_ABORTED', writeChannelUrl)).toBe(true)
  })
})
