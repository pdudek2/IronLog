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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
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
    saveActiveSession.mockReset().mockResolvedValue(undefined)
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

  it('does not resurrect the first session after a later replacement is also confirmed closed', async () => {
    useWorkoutStore.getState().hydrateFromDoc(remoteSession)
    const { result } = renderHook(() => useActiveSession('user-1'))

    act(() => {
      result.current.beginClosure('discard', remoteSession)
      result.current.confirmClosure()
      useWorkoutStore.getState().startWorkout()
    })
    const secondSession = useWorkoutStore.getState().active
    expect(secondSession).not.toBeNull()
    act(() => {
      result.current.beginClosure('discard', secondSession)
      result.current.confirmClosure()
    })
    expect(useWorkoutStore.getState().active).toBeNull()

    act(() => listener.current?.({
      session: remoteSession,
      fromCache: false,
      hasPendingWrites: false,
    }))
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'))
      await Promise.resolve()
    })

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

  it('ignores a late failed write for the first of two confirmed closed sessions', async () => {
    const closedWrite = createDeferred<void>()
    const saveError = new Error('permission-denied')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    saveActiveSession.mockImplementationOnce(() => closedWrite.promise)
    useWorkoutStore.getState().hydrateFromDoc(remoteSession)
    const { result } = renderHook(() => useActiveSession('user-1'))

    act(() => window.dispatchEvent(new Event('pagehide')))
    expect(saveActiveSession).toHaveBeenCalledWith('user-1', remoteSession)

    act(() => {
      result.current.beginClosure('discard', remoteSession)
      result.current.confirmClosure()
      useWorkoutStore.getState().startWorkout()
    })
    const secondSession = useWorkoutStore.getState().active
    expect(secondSession).not.toBeNull()
    act(() => {
      result.current.beginClosure('discard', secondSession)
      result.current.confirmClosure()
    })

    await act(async () => {
      closedWrite.reject(saveError)
      await closedWrite.promise.catch(() => undefined)
      await Promise.resolve()
    })

    expect(useWorkoutStore.getState().active).toBeNull()
    expect(result.current.activeSessionSyncStatus).toBe('idle')
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('does not let a late successful first-session write hide a failure after two closures', async () => {
    const closedWrite = createDeferred<void>()
    const replacementWrite = createDeferred<void>()
    const replacementError = new Error('replacement write failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    saveActiveSession
      .mockImplementationOnce(() => closedWrite.promise)
      .mockImplementationOnce(() => replacementWrite.promise)
    useWorkoutStore.getState().hydrateFromDoc(remoteSession)
    const { result } = renderHook(() => useActiveSession('user-1'))

    act(() => window.dispatchEvent(new Event('pagehide')))
    act(() => {
      result.current.beginClosure('discard', remoteSession)
      result.current.confirmClosure()
      useWorkoutStore.getState().startWorkout()
    })
    const secondSession = useWorkoutStore.getState().active
    expect(secondSession).not.toBeNull()
    act(() => {
      result.current.beginClosure('discard', secondSession)
      result.current.confirmClosure()
      useWorkoutStore.getState().startWorkout()
      window.dispatchEvent(new Event('pagehide'))
    })
    const replacement = useWorkoutStore.getState().active
    expect(replacement?.sessionId).not.toBe(remoteSession.sessionId)
    expect(saveActiveSession).toHaveBeenNthCalledWith(2, 'user-1', replacement)

    await act(async () => {
      replacementWrite.reject(replacementError)
      await replacementWrite.promise.catch(() => undefined)
      await Promise.resolve()
    })
    expect(result.current.activeSessionSyncStatus).toBe('failed')
    expect(consoleError).toHaveBeenCalledWith('[active session save error]', replacementError)

    await act(async () => {
      closedWrite.resolve()
      await closedWrite.promise
      await Promise.resolve()
    })

    expect(useWorkoutStore.getState().active?.sessionId).toBe(replacement?.sessionId)
    expect(result.current.activeSessionSyncStatus).toBe('failed')
    expect(consoleError).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })

  it('resets confirmed closure identities when the active user changes', () => {
    useWorkoutStore.getState().hydrateFromDoc(remoteSession)
    const { result, rerender } = renderHook(
      ({ uid }: { uid: string }) => useActiveSession(uid),
      { initialProps: { uid: 'user-1' } },
    )

    act(() => {
      result.current.beginClosure('discard', remoteSession)
      result.current.confirmClosure()
    })
    expect(useWorkoutStore.getState().active).toBeNull()

    rerender({ uid: 'user-2' })
    act(() => listener.current?.({
      session: remoteSession,
      fromCache: false,
      hasPendingWrites: false,
    }))

    expect(useWorkoutStore.getState().active?.sessionId).toBe(remoteSession.sessionId)
  })

  it('ignores a late retry rejection after that session is confirmed closed', async () => {
    const retryWrite = createDeferred<void>()
    const retryError = new Error('closed retry failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    saveActiveSession.mockImplementationOnce(() => retryWrite.promise)
    useWorkoutStore.getState().hydrateFromDoc(remoteSession)
    const { result } = renderHook(() => useActiveSession('user-1'))

    let retryPromise!: Promise<void>
    act(() => {
      retryPromise = result.current.retryActiveSessionSync()
    })
    expect(result.current.activeSessionSyncStatus).toBe('retrying')
    act(() => {
      result.current.beginClosure('discard', remoteSession)
      result.current.confirmClosure()
    })

    await act(async () => {
      retryWrite.reject(retryError)
      await retryPromise
    })

    expect(useWorkoutStore.getState().active).toBeNull()
    expect(result.current.activeSessionSyncStatus).toBe('retrying')
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('does not let a late successful closed-session retry hide a replacement retry failure', async () => {
    const closedRetry = createDeferred<void>()
    const replacementRetry = createDeferred<void>()
    const replacementError = new Error('replacement retry failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    saveActiveSession
      .mockImplementationOnce(() => closedRetry.promise)
      .mockImplementationOnce(() => replacementRetry.promise)
    useWorkoutStore.getState().hydrateFromDoc(remoteSession)
    const { result } = renderHook(() => useActiveSession('user-1'))

    let closedRetryPromise!: Promise<void>
    act(() => {
      closedRetryPromise = result.current.retryActiveSessionSync()
      result.current.beginClosure('discard', remoteSession)
      result.current.confirmClosure()
      useWorkoutStore.getState().startWorkout()
    })
    const replacement = useWorkoutStore.getState().active
    expect(replacement).not.toBeNull()

    let replacementRetryPromise!: Promise<void>
    act(() => {
      replacementRetryPromise = result.current.retryActiveSessionSync()
    })
    await act(async () => {
      replacementRetry.reject(replacementError)
      await replacementRetryPromise
    })
    expect(result.current.activeSessionSyncStatus).toBe('failed')
    expect(consoleError).toHaveBeenCalledWith('[active session retry error]', replacementError)

    await act(async () => {
      closedRetry.resolve()
      await closedRetryPromise
    })

    expect(useWorkoutStore.getState().active?.sessionId).toBe(replacement?.sessionId)
    expect(result.current.activeSessionSyncStatus).toBe('failed')
    expect(consoleError).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })

  it('ignores a late write rejection from the previous user lifecycle', async () => {
    const oldUserWrite = createDeferred<void>()
    const oldUserError = new Error('old user write failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    saveActiveSession.mockImplementationOnce(() => oldUserWrite.promise)
    useWorkoutStore.getState().hydrateFromDoc(remoteSession)
    const { result, rerender } = renderHook(
      ({ uid }: { uid: string }) => useActiveSession(uid),
      { initialProps: { uid: 'user-1' } },
    )

    act(() => window.dispatchEvent(new Event('pagehide')))
    act(() => {
      result.current.beginClosure('discard', remoteSession)
      result.current.confirmClosure()
    })
    rerender({ uid: 'user-2' })

    await act(async () => {
      oldUserWrite.reject(oldUserError)
      await oldUserWrite.promise.catch(() => undefined)
      await Promise.resolve()
    })

    expect(result.current.activeSessionSyncStatus).toBe('idle')
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('does not let a late previous-user success hide a current-user write failure', async () => {
    const oldUserWrite = createDeferred<void>()
    const currentUserWrite = createDeferred<void>()
    const currentUserError = new Error('current user write failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    saveActiveSession
      .mockImplementationOnce(() => oldUserWrite.promise)
      .mockImplementationOnce(() => currentUserWrite.promise)
    useWorkoutStore.getState().hydrateFromDoc(remoteSession)
    const { result, rerender } = renderHook(
      ({ uid }: { uid: string }) => useActiveSession(uid),
      { initialProps: { uid: 'user-1' } },
    )

    act(() => window.dispatchEvent(new Event('pagehide')))
    act(() => {
      result.current.beginClosure('discard', remoteSession)
      result.current.confirmClosure()
    })
    rerender({ uid: 'user-2' })
    const currentUserSession: ActiveWorkout = {
      ...remoteSession,
      sessionId: 'current-user-session',
    }
    act(() => {
      useWorkoutStore.getState().hydrateFromDoc(currentUserSession)
      window.dispatchEvent(new Event('pagehide'))
    })

    await act(async () => {
      currentUserWrite.reject(currentUserError)
      await currentUserWrite.promise.catch(() => undefined)
      await Promise.resolve()
    })
    expect(result.current.activeSessionSyncStatus).toBe('failed')
    expect(consoleError).toHaveBeenCalledWith('[active session save error]', currentUserError)

    await act(async () => {
      oldUserWrite.resolve()
      await oldUserWrite.promise
      await Promise.resolve()
    })

    expect(useWorkoutStore.getState().active?.sessionId).toBe(currentUserSession.sessionId)
    expect(result.current.activeSessionSyncStatus).toBe('failed')
    expect(consoleError).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })
})
