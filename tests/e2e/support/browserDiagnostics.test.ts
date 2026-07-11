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
})
