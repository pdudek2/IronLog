import { describe, expect, it } from 'vitest'
import {
  clearWorkoutDeleteRecovery,
  readWorkoutDeleteRecovery,
  writeWorkoutDeleteRecovery,
} from '../workoutDeleteRecovery'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length(): number { return this.values.size }
  clear(): void { this.values.clear() }
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

describe('workout delete recovery', () => {
  it('round-trips the committed delete workout ID', () => {
    const storage = new MemoryStorage()

    writeWorkoutDeleteRecovery('user-1', { workoutId: 'workout-1' }, storage)

    expect(readWorkoutDeleteRecovery('user-1', storage)).toEqual({ workoutId: 'workout-1' })
  })

  it('keeps recoveries isolated by UID', () => {
    const storage = new MemoryStorage()

    writeWorkoutDeleteRecovery('user-1', { workoutId: 'workout-1' }, storage)
    writeWorkoutDeleteRecovery('user-2', { workoutId: 'workout-2' }, storage)

    expect(readWorkoutDeleteRecovery('user-1', storage)).toEqual({ workoutId: 'workout-1' })
    expect(readWorkoutDeleteRecovery('user-2', storage)).toEqual({ workoutId: 'workout-2' })
  })

  it.each([
    ['malformed JSON', '{'],
    ['wrong UID', JSON.stringify({ uid: 'user-2', workoutId: 'workout-1' })],
    ['missing workout ID', JSON.stringify({ uid: 'user-1' })],
    ['blank workout ID', JSON.stringify({ uid: 'user-1', workoutId: '' })],
    ['numeric workout ID', JSON.stringify({ uid: 'user-1', workoutId: 42 })],
  ])('returns null for %s', (_case, stored) => {
    const storage = new MemoryStorage()
    storage.setItem('ironlog:workout-delete-recovery:user-1', stored)

    expect(readWorkoutDeleteRecovery('user-1', storage)).toBeNull()
  })

  it('clears recovery when requested', () => {
    const storage = new MemoryStorage()
    writeWorkoutDeleteRecovery('user-1', { workoutId: 'workout-1' }, storage)

    clearWorkoutDeleteRecovery('user-1', storage)

    expect(readWorkoutDeleteRecovery('user-1', storage)).toBeNull()
  })
})
