import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ActiveWorkout } from '../../store/workoutStore'

type Snapshot = { session: ActiveWorkout | null; sessionRevision: string | null; fromCache: boolean; hasPendingWrites: boolean }
const listener = vi.hoisted(() => ({ current: null as ((snapshot: Snapshot) => void) | null }))

vi.mock('../../lib/activeSessionService', () => ({
  subscribeToActiveSession: vi.fn((_uid: string, onChange: (snapshot: Snapshot) => void) => {
    listener.current = onChange
    return vi.fn()
  }),
}))

import { readActiveSessionBackupRecord, writeActiveSessionBackup } from '../../lib/activeSessionBackup'
import { useWorkoutStore } from '../../store/workoutStore'
import { usePassiveActiveSessionSync } from '../usePassiveActiveSessionSync'

const session = (reps: string): ActiveWorkout => ({
  sessionId: 'session-1',
  startedAt: 1,
  exercises: [{ exerciseId: 'bench-press', exerciseSource: 'global', name: 'Bench Press', sets: [{ weight: '80', reps, done: false }] }],
})

describe('usePassiveActiveSessionSync', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    })
    useWorkoutStore.getState().hydrateFromDoc(session('5'))
  })

  it('replaces the kept copy with a newer server version of the same session and its revision', () => {
    renderHook(() => usePassiveActiveSessionSync('user-1'))

    act(() => listener.current?.({ session: session('8'), sessionRevision: 'revision-2', fromCache: false, hasPendingWrites: false }))

    expect(useWorkoutStore.getState().active?.exercises[0].sets[0].reps).toBe('8')
    expect(readActiveSessionBackupRecord('user-1')).toMatchObject({ baseRevision: 'revision-2', unsynced: false })
  })

  it('keeps edits this device has not saved yet', () => {
    writeActiveSessionBackup('user-1', session('5'), { baseRevision: 'revision-1', unsynced: true })
    renderHook(() => usePassiveActiveSessionSync('user-1'))

    act(() => listener.current?.({ session: session('8'), sessionRevision: 'revision-2', fromCache: false, hasPendingWrites: false }))

    expect(useWorkoutStore.getState().active?.exercises[0].sets[0].reps).toBe('5')
    expect(readActiveSessionBackupRecord('user-1')).toMatchObject({ baseRevision: 'revision-1', unsynced: true })
  })
})
