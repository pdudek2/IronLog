import { describe, expect, it } from 'vitest'

import { routeTitle } from '../routeTitle'

describe('routeTitle', () => {
  it('names each page and falls back for unknown routes', () => {
    expect(routeTitle('/dashboard')).toBe('Home · IronLog')
    expect(routeTitle('/templates/abc/edit')).toBe('Edit plan · IronLog')
    expect(routeTitle('/workout/new')).toBe('Workout · IronLog')
    expect(routeTitle('/workout/w-1')).toBe('Saved workout · IronLog')
    expect(routeTitle('/nope')).toBe('Page not found · IronLog')
  })
})
