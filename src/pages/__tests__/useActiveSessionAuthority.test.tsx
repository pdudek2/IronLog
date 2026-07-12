import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ActiveWorkout } from '../../store/workoutStore'

type SnapshotListener = (snapshot: {
  session: ActiveWorkout | null
  fromCache: boolean
  hasPendingWrites: boolean
}) => void

const listener = vi.hoisted(() => ({ current: null as SnapshotListener | null }))

vi.mock('../../lib/activeSessionService', () => ({
  saveActiveSession: vi.fn().mockResolvedValue(undefined),
  subscribeToActiveSession: vi.fn((_uid: string, onChange: SnapshotListener) => {
    listener.current = onChange
    return vi.fn()
  }),
}))

vi.mock('../../lib/workoutClosureService', () => ({
  WorkoutClosureError: class WorkoutClosureError extends Error {},
}))

import { useActiveSession } from '../../hooks/useActiveSession'
import { useWorkoutStore } from '../../store/workoutStore'

const remoteSession: ActiveWorkout = {
  sessionId: 'server-session',
  startedAt: Date.now(),
  exercises: [],
}

describe('useActiveSession snapshot authority', () => {
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
    useWorkoutStore.getState().clearWorkout()
    listener.current = null
  })

  it.each([
    ['cached deletion', null],
    ['cached session', remoteSession],
  ] as const)('keeps the workout page loading after %s until server authority arrives', (
    _case,
    cachedSession,
  ) => {
    const { result } = renderHook(() => useActiveSession('user-1'))

    act(() => listener.current?.({
      session: cachedSession,
      fromCache: true,
      hasPendingWrites: false,
    }))
    expect(result.current.ready).toBe(false)
    expect(useWorkoutStore.getState().active).toBeNull()

    act(() => listener.current?.({
      session: remoteSession,
      fromCache: false,
      hasPendingWrites: false,
    }))
    expect(result.current.ready).toBe(true)
    expect(useWorkoutStore.getState().active?.sessionId).toBe('server-session')
  })
})
