import { describe, expect, it } from 'vitest'

import { workoutCover } from '../../shared/workoutCover'

describe('workoutCover', () => {
  it.each([
    ['Push', 'push'],
    ['Pull Day', 'pull'],
    ['Legs', 'legs'],
    ['Lower Body', 'legs'],
    ['Upper Body', 'upper'],
    ['Full Body', 'plan'],
    [null, 'plan'],
  ])('maps %s to the %s cover', (name, cover) => {
    expect(workoutCover(name)).toBe(cover)
  })
})
