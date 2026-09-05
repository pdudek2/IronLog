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
import { useAuthStore } from '../../store/authStore'
import { useDashboardStore } from '../../store/dashboardStore'
import { useWorkoutStore, type ActiveWorkout } from '../../store/workoutStore'
import DashboardPage from '../DashboardPage'

const mocks = vi.hoisted(() => ({
  getRecentWorkouts: vi.fn(),
  retryWorkoutMaterialization: vi.fn(),
  deleteWorkout: vi.fn(),
  getTemplates: vi.fn(),
  toastError: vi.fn(),
  profile: { displayName: 'Patryk', weeklyGoal: 3 },
  navigate: vi.fn(),
  preloadRouteByPath: vi.fn(),
  requestTemplateLaunch: vi.fn(),
  reportedReadinessEntry: null as object | null,
  readinessEntry: null as null | {
    userId: string
    date: string
    sleep: number
    mood: number
    soreness: number
    createdAt: number
  },
  activeSessionHasWork: false,
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
  deleteWorkout: mocks.deleteWorkout,
  retryWorkoutMaterialization: mocks.retryWorkoutMaterialization,
  calcStreak: () => 1,
  calcVolume: () => 400,
}))

vi.mock('../../lib/templateService', () => ({
  getTemplates: mocks.getTemplates,
  templateExerciseKey: (exerciseId: string, source: string) => `${source}:${exerciseId}`,
}))

vi.mock('../../hooks/useTemplateWorkoutLaunch', () => ({
  useTemplateWorkoutLaunch: () => ({
    pendingLaunch: null,
    launchOperation: null,
    launchingTemplateId: null,
    requestTemplateLaunch: mocks.requestTemplateLaunch,
    confirmTemplateLaunch: vi.fn(),
    cancelTemplateLaunch: vi.fn(),
    retryTemplateLaunch: vi.fn(),
    dismissTemplateLaunchError: vi.fn(),
  }),
}))

vi.mock('../../lib/activeSessionService', () => ({
  hasActiveSessionWork: (session: ActiveWorkout | null | undefined) => (
    Boolean(session) && mocks.activeSessionHasWork
  ),
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

vi.mock('../../components/ConfirmDialog', () => ({
  default: ({ onConfirm }: { onConfirm: () => void }) => (
    <button type="button" onClick={onConfirm}>Potwierdź usunięcie</button>
  ),
}))
vi.mock('../../components/TemplateLaunchConfirmDialog', () => ({ default: () => null }))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mocks.navigate }
})

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: mocks.toastError },
}))

vi.mock('framer-motion', () => ({
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
    mocks.deleteWorkout.mockReset()
    mocks.getTemplates.mockReset()
    mocks.getTemplates.mockResolvedValue([])
    mocks.toastError.mockReset()
    mocks.navigate.mockReset()
    mocks.preloadRouteByPath.mockReset()
    mocks.preloadRouteByPath.mockResolvedValue(undefined)
    mocks.requestTemplateLaunch.mockReset()
    mocks.reportedReadinessEntry = null
    mocks.readinessEntry = null
    mocks.activeSessionHasWork = false
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
    expect(await screen.findByText('Push day')).toBeInTheDocument()
    expect(useDashboardStore.getState()).toMatchObject({ uid: 'user-1', ready: true, workouts: [workout] })
    first.unmount()

    mocks.getRecentWorkouts.mockReturnValueOnce(deferred<WorkoutSummary[]>().promise)
    render(<DashboardPage />)
    expect(screen.getByText('Push day')).toBeInTheDocument()
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
    expect(screen.queryByText('Push day')).not.toBeInTheDocument()
    expect(mocks.toastError).not.toHaveBeenCalled()
    expect(mocks.retryWorkoutMaterialization).not.toHaveBeenCalled()

    const workoutB = { ...pendingWorkout, id: 'workout-b', label: 'Account B workout', materialized: true }
    await act(async () => requestB.resolve([workoutB]))
    expect(await screen.findByText('Account B workout')).toBeInTheDocument()
    expect(useDashboardStore.getState()).toMatchObject({ uid: 'user-2', workouts: [workoutB] })
  })

  it('hides an old snapshot in Dashboard and TopNav and rejects an old owner write before B loads', async () => {
    const workoutA = { ...pendingWorkout, materialized: true }
    useDashboardStore.getState().setSnapshot('user-1', { workouts: [workoutA], weeklyDone: 4, streak: 8 })
    const requestB = deferred<WorkoutSummary[]>()
    mocks.getRecentWorkouts.mockReturnValue(requestB.promise)
    act(() => useAuthStore.getState().setUser({ uid: 'user-2' } as User))
    render(<MemoryRouter><TopNav /><DashboardPage /></MemoryRouter>)

    expect(screen.queryByText('Push day')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Seria treningowa 8 dni' })).not.toBeInTheDocument()
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
    expect(await screen.findByText('Account B workout')).toBeInTheDocument()
    await act(async () => {
      if (outcome === 'success') retryA.resolve()
      else retryA.reject(new Error('late A retry failure'))
    })
    expect(mocks.getRecentWorkouts).toHaveBeenCalledTimes(2)
    expect(useDashboardStore.getState()).toMatchObject({ uid: 'user-2', workouts: [workoutB] })
    expect(screen.queryByText('Push day')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ponów synchronizację' })).not.toBeInTheDocument()
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
    expect(await screen.findByText('Account B workout')).toBeInTheDocument()
    await act(async () => refreshA.resolve([{ ...pendingWorkout, materialized: true }]))
    expect(useDashboardStore.getState()).toMatchObject({ uid: 'user-2', workouts: [workoutB] })
    expect(screen.queryByText('Push day')).not.toBeInTheDocument()
  })

  it.each(['success', 'failure'] as const)('ignores a manual projection retry %s after unmount', async (outcome) => {
    const retry = deferred<void>()
    mocks.getRecentWorkouts.mockResolvedValue([pendingWorkout])
    mocks.retryWorkoutMaterialization.mockRejectedValueOnce(new Error('automatic failure')).mockReturnValueOnce(retry.promise)
    const page = render(<DashboardPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ponów synchronizację' }))
    await waitFor(() => expect(mocks.retryWorkoutMaterialization).toHaveBeenCalledTimes(2))
    page.unmount()
    useDashboardStore.getState().clearSnapshot()
    await act(async () => {
      if (outcome === 'success') retry.resolve()
      else retry.reject(new Error('late manual failure'))
    })
    expect(mocks.getRecentWorkouts).toHaveBeenCalledTimes(1)
    expect(useDashboardStore.getState()).toMatchObject({ uid: null, ready: false, workouts: [] })
  })

  it('keeps the empty week summary compact for a new account', async () => {
    mocks.getRecentWorkouts.mockResolvedValue([])

    render(<DashboardPage />)

    expect(await screen.findByText(/sesje do celu\./)).toBeInTheDocument()
    expect(screen.getByText('0/3')).toBeInTheDocument()
    expect(screen.queryByText('Statystyki tygodnia pojawią się po pierwszym treningu.')).not.toBeInTheDocument()
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

    expect(await screen.findByText(/sesje do celu\./)).toBeInTheDocument()
    expect(screen.queryByText('Brak zapisanych treningów w tym tygodniu.')).not.toBeInTheDocument()
    expect(screen.queryByText('Statystyki tygodnia pojawią się po pierwszym treningu.')).not.toBeInTheDocument()
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

    expect(await screen.findByText('3 sesje do celu.')).toBeInTheDocument()
    expect(screen.getByText('0/3')).toBeInTheDocument()
    expect(screen.getByText('brak porównania')).toBeInTheDocument()
    expect(screen.queryByText(/-100% vs poprzedni tydzień/)).not.toBeInTheDocument()
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

      expect(screen.getByText('800 kg')).toBeInTheDocument()
      expect(screen.getByText('2/7 dni')).toBeInTheDocument()
    } finally {
      view?.unmount()
      vi.useRealTimers()
    }
  })

  it('uses Polish set-count forms in the peak-day summary', async () => {
    const now = Date.now()
    mocks.getRecentWorkouts.mockResolvedValue([{
      ...pendingWorkout,
      startedAt: now - 60_000,
      finishedAt: now,
      materialized: true,
    }])

    render(<DashboardPage />)

    expect(await screen.findByText('400 kg • 1 seria')).toBeInTheDocument()
    expect(screen.queryByText('400 kg • 1 serii')).not.toBeInTheDocument()
  })

  it('uses the Polish paucal set-count form in the peak-day summary', async () => {
    const now = Date.now()
    mocks.getRecentWorkouts.mockResolvedValue([{
      ...pendingWorkout,
      startedAt: now - 60_000,
      finishedAt: now,
      materialized: true,
      exercises: [{
        ...pendingWorkout.exercises[0],
        sets: [
          ...pendingWorkout.exercises[0].sets,
          { weight: 80, reps: 5 },
        ],
      }],
    }])

    render(<DashboardPage />)

    expect(await screen.findByText('400 kg • 2 serie')).toBeInTheDocument()
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
      expect(screen.getAllByRole('button', { name: 'Rozpocznij nowy trening' }))
        .toHaveLength(3)
    })

    mocks.activeSessionHasWork = true
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
      expect(screen.getAllByRole('button', { name: 'Wznów trening' })).toHaveLength(3)
    })
    expect(useWorkoutStore.getState().active?.sessionId).toBe('remote-session')

    mocks.activeSessionHasWork = false
    act(() => {
      mocks.activeSessionListener?.({ session: null })
    })

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Rozpocznij nowy trening' })).toHaveLength(3)
    })
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

    const [workoutCta] = await screen.findAllByRole('button', { name: 'Rozpocznij nowy trening' })
    fireEvent.click(workoutCta)
    fireEvent.click(workoutCta)

    screen.getAllByRole('button', { name: 'Otwieram trening…' })
      .forEach((button) => expect(button).toBeDisabled())
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

  it('hands off an active workout route and clears pending state when preload fails', async () => {
    const preload = deferred<void>()
    mocks.activeSessionHasWork = true
    useWorkoutStore.setState({
      active: {
        sessionId: 'active-session',
        startedAt: 1,
        label: 'Push',
        exercises: [],
      },
    })
    mocks.getRecentWorkouts.mockResolvedValue([])
    mocks.preloadRouteByPath.mockReturnValueOnce(preload.promise)

    render(<DashboardPage />)

    const [workoutCta] = await screen.findAllByRole('button', { name: 'Wznów trening' })
    fireEvent.click(workoutCta)
    screen.getAllByRole('button', { name: 'Otwieram sesję…' })
      .forEach((button) => expect(button).toBeDisabled())

    await act(async () => preload.reject(new Error('chunk unavailable')))

    expect(mocks.navigate).toHaveBeenCalledTimes(1)
    expect(mocks.navigate).toHaveBeenCalledWith('/workout/new')
    expect(screen.getAllByRole('button', { name: 'Wznów trening' })[0]).toBeEnabled()
  })

  it('keeps pending feedback visible and recovers one workout after a failed automatic retry', async () => {
    const manualRetry = deferred<void>()
    mocks.getRecentWorkouts
      .mockResolvedValueOnce([pendingWorkout])
      .mockResolvedValueOnce([{ ...pendingWorkout, materialized: true }])
    mocks.retryWorkoutMaterialization
      .mockRejectedValueOnce(new Error('automatic retry failed'))
      .mockReturnValueOnce(manualRetry.promise)

    render(<DashboardPage />)

    await screen.findByText('Statystyki oczekują na synchronizację.')
    expect(mocks.getRecentWorkouts).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Statystyki oczekują na synchronizację.')).toBeInTheDocument()
    const retryButton = await screen.findByRole('button', { name: 'Ponów synchronizację' })

    fireEvent.click(retryButton)

    const syncingButton = screen.getByRole('button', { name: 'Synchronizowanie…' })
    expect(syncingButton).toBeDisabled()

    await act(async () => manualRetry.resolve())

    await waitFor(() => {
      expect(screen.queryByText('Statystyki oczekują na synchronizację.')).not.toBeInTheDocument()
    })
    expect(mocks.retryWorkoutMaterialization).toHaveBeenNthCalledWith(2, 'workout-pending')
    expect(mocks.getRecentWorkouts).toHaveBeenCalledTimes(2)
  })

  it('keeps manual recovery available when materialization succeeds but snapshot refresh fails', async () => {
    mocks.getRecentWorkouts
      .mockResolvedValueOnce([pendingWorkout])
      .mockRejectedValueOnce(new Error('refresh unavailable'))
    mocks.retryWorkoutMaterialization.mockResolvedValue(undefined)

    render(<DashboardPage />)

    expect(await screen.findByRole('button', { name: 'Ponów synchronizację' })).toBeInTheDocument()
    expect(screen.getByText('Statystyki oczekują na synchronizację.')).toBeInTheDocument()
  })

  it('does not let an older retry refresh restore a workout after deletion', async () => {
    const staleRetryRefresh = deferred<WorkoutSummary[]>()
    mocks.getRecentWorkouts
      .mockResolvedValueOnce([pendingWorkout])
      .mockReturnValueOnce(staleRetryRefresh.promise)
      .mockResolvedValueOnce([])
    mocks.retryWorkoutMaterialization.mockResolvedValue(undefined)
    mocks.deleteWorkout.mockResolvedValue({ status: 'deleted' })

    render(<DashboardPage />)

    await waitFor(() => expect(mocks.getRecentWorkouts).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: /Usuń trening Push day/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Potwierdź usunięcie' }))

    await waitFor(() => expect(mocks.getRecentWorkouts).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(screen.queryByText('Push day')).not.toBeInTheDocument())

    await act(async () => staleRetryRefresh.resolve([pendingWorkout]))

    expect(screen.queryByText('Push day')).not.toBeInTheDocument()
  })

  it('keeps a cleanup-pending deletion attached to its workout until retry succeeds', async () => {
    const workoutB = { ...pendingWorkout, id: 'workout-b', label: 'Pull day', materialized: true }
    const firstDelete = deferred<{ status: 'cleanup_pending' }>()
    const failedCleanupRetry = deferred<{ status: 'deleted' }>()
    const retryDelete = deferred<{ status: 'deleted' }>()
    mocks.getRecentWorkouts
      .mockResolvedValueOnce([pendingWorkout, workoutB])
      .mockResolvedValueOnce([workoutB])
    mocks.retryWorkoutMaterialization.mockRejectedValue(new Error('projection unavailable'))
    mocks.deleteWorkout
      .mockReturnValueOnce(firstDelete.promise)
      .mockReturnValueOnce(failedCleanupRetry.promise)
      .mockReturnValueOnce(retryDelete.promise)

    render(<DashboardPage />)

    await screen.findByText('Push day')
    fireEvent.click(screen.getByRole('button', { name: /Usuń trening Push day/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Potwierdź usunięcie' }))

    const pushRow = screen.getByText('Push day').closest('.dashboard-history-row')
    const pullRow = screen.getByText('Pull day').closest('.dashboard-history-row')
    expect(pushRow).not.toBeNull()
    expect(pullRow).not.toBeNull()
    expect(within(pushRow as HTMLElement).getByText('Usuwanie treningu…')).toBeInTheDocument()
    expect(within(pullRow as HTMLElement).getByRole('button', { name: /Otwórz trening Pull day/ }))
      .toBeEnabled()
    expect(mocks.deleteWorkout).toHaveBeenLastCalledWith('workout-pending')

    firstDelete.resolve({ status: 'cleanup_pending' })
    await act(async () => {
      await firstDelete.promise
    })

    const failedPushRow = screen.getByText('Push day').closest('.dashboard-history-row')
    expect(failedPushRow).not.toBeNull()
    const alert = await within(failedPushRow as HTMLElement).findByRole('alert')
    expect(alert).toHaveTextContent('Trening usunięty. Nie udało się odświeżyć statystyk.')
    expect(screen.getByText('Push day')).toBeInTheDocument()
    expect(within(failedPushRow as HTMLElement).getByRole('button', { name: /Otwórz trening Push day/ }))
      .toBeDisabled()
    expect(within(failedPushRow as HTMLElement).getByRole('button', { name: /Usuń trening Push day/ }))
      .toBeDisabled()
    expect(within(failedPushRow as HTMLElement).queryByText('Statystyki oczekują na synchronizację.'))
      .not.toBeInTheDocument()

    fireEvent.click(within(alert).getByRole('button', { name: 'Spróbuj ponownie' }))

    const retryingPushRow = screen.getByText('Push day').closest('.dashboard-history-row')
    expect(retryingPushRow).not.toBeNull()
    expect(within(retryingPushRow as HTMLElement).getByRole('status')).toHaveTextContent('Usuwanie treningu…')
    expect(mocks.deleteWorkout).toHaveBeenNthCalledWith(2, 'workout-pending')

    failedCleanupRetry.reject(new Error('offline'))
    await act(async () => {
      await failedCleanupRetry.promise.catch(() => undefined)
    })

    const failedRetryPushRow = screen.getByText('Push day').closest('.dashboard-history-row')
    expect(failedRetryPushRow).not.toBeNull()
    const retryAlert = within(failedRetryPushRow as HTMLElement).getByRole('alert')
    expect(retryAlert).toHaveTextContent('Trening usunięty. Nie udało się odświeżyć statystyk.')
    expect(within(failedRetryPushRow as HTMLElement).queryByRole('button', { name: 'Zamknij' }))
      .not.toBeInTheDocument()
    expect(within(failedRetryPushRow as HTMLElement).getByRole('button', { name: /Otwórz trening Push day/ }))
      .toBeDisabled()
    expect(within(failedRetryPushRow as HTMLElement).getByRole('button', { name: /Usuń trening Push day/ }))
      .toBeDisabled()
    expect(within(failedRetryPushRow as HTMLElement).queryByText('Statystyki oczekują na synchronizację.'))
      .not.toBeInTheDocument()

    fireEvent.click(within(retryAlert).getByRole('button', { name: 'Spróbuj ponownie' }))
    expect(mocks.deleteWorkout).toHaveBeenNthCalledWith(3, 'workout-pending')

    retryDelete.resolve({ status: 'deleted' })
    await act(async () => {
      await retryDelete.promise
    })

    await waitFor(() => expect(screen.queryByText('Push day')).not.toBeInTheDocument())
    expect(screen.getByText('Pull day')).toBeInTheDocument()
  })

  it('restores committed delete recovery after reload when the workout row is gone', async () => {
    const firstDelete = deferred<{ status: 'cleanup_pending' }>()
    const repeatedCleanupPending = deferred<{ status: 'cleanup_pending' }>()
    const retryDelete = deferred<{ status: 'deleted' }>()
    mocks.getRecentWorkouts
      .mockResolvedValueOnce([pendingWorkout])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    mocks.retryWorkoutMaterialization.mockRejectedValue(new Error('projection unavailable'))
    mocks.deleteWorkout
      .mockReturnValueOnce(firstDelete.promise)
      .mockReturnValueOnce(repeatedCleanupPending.promise)
      .mockReturnValueOnce(retryDelete.promise)

    const firstRender = render(<DashboardPage />)

    await screen.findByText('Push day')
    fireEvent.click(screen.getByRole('button', { name: /Usuń trening Push day/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Potwierdź usunięcie' }))

    firstDelete.resolve({ status: 'cleanup_pending' })
    await act(async () => {
      await firstDelete.promise
    })

    firstRender.unmount()
    render(<DashboardPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Trening usunięty. Nie udało się odświeżyć statystyk.')
    expect(screen.queryByText('Push day')).not.toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: 'Spróbuj ponownie' }))
    await waitFor(() => {
      expect(mocks.deleteWorkout).toHaveBeenNthCalledWith(2, 'workout-pending')
    })

    repeatedCleanupPending.resolve({ status: 'cleanup_pending' })
    await act(async () => {
      await repeatedCleanupPending.promise
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Trening usunięty. Nie udało się odświeżyć statystyk.')
    expect(screen.queryByText('Push day')).not.toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: 'Spróbuj ponownie' }))
    await waitFor(() => {
      expect(mocks.deleteWorkout).toHaveBeenNthCalledWith(3, 'workout-pending')
    })

    retryDelete.resolve({ status: 'deleted' })
    await act(async () => {
      await retryDelete.promise
    })

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  it('keeps the pending delete owner when another workout delete is attempted', async () => {
    const workoutA = { ...pendingWorkout, materialized: true }
    const workoutB = { ...pendingWorkout, id: 'workout-b', label: 'Pull day', materialized: true }
    const firstDelete = deferred<{ status: 'deleted' }>()
    mocks.getRecentWorkouts
      .mockResolvedValueOnce([workoutA, workoutB])
      .mockResolvedValueOnce([workoutB])
      .mockResolvedValueOnce([])
    mocks.retryWorkoutMaterialization.mockResolvedValue(undefined)
    mocks.deleteWorkout
      .mockReturnValueOnce(firstDelete.promise)
      .mockResolvedValueOnce({ status: 'deleted' })

    render(<DashboardPage />)

    await screen.findByText('Push day')
    fireEvent.click(screen.getByRole('button', { name: /Usuń trening Push day/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Potwierdź usunięcie' }))

    const pullRow = screen.getByText('Pull day').closest('.dashboard-history-row')
    expect(pullRow).not.toBeNull()
    const pullDelete = within(pullRow as HTMLElement).getByRole('button', {
      name: /Usuń trening Pull day/,
    })
    fireEvent.click(pullDelete)
    const secondConfirm = screen.queryByRole('button', { name: 'Potwierdź usunięcie' })
    if (secondConfirm) fireEvent.click(secondConfirm)

    const pushRow = screen.getByText('Push day').closest('.dashboard-history-row')
    expect(pushRow).not.toBeNull()
    expect(mocks.deleteWorkout).toHaveBeenCalledTimes(1)
    expect(pullDelete).toBeDisabled()
    expect(within(pullRow as HTMLElement).getByRole('button', { name: /Otwórz trening Pull day/ }))
      .toBeEnabled()
    expect(within(pushRow as HTMLElement).getByRole('status')).toHaveTextContent('Usuwanie treningu…')
    expect(within(pullRow as HTMLElement).queryByRole('status')).not.toBeInTheDocument()

    firstDelete.resolve({ status: 'deleted' })
    await act(async () => {
      await firstDelete.promise
    })

    await waitFor(() => expect(screen.queryByText('Push day')).not.toBeInTheDocument())
    const availablePullRow = screen.getByText('Pull day').closest('.dashboard-history-row')
    expect(availablePullRow).not.toBeNull()
    const availablePullDelete = within(availablePullRow as HTMLElement).getByRole('button', {
      name: /Usuń trening Pull day/,
    })
    expect(availablePullDelete).toBeEnabled()

    fireEvent.click(availablePullDelete)
    fireEvent.click(screen.getByRole('button', { name: 'Potwierdź usunięcie' }))

    await waitFor(() => {
      expect(mocks.deleteWorkout).toHaveBeenNthCalledWith(2, 'workout-b')
      expect(screen.queryByText('Pull day')).not.toBeInTheDocument()
    })
  })

  it('dismisses workout deletion feedback without removing the row', async () => {
    mocks.getRecentWorkouts.mockResolvedValueOnce([{ ...pendingWorkout, materialized: true }])
    mocks.retryWorkoutMaterialization.mockResolvedValue(undefined)
    mocks.deleteWorkout.mockRejectedValueOnce(new Error('offline'))

    render(<DashboardPage />)

    await screen.findByText('Push day')
    fireEvent.click(screen.getByRole('button', { name: /Usuń trening Push day/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Potwierdź usunięcie' }))

    const row = screen.getByText('Push day').closest('.dashboard-history-row')
    expect(row).not.toBeNull()
    await act(async () => {
      await expect(mocks.deleteWorkout.mock.results[0]?.value).rejects.toThrow('offline')
    })
    const failedRow = screen.getByText('Push day').closest('.dashboard-history-row')
    expect(failedRow).not.toBeNull()
    const alert = await within(failedRow as HTMLElement).findByRole('alert')
    fireEvent.click(within(alert).getByRole('button', { name: 'Zamknij' }))

    expect(within(failedRow as HTMLElement).queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Push day')).toBeInTheDocument()
    expect(mocks.deleteWorkout).toHaveBeenCalledTimes(1)
  })

  it('keeps an unresolved workout A delete error when workout B delete is attempted', async () => {
    const workoutA = { ...pendingWorkout, materialized: true }
    const workoutB = { ...pendingWorkout, id: 'workout-b', label: 'Pull day', materialized: true }
    mocks.getRecentWorkouts.mockResolvedValueOnce([workoutA, workoutB])
    mocks.retryWorkoutMaterialization.mockResolvedValue(undefined)
    mocks.deleteWorkout.mockRejectedValueOnce(new Error('offline'))

    render(<DashboardPage />)

    await screen.findByText('Push day')
    fireEvent.click(screen.getByRole('button', { name: /Usuń trening Push day/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Potwierdź usunięcie' }))

    await act(async () => {
      await expect(mocks.deleteWorkout.mock.results[0]?.value).rejects.toThrow('offline')
    })

    const pushRow = screen.getByText('Push day').closest('.dashboard-history-row')
    const pullRow = screen.getByText('Pull day').closest('.dashboard-history-row')
    expect(pushRow).not.toBeNull()
    expect(pullRow).not.toBeNull()
    const alert = await within(pushRow as HTMLElement).findByRole('alert')
    const pullDelete = within(pullRow as HTMLElement).getByRole('button', {
      name: /Usuń trening Pull day/,
    })

    expect(pullDelete).toBeDisabled()
    fireEvent.click(pullDelete)
    expect(screen.queryByRole('button', { name: 'Potwierdź usunięcie' })).not.toBeInTheDocument()
    expect(within(pushRow as HTMLElement).getByRole('alert')).toBe(alert)
    expect(mocks.deleteWorkout).toHaveBeenCalledTimes(1)
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

  it('forgets retry state for a workout absent from an authoritative snapshot', async () => {
    const pendingWorkoutA = { ...pendingWorkout, id: 'workout-a', label: 'Workout A' }
    const pendingWorkoutB = { ...pendingWorkout, id: 'workout-b', label: 'Workout B' }
    const pendingWorkoutC = { ...pendingWorkout, id: 'workout-c', label: 'Workout C' }

    mocks.getRecentWorkouts
      .mockResolvedValueOnce([pendingWorkoutA, pendingWorkoutB, pendingWorkoutC])
      .mockResolvedValueOnce([
        { ...pendingWorkoutB, materialized: true },
        pendingWorkoutC,
      ])
      .mockResolvedValueOnce([
        pendingWorkoutA,
        { ...pendingWorkoutB, materialized: true },
        { ...pendingWorkoutC, materialized: true },
      ])
    mocks.retryWorkoutMaterialization
      .mockRejectedValueOnce(new Error('automatic A failed'))
      .mockRejectedValueOnce(new Error('automatic B failed'))
      .mockRejectedValueOnce(new Error('automatic C failed'))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)

    render(<DashboardPage />)

    await screen.findAllByRole('button', { name: 'Ponów synchronizację' })
    const workoutBRow = screen.getByText('Workout B').closest('.dashboard-history-row')
    expect(workoutBRow).not.toBeNull()
    const retryWorkoutB = within(workoutBRow as HTMLElement).getByRole('button', {
      name: 'Ponów synchronizację',
    })
    fireEvent.click(retryWorkoutB)

    await waitFor(() => expect(screen.queryByText('Workout A')).not.toBeInTheDocument())
    const workoutCRow = screen.getByText('Workout C').closest('.dashboard-history-row')
    expect(workoutCRow).not.toBeNull()
    fireEvent.click(within(workoutCRow as HTMLElement).getByRole('button', { name: 'Ponów synchronizację' }))

    const returnedWorkoutARow = (await screen.findByText('Workout A')).closest('.dashboard-history-row')
    expect(returnedWorkoutARow).not.toBeNull()
    expect(within(returnedWorkoutARow as HTMLElement).queryByRole('button', {
      name: 'Ponów synchronizację',
    })).not.toBeInTheDocument()
  })

  it('does not restore failed state when an obsolete retry rejects after removal', async () => {
    const pendingWorkoutA = { ...pendingWorkout, id: 'workout-a', label: 'Workout A' }
    const pendingWorkoutB = { ...pendingWorkout, id: 'workout-b', label: 'Workout B' }
    const pendingWorkoutC = { ...pendingWorkout, id: 'workout-c', label: 'Workout C' }
    const retryWorkoutA = deferred<void>()

    mocks.getRecentWorkouts
      .mockResolvedValueOnce([pendingWorkoutB, pendingWorkoutC])
      .mockResolvedValueOnce([
        pendingWorkoutA,
        { ...pendingWorkoutB, materialized: true },
        pendingWorkoutC,
      ])
      .mockResolvedValueOnce([
        { ...pendingWorkoutB, materialized: true },
        { ...pendingWorkoutC, materialized: true },
      ])
      .mockResolvedValueOnce([
        pendingWorkoutA,
        { ...pendingWorkoutB, materialized: true },
        { ...pendingWorkoutC, materialized: true },
      ])
    mocks.retryWorkoutMaterialization
      .mockRejectedValueOnce(new Error('automatic B failed'))
      .mockRejectedValueOnce(new Error('automatic C failed'))
      .mockResolvedValueOnce(undefined)
      .mockReturnValueOnce(retryWorkoutA.promise)
      .mockResolvedValueOnce(undefined)
    mocks.deleteWorkout.mockResolvedValue({ status: 'deleted' })

    render(<DashboardPage />)

    await screen.findAllByRole('button', { name: 'Ponów synchronizację' })
    const workoutBRow = screen.getByText('Workout B').closest('.dashboard-history-row')
    expect(workoutBRow).not.toBeNull()
    fireEvent.click(within(workoutBRow as HTMLElement).getByRole('button', {
      name: 'Ponów synchronizację',
    }))

    await screen.findByText('Workout A')
    await act(async () => window.dispatchEvent(new Event('online')))
    await waitFor(() => expect(mocks.retryWorkoutMaterialization).toHaveBeenCalledTimes(5))

    fireEvent.click(screen.getByRole('button', { name: /Usuń trening Workout A/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Potwierdź usunięcie' }))
    await waitFor(() => expect(screen.queryByText('Workout A')).not.toBeInTheDocument())

    await act(async () => retryWorkoutA.reject(new Error('obsolete A failed')))

    const returnedWorkoutARow = (await screen.findByText('Workout A')).closest('.dashboard-history-row')
    expect(returnedWorkoutARow).not.toBeNull()
    expect(within(returnedWorkoutARow as HTMLElement).queryByRole('button', {
      name: 'Ponów synchronizację',
    })).not.toBeInTheDocument()
  })

  it('shows a persistent template error and reaches the empty state only after retry succeeds', async () => {
    mocks.getRecentWorkouts.mockResolvedValue([])
    mocks.getTemplates
      .mockRejectedValueOnce(new Error('templates offline'))
      .mockResolvedValueOnce([])

    render(<DashboardPage />)

    expect(await screen.findByText('Nie udało się wczytać planów')).toBeInTheDocument()
    expect(screen.queryByText('Brak zapisanych szablonów')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Utwórz pierwszy plan' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))

    expect(await screen.findByText('Brak zapisanych szablonów')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Utwórz pierwszy plan' })).toBeInTheDocument()
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

    expect(await screen.findByRole('button', {
      name: 'Rozpocznij Upper z planu Upper / Lower',
    })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Plany' })).not.toBeInTheDocument()
    expect(screen.queryByText('Brak zapisanych szablonów')).not.toBeInTheDocument()
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

    const start = await screen.findByRole('button', {
      name: 'Rozpocznij Lower A z planu Upper / Lower',
    })
    fireEvent.click(start)

    expect(mocks.requestTemplateLaunch).toHaveBeenCalledWith(
      template,
      1,
      'dashboard:template-1:quick',
    )
    expect(screen.queryByRole('heading', { name: 'Plany' })).not.toBeInTheDocument()
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

    await screen.findByRole('region', { name: 'Dzisiejszy trening' })
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Dzisiejszy trening' }).closest('.dashboard-home'))
        .toHaveClass('dashboard-home--today')
    })
    const recommendation = screen.getByRole('region', { name: 'Dzisiejszy trening' })
    const startRecommendation = within(recommendation).getByRole('button', { name: 'Rozpocznij Upper A' })
    expect(startRecommendation).toBeEnabled()
    fireEvent.click(startRecommendation)

    expect(mocks.requestTemplateLaunch).toHaveBeenCalledWith(
      template,
      0,
      'dashboard:template-1:quick',
      expect.any(Map),
    )

    const dialog = screen.getByRole('dialog', { hidden: true })
    const [start, edit] = within(dialog).getAllByRole('button', { hidden: true }).slice(-2)
    expect(start).toHaveTextContent('Rozpocznij')
    expect(edit).toHaveTextContent('Edytuj')
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

    await screen.findByText('Brak zapisanych szablonów')
    await act(async () => obsoleteRequest.reject(new Error('obsolete templates failure')))

    expect(screen.getByText('Brak zapisanych szablonów')).toBeInTheDocument()
    expect(mocks.toastError).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
