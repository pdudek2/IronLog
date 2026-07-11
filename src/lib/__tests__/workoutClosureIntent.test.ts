import { describe, expect, it } from 'vitest'
import type { ActiveWorkout } from '../../store/workoutStore'
import {
  clearWorkoutClosureIntent,
  readWorkoutClosureIntent,
  writeWorkoutClosureIntent,
  type WorkoutClosureIntent,
} from '../workoutClosureIntent'

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
  startedAt: 1_790_000_000_000,
  templateId: 'template-1',
  label: 'Push',
  exercises: [{
    exerciseId: 'bench-press',
    exerciseSource: 'global',
    name: 'Bench Press',
    sets: [{ weight: '82.5', reps: '5', done: true }],
  }, {
    exerciseId: 'custom-row',
    exerciseSource: 'user',
    name: 'Custom Row',
    sets: [{ weight: '40', reps: '10', done: false }],
  }],
}

function intent(action: WorkoutClosureIntent['action'], createdAt = 100): WorkoutClosureIntent {
  return { action, session, createdAt }
}

describe('workout closure intent', () => {
  it.each(['finish', 'discard'] as const)('round-trips a complete %s snapshot', (action) => {
    const storage = new MemoryStorage()
    writeWorkoutClosureIntent('user-1', intent(action), storage)

    expect(readWorkoutClosureIntent('user-1', storage)).toEqual(intent(action))
  })

  it('keeps intents isolated by UID', () => {
    const storage = new MemoryStorage()
    writeWorkoutClosureIntent('user-1', intent('finish', 100), storage)
    writeWorkoutClosureIntent('user-2', intent('discard', 200), storage)

    expect(readWorkoutClosureIntent('user-1', storage)).toEqual(intent('finish', 100))
    expect(readWorkoutClosureIntent('user-2', storage)).toEqual(intent('discard', 200))
    expect(storage.length).toBe(2)
  })

  it.each([
    ['malformed JSON', '{'],
    ['wrong UID', JSON.stringify({ uid: 'user-2', intent: intent('finish') })],
    ['invalid action', JSON.stringify({ uid: 'user-1', intent: { ...intent('finish'), action: 'archive' } })],
    ['missing session', JSON.stringify({ uid: 'user-1', intent: { action: 'finish', createdAt: 100 } })],
    ['numeric label', JSON.stringify({
      uid: 'user-1',
      intent: { ...intent('finish'), session: { ...session, label: 42 } },
    })],
    ['object label', JSON.stringify({
      uid: 'user-1',
      intent: { ...intent('finish'), session: { ...session, label: { text: 'Push' } } },
    })],
    ['numeric template ID', JSON.stringify({
      uid: 'user-1',
      intent: { ...intent('finish'), session: { ...session, templateId: 42 } },
    })],
    ['object template ID', JSON.stringify({
      uid: 'user-1',
      intent: { ...intent('finish'), session: { ...session, templateId: { id: 'template-1' } } },
    })],
  ])('returns null for %s', (_case, stored) => {
    const storage = new MemoryStorage()
    storage.setItem('ironlog:workout-closure:user-1', stored)

    expect(readWorkoutClosureIntent('user-1', storage)).toBeNull()
  })

  it.each([
    ['omitted', {}, {}],
    ['null template ID', { templateId: null }, { templateId: null }],
    ['string values', { templateId: 'template-1', label: 'Push' }, { templateId: 'template-1', label: 'Push' }],
  ])('round-trips valid optional fields when %s', (_case, optionalFields, expectedFields) => {
    const storage = new MemoryStorage()
    const validIntent: WorkoutClosureIntent = {
      action: 'finish',
      session: { ...session, label: undefined, templateId: undefined, ...optionalFields },
      createdAt: 100,
    }

    writeWorkoutClosureIntent('user-1', validIntent, storage)

    expect(readWorkoutClosureIntent('user-1', storage)).toEqual({
      action: 'finish',
      session: {
        sessionId: session.sessionId,
        startedAt: session.startedAt,
        exercises: session.exercises,
        ...expectedFields,
      },
      createdAt: 100,
    })
  })

  it('clears only when explicitly requested', () => {
    const storage = new MemoryStorage()
    writeWorkoutClosureIntent('user-1', intent('finish'), storage)

    clearWorkoutClosureIntent('user-1', storage)

    expect(readWorkoutClosureIntent('user-1', storage)).toBeNull()
  })

  it('does not expire an unresolved intent because of age', () => {
    const storage = new MemoryStorage()
    writeWorkoutClosureIntent('user-1', intent('discard', 1), storage)

    expect(readWorkoutClosureIntent('user-1', storage)).toEqual(intent('discard', 1))
  })
})
