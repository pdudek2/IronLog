import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import BottomNav from '../../components/BottomNav'
import MobileInteractionProvider from '../../components/MobileInteractionProvider'
import TopNav from '../../components/TopNav'
import { readActiveSessionBackup, writeActiveSessionBackup } from '../../lib/activeSessionBackup'
import type { WorkoutSummary } from '../../lib/workoutService'
import type { WorkoutTemplate } from '../../lib/templateService'
import { useAuthStore } from '../../store/authStore'
import { useDashboardStore } from '../../store/dashboardStore'
import { useWorkoutStore, type ActiveWorkout } from '../../store/workoutStore'
import DashboardPage from '../DashboardPage'

const mocks = vi.hoisted(() => ({
  getRecentWorkouts: vi.fn(),
  retryWorkoutMaterialization: vi.fn(),
  getTemplates: vi.fn(),
  toastError: vi.fn(),
  profile: { displayName: 'Patryk', weeklyGoal: 3 },
  navigate: vi.fn(),
  preloadRouteByPath: vi.fn(),
  requestTemplateLaunch: vi.fn(),
  targetUnavailable: null as null | ((target: {
    template: { id: string }
    dayIndex: number
  }, templates: never[]) => void),
  reportedReadinessEntry: null as object | null,
  readinessEntry: null as null | {
    userId: string
    date: string
    sleep: number
    mood: number
    soreness: number
    createdAt: number
  },
  activeSessionListener: null as null | ((snapshot: { session: ActiveWorkout | null }) => void),
}))

vi.mock('../../store/profileStore', () => ({
  useProfileStore: () => ({
    profile: mocks.profile,
  }),
}))

vi.mock('../../lib/workoutService', async () => ({
  ...await vi.importActual<typeof import('../../lib/workoutService')>('../../lib/workoutService'),
  getRecentWorkouts: mocks.getRecentWorkouts,
  retryWorkoutMaterialization: mocks.retryWorkoutMaterialization,
  calcStreak: () => 1,
  calcVolume: () => 400,
}))

vi.mock('../../lib/templateService', () => ({
  getTemplates: mocks.getTemplates,
  templateExerciseKey: (exerciseId: string, source: string) => `${source}:${exerciseId}`,
}))

vi.mock('../../hooks/useTemplateWorkoutLaunch', () => ({
  useTemplateWorkoutLaunch: (_uid: string | null | undefined, onTargetUnavailable?: typeof mocks.targetUnavailable) => {
    mocks.targetUnavailable = onTargetUnavailable ?? null
    return ({
      pendingLaunch: null,
      launchOperation: null,
      launchingTemplateId: null,
      requestTemplateLaunch: mocks.requestTemplateLaunch,
      confirmTemplateLaunch: vi.fn(),
      cancelTemplateLaunch: vi.fn(),
      retryTemplateLaunch: vi.fn(),
      dismissTemplateLaunchError: vi.fn(),
    })
  },
}))

vi.mock('../../lib/activeSessionService', () => ({
  subscribeToActiveSession: (
    _uid: string,
    onChange: (snapshot: { session: ActiveWorkout | null }) => void,
  ) => {
    mocks.activeSessionListener = onChange
    return vi.fn()
  },
}))

vi.mock('../../router/pageLoaders', () => ({
  preloadRouteByPath: mocks.preloadRouteByPath,
}))

vi.mock('../../components/ReadinessWidget', async () => {
  const { useEffect } = await vi.importActual<typeof import('react')>('react')
  function MockReadinessWidget({
    onStateChange,
    renderSaved,
  }: {
    onStateChange?: (state: unknown) => void
    renderSaved?: (entry: NonNullable<typeof mocks.readinessEntry>) => ReactNode
  }) {
    const entry = mocks.readinessEntry
    useEffect(() => {
      if (entry && mocks.reportedReadinessEntry !== entry) {
        mocks.reportedReadinessEntry = entry
        onStateChange?.({ status: 'success', data: entry })
      }
    }, [entry, onStateChange])
    return entry
      ? renderSaved?.(entry) ?? <div data-testid="readiness-widget" />
      : <div data-testid="readiness-widget" />
  }

  return {
    default: MockReadinessWidget,
  }
})

vi.mock('../../components/TemplateLaunchConfirmDialog', () => ({ default: () => null }))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mocks.navigate }
})

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: mocks.toastError },
}))

vi.mock('framer-motion', () => ({
  useReducedMotion: () => true,
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  motion: new Proxy({}, {
    get: (_target, tag: string | symbol) => {
      if (typeof tag !== 'string') return undefined
      return ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => {
        delete props.initial
        delete props.animate
        delete props.exit
        delete props.transition
        delete props.whileHover
        delete props.whileTap
        return createElement(tag, props, children)
      }
    },
  }),
}))

const pendingWorkout: WorkoutSummary = {
  id: 'workout-pending',
  startedAt: Date.UTC(2026, 6, 11, 8),
  finishedAt: Date.UTC(2026, 6, 11, 9),
  materialized: false,
  label: 'Push day',
  exercises: [{
    exerciseId: 'bench-press',
    exerciseSource: 'global',
    name: 'Wyciskanie',
    sets: [{ weight: 80, reps: 5 }],
  }],
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

describe('Dashboard workout projection status', () => {
  beforeEach(() => {
    mocks.getRecentWorkouts.mockReset()
    mocks.retryWorkoutMaterialization.mockReset()
    mocks.getTemplates.mockReset()
    mocks.getTemplates.mockResolvedValue([])
    mocks.toastError.mockReset()
    mocks.navigate.mockReset()
    mocks.preloadRouteByPath.mockReset()
    mocks.preloadRouteByPath.mockResolvedValue(undefined)
    mocks.requestTemplateLaunch.mockReset()
    mocks.targetUnavailable = null
    mocks.reportedReadinessEntry = null
    mocks.readinessEntry = null
    mocks.activeSessionListener = null
    useAuthStore.getState().setUser({ uid: 'user-1' } as User)
    localStorage.clear()
    useDashboardStore.getState().clearSnapshot()
    useWorkoutStore.getState().clearWorkout()
  })

  it('accepts a delayed same-account snapshot and keeps it cached on remount', async () => {
    const request = deferred<WorkoutSummary[]>()
    const workout = { ...pendingWorkout, materialized: true }
    mocks.getRecentWorkouts.mockReturnValueOnce(request.promise)
    const first = render(<DashboardPage />)
    await waitFor(() => expect(mocks.getRecentWorkouts).toHaveBeenCalledWith('user-1', 50))

    await act(async () => request.resolve([workout]))
    expect(await screen.findByText(/Last: Push day/)).toBeInTheDocument()
    expect(useDashboardStore.getState()).toMatchObject({ uid: 'user-1', ready: true, workouts: [workout] })
    first.unmount()

    mocks.getRecentWorkouts.mockReturnValueOnce(deferred<WorkoutSummary[]>().promise)
    mocks.getTemplates.mockReturnValueOnce(deferred<WorkoutTemplate[]>().promise)
    render(<DashboardPage />)
    expect(screen.getByText(/Last: Push day/)).toBeInTheDocument()
  })

  it.each(['success', 'failure'] as const)('ignores an initial account A %s after unmount and login B', async (outcome) => {
    const requestA = deferred<WorkoutSummary[]>()
    const requestB = deferred<WorkoutSummary[]>()
    mocks.getRecentWorkouts.mockReturnValueOnce(requestA.promise).mockReturnValueOnce(requestB.promise)
    const first = render(<DashboardPage />)
    await waitFor(() => expect(mocks.getRecentWorkouts).toHaveBeenCalledWith('user-1', 50))
    first.unmount()
    act(() => {
      useDashboardStore.getState().clearSnapshot()
      useAuthStore.getState().setUser({ uid: 'user-2' } as User)
    })
    render(<DashboardPage />)
    await waitFor(() => expect(mocks.getRecentWorkouts).toHaveBeenCalledWith('user-2', 50))
    await act(async () => {
      if (outcome === 'success') requestA.resolve([pendingWorkout])
      else requestA.reject(new Error('late A failure'))
    })
    expect(useDashboardStore.getState()).toMatchObject({ uid: null, ready: false, workouts: [] })
    expect(screen.queryByText(/Push day/)).not.toBeInTheDocument()
    expect(mocks.toastError).not.toHaveBeenCalled()
    expect(mocks.retryWorkoutMaterialization).not.toHaveBeenCalled()

    const workoutB = { ...pendingWorkout, id: 'workout-b', label: 'Account B workout', materialized: true }
    await act(async () => requestB.resolve([workoutB]))
    expect(await screen.findByText(/Last: Account B workout/)).toBeInTheDocument()
    expect(useDashboardStore.getState()).toMatchObject({ uid: 'user-2', workouts: [workoutB] })
  })

  it('hides an old snapshot in Dashboard and TopNav and rejects an old owner write before B loads', async () => {
    const workoutA = { ...pendingWorkout, materialized: true }
    useDashboardStore.getState().setSnapshot('user-1', { workouts: [workoutA], weeklyDone: 4, streak: 8 })
    const requestB = deferred<WorkoutSummary[]>()
    mocks.getRecentWorkouts.mockReturnValue(requestB.promise)
    act(() => useAuthStore.getState().setUser({ uid: 'user-2' } as User))
    render(<MemoryRouter><TopNav /><DashboardPage /></MemoryRouter>)

    expect(screen.queryByText(/Push day/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Workout streak 8 days' })).not.toBeInTheDocument()
    expect(useDashboardStore.getState().setSnapshot('user-1', {
      workouts: [pendingWorkout], weeklyDone: 9, streak: 9,
    })).toBe(false)
    expect(useDashboardStore.getState().streak).toBe(8)
    await act(async () => requestB.resolve([]))
    expect(useDashboardStore.getState()).toMatchObject({ uid: 'user-2', ready: true, workouts: [] })
  })

  it.each(['success', 'failure'] as const)('ignores an automatic projection retry %s after an account change', async (outcome) => {
    const retryA = deferred<void>()
    const workoutB = { ...pendingWorkout, id: 'workout-b', label: 'Account B workout', materialized: true }
    mocks.getRecentWorkouts.mockResolvedValueOnce([pendingWorkout]).mockResolvedValueOnce([workoutB])
    mocks.retryWorkoutMaterialization.mockReturnValueOnce(retryA.promise)
    render(<DashboardPage />)
    await waitFor(() => expect(mocks.retryWorkoutMaterialization).toHaveBeenCalledTimes(1))

    act(() => {
      useDashboardStore.getState().clearSnapshot()
      useAuthStore.getState().setUser({ uid: 'user-2' } as User)
    })
    expect(await screen.findByText(/Last: Account B workout/)).toBeInTheDocument()
    await act(async () => {
      if (outcome === 'success') retryA.resolve()
      else retryA.reject(new Error('late A retry failure'))
    })
    expect(mocks.getRecentWorkouts).toHaveBeenCalledTimes(2)
    expect(useDashboardStore.getState()).toMatchObject({ uid: 'user-2', workouts: [workoutB] })
    expect(screen.queryByText(/Push day/)).not.toBeInTheDocument()
  })

  it('ignores an in-flight retry refresh after unmount and B has loaded', async () => {
    const refreshA = deferred<WorkoutSummary[]>()
    const workoutB = { ...pendingWorkout, id: 'workout-b', label: 'Account B workout', materialized: true }
    mocks.getRecentWorkouts
      .mockResolvedValueOnce([pendingWorkout])
      .mockReturnValueOnce(refreshA.promise)
      .mockResolvedValueOnce([workoutB])
    mocks.retryWorkoutMaterialization.mockResolvedValueOnce(undefined)
    const first = render(<DashboardPage />)
    await waitFor(() => expect(mocks.getRecentWorkouts).toHaveBeenCalledTimes(2))
    first.unmount()
    act(() => {
      useDashboardStore.getState().clearSnapshot()
      useAuthStore.getState().setUser({ uid: 'user-2' } as User)
    })
    render(<DashboardPage />)
    expect(await screen.findByText(/Last: Account B workout/)).toBeInTheDocument()
    await act(async () => refreshA.resolve([{ ...pendingWorkout, materialized: true }]))
    expect(useDashboardStore.getState()).toMatchObject({ uid: 'user-2', workouts: [workoutB] })
    expect(screen.queryByText(/Push day/)).not.toBeInTheDocument()
  })

  it('keeps the empty week summary compact for a new account', async () => {
    mocks.getRecentWorkouts.mockResolvedValue([])

    render(<DashboardPage />)

    expect(await screen.findByText('0 of 3')).toBeInTheDocument()
    expect(screen.getByLabelText('Days of the current week').children).toHaveLength(7)
  })

  it('uses the same compact goal summary when a returning user has an empty week', async () => {
    const now = Date.now()
    mocks.getRecentWorkouts.mockResolvedValue([{
      ...pendingWorkout,
      startedAt: now - 120 * 86_400_000,
      finishedAt: now - 120 * 86_400_000 + 3_600_000,
      materialized: true,
    }])

    render(<DashboardPage />)

    expect(await screen.findByText('0 of 3')).toBeInTheDocument()
  })

  it('suppresses negative weekly delta copy until the current week has its first workout', async () => {
    const previousMonday = new Date()
    previousMonday.setHours(12, 0, 0, 0)
    previousMonday.setDate(previousMonday.getDate() - ((previousMonday.getDay() + 6) % 7) - 7)
    const previousWeekWorkoutStartedAt = previousMonday.getTime()
    mocks.getRecentWorkouts.mockResolvedValue([{
      ...pendingWorkout,
      startedAt: previousWeekWorkoutStartedAt,
      finishedAt: previousWeekWorkoutStartedAt + 3_600_000,
      materialized: true,
    }])

    render(<DashboardPage />)

    expect(await screen.findByText('0 of 3')).toBeInTheDocument()
    expect(screen.queryByText(/vs last week/)).not.toBeInTheDocument()
  })

  it('keeps the full local Sunday in the current week across the autumn DST change', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-25T12:00:00+01:00'))
    let view: ReturnType<typeof render> | undefined

    try {
      mocks.getRecentWorkouts.mockResolvedValue([
        {
          ...pendingWorkout,
          id: 'workout-saturday',
          startedAt: new Date('2026-10-24T23:30:00+02:00').getTime(),
          finishedAt: new Date('2026-10-25T00:30:00+02:00').getTime(),
          materialized: true,
        },
        {
          ...pendingWorkout,
          id: 'workout-sunday',
          startedAt: new Date('2026-10-25T23:30:00+01:00').getTime(),
          finishedAt: new Date('2026-10-25T23:59:00+01:00').getTime(),
          materialized: true,
        },
      ])

      await act(async () => {
        view = render(<DashboardPage />)
      })

      expect(screen.getByText('2 of 3 · 800 kg')).toBeInTheDocument()
      const doneDays = screen.getByLabelText('Days of the current week').querySelectorAll('[data-done="true"]')
      expect(Array.from(doneDays, (day) => day.getAttribute('title'))).toEqual(['Sat', 'Sun'])
    } finally {
      view?.unmount()
      vi.useRealTimers()
    }
  })

  it('keeps the dashboard shell aligned when remote work appears and disappears', async () => {
    mocks.getRecentWorkouts.mockResolvedValue([])

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <MobileInteractionProvider>
          <TopNav />
          <DashboardPage />
          <BottomNav />
        </MobileInteractionProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start empty workout' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: 'Resume workout' })).not.toBeInTheDocument()

    act(() => {
      mocks.activeSessionListener?.({
        session: {
          sessionId: 'remote-session',
          startedAt: 1,
          label: 'Push',
          exercises: [],
        },
      })
    })

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Resume workout' })).toHaveLength(1)
    })
    expect(screen.queryByRole('button', { name: 'Start empty workout' })).not.toBeInTheDocument()
    expect(useWorkoutStore.getState().active?.sessionId).toBe('remote-session')

    act(() => {
      mocks.activeSessionListener?.({ session: null })
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start empty workout' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: 'Resume workout' })).not.toBeInTheDocument()
    expect(useWorkoutStore.getState().active).toBeNull()
  })

  it('removes the local backup when the authoritative remote session disappears', async () => {
    const session: ActiveWorkout = {
      sessionId: 'remote-session',
      startedAt: Date.now(),
      label: 'Push',
      exercises: [],
    }
    mocks.getRecentWorkouts.mockResolvedValue([])
    useWorkoutStore.getState().hydrateFromDoc(session)
    writeActiveSessionBackup('user-1', session)

    render(<DashboardPage />)

    act(() => {
      mocks.activeSessionListener?.({ session: null })
    })

    await waitFor(() => {
      expect(readActiveSessionBackup('user-1')).toBeNull()
    })
  })

  it('hands off a new workout route once after its preload settles', async () => {
    const preload = deferred<void>()
    mocks.getRecentWorkouts.mockResolvedValue([])
    mocks.preloadRouteByPath.mockReturnValueOnce(preload.promise)

    render(<DashboardPage />)

    const workoutCta = await screen.findByRole('button', { name: 'Start empty workout' })
    fireEvent.click(workoutCta)
    fireEvent.click(workoutCta)

    expect(screen.getByRole('button', { name: 'Opening workout…' })).toBeDisabled()
    expect(mocks.preloadRouteByPath).toHaveBeenCalledTimes(1)
    expect(mocks.preloadRouteByPath).toHaveBeenCalledWith('/workout/new')
    expect(mocks.navigate).not.toHaveBeenCalledWith('/workout/new', {
      state: { startNew: true },
    })

    await act(async () => preload.resolve())

    expect(mocks.navigate).toHaveBeenCalledTimes(1)
    expect(mocks.navigate).toHaveBeenCalledWith('/workout/new', {
      state: { startNew: true },
    })
  })

  it('does not offer a replacement workout when an explicitly started empty session exists', async () => {
    useWorkoutStore.setState({
      active: {
        sessionId: 'active-session',
        startedAt: 1,
        exercises: [],
      },
    })
    mocks.getRecentWorkouts.mockResolvedValue([])

    render(<DashboardPage />)

    await screen.findByRole('heading', { name: 'Workout' })
    expect(screen.getByRole('button', { name: 'Return to workout' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /empty workout/i })).not.toBeInTheDocument()
  })

  it('retries a pending workout on reconnect after a failed automatic retry', async () => {
    mocks.getRecentWorkouts
      .mockResolvedValueOnce([pendingWorkout])
      .mockResolvedValueOnce([{ ...pendingWorkout, materialized: true }])
    mocks.retryWorkoutMaterialization
      .mockRejectedValueOnce(new Error('automatic retry failed'))
      .mockResolvedValueOnce(undefined)

    render(<DashboardPage />)

    await waitFor(() => expect(mocks.retryWorkoutMaterialization).toHaveBeenCalledTimes(1))
    expect(mocks.getRecentWorkouts).toHaveBeenCalledTimes(1)

    await act(async () => window.dispatchEvent(new Event('online')))

    await waitFor(() => expect(useDashboardStore.getState().workouts[0]?.materialized).toBe(true))
    expect(mocks.retryWorkoutMaterialization).toHaveBeenNthCalledWith(2, 'workout-pending')
  })

  it('keeps the snapshot when the refresh after a successful retry fails', async () => {
    mocks.getRecentWorkouts
      .mockResolvedValueOnce([pendingWorkout])
      .mockRejectedValueOnce(new Error('refresh unavailable'))
    mocks.retryWorkoutMaterialization.mockResolvedValue(undefined)

    render(<DashboardPage />)

    await waitFor(() => expect(mocks.getRecentWorkouts).toHaveBeenCalledTimes(2))
    expect(useDashboardStore.getState().workouts).toEqual([pendingWorkout])
    expect(screen.queryByText('Could not load the dashboard')).not.toBeInTheDocument()
  })

  it('does not let an older retry refresh overwrite a newer snapshot', async () => {
    const staleRetryRefresh = deferred<WorkoutSummary[]>()
    mocks.getRecentWorkouts
      .mockResolvedValueOnce([pendingWorkout])
      .mockReturnValueOnce(staleRetryRefresh.promise)
      .mockResolvedValueOnce([])
    mocks.retryWorkoutMaterialization.mockResolvedValue(undefined)

    render(<DashboardPage />)

    await waitFor(() => expect(mocks.getRecentWorkouts).toHaveBeenCalledTimes(2))
    await act(async () => window.dispatchEvent(new Event('online')))
    await waitFor(() => expect(useDashboardStore.getState().workouts).toEqual([]))

    await act(async () => staleRetryRefresh.resolve([pendingWorkout]))

    expect(useDashboardStore.getState().workouts).toEqual([])
  })

  it('deduplicates concurrent automatic retries and releases the workout after completion', async () => {
    const initialRetry = deferred<void>()
    mocks.getRecentWorkouts.mockResolvedValue([pendingWorkout])
    mocks.retryWorkoutMaterialization
      .mockReturnValueOnce(initialRetry.promise)
      .mockRejectedValueOnce(new Error('later retry failed'))

    render(<DashboardPage />)

    await waitFor(() => expect(mocks.retryWorkoutMaterialization).toHaveBeenCalledTimes(1))

    await act(async () => window.dispatchEvent(new Event('online')))

    expect(mocks.retryWorkoutMaterialization).toHaveBeenCalledTimes(1)

    await act(async () => initialRetry.resolve())
    await waitFor(() => expect(mocks.getRecentWorkouts.mock.calls.length).toBeGreaterThan(1))

    await act(async () => window.dispatchEvent(new Event('online')))

    await waitFor(() => expect(mocks.retryWorkoutMaterialization).toHaveBeenCalledTimes(2))
  })

  it('shows a persistent template error and reaches the empty state only after retry succeeds', async () => {
    mocks.getRecentWorkouts.mockResolvedValue([])
    mocks.getTemplates
      .mockRejectedValueOnce(new Error('templates offline'))
      .mockResolvedValueOnce([])

    render(<DashboardPage />)

    expect(await screen.findByText('Plans unavailable')).toBeInTheDocument()
    expect(screen.queryByText('No plans yet')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('No plans yet')).toBeInTheDocument()
    expect(mocks.getTemplates).toHaveBeenCalledTimes(2)
  })

  it('renders template data after a successful read', async () => {
    mocks.getRecentWorkouts.mockResolvedValue([])
    mocks.getTemplates.mockResolvedValueOnce([{
      id: 'template-1',
      userId: 'user-1',
      name: 'Upper / Lower',
      createdAt: 1,
      updatedAt: 2,
      days: [{
        name: 'Upper',
        exercises: [{
          exerciseId: 'bench',
          exerciseSource: 'global' as const,
          name: 'Bench Press',
          sets: 4,
          targetReps: 8,
          targetWeight: 70,
        }],
      }],
    }])

    render(<DashboardPage />)

    expect(await screen.findByRole('button', { name: 'Start Upper' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Upper' })).toBeInTheDocument()
    expect(screen.getByText(/Upper \/ Lower/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Plans' })).not.toBeInTheDocument()
    expect(screen.queryByText('No plans yet')).not.toBeInTheDocument()
  })

  it('uses the first launchable day when the first saved day is empty', async () => {
    const template = {
      id: 'template-1',
      userId: 'user-1',
      name: 'Upper / Lower',
      createdAt: 1,
      updatedAt: 2,
      days: [
        { name: 'Upper A', exercises: [] },
        {
          name: 'Lower A',
          exercises: [{
            exerciseId: 'squat',
            exerciseSource: 'global' as const,
            name: 'Back Squat',
            sets: 4,
            targetReps: 6,
            targetWeight: 90,
          }],
        },
      ],
    }
    mocks.getRecentWorkouts.mockResolvedValue([])
    mocks.getTemplates.mockResolvedValueOnce([template])

    render(<DashboardPage />)

    const start = await screen.findByRole('button', { name: 'Start Lower A' })
    fireEvent.click(start)

    expect(mocks.requestTemplateLaunch).toHaveBeenCalledWith(
      template,
      1,
      'dashboard:template-1:selection:1',
    )
    expect(screen.queryByRole('heading', { name: 'Plans' })).not.toBeInTheDocument()
  })

  it('chooses a non-first day without launching until Start is pressed', async () => {
    const template = {
      id: 'template-1',
      userId: 'user-1',
      name: 'Upper / Lower',
      createdAt: 1,
      updatedAt: 2,
      days: [
        {
          name: 'Upper A',
          exercises: [{
            exerciseId: 'bench',
            exerciseSource: 'global' as const,
            name: 'Bench Press',
            sets: 4,
            targetReps: 8,
            targetWeight: 70,
          }],
        },
        {
          name: 'Lower A',
          exercises: [{
            exerciseId: 'squat',
            exerciseSource: 'global' as const,
            name: 'Back Squat',
            sets: 4,
            targetReps: 6,
            targetWeight: 90,
          }],
        },
      ],
    }
    mocks.getRecentWorkouts.mockResolvedValue([])
    mocks.getTemplates.mockResolvedValueOnce([template])

    render(<DashboardPage />)

    await screen.findByText('Upper A')
    fireEvent.click(screen.getByRole('button', { name: 'Change workout' }))
    const picker = screen.getByRole('dialog', { name: 'Choose a workout' })
    fireEvent.click(within(picker).getByRole('button', {
      name: 'Select Lower A from plan Upper / Lower',
    }))

    expect(mocks.requestTemplateLaunch).not.toHaveBeenCalled()
    fireEvent.click(within(picker).getByRole('button', { name: 'Choose workout' }))

    expect(screen.getByText('Lower A')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start Lower A' }))
    expect(mocks.requestTemplateLaunch).toHaveBeenCalledWith(
      template,
      1,
      'dashboard:template-1:selection:1',
    )
  })

  it('cancels a draft workout choice and keeps the original selection', async () => {
    const template = {
      id: 'template-1',
      userId: 'user-1',
      name: 'Upper / Lower',
      createdAt: 1,
      updatedAt: 2,
      days: [
        { name: 'Upper A', exercises: [{ exerciseId: 'bench', exerciseSource: 'global' as const, name: 'Bench Press', sets: 3, targetReps: 8, targetWeight: 70 }] },
        { name: 'Lower A', exercises: [{ exerciseId: 'squat', exerciseSource: 'global' as const, name: 'Back Squat', sets: 3, targetReps: 6, targetWeight: 90 }] },
      ],
    }
    mocks.getRecentWorkouts.mockResolvedValue([])
    mocks.getTemplates.mockResolvedValueOnce([template])

    render(<DashboardPage />)

    await screen.findByText('Upper A')
    fireEvent.click(screen.getByRole('button', { name: 'Change workout' }))
    const picker = screen.getByRole('dialog', { name: 'Choose a workout' })
    fireEvent.click(within(picker).getByRole('button', {
      name: 'Select Lower A from plan Upper / Lower',
    }))
    fireEvent.click(within(picker).getByRole('button', { name: 'Cancel' }))

    expect(screen.getByText('Upper A')).toBeInTheDocument()
    expect(screen.queryByText('Lower A')).not.toBeInTheDocument()
    expect(mocks.requestTemplateLaunch).not.toHaveBeenCalled()
  })

  it('clears a selected day that becomes empty before launch instead of starting a fallback', async () => {
    const template = {
      id: 'template-1',
      userId: 'user-1',
      name: 'Upper / Lower',
      createdAt: 1,
      updatedAt: 2,
      days: [
        { name: 'Upper A', exercises: [{ exerciseId: 'bench', exerciseSource: 'global' as const, name: 'Bench Press', sets: 3, targetReps: 8, targetWeight: 70 }] },
        { name: 'Lower A', exercises: [{ exerciseId: 'squat', exerciseSource: 'global' as const, name: 'Back Squat', sets: 3, targetReps: 6, targetWeight: 90 }] },
      ],
    }
    mocks.getRecentWorkouts.mockResolvedValue([])
    mocks.getTemplates.mockResolvedValueOnce([template])

    render(<DashboardPage />)

    await screen.findByText('Upper A')
    fireEvent.click(screen.getByRole('button', { name: 'Change workout' }))
    const picker = screen.getByRole('dialog', { name: 'Choose a workout' })
    fireEvent.click(within(picker).getByRole('button', {
      name: 'Select Lower A from plan Upper / Lower',
    }))
    fireEvent.click(within(picker).getByRole('button', { name: 'Choose workout' }))

    template.days[1].exercises = []
    fireEvent.click(screen.getByRole('button', { name: 'Start Lower A' }))

    expect(mocks.requestTemplateLaunch).not.toHaveBeenCalled()
    expect(screen.getByText('Workout no longer available')).toBeInTheDocument()
    expect(screen.getByText('Choose another workout before starting.')).toBeInTheDocument()
  })

  it('clears the Home selection when fresh launch validation rejects its target', async () => {
    const template = {
      id: 'template-1',
      userId: 'user-1',
      name: 'Upper / Lower',
      createdAt: 1,
      updatedAt: 2,
      days: [{
        name: 'Upper A',
        exercises: [{ exerciseId: 'bench', exerciseSource: 'global' as const, name: 'Bench Press', sets: 3, targetReps: 8, targetWeight: 70 }],
      }],
    }
    mocks.getRecentWorkouts.mockResolvedValue([])
    mocks.getTemplates
      .mockResolvedValueOnce([template])
      .mockResolvedValueOnce([])

    render(<DashboardPage />)

    await screen.findByRole('button', { name: 'Start Upper A' })
    act(() => mocks.targetUnavailable?.({ template, dayIndex: 0 }, []))

    expect(await screen.findByText('Workout no longer available')).toBeInTheDocument()
    expect(screen.getByText('Choose another workout before starting.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start Upper A' })).not.toBeInTheDocument()
  })

  it('skips an empty newest plan when choosing the documented default', async () => {
    const emptyTemplate = {
      id: 'template-empty', userId: 'user-1', name: 'Newest empty', createdAt: 2, updatedAt: 3,
      days: [{ name: 'Rest', exercises: [] }],
    }
    const launchableTemplate = {
      id: 'template-ready', userId: 'user-1', name: 'Ready plan', createdAt: 1, updatedAt: 2,
      days: [{
        name: 'Pull',
        exercises: [{ exerciseId: 'row', exerciseSource: 'global' as const, name: 'Barbell Row', sets: 3, targetReps: 8, targetWeight: 60 }],
      }],
    }
    mocks.getRecentWorkouts.mockResolvedValue([])
    mocks.getTemplates.mockResolvedValueOnce([emptyTemplate, launchableTemplate])

    render(<DashboardPage />)

    expect(await screen.findByText('Pull')).toBeInTheDocument()
    expect(screen.getByText(/Ready plan/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start Pull' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Change workout' }))
    const picker = screen.getByRole('dialog', { name: 'Choose a workout' })
    expect(within(picker).getByText('No exercises')).toBeInTheDocument()
    expect(within(picker).getByRole('button', { name: 'Edit plan Newest empty' })).toBeInTheDocument()
  })

  it('starts the compact recommendation before offering template editing', async () => {
    const template = {
      id: 'template-1',
      userId: 'user-1',
      name: 'Upper / Lower',
      createdAt: 1,
      updatedAt: 2,
      days: [{
        name: 'Upper A',
        exercises: [
          { exerciseId: 'bench', exerciseSource: 'global' as const, name: 'Bench Press', sets: 4, targetReps: 8, targetWeight: 70 },
          { exerciseId: 'row', exerciseSource: 'global' as const, name: 'Barbell Row', sets: 4, targetReps: 8, targetWeight: 65 },
          { exerciseId: 'ohp', exerciseSource: 'global' as const, name: 'Overhead Press', sets: 3, targetReps: 10, targetWeight: 40 },
          { exerciseId: 'pulldown', exerciseSource: 'global' as const, name: 'Lat Pulldown', sets: 3, targetReps: 12, targetWeight: 50 },
        ],
      }],
    }
    mocks.getRecentWorkouts.mockResolvedValue([])
    mocks.getTemplates.mockResolvedValue([template])
    mocks.readinessEntry = {
      userId: 'user-1',
      date: '2026-08-10',
      sleep: 3,
      mood: 3,
      soreness: 3,
      createdAt: 1,
    }

    render(<DashboardPage />)

    const recommendation = await screen.findByRole('region', { name: 'Today’s workout' })
    expect(recommendation.closest('.train-side')).toBeInTheDocument()
    const startRecommendation = within(recommendation).getByRole('button', { name: 'Start Upper A' })
    expect(startRecommendation).toBeEnabled()
    fireEvent.click(startRecommendation)

    expect(mocks.requestTemplateLaunch).toHaveBeenCalledWith(
      template,
      0,
      'dashboard:template-1:selection:0',
      expect.any(Map),
    )

    const dialog = screen.getByRole('dialog', { hidden: true })
    const [start, edit] = within(dialog).getAllByRole('button', { hidden: true }).slice(-2)
    expect(start).toHaveTextContent('Start')
    expect(edit).toHaveTextContent('Edit')
    expect(start.compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.click(edit)
    expect(mocks.navigate).toHaveBeenCalledWith('/templates/template-1/edit')
  })

  it('ignores a template failure that arrives after unmount, including its side effects', async () => {
    const templatesRequest = deferred<never>()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.getRecentWorkouts.mockResolvedValue([])
    mocks.getTemplates.mockReturnValueOnce(templatesRequest.promise)

    const { unmount } = render(<DashboardPage />)
    await waitFor(() => expect(mocks.getTemplates).toHaveBeenCalledTimes(1))
    unmount()

    await act(async () => templatesRequest.reject(new Error('late templates failure')))

    expect(mocks.toastError).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('ignores an obsolete template failure after the authenticated user changes', async () => {
    const obsoleteRequest = deferred<never>()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.getRecentWorkouts.mockResolvedValue([])
    mocks.getTemplates
      .mockReturnValueOnce(obsoleteRequest.promise)
      .mockResolvedValueOnce([])

    const { rerender } = render(<DashboardPage />)
    await waitFor(() => expect(mocks.getTemplates).toHaveBeenCalledTimes(1))

    act(() => useAuthStore.getState().setUser({ uid: 'user-2' } as User))
    rerender(<DashboardPage />)

    await screen.findByText('No plans yet')
    await act(async () => obsoleteRequest.reject(new Error('obsolete templates failure')))

    expect(screen.getByText('No plans yet')).toBeInTheDocument()
    expect(mocks.toastError).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
