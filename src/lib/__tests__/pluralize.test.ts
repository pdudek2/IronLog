import { describe, expect, it } from 'vitest'
import { pluralize } from '../pluralize'

describe('pluralize', () => {
  it('handles English singular and plural forms', () => {
    expect(pluralize(1, 'session', 'sessions')).toBe('session')
    expect(pluralize(2, 'session', 'sessions')).toBe('sessions')
    expect(pluralize(5, 'session', 'sessions')).toBe('sessions')
    expect(pluralize(12, 'session', 'sessions')).toBe('sessions')
    expect(pluralize(22, 'session', 'sessions')).toBe('sessions')
  })

  it.each([
    [0, 'entries'],
    [1, 'entry'],
    [2, 'entries'],
    [4, 'entries'],
    [5, 'entries'],
    [12, 'entries'],
    [22, 'entries'],
  ])('uses the correct form for %i entries', (count, expected) => {
    expect(pluralize(count, 'entry', 'entries')).toBe(expected)
  })
})

describe('English count labels', () => {
  it('uses the plural for zero, decimals and counts ending in 1 or 2 except one itself', () => {
    expect(pluralize(1, 'session', 'sessions')).toBe('session')
    for (const count of [0, 1.5, 2, 5, 11, 21, 22, 101]) {
      expect(pluralize(count, 'session', 'sessions')).toBe('sessions')
    }
  })
})
