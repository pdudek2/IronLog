import { describe, expect, it, vi } from 'vitest'

vi.mock('../firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(),
}))

import { hasActiveSessionWork } from '../activeSessionService'

describe('hasActiveSessionWork', () => {
  it('detects whether an active session contains resumable work', () => {
    expect(hasActiveSessionWork(null)).toBe(false)
    expect(hasActiveSessionWork({ startedAt: 1, exercises: [] })).toBe(false)
    expect(hasActiveSessionWork({ startedAt: 1, label: '   ', exercises: [] })).toBe(false)
    expect(hasActiveSessionWork({ startedAt: 1, label: 'Push A', exercises: [] })).toBe(true)
    expect(hasActiveSessionWork({
      startedAt: 1,
      exercises: [{
        exerciseId: 'squat',
        exerciseSource: 'global',
        name: 'Squat',
        sets: [],
      }],
    })).toBe(true)
  })
})
