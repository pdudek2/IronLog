import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkoutTemplate } from '../../lib/templateService'
import type { ActiveWorkout } from '../../store/workoutStore'
import { useTemplateWorkoutLaunch } from '../useTemplateWorkoutLaunch'

const mocks = vi.hoisted(() => ({
  active: null as ActiveWorkout | null,
  createPersistedTemplateWorkout: vi.fn(),
  hydrateFromDoc: vi.fn(),
  navigate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('../../store/workoutStore', () => ({
  useWorkoutStore: (selector: (state: {
    active: ActiveWorkout | null
    hydrateFromDoc: typeof mocks.hydrateFromDoc
  }) => unknown) => selector({
    active: mocks.active,
    hydrateFromDoc: mocks.hydrateFromDoc,
  }),
}))

vi.mock('../../lib/templateLaunchService', () => ({
  createPersistedTemplateWorkout: mocks.createPersistedTemplateWorkout,
}))

vi.mock('../../lib/activeSessionService', () => {
  class TemplateLaunchConflictError extends Error {}
  return {
    TemplateLaunchConflictError,
    hasActiveSessionWork: (active: ActiveWorkout | null | undefined) => (
      Boolean(active?.label?.trim()) || Boolean(active?.exercises.length)
    ),
  }
})

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mocks.navigate }
})

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}))

const template: WorkoutTemplate = {
  id: 'template-a',
  userId: 'user-1',
  name: 'Plan A',
  createdAt: 1,
  updatedAt: 2,
  days: [{
    name: 'Dzień A',
    exercises: [{
      exerciseId: 'squat',
      exerciseSource: 'global',
      name: 'Squat',
      sets: 3,
      targetReps: 5,
      targetWeight: 100,
    }],
  }],
}

const workout: ActiveWorkout = {
  sessionId: 'session-1',
  startedAt: 10,
  templateId: template.id,
  label: template.name,
  exercises: [],
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>
}

describe('useTemplateWorkoutLaunch', () => {
  beforeEach(() => {
    mocks.active = null
    mocks.createPersistedTemplateWorkout.mockReset()
    mocks.hydrateFromDoc.mockReset()
    mocks.navigate.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.toastError.mockReset()
  })

  it('moves from idle through pending to one hydration and navigation', async () => {
    const launch = deferred<ActiveWorkout>()
    mocks.createPersistedTemplateWorkout.mockReturnValue(launch.promise)
    const { result } = renderHook(() => useTemplateWorkoutLaunch('user-1'), { wrapper })

    expect(result.current.launchOperation).toBeNull()

    act(() => {
      void result.current.requestTemplateLaunch(template, 0, 'templates:template-a:primary')
    })

    expect(result.current.launchOperation).toEqual({
      target: { template, dayIndex: 0, requestKey: 'templates:template-a:primary' },
      replaceExisting: false,
      status: 'pending',
      errorMessage: null,
    })
    expect(result.current.launchingTemplateId).toBe(template.id)

    await act(async () => launch.resolve(workout))

    expect(mocks.hydrateFromDoc).toHaveBeenCalledTimes(1)
    expect(mocks.hydrateFromDoc).toHaveBeenCalledWith(workout)
    expect(mocks.navigate).toHaveBeenCalledTimes(1)
    expect(mocks.navigate).toHaveBeenCalledWith('/workout/new')
  })

  it('stores the exact failed target as a retryable non-replace operation', async () => {
    mocks.createPersistedTemplateWorkout.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useTemplateWorkoutLaunch('user-1'), { wrapper })

    await act(async () => {
      await result.current.requestTemplateLaunch(template, 0, 'templates:template-a:summary:0')
    })

    expect(result.current.launchOperation).toEqual({
      target: { template, dayIndex: 0, requestKey: 'templates:template-a:summary:0' },
      replaceExisting: false,
      status: 'error',
      errorMessage: 'Nie udało się uruchomić planu.',
    })
    expect(result.current.launchingTemplateId).toBeNull()
  })

  it('retries the same template, day index and replace flag', async () => {
    mocks.createPersistedTemplateWorkout
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(workout)
    const { result } = renderHook(() => useTemplateWorkoutLaunch('user-1'), { wrapper })

    await act(async () => {
      await result.current.requestTemplateLaunch(template, 0, 'templates:template-a:detail:0')
    })
    await act(async () => {
      await result.current.retryTemplateLaunch()
    })

    expect(mocks.createPersistedTemplateWorkout).toHaveBeenNthCalledWith(
      2,
      'user-1',
      template,
      0,
      false,
    )
  })

  it('opens the conflict dialog without calling the service when local work exists', async () => {
    mocks.active = { ...workout, exercises: [{
      exerciseId: 'bench',
      exerciseSource: 'global',
      name: 'Bench Press',
      sets: [],
    }] }
    const { result } = renderHook(() => useTemplateWorkoutLaunch('user-1'), { wrapper })

    await act(async () => {
      await result.current.requestTemplateLaunch(template, 0, 'templates:template-a:primary')
    })

    expect(result.current.pendingLaunch).toEqual({
      template,
      dayIndex: 0,
      requestKey: 'templates:template-a:primary',
    })
    expect(mocks.createPersistedTemplateWorkout).not.toHaveBeenCalled()
  })

  it('keeps replaceExisting true after a failed confirmation and retry', async () => {
    mocks.active = { ...workout, label: 'Trwająca sesja' }
    mocks.createPersistedTemplateWorkout
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(workout)
    const { result } = renderHook(() => useTemplateWorkoutLaunch('user-1'), { wrapper })

    await act(async () => {
      await result.current.requestTemplateLaunch(template, 0, 'templates:template-a:primary')
    })
    await act(async () => {
      await result.current.confirmTemplateLaunch()
    })

    expect(result.current.pendingLaunch).toBeNull()
    expect(result.current.launchOperation).toMatchObject({
      target: { template, dayIndex: 0, requestKey: 'templates:template-a:primary' },
      replaceExisting: true,
      status: 'error',
    })

    await act(async () => {
      await result.current.retryTemplateLaunch()
    })

    expect(mocks.createPersistedTemplateWorkout).toHaveBeenNthCalledWith(
      2,
      'user-1',
      template,
      0,
      true,
    )
  })

  it('deduplicates a double click while a launch is pending', async () => {
    const launch = deferred<ActiveWorkout>()
    mocks.createPersistedTemplateWorkout.mockReturnValue(launch.promise)
    const { result } = renderHook(() => useTemplateWorkoutLaunch('user-1'), { wrapper })

    act(() => {
      void result.current.requestTemplateLaunch(template, 0, 'templates:template-a:primary')
      void result.current.requestTemplateLaunch(template, 0, 'templates:template-a:primary')
    })

    expect(mocks.createPersistedTemplateWorkout).toHaveBeenCalledTimes(1)
    await act(async () => launch.resolve(workout))
  })

  it('does not hydrate or navigate for a stale user generation', async () => {
    const launch = deferred<ActiveWorkout>()
    mocks.createPersistedTemplateWorkout.mockReturnValue(launch.promise)
    const { result, rerender } = renderHook(
      ({ uid }: { uid: string }) => useTemplateWorkoutLaunch(uid),
      { initialProps: { uid: 'user-1' }, wrapper },
    )

    act(() => {
      void result.current.requestTemplateLaunch(template, 0, 'templates:template-a:primary')
    })
    rerender({ uid: 'user-2' })
    await act(async () => launch.resolve(workout))

    expect(mocks.hydrateFromDoc).not.toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('clears a failed operation on uid change and cannot retry the old target', async () => {
    mocks.createPersistedTemplateWorkout.mockRejectedValue(new Error('offline'))
    const { result, rerender } = renderHook(
      ({ uid }: { uid: string }) => useTemplateWorkoutLaunch(uid),
      { initialProps: { uid: 'user-1' }, wrapper },
    )

    await act(async () => {
      await result.current.requestTemplateLaunch(template, 0, 'templates:template-a:primary')
    })
    expect(result.current.launchOperation?.status).toBe('error')

    rerender({ uid: 'user-2' })

    expect(result.current.launchOperation).toBeNull()
    await act(async () => {
      await result.current.retryTemplateLaunch()
    })
    expect(mocks.createPersistedTemplateWorkout).toHaveBeenCalledTimes(1)
  })

  it('clears the conflict dialog on uid change and cannot confirm the old target', async () => {
    mocks.active = { ...workout, label: 'Trwająca sesja' }
    const { result, rerender } = renderHook(
      ({ uid }: { uid: string }) => useTemplateWorkoutLaunch(uid),
      { initialProps: { uid: 'user-1' }, wrapper },
    )

    await act(async () => {
      await result.current.requestTemplateLaunch(template, 0, 'templates:template-a:primary')
    })
    expect(result.current.pendingLaunch).not.toBeNull()

    rerender({ uid: 'user-2' })

    expect(result.current.pendingLaunch).toBeNull()
    await act(async () => {
      await result.current.confirmTemplateLaunch()
    })
    expect(mocks.createPersistedTemplateWorkout).not.toHaveBeenCalled()
  })

  it('does not hydrate or navigate after unmount', async () => {
    const launch = deferred<ActiveWorkout>()
    mocks.createPersistedTemplateWorkout.mockReturnValue(launch.promise)
    const { result, unmount } = renderHook(() => useTemplateWorkoutLaunch('user-1'), { wrapper })

    act(() => {
      void result.current.requestTemplateLaunch(template, 0, 'templates:template-a:primary')
    })
    unmount()
    await act(async () => launch.resolve(workout))

    expect(mocks.hydrateFromDoc).not.toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('dismisses the stored error without changing the conflict target', async () => {
    mocks.createPersistedTemplateWorkout.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useTemplateWorkoutLaunch('user-1'), { wrapper })

    await act(async () => {
      await result.current.requestTemplateLaunch(template, 0, 'templates:template-a:primary')
    })
    act(() => result.current.dismissTemplateLaunchError())

    expect(result.current.launchOperation).toBeNull()
    expect(result.current.pendingLaunch).toBeNull()
  })

  it('moves a server conflict to the dialog with the same target', async () => {
    const { TemplateLaunchConflictError } = await import('../../lib/activeSessionService')
    mocks.createPersistedTemplateWorkout.mockRejectedValue(new TemplateLaunchConflictError())
    const { result } = renderHook(() => useTemplateWorkoutLaunch('user-1'), { wrapper })

    await act(async () => {
      await result.current.requestTemplateLaunch(template, 0, 'templates:template-a:detail:0')
    })

    expect(result.current.pendingLaunch).toEqual({
      template,
      dayIndex: 0,
      requestKey: 'templates:template-a:detail:0',
    })
    expect(result.current.launchOperation).toBeNull()
  })
})
