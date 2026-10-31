import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { paletteCss } from '../../src/shared/palette'

describe('palette', () => {
  it('matches the generated web stylesheet, so web and native cannot drift', () => {
    expect(readFileSync('src/palette.generated.css', 'utf8')).toBe(paletteCss())
  })
})
