import { describe, expect, it } from 'vitest'
import { createSessionId, normalizeSessionId } from '../sessionIdentity'

describe('session identity', () => {
  it('creates a Firestore-safe UUID', () => {
    expect(createSessionId()).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/)
  })

  it('keeps an existing session id', () => {
    expect(normalizeSessionId('session-123', 500)).toBe('session-123')
  })

  it('derives the same legacy id from startedAt on every client', () => {
    expect(normalizeSessionId(undefined, 500)).toBe('legacy-500')
    expect(normalizeSessionId('', 500)).toBe('legacy-500')
  })
})
