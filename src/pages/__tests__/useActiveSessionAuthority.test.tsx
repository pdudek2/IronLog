import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ActiveWorkout } from '../../store/workoutStore'

type SnapshotListener = (snapshot: {
  session: ActiveWorkout | null
  fromCache: boolean
  hasPendingWrites: boolean
}) => void

const listener = vi.hoisted(() => ({ current: null as SnapshotListener | null }))
const claimActiveSession = vi.hoisted(() => vi.fn(async (_uid: string, candidate: ActiveWorkout) => candidate))
const loadActiveSessionFromServer = vi.hoisted(() => vi.fn<() => Promise<ActiveWorkout | null>>())
const saveActiveSession = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const discardStaleSessionLifecycle = vi.hoisted(() => vi.fn())

vi.mock('../../lib/activeSessionService', () => ({
  claimActiveSession,
  loadActiveSessionFromServer,
  saveActiveSession,
  subscribeToActiveSession: vi.fn((_uid: string, onChange: SnapshotListener) => {
    listener.current = onChange
    return vi.fn()
  }),
}))

vi.mock('../../lib/workoutClosureService', () => ({
  WorkoutClosureError: class WorkoutClosureError extends Error {},
}))

vi.mock('../../lib/workoutLifecycle', () => ({
  discardStaleSessionLifecycle,
}))

import { useActiveSession } from '../../hooks/useActiveSession'
import { readWorkoutClosureIntent, writeWorkoutClosureIntent } from '../../lib/workoutClosureIntent'
import { useWorkoutStore } from '../../store/workoutStore'

const remoteSession: ActiveWorkout = {
  sessionId: 'server-session',
  startedAt: Date.now(),
  exercises: [],
}

const staleRemoteSession: ActiveWorkout = {
  ...remoteSession,
  sessionId: 'stale-server-session',
  startedAt: Date.now() - (13 * 60 * 60 * 1000),
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
    claimActiveSession.mockReset().mockImplementation(async (_uid: string, candidate: ActiveWorkout) => candidate)
    loadActiveSessionFromServer.mockReset().mockResolvedValue(null)
    saveActiveSession.mockReset().mockResolvedValue(undefined)
    discardStaleSessionLifecycle.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports failure without unlocking an unconfirmed empty session', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useActiveSession('user-1'))

    expect(result.current.ready).toBe(false)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000)
    })

    expect(result.current.ready).toBe(false)
    expect(result.current.activeSessionSyncStatus).toBe('failed')
  })

  it('accepts a newer server edit after its local write is acknowledged', async () => {
    vi.useFakeTimers()
    const initialSession: ActiveWorkout = {
      ...remoteSession,
      exercises: [{
        exerciseId: 'bench-press',
        exerciseSource: 'global',
        name: 'Bench Press',
        sets: [{ weight: '80', reps: '5', done: false }],
      }],
    }
    const { result } = renderHook(() => useActiveSession('user-1'))

    act(() => listener.current?.({
      session: initialSession,
      fromCache: false,
      hasPendingWrites: false,
    }))
    act(() => useWorkoutStore.getState().updateSet(0, 0, 'reps', '6'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(saveActiveSession).toHaveBeenCalledTimes(1)

    act(() => listener.current?.({
      session: {
        ...initialSession,
        exercises: [{
          ...initialSession.exercises[0],
          sets: [{ weight: '80', reps: '6', done: false }],
        }],
      },
      fromCache: false,
      hasPendingWrites: false,
    }))
    act(() => listener.current?.({
      session: {
        ...initialSession,
        exercises: [{
          ...initialSession.exercises[0],
          sets: [{ weight: '80', reps: '7', done: false }],
        }],
      },
      fromCache: false,
      hasPendingWrites: false,
    }))

    expect(result.current.ready).toBe(true)
    expect(useWorkoutStore.getState().active?.exercises[0].sets[0].reps).toBe('7')
    expect(saveActiveSession).toHaveBeenCalledTimes(1)
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

  it('converges a simultaneous empty start to the session claimed on the server', async () => {
    const claim = createDeferred<ActiveWorkout>()
    claimActiveSession.mockReturnValueOnce(claim.promise)
    const { result } = renderHook(() => useActiveSession('user-1'))

    act(() => listener.current?.({
      session: null,
      fromCache: false,
      hasPendingWrites: false,
    }))

    expect(claimActiveSession).toHaveBeenCalledOnce()
    expect(result.current.ready).toBe(false)
    const candidate = claimActiveSession.mock.calls[0][1]
    act(() => listener.current?.({
      session: candidate,
      fromCache: false,
      hasPendingWrites: true,
    }))
    expect(result.current.ready).toBe(false)

    await act(async () => {
      claim.resolve(remoteSession)
      await claim.promise
    })

    expect(result.current.ready).toBe(true)
    expect(useWorkoutStore.getState().active?.sessionId).toBe('server-session')
  })

  it('reloads the authoritative session directly instead of trusting the local cache', async () => {
    const staleLocalSession = { ...remoteSession, sessionId: 'stale-local-session' }
    const authoritativeSession = { ...remoteSession, sessionId: 'authoritative-session' }
    useWorkoutStore.getState().hydrateFromDoc(staleLocalSession)
    loadActiveSessionFromServer.mockResolvedValueOnce(authoritativeSession)
    const { result } = renderHook(() => useActiveSession('user-1'))

    await act(async () => {
      await result.current.reloadCurrentSession()
    })

    expect(loadActiveSessionFromServer).toHaveBeenCalledWith('user-1')
    expect(result.current.ready).toBe(true)
    expect(useWorkoutStore.getState().active?.sessionId).toBe('authoritative-session')
  })

  it('automatically reconciles a server session mismatch', async () => {
    const staleLocalSession = { ...remoteSession, sessionId: 'stale-local-session' }
    const authoritativeSession = { ...remoteSession, sessionId: 'authoritative-session' }
    useWorkoutStore.getState().hydrateFromDoc(staleLocalSession)
    loadActiveSessionFromServer.mockResolvedValueOnce(authoritativeSession)
    const { result } = renderHook(() => useActiveSession('user-1'))

    await act(async () => {
      await result.current.markClosureError(Object.assign(new Error('mismatch'), {
        kind: 'definitive',
        code: 'session_mismatch',
        status: 409,
      }) as never)
    })

    expect(loadActiveSessionFromServer).toHaveBeenCalledWith('user-1')
    expect(result.current.closureState).toBe('idle')
    expect(useWorkoutStore.getState().active?.sessionId).toBe('authoritative-session')
  })

  it('automatically clears a stale closure intent when another device has an active session', () => {
    writeWorkoutClosureIntent('user-1', {
      action: 'discard',
      session: { ...remoteSession, sessionId: 'closed-on-this-device' },
      createdAt: Date.now(),
    })
    const { result } = renderHook(() => useActiveSession('user-1'))
    const authoritativeSession = { ...remoteSession, sessionId: 'active-on-another-device' }

    act(() => listener.current?.({
      session: authoritativeSession,
      fromCache: false,
      hasPendingWrites: false,
    }))

    expect(result.current.closureState).toBe('idle')
    expect(readWorkoutClosureIntent('user-1')).toBeNull()
    expect(useWorkoutStore.getState().active?.sessionId).toBe('active-on-another-device')
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

  it('returns completed when the current stale session is continued successfully', async () => {
    const { result } = renderHook(() => useActiveSession('user-1'))
    act(() => listener.current?.({
      session: staleRemoteSession,
      fromCache: false,
      hasPendingWrites: false,
    }))

    let outcome: Awaited<ReturnType<typeof result.current.continueStaleSession>>
    await act(async () => {
      outcome = await result.current.continueStaleSession()
    })

    expect(outcome!).toEqual({ status: 'completed' })
  })

  it('still rejects a current stale-session continuation failure', async () => {
    const currentError = new Error('current continuation failed')
    saveActiveSession.mockRejectedValueOnce(currentError)
    const { result } = renderHook(() => useActiveSession('user-1'))
    act(() => listener.current?.({
      session: staleRemoteSession,
      fromCache: false,
      hasPendingWrites: false,
    }))

    await act(async () => {
      await expect(result.current.continueStaleSession()).rejects.toBe(currentError)
    })
  })

  it('returns ignored for a late continuation success after confirmed closure', async () => {
    const continuationWrite = createDeferred<void>()
    saveActiveSession.mockImplementationOnce(() => continuationWrite.promise)
    const { result } = renderHook(() => useActiveSession('user-1'))
    act(() => listener.current?.({
      session: staleRemoteSession,
      fromCache: false,
      hasPendingWrites: false,
    }))

    let operation!: ReturnType<typeof result.current.continueStaleSession>
    act(() => {
      operation = result.current.continueStaleSession()
    })
    const refreshedSession = useWorkoutStore.getState().active
    expect(refreshedSession).not.toBeNull()
    act(() => {
      result.current.beginClosure('discard', refreshedSession)
      result.current.confirmClosure()
    })

    let outcome: Awaited<typeof operation>
    await act(async () => {
      continuationWrite.resolve()
      outcome = await operation
    })

    expect(outcome!).toEqual({ status: 'ignored' })
    expect(useWorkoutStore.getState().active).toBeNull()
  })

  it('returns ignored instead of rejecting a continuation invalidated by uid change', async () => {
    const continuationWrite = createDeferred<void>()
    saveActiveSession.mockImplementationOnce(() => continuationWrite.promise)
    const { result, rerender } = renderHook(
      ({ uid }: { uid: string }) => useActiveSession(uid),
      { initialProps: { uid: 'user-1' } },
    )
    act(() => listener.current?.({
      session: staleRemoteSession,
      fromCache: false,
      hasPendingWrites: false,
    }))

    let operation!: ReturnType<typeof result.current.continueStaleSession>
    act(() => {
      operation = result.current.continueStaleSession()
    })
    rerender({ uid: 'user-2' })

    let outcome: Awaited<typeof operation>
    await act(async () => {
      continuationWrite.reject(new Error('old continuation failed'))
      outcome = await operation
    })

    expect(outcome!).toEqual({ status: 'ignored' })
  })

  it('returns ignored for a continuation completed after unmount', async () => {
    const continuationWrite = createDeferred<void>()
    saveActiveSession.mockImplementationOnce(() => continuationWrite.promise)
    const { result, unmount } = renderHook(() => useActiveSession('user-1'))
    act(() => listener.current?.({
      session: staleRemoteSession,
      fromCache: false,
      hasPendingWrites: false,
    }))

    let operation!: ReturnType<typeof result.current.continueStaleSession>
    act(() => {
      operation = result.current.continueStaleSession()
    })
    unmount()
    continuationWrite.resolve()

    await expect(operation).resolves.toEqual({ status: 'ignored' })
  })

  it('returns discarded for a valid stale discard even though that session is now closed', async () => {
    discardStaleSessionLifecycle.mockImplementationOnce(async (
      dependencies: { clearConfirmed(): void },
    ) => {
      dependencies.clearConfirmed()
      return { status: 'discarded', replacement: null }
    })
    const { result } = renderHook(() => useActiveSession('user-1'))
    act(() => listener.current?.({
      session: staleRemoteSession,
      fromCache: false,
      hasPendingWrites: false,
    }))

    let outcome: Awaited<ReturnType<typeof result.current.discardStaleSession>>
    await act(async () => {
      outcome = await result.current.discardStaleSession()
    })

    expect(outcome!).toEqual({ status: 'discarded', replacement: null })
  })

  it('returns ignored for a stale discard result invalidated by uid change', async () => {
    const lifecycle = createDeferred<{ status: 'discarded'; replacement: null }>()
    discardStaleSessionLifecycle.mockReturnValueOnce(lifecycle.promise)
    const { result, rerender } = renderHook(
      ({ uid }: { uid: string }) => useActiveSession(uid),
      { initialProps: { uid: 'user-1' } },
    )
    act(() => listener.current?.({
      session: staleRemoteSession,
      fromCache: false,
      hasPendingWrites: false,
    }))

    let operation!: ReturnType<typeof result.current.discardStaleSession>
    act(() => {
      operation = result.current.discardStaleSession()
    })
    rerender({ uid: 'user-2' })
    lifecycle.resolve({ status: 'discarded', replacement: null })

    await expect(operation).resolves.toEqual({ status: 'ignored' })
  })

  it('returns ignored instead of rejecting a stale discard invalidated by unmount', async () => {
    const lifecycle = createDeferred<{ status: 'discarded'; replacement: null }>()
    discardStaleSessionLifecycle.mockReturnValueOnce(lifecycle.promise)
    const { result, unmount } = renderHook(() => useActiveSession('user-1'))
    act(() => listener.current?.({
      session: staleRemoteSession,
      fromCache: false,
      hasPendingWrites: false,
    }))

    let operation!: ReturnType<typeof result.current.discardStaleSession>
    act(() => {
      operation = result.current.discardStaleSession()
    })
    unmount()
    lifecycle.reject(new Error('old discard failed'))

    await expect(operation).resolves.toEqual({ status: 'ignored' })
  })
})
