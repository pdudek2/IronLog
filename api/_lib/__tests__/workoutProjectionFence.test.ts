import { describe, expect, it } from 'vitest'

import {
  normalizeProjectionExerciseKeys,
  parseProjectionFence,
  projectionStateConflict,
  projectionSuperseded,
  workoutDeleted,
} from '../workoutProjectionFence.js'

describe('workout projection fence', () => {
  it('deduplicates and sorts exercise keys deterministically', () => {
    expect(normalizeProjectionExerciseKeys(
      [
        { exerciseSource: 'user', exerciseId: 'curl' },
        { exerciseSource: 'global', exerciseId: 'bench' },
      ],
      [
        { exerciseSource: 'global', exerciseId: 'bench' },
      ],
    )).toEqual([
      { exerciseSource: 'global', exerciseId: 'bench' },
      { exerciseSource: 'user', exerciseId: 'curl' },
    ])
  })

  it('accepts a complete fence, recognizes legacy, and rejects corruption', () => {
    expect(parseProjectionFence({
      projectionState: 'deleted',
      projectionRevision: 3,
      projectionExerciseKeys: [
        { exerciseSource: 'global', exerciseId: 'bench' },
      ],
      deletedAt: 123,
    })).toEqual({
      projectionState: 'deleted',
      projectionRevision: 3,
      projectionExerciseKeys: [
        { exerciseSource: 'global', exerciseId: 'bench' },
      ],
      deletedAt: 123,
    })

    expect(parseProjectionFence({})).toBeNull()
    expect(() => parseProjectionFence({ projectionState: 'pending' }))
      .toThrowError(projectionStateConflict())
  })

  it('uses stable conflict codes', () => {
    expect(projectionSuperseded()).toMatchObject({
      status: 409,
      code: 'projection_superseded',
    })
    expect(workoutDeleted()).toMatchObject({
      status: 409,
      code: 'workout_deleted',
    })
  })
})
