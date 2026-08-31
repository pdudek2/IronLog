import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ActiveWorkout } from '../../store/workoutStore'

type SnapshotListener = (snapshot: {
  session: ActiveWorkout | null
  sessionRevision?: string | null
  fromCache: boolean
  hasPendingWrites: boolean
}) => void

const listener = vi.hoisted(() => ({ current: null as SnapshotListener | null }))
const ActiveSessionConflictError = vi.hoisted(() => class ActiveSessionConflictError extends Error {
  constructor() {
    super('The active session changed on the server.')
    this.name = 'ActiveSessionConflictError'
  }
})
const claimActiveSession = vi.hoisted(() => vi.fn(async (_uid: string, candidate: ActiveWorkout) => ({
  session: candidate,
  sessionRevision: 'revision-claimed',
})))
const loadActiveSessionFromServer = vi.hoisted(() => vi.fn<() => Promise<{
  session: ActiveWorkout | null
  sessionRevision: string | null
}>>())
const saveActiveSession = vi.hoisted(() => vi.fn().mockResolvedValue({ sessionRevision: 'revision-saved' }))
const discardStaleSessionLifecycle = vi.hoisted(() => vi.fn())

vi.mock('../../lib/activeSessionService', () => ({
  ActiveSessionConflictError,
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
import {
  readWorkoutClosureIntent,
  writeWorkoutClosureIntent,
  type WorkoutClosureIntent,
} from '../../lib/workoutClosureIntent'
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

const editableRemoteSession: ActiveWorkout = {
  ...remoteSession,
  exercises: [{
    exerciseId: 'bench-press',
    exerciseSource: 'global',
    name: 'Bench Press',
    sets: [{ weight: '80', reps: '5', done: false }],
  }],
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
    claimActiveSession.mockReset().mockImplementation(async (_uid: string, candidate: ActiveWorkout) => ({
      session: candidate,
      sessionRevision: 'revision-claimed',
    }))
    loadActiveSessionFromServer.mockReset().mockResolvedValue({ session: null, sessionRevision: null })
    saveActiveSession.mockReset().mockResolvedValue({ sessionRevision: 'revision-saved' })
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

  it('keeps the local edit and reports a revision conflict after a stale save is rejected', async () => {
    vi.useFakeTimers()
    saveActiveSession.mockRejectedValueOnce(new ActiveSessionConflictError())
    const { result } = renderHook(() => useActiveSession('user-1'))

    act(() => listener.current?.({
      session: editableRemoteSession,
      sessionRevision: 'revision-initial',
      fromCache: false,
      hasPendingWrites: false,
    }))
    act(() => useWorkoutStore.getState().updateSet(0, 0, 'reps', '6'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })

    expect(useWorkoutStore.getState().active?.exercises[0].sets[0].reps).toBe('6')
    expect(result.current.activeSessionSyncStatus).toBe('conflict')
  })

  it('keeps the edit base revision when a newer remote snapshot arrives before autosave', async () => {
    vi.useFakeTimers()
    renderHook(() => useActiveSession('user-1'))

    act(() => listener.current?.({
      session: editableRemoteSession,
      sessionRevision: 'revision-initial',
      fromCache: false,
      hasPendingWrites: false,
    }))
    act(() => useWorkoutStore.getState().updateSet(0, 0, 'reps', '6'))
    act(() => listener.current?.({
      session: {
        ...editableRemoteSession,
        exercises: [{
          ...editableRemoteSession.exercises[0],
          sets: [{ weight: '80', reps: '7', done: false }],
        }],
      },
      sessionRevision: 'revision-newer',
      fromCache: false,
      hasPendingWrites: false,
    }))
    await act(async () => {
      await Promise.resolve()
    })

    expect(saveActiveSession).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        exercises: [expect.objectContaining({
          sets: [expect.objectContaining({ reps: '6' })],
        })],
      }),
      'revision-initial',
    )
  })

  it('serializes rapid saves and gives the next write the committed revision', async () => {
    vi.useFakeTimers()
    const firstWrite = createDeferred<{ sessionRevision: string }>()
    saveActiveSession
      .mockReturnValueOnce(firstWrite.promise)
      .mockResolvedValueOnce({ sessionRevision: 'revision-third' })
    renderHook(() => useActiveSession('user-1'))

    act(() => listener.current?.({
      session: editableRemoteSession,
      sessionRevision: 'revision-initial',
      fromCache: false,
      hasPendingWrites: false,
    }))
    act(() => useWorkoutStore.getState().updateSet(0, 0, 'reps', '6'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    act(() => useWorkoutStore.getState().updateSet(0, 0, 'reps', '7'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })

    expect(saveActiveSession).toHaveBeenCalledTimes(1)
    await act(async () => {
      firstWrite.resolve({ sessionRevision: 'revision-second' })
      await firstWrite.promise
      await Promise.resolve()
    })
    expect(saveActiveSession).toHaveBeenNthCalledWith(
      2,
      'user-1',
      expect.objectContaining({
        exercises: [expect.objectContaining({
          sets: [expect.objectContaining({ reps: '7' })],
        })],
      }),
      'revision-second',
    )
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

  it('keeps authoritative absence idle until the user explicitly starts a session', async () => {
    const claim = createDeferred<{ session: ActiveWorkout; sessionRevision: string }>()
    claimActiveSession.mockReturnValueOnce(claim.promise)
    const { result } = renderHook(() => useActiveSession('user-1'))

    act(() => listener.current?.({
      session: null,
      fromCache: false,
      hasPendingWrites: false,
    }))

    expect(result.current.ready).toBe(true)
    expect(useWorkoutStore.getState().active).toBeNull()
    expect(claimActiveSession).not.toHaveBeenCalled()

    let startPromise!: Promise<void>
    act(() => {
      startPromise = result.current.startNewSession()
    })

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
      claim.resolve({ session: remoteSession, sessionRevision: 'revision-claimed' })
      await startPromise
    })

    expect(result.current.ready).toBe(true)
    expect(useWorkoutStore.getState().active?.sessionId).toBe('server-session')
  })

  it('reloads the authoritative session directly instead of trusting the local cache', async () => {
    const staleLocalSession = { ...remoteSession, sessionId: 'stale-local-session' }
    const authoritativeSession = { ...remoteSession, sessionId: 'authoritative-session' }
    useWorkoutStore.getState().hydrateFromDoc(staleLocalSession)
    loadActiveSessionFromServer.mockResolvedValueOnce({
      session: authoritativeSession,
      sessionRevision: 'revision-authoritative',
    })
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
    loadActiveSessionFromServer.mockResolvedValueOnce({
      session: authoritativeSession,
      sessionRevision: 'revision-authoritative',
    })
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

  it('reloads the authoritative session and clears a stale closure after a revision conflict', async () => {
    const staleLocalSession = { ...remoteSession, sessionId: 'stale-local-session' }
    const authoritativeSession = { ...remoteSession, sessionId: 'authoritative-session' }
    useWorkoutStore.getState().hydrateFromDoc(staleLocalSession)
    loadActiveSessionFromServer.mockResolvedValueOnce({
      session: authoritativeSession,
      sessionRevision: 'revision-authoritative',
    })
    const { result } = renderHook(() => useActiveSession('user-1'))
    act(() => { result.current.beginClosure('finish', staleLocalSession) })

    let failure: Awaited<ReturnType<typeof result.current.markClosureError>>
    await act(async () => {
      failure = await result.current.markClosureError(Object.assign(new Error('changed'), {
        kind: 'definitive',
        code: 'active_session_changed',
        status: 409,
      }) as never)
    })

    expect(failure!).toBe('active_session_changed')
    expect(loadActiveSessionFromServer).toHaveBeenCalledWith('user-1')
    expect(readWorkoutClosureIntent('user-1')).toBeNull()
    expect(result.current.closureIntent).toBeNull()
    expect(result.current.closureState).toBe('idle')
    expect(useWorkoutStore.getState().active?.sessionId).toBe('authoritative-session')
  })

  it('keeps a revision conflict locked through reload failures until authority is restored', async () => {
    const firstReloadError = new Error('offline during conflict reload')
    const retryReloadError = new Error('offline during conflict retry')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const staleLocalSession = { ...remoteSession, sessionId: 'stale-local-session' }
    const authoritativeSession = {
      ...staleLocalSession,
      label: 'Authoritative session',
    }
    useWorkoutStore.getState().hydrateFromDoc(staleLocalSession)
    loadActiveSessionFromServer
      .mockRejectedValueOnce(firstReloadError)
      .mockRejectedValueOnce(retryReloadError)
      .mockResolvedValueOnce({
        session: authoritativeSession,
        sessionRevision: 'revision-authoritative',
      })
    const { result } = renderHook(() => useActiveSession('user-1'))
    let intent: WorkoutClosureIntent | null = null
    act(() => { intent = result.current.beginClosure('finish', staleLocalSession) })

    let failure: Awaited<ReturnType<typeof result.current.markClosureError>>
    await act(async () => {
      failure = await result.current.markClosureError(Object.assign(new Error('changed'), {
        kind: 'definitive',
        code: 'active_session_changed',
        status: 409,
      }) as never)
    })

    expect(failure!).toBeNull()
    expect(result.current.ready).toBe(true)
    expect(result.current.closureIntent).toEqual(intent)
    expect(readWorkoutClosureIntent('user-1')).toEqual(intent)
    expect(result.current.closureState).toBe('active_session_changed')
    expect(result.current.activeSessionSyncStatus).toBe('failed')
    expect(useWorkoutStore.getState().active).toEqual(staleLocalSession)
    expect(consoleError).toHaveBeenCalledWith('[active session reload error]', firstReloadError)

    await act(async () => {
      await result.current.reloadCurrentSession()
    })
    expect(result.current.closureIntent).toEqual(intent)
    expect(result.current.closureState).toBe('active_session_changed')
    expect(result.current.activeSessionSyncStatus).toBe('failed')
    expect(useWorkoutStore.getState().active).toEqual(staleLocalSession)
    expect(consoleError).toHaveBeenCalledWith('[active session reload error]', retryReloadError)

    await act(async () => {
      await result.current.reloadCurrentSession()
    })

    expect(result.current.closureIntent).toBeNull()
    expect(readWorkoutClosureIntent('user-1')).toBeNull()
    expect(result.current.closureState).toBe('idle')
    expect(result.current.activeSessionSyncStatus).toBe('idle')
    expect(useWorkoutStore.getState().active).toEqual(authoritativeSession)
    expect(saveActiveSession).not.toHaveBeenCalled()
    consoleError.mockRestore()
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

  it('persists the frozen closure snapshot and returns its revision', async () => {
    saveActiveSession.mockResolvedValueOnce({ sessionRevision: 'revision-finish' })
    const { result } = renderHook(() => useActiveSession('user-1'))
    act(() => useWorkoutStore.getState().hydrateFromDoc(remoteSession))
    let intent: WorkoutClosureIntent | null = null
    act(() => { intent = result.current.beginClosure('finish', remoteSession) })

    let outcome!: Awaited<ReturnType<typeof result.current.prepareFinishClosure>>
    await act(async () => {
      outcome = await result.current.prepareFinishClosure(intent!)
    })
    expect(outcome).toEqual({
      status: 'ready',
      sessionRevision: 'revision-finish',
    })
    expect(saveActiveSession).toHaveBeenCalledWith('user-1', intent!.session, null)
    expect(result.current.closureIntent).toEqual({
      ...intent!,
      sessionRevision: 'revision-finish',
    })
    expect(readWorkoutClosureIntent('user-1')).toEqual({
      ...intent!,
      sessionRevision: 'revision-finish',
    })
  })

  it('unlocks an unsent finish and exposes sync retry when snapshot persistence fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    saveActiveSession.mockRejectedValueOnce(new Error('offline'))
    const { result } = renderHook(() => useActiveSession('user-1'))
    act(() => useWorkoutStore.getState().hydrateFromDoc(remoteSession))
    let intent: WorkoutClosureIntent | null = null
    act(() => { intent = result.current.beginClosure('finish', remoteSession) })

    let outcome!: Awaited<ReturnType<typeof result.current.prepareFinishClosure>>
    await act(async () => {
      outcome = await result.current.prepareFinishClosure(intent!)
    })
    expect(outcome).toEqual({ status: 'failed' })
    expect(result.current.closureState).toBe('idle')
    expect(result.current.closureIntent).toBeNull()
    expect(result.current.activeSessionSyncStatus).toBe('failed')
    expect(useWorkoutStore.getState().active?.sessionId).toBe(remoteSession.sessionId)
    consoleError.mockRestore()
  })

  it('ignores a finish preparation completed after a newer closure supersedes it', async () => {
    const preparation = createDeferred<{ sessionRevision: string }>()
    saveActiveSession.mockReturnValueOnce(preparation.promise)
    const { result } = renderHook(() => useActiveSession('user-1'))
    act(() => useWorkoutStore.getState().hydrateFromDoc(remoteSession))
    let finishIntent: WorkoutClosureIntent | null = null
    act(() => { finishIntent = result.current.beginClosure('finish', remoteSession) })

    let preparePromise!: ReturnType<typeof result.current.prepareFinishClosure>
    act(() => { preparePromise = result.current.prepareFinishClosure(finishIntent!) })

    let newerIntent: WorkoutClosureIntent | null = null
    act(() => { newerIntent = result.current.beginClosure('discard', remoteSession) })
    let outcome!: Awaited<typeof preparePromise>
    await act(async () => {
      preparation.resolve({ sessionRevision: 'superseded-revision' })
      outcome = await preparePromise
    })

    expect(outcome).toEqual({ status: 'failed' })
    expect(result.current.closureIntent).toEqual(newerIntent)
    expect(readWorkoutClosureIntent('user-1')).toEqual(newerIntent)
    expect(result.current.closureState).toBe('submitting')
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
    expect(saveActiveSession).toHaveBeenCalledWith('user-1', replacement, null)
  })

  it('ignores a late failed write for the first of two confirmed closed sessions', async () => {
    const closedWrite = createDeferred<{ sessionRevision: string }>()
    const saveError = new Error('permission-denied')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    saveActiveSession.mockImplementationOnce(() => closedWrite.promise)
    useWorkoutStore.getState().hydrateFromDoc(remoteSession)
    const { result } = renderHook(() => useActiveSession('user-1'))

    await act(async () => {
      window.dispatchEvent(new Event('pagehide'))
      await Promise.resolve()
    })
    expect(saveActiveSession).toHaveBeenCalledWith('user-1', remoteSession, null)

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
    const closedWrite = createDeferred<{ sessionRevision: string }>()
    const replacementWrite = createDeferred<{ sessionRevision: string }>()
    const replacementError = new Error('replacement write failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    saveActiveSession
      .mockImplementationOnce(() => closedWrite.promise)
      .mockImplementationOnce(() => replacementWrite.promise)
    useWorkoutStore.getState().hydrateFromDoc(remoteSession)
    const { result } = renderHook(() => useActiveSession('user-1'))

    await act(async () => {
      window.dispatchEvent(new Event('pagehide'))
      await Promise.resolve()
    })
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
    await act(async () => {
      closedWrite.resolve({ sessionRevision: 'revision-closed' })
      await closedWrite.promise
      await Promise.resolve()
    })
    expect(saveActiveSession).toHaveBeenNthCalledWith(2, 'user-1', replacement, null)

    await act(async () => {
      replacementWrite.reject(replacementError)
      await replacementWrite.promise.catch(() => undefined)
      await Promise.resolve()
    })

    expect(useWorkoutStore.getState().active?.sessionId).toBe(replacement?.sessionId)
    expect(result.current.activeSessionSyncStatus).toBe('failed')
    expect(consoleError).toHaveBeenCalledWith('[active session save error]', replacementError)
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
    const retryWrite = createDeferred<{ sessionRevision: string }>()
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
    const closedRetry = createDeferred<{ sessionRevision: string }>()
    const replacementRetry = createDeferred<{ sessionRevision: string }>()
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
      closedRetry.resolve({ sessionRevision: 'revision-closed' })
      await closedRetryPromise
    })
    await act(async () => {
      replacementRetry.reject(replacementError)
      await replacementRetryPromise
    })

    expect(useWorkoutStore.getState().active?.sessionId).toBe(replacement?.sessionId)
    expect(result.current.activeSessionSyncStatus).toBe('failed')
    expect(consoleError).toHaveBeenCalledWith('[active session retry error]', replacementError)
    expect(consoleError).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })

  it('ignores a late write rejection from the previous user lifecycle', async () => {
    const oldUserWrite = createDeferred<{ sessionRevision: string }>()
    const oldUserError = new Error('old user write failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    saveActiveSession.mockImplementationOnce(() => oldUserWrite.promise)
    useWorkoutStore.getState().hydrateFromDoc(remoteSession)
    const { result, rerender } = renderHook(
      ({ uid }: { uid: string }) => useActiveSession(uid),
      { initialProps: { uid: 'user-1' } },
    )

    await act(async () => {
      window.dispatchEvent(new Event('pagehide'))
      await Promise.resolve()
    })
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
    const oldUserWrite = createDeferred<{ sessionRevision: string }>()
    const currentUserWrite = createDeferred<{ sessionRevision: string }>()
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

    await act(async () => {
      window.dispatchEvent(new Event('pagehide'))
      await Promise.resolve()
    })
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
      oldUserWrite.resolve({ sessionRevision: 'revision-old-user' })
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

  it('keeps a locally refreshed stale session available for sync retry when persistence fails', async () => {
    const currentError = new Error('current continuation failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    saveActiveSession.mockRejectedValueOnce(currentError)
    const { result } = renderHook(() => useActiveSession('user-1'))
    act(() => listener.current?.({
      session: staleRemoteSession,
      fromCache: false,
      hasPendingWrites: false,
    }))

    await act(async () => {
      await expect(result.current.continueStaleSession()).resolves.toEqual({ status: 'sync_failed' })
    })
    expect(useWorkoutStore.getState().active?.sessionId).toBe(staleRemoteSession.sessionId)
    expect(result.current.activeSessionSyncStatus).toBe('failed')
    expect(consoleError).toHaveBeenCalledWith('[continue stale session persistence error]', currentError)
    consoleError.mockRestore()
  })

  it('ignores a stale continuation failure superseded by a newer same-session retry', async () => {
    const continuationWrite = createDeferred<{ sessionRevision: string }>()
    const retryWrite = createDeferred<{ sessionRevision: string }>()
    const staleError = new Error('superseded continuation failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    saveActiveSession
      .mockImplementationOnce(() => continuationWrite.promise)
      .mockImplementationOnce(() => retryWrite.promise)
    const { result } = renderHook(() => useActiveSession('user-1'))
    act(() => listener.current?.({
      session: staleRemoteSession,
      fromCache: false,
      hasPendingWrites: false,
    }))

    let continuationOperation!: ReturnType<typeof result.current.continueStaleSession>
    act(() => {
      continuationOperation = result.current.continueStaleSession()
    })
    let retryOperation!: ReturnType<typeof result.current.retryActiveSessionSync>
    act(() => {
      retryOperation = result.current.retryActiveSessionSync()
    })

    let outcome!: Awaited<typeof continuationOperation>
    await act(async () => {
      continuationWrite.reject(staleError)
      outcome = await continuationOperation
    })
    await act(async () => {
      retryWrite.resolve({ sessionRevision: 'revision-retry' })
      await retryOperation
    })

    expect(outcome).toEqual({ status: 'ignored' })
    expect(useWorkoutStore.getState().active?.sessionId).toBe(staleRemoteSession.sessionId)
    expect(result.current.activeSessionSyncStatus).toBe('idle')
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('returns ignored for a late continuation success after confirmed closure', async () => {
    const continuationWrite = createDeferred<{ sessionRevision: string }>()
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
      continuationWrite.resolve({ sessionRevision: 'revision-continuation' })
      outcome = await operation
    })

    expect(outcome!).toEqual({ status: 'ignored' })
    expect(useWorkoutStore.getState().active).toBeNull()
  })

  it('returns ignored instead of rejecting a continuation invalidated by uid change', async () => {
    const continuationWrite = createDeferred<{ sessionRevision: string }>()
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
    await act(async () => {
      await Promise.resolve()
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
    const continuationWrite = createDeferred<{ sessionRevision: string }>()
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
    continuationWrite.resolve({ sessionRevision: 'revision-continuation' })

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
