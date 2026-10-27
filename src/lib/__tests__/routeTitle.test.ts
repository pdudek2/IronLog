import { describe, expect, it } from 'vitest'

import { routeTitle } from '../routeTitle'

describe('routeTitle', () => {
  it('names each page and falls back for unknown routes', () => {
    expect(routeTitle('/dashboard')).toBe('Home · SHEAR')
    expect(routeTitle('/templates/abc/edit')).toBe('Edit plan · SHEAR')
    expect(routeTitle('/workout/new')).toBe('Workout · SHEAR')
    expect(routeTitle('/workout/w-1')).toBe('Saved workout · SHEAR')
    expect(routeTitle('/nope')).toBe('Page not found · SHEAR')
  })
})
