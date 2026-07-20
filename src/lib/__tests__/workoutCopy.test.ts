import { describe, expect, it } from 'vitest'

import { getCategoryWorkloadInsight } from '../workoutCopy'

describe('getCategoryWorkloadInsight', () => {
  it.each([
    ['chest', 'Najwięcej pracy poszło na klatkę.'],
    ['back', 'Najwięcej pracy poszło na plecy.'],
    ['legs', 'Najwięcej pracy wykonały nogi.'],
    ['shoulders', 'Najwięcej pracy poszło w barki.'],
    ['arms', 'Najwięcej pracy poszło w ramiona.'],
    ['core', 'Najwięcej pracy wykonał core.'],
    ['cardio', 'Najmocniejszym akcentem było cardio.'],
  ])('uses the approved sentence for %s', (category, expected) => {
    expect(getCategoryWorkloadInsight(category, 'Fallback')).toBe(expected)
  })

  it('uses the presentation label in a safe fallback sentence', () => {
    expect(getCategoryWorkloadInsight('mobility', 'Mobilność')).toBe(
      'Najwięcej pracy przypadło kategorii „Mobilność”.',
    )
  })
})
