import { describe, expect, it } from 'vitest'
import {
  createSessionId,
  deriveLegacySessionId,
  normalizeSessionId,
} from '../sessionIdentity'

describe('session identity', () => {
  it('creates a Firestore-safe UUID', () => {
    expect(createSessionId()).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/)
  })

  it('keeps an existing session id', () => {
    expect(normalizeSessionId('session-123', 'user-1', 500)).toBe('session-123')
  })

  it('derives the same user-scoped legacy id on every client', () => {
    const expected = deriveLegacySessionId('user-1', 500)

    expect(normalizeSessionId(undefined, 'user-1', 500)).toBe(expected)
    expect(normalizeSessionId('', 'user-1', 500)).toBe(expected)
  })

  it('does not collide for two owners with the same startedAt', () => {
    expect(deriveLegacySessionId('user-1', 500))
      .not.toBe(deriveLegacySessionId('user-2', 500))
  })

  it('is Firestore-safe and bounded even for an unsafe maximum-length uid', () => {
    const derived = deriveLegacySessionId(`${'/ż🙂'.repeat(64)}.`, 4_102_444_800_000)

    expect(derived).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
    expect(derived.length).toBeLessThanOrEqual(160)
  })
})
