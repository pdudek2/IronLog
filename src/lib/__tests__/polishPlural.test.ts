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
})
