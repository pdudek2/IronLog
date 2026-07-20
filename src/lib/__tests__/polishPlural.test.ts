import { describe, expect, it } from 'vitest'
import { polishPlural } from '../polishPlural'

describe('polishPlural', () => {
  it('handles Polish singular, paucal and plural forms', () => {
    expect(polishPlural(1, 'sesja', 'sesje', 'sesji')).toBe('sesja')
    expect(polishPlural(2, 'sesja', 'sesje', 'sesji')).toBe('sesje')
    expect(polishPlural(5, 'sesja', 'sesje', 'sesji')).toBe('sesji')
    expect(polishPlural(12, 'sesja', 'sesje', 'sesji')).toBe('sesji')
    expect(polishPlural(22, 'sesja', 'sesje', 'sesji')).toBe('sesje')
  })

  it.each([
    [0, 'wpisów'],
    [1, 'wpis'],
    [2, 'wpisy'],
    [4, 'wpisy'],
    [5, 'wpisów'],
    [12, 'wpisów'],
    [22, 'wpisy'],
  ])('uses the correct form for %i entries', (count, expected) => {
    expect(polishPlural(count, 'wpis', 'wpisy', 'wpisów')).toBe(expected)
  })
})
