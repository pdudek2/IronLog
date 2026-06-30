import { afterEach, describe, expect, it } from 'vitest'
import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  clearAnalyticsConsent,
  getAnalyticsConsent,
  setAnalyticsConsent,
} from '../analyticsConsent'

type StorageShape = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')

function installWindowWithStorage() {
  const values = new Map<string, string>()
  const localStorage: StorageShape = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage },
  })

  return values
}

afterEach(() => {
  if (originalWindow) {
    Object.defineProperty(globalThis, 'window', originalWindow)
  } else {
    delete (globalThis as { window?: Window }).window
  }
})

describe('analytics consent storage', () => {
  it('returns null when storage is unavailable', () => {
    delete (globalThis as { window?: Window }).window

    expect(getAnalyticsConsent()).toBeNull()
    expect(setAnalyticsConsent('granted')).toBe('granted')
    expect(getAnalyticsConsent()).toBeNull()
  })

  it('persists granted and denied choices', () => {
    const values = installWindowWithStorage()

    expect(getAnalyticsConsent()).toBeNull()
    expect(setAnalyticsConsent('granted')).toBe('granted')
    expect(values.get(ANALYTICS_CONSENT_STORAGE_KEY)).toBe('granted')
    expect(getAnalyticsConsent()).toBe('granted')

    expect(setAnalyticsConsent('denied')).toBe('denied')
    expect(values.get(ANALYTICS_CONSENT_STORAGE_KEY)).toBe('denied')
    expect(getAnalyticsConsent()).toBe('denied')
  })

  it('ignores unknown stored values and clears consent', () => {
    const values = installWindowWithStorage()

    values.set(ANALYTICS_CONSENT_STORAGE_KEY, 'maybe')
    expect(getAnalyticsConsent()).toBeNull()

    setAnalyticsConsent('granted')
    clearAnalyticsConsent()
    expect(values.has(ANALYTICS_CONSENT_STORAGE_KEY)).toBe(false)
    expect(getAnalyticsConsent()).toBeNull()
  })
})
