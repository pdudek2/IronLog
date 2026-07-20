import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ActiveWorkout } from '../../store/workoutStore'

type SnapshotListener = (snapshot: {
  session: ActiveWorkout | null
  fromCache: boolean
  hasPendingWrites: boolean
}) => void

const listener = vi.hoisted(() => ({ current: null as SnapshotListener | null }))
const saveActiveSession = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('../../lib/activeSessionService', () => ({
  saveActiveSession,
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
    saveActiveSession.mockClear()
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

  it('does not resurrect or persist a confirmed closed session from a late authoritative snapshot', () => {
    useWorkoutStore.getState().hydrateFromDoc(remoteSession)
    const { result } = renderHook(() => useActiveSession('user-1'))

    act(() => {
      result.current.beginClosure('discard', remoteSession)
      result.current.confirmClosure()
    })
    expect(useWorkoutStore.getState().active).toBeNull()

    act(() => listener.current?.({
      session: remoteSession,
      fromCache: false,
      hasPendingWrites: false,
    }))
    act(() => window.dispatchEvent(new Event('pagehide')))

    expect(useWorkoutStore.getState().active).toBeNull()
    expect(saveActiveSession).not.toHaveBeenCalled()
  })

  it('keeps and persists a newer replacement when the closed session snapshot arrives late', async () => {
    useWorkoutStore.getState().hydrateFromDoc(remoteSession)
    const { result } = renderHook(() => useActiveSession('user-1'))

    act(() => {
      result.current.beginClosure('discard', remoteSession)
      result.current.confirmClosure()
      useWorkoutStore.getState().startWorkout()
    })
    const replacement = useWorkoutStore.getState().active
    expect(replacement?.sessionId).not.toBe(remoteSession.sessionId)

    act(() => listener.current?.({
      session: remoteSession,
      fromCache: false,
      hasPendingWrites: false,
    }))
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'))
      await Promise.resolve()
    })

    expect(useWorkoutStore.getState().active?.sessionId).toBe(replacement?.sessionId)
    expect(saveActiveSession).toHaveBeenCalledTimes(1)
    expect(saveActiveSession).toHaveBeenCalledWith('user-1', replacement)
  })
})
