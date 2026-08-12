import { describe, expect, it, vi } from 'vitest'
import type { ActiveWorkout } from '../../store/workoutStore'
import { WorkoutClosureError } from '../workoutClosureService'
import { readWorkoutClosureIntent } from '../workoutClosureIntent'
import {
  discardStaleSessionLifecycle,
  discardWorkoutLifecycle,
  finishWorkoutLifecycle,
} from '../workoutLifecycle'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length(): number { return this.values.size }
  clear(): void { this.values.clear() }
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

const session: ActiveWorkout = {
  sessionId: 'session-1',
  startedAt: 100,
  exercises: [{
    exerciseId: 'bench-press',
    exerciseSource: 'global',
    name: 'Bench Press',
    sets: [{ weight: '80', reps: '5', done: true }],
  }],
}

describe('finishWorkoutLifecycle', () => {
  it('persists intent before request and clears recovery only after confirmed success', async () => {
    const order: string[] = []
    const storage = new MemoryStorage()
    const originalSetItem = storage.setItem.bind(storage)
    storage.setItem = vi.fn((key, value) => { order.push('prepare-intent'); originalSetItem(key, value) })

    const result = await finishWorkoutLifecycle({
      uid: 'user-1',
      session,
      sessionRevision: 'revision-finish',
      storage,
      request: vi.fn(async () => {
        expect(readWorkoutClosureIntent('user-1', storage)).toEqual({
          action: 'finish',
          session,
          createdAt: 100,
          sessionRevision: 'revision-finish',
        })
        order.push('request')
        return { workoutId: 'session-1', status: 'materialized' as const }
      }),
      now: () => 100,
      clearConfirmed: vi.fn(async () => { order.push('confirmed-clear') }),
    })

    expect(result).toEqual({ workoutId: 'session-1', status: 'materialized' })
    expect(order).toEqual(['prepare-intent', 'request', 'confirmed-clear'])
    expect(storage.length).toBe(0)
  })

  it('returns closure_unconfirmed and keeps the intent and session on ambiguous failure', async () => {
    const order: string[] = []
    const storage = new MemoryStorage()
    const clearConfirmed = vi.fn()

    const result = await finishWorkoutLifecycle({
      uid: 'user-1',
      session,
      sessionRevision: 'revision-finish',
      storage,
      now: () => 100,
      request: vi.fn(async () => {
        order.push('request-fails')
        throw new WorkoutClosureError('ambiguous', 'No acknowledgement')
      }),
      clearConfirmed,
    })

    expect(result.status).toBe('closure_unconfirmed')
    expect(order).toEqual(['request-fails'])
    expect(clearConfirmed).not.toHaveBeenCalled()
    expect(storage.length).toBe(1)
    expect(readWorkoutClosureIntent('user-1', storage)).toEqual({
      action: 'finish',
      session,
      createdAt: 100,
      sessionRevision: 'revision-finish',
    })
  })
})

describe('discardWorkoutLifecycle', () => {
  it('uses the same prepare-request-confirmed-clear ordering', async () => {
    const order: string[] = []
    const storage = new MemoryStorage()
    const originalSetItem = storage.setItem.bind(storage)
    storage.setItem = vi.fn((key, value) => { order.push('prepare-intent'); originalSetItem(key, value) })

    const result = await discardWorkoutLifecycle({
      uid: 'user-1',
      session,
      storage,
      request: vi.fn(async () => { order.push('request'); return { status: 'discarded' as const } }),
      clearConfirmed: vi.fn(async () => { order.push('confirmed-clear') }),
    })

    expect(result).toEqual({ status: 'discarded' })
    expect(order).toEqual(['prepare-intent', 'request', 'confirmed-clear'])
  })
})

describe('discardStaleSessionLifecycle', () => {
  it('creates and persists a replacement only after confirmed discard', async () => {
    const order: string[] = []
    const storage = new MemoryStorage()
    const replacement = { sessionId: 'session-2', startedAt: 200, exercises: [] }

    const result = await discardStaleSessionLifecycle({
      uid: 'user-1',
      session,
      storage,
      request: vi.fn(async () => { order.push('request-confirmed'); return { status: 'discarded' as const } }),
      clearConfirmed: vi.fn(async () => { order.push('confirmed-clear') }),
      startReplacement: vi.fn(() => { order.push('start-replacement'); return replacement }),
      persistReplacement: vi.fn(async () => { order.push('persist-replacement') }),
    })

    expect(result).toEqual({ status: 'discarded', replacement })
    expect(order).toEqual([
      'request-confirmed',
      'confirmed-clear',
      'start-replacement',
      'persist-replacement',
    ])
  })

  it('does not create a replacement after an ambiguous discard', async () => {
    const storage = new MemoryStorage()
    const startReplacement = vi.fn()

    const result = await discardStaleSessionLifecycle({
      uid: 'user-1',
      session,
      storage,
      request: vi.fn().mockRejectedValue(new WorkoutClosureError('ambiguous', 'No acknowledgement')),
      clearConfirmed: vi.fn(),
      startReplacement,
      persistReplacement: vi.fn(),
    })

    expect(result).toMatchObject({ status: 'closure_unconfirmed', replacement: null })
    expect(startReplacement).not.toHaveBeenCalled()
    expect(storage.length).toBe(1)
  })
})
