import { describe, expect, it, vi } from 'vitest'
import {
  discardStaleSessionLifecycle,
  discardWorkoutLifecycle,
  finishWorkoutLifecycle,
} from '../workoutLifecycle'

const savedWorkout = { id: 'workout-1', materialized: false }

describe('finishWorkoutLifecycle', () => {
  it('does not clear local or remote session state when workout save fails', async () => {
    const clearWorkout = vi.fn()
    const clearSession = vi.fn()

    await expect(finishWorkoutLifecycle({
      saveWorkout: vi.fn().mockRejectedValue(new Error('ambiguous write result')),
      clearWorkout,
      clearSession,
    })).rejects.toThrow('ambiguous write result')

    expect(clearWorkout).not.toHaveBeenCalled()
    expect(clearSession).not.toHaveBeenCalled()
  })

  it('reports unconfirmed cleanup after a saved workout without rejecting the finish', async () => {
    const order: string[] = []
    const result = await finishWorkoutLifecycle({
      saveWorkout: vi.fn(async () => { order.push('save'); return savedWorkout }),
      clearWorkout: vi.fn(() => { order.push('clear-local') }),
      clearSession: vi.fn(async () => { order.push('clear-remote'); throw new Error('delete failed') }),
    })

    expect(order).toEqual(['save', 'clear-local', 'clear-remote'])
    expect(result.workout).toEqual(savedWorkout)
    expect(result.sessionCleanup).toBe('unconfirmed')
    expect(result.cleanupError).toEqual(new Error('delete failed'))
  })
})

describe('discardWorkoutLifecycle', () => {
  it('clears local state first and reports a failed cloud cleanup', async () => {
    const order: string[] = []
    const result = await discardWorkoutLifecycle({
      clearWorkout: vi.fn(() => { order.push('clear-local') }),
      clearSession: vi.fn(async () => { order.push('clear-remote'); throw new Error('delete failed') }),
    })

    expect(order).toEqual(['clear-local', 'clear-remote'])
    expect(result.sessionCleanup).toBe('unconfirmed')
  })
})

describe('discardStaleSessionLifecycle', () => {
  it('starts and persists a replacement after the old remote delete fails', async () => {
    const replacement = { startedAt: 200, exercises: [] }
    const persistReplacement = vi.fn(async () => undefined)
    const result = await discardStaleSessionLifecycle({
      clearLocal: vi.fn(),
      deleteRemote: vi.fn().mockRejectedValue(new Error('delete failed')),
      startReplacement: vi.fn(() => replacement),
      persistReplacement,
    })

    expect(result.sessionCleanup).toBe('unconfirmed')
    expect(result.replacement).toBe(replacement)
    expect(persistReplacement).toHaveBeenCalledWith(replacement)
  })
})
