import { describe, expect, it, vi } from 'vitest'
import type { BrowserContext, Route } from '@playwright/test'
import {
  assertLocalQaEmulators,
  guardQaCaptureContext,
  isAllowedQaCaptureRequest,
  resolveQaCapture,
} from '../qaSafety.js'

const emulatorEnv = {
  E2E_BACKEND: 'emulator',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  TEST_EMAIL: 'e2e@ironlog.local',
  TEST_PASSWORD: 'ironlog-e2e',
}

describe('QA capture safety', () => {
  it('requires both local emulators and an explicit emulator backend before capture', () => {
    expect(() => assertLocalQaEmulators({})).toThrow('QA requires')
    for (const key of ['E2E_BACKEND', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
      expect(() => assertLocalQaEmulators({ ...emulatorEnv, [key]: undefined })).toThrow('QA requires')
      expect(() => assertLocalQaEmulators({ ...emulatorEnv, [key]: 'live' })).toThrow('QA requires')
    }
    expect(resolveQaCapture(emulatorEnv)).toEqual({
      baseUrl: 'http://localhost:5174', email: emulatorEnv.TEST_EMAIL, password: emulatorEnv.TEST_PASSWORD,
    })
    expect(() => resolveQaCapture({ ...emulatorEnv, TEST_EMAIL: '' })).toThrow('TEST_EMAIL')
    expect(() => resolveQaCapture({ ...emulatorEnv, TEST_PASSWORD: '' })).toThrow('TEST_PASSWORD')
  })

  it.each([
    'https://ironlog.app', 'http://localhost.evil.test:5174', 'http://user:pass@localhost:5174',
    'http://localhost:5174/dashboard', 'http://localhost:5174/?redirect=live',
  ])('rejects a non-local capture origin: %s', (url) => {
    expect(() => resolveQaCapture(emulatorEnv, url)).toThrow('local HTTP origin')
  })

  it('blocks cloud Firebase and server APIs even when the local app is misconfigured', () => {
    const base = 'http://localhost:5174'
    for (const url of [
      `${base}/api/finalize-workout`, `${base}/api/discard-session`,
      'http://localhost:3000/api/finalize-workout',
      'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword',
      'https://firestore.googleapis.com/google.firestore.v1.Firestore/Write/channel',
    ]) expect(isAllowedQaCaptureRequest(url, base)).toBe(false)
    for (const url of [
      `${base}/login`, `${base}/src/main.tsx`,
      'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword',
      'http://127.0.0.1:8080/google.firestore.v1.Firestore/Write/channel',
      'https://fonts.gstatic.com/font.woff2',
    ]) expect(isAllowedQaCaptureRequest(url, base)).toBe(true)
  })

  it('installs the request guard before navigation', async () => {
    const route = vi.fn()
    await guardQaCaptureContext({ route } as unknown as BrowserContext, 'http://localhost:5174')
    expect(route).toHaveBeenCalledWith('**/*', expect.any(Function))
    const handler = route.mock.calls[0][1] as (route: Route) => Promise<void>
    const blocked = { request: () => ({ url: () => 'https://firestore.googleapis.com/write' }), abort: vi.fn(), continue: vi.fn() }
    await handler(blocked as unknown as Route)
    expect(blocked.abort).toHaveBeenCalledWith('blockedbyclient')
    expect(blocked.continue).not.toHaveBeenCalled()
  })
})
