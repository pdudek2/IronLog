import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import BottomNav from '../../components/BottomNav'
import MobileInteractionProvider from '../../components/MobileInteractionProvider'
import TopNav from '../../components/TopNav'
import type { WorkoutSummary } from '../../lib/workoutService'
import { useDashboardStore } from '../../store/dashboardStore'
import { useWorkoutStore, type ActiveWorkout } from '../../store/workoutStore'
import DashboardPage from '../DashboardPage'

const mocks = vi.hoisted(() => ({
  getRecentWorkouts: vi.fn(),
  retryWorkoutMaterialization: vi.fn(),
  deleteWorkout: vi.fn(),
  getTemplates: vi.fn(),
  toastError: vi.fn(),
  user: { uid: 'user-1' },
  profile: { displayName: 'Patryk', weeklyGoal: 3 },
  setProfile: vi.fn(),
  setLoading: vi.fn(),
  navigate: vi.fn(),
  preloadRouteByPath: vi.fn(),
  activeSessionHasWork: false,
  activeSessionListener: null as null | ((snapshot: { session: ActiveWorkout | null }) => void),
}))

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ user: mocks.user }),
}))

vi.mock('../../store/profileStore', () => ({
  useProfileStore: () => ({
    profile: mocks.profile,
    loading: false,
    setProfile: mocks.setProfile,
    setLoading: mocks.setLoading,
  }),
}))

vi.mock('../../lib/workoutService', () => ({
  getRecentWorkouts: mocks.getRecentWorkouts,
  deleteWorkout: mocks.deleteWorkout,
  retryWorkoutMaterialization: mocks.retryWorkoutMaterialization,
  countWeeklyWorkouts: (workouts: WorkoutSummary[]) => workouts.length,
  calcStreak: () => 1,
  calcVolume: () => 400,
}))

vi.mock('../../lib/templateService', () => ({
  getTemplates: mocks.getTemplates,
}))

vi.mock('../../lib/userProfile', () => ({
  getProfile: vi.fn(),
}))

vi.mock('../../hooks/useTemplateWorkoutLaunch', () => ({
  useTemplateWorkoutLaunch: () => ({
    pendingLaunch: null,
    launchOperation: null,
    launchingTemplateId: null,
    requestTemplateLaunch: vi.fn(),
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

vi.mock('../../components/ReadinessWidget', () => ({
  default: () => <div data-testid="readiness-widget" />,
}))

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
    mocks.activeSessionHasWork = false
    mocks.activeSessionListener = null
    mocks.user = { uid: 'user-1' }
    useDashboardStore.getState().clearSnapshot()
    useWorkoutStore.getState().clearWorkout()
  })

  it('hydrates cold dashboard remote work so the hero and shell agree to resume', async () => {
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
        .toHaveLength(4)
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
      expect(screen.getAllByRole('button', { name: 'Wznów trening' })).toHaveLength(4)
    })
    expect(useWorkoutStore.getState().active?.sessionId).toBe('remote-session')
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
    expect(mocks.navigate).not.toHaveBeenCalledWith('/workout/new')

    await act(async () => preload.resolve())

    expect(mocks.navigate).toHaveBeenCalledTimes(1)
    expect(mocks.navigate).toHaveBeenCalledWith('/workout/new')
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
    mocks.deleteWorkout.mockResolvedValue(undefined)

    render(<DashboardPage />)

    await waitFor(() => expect(mocks.getRecentWorkouts).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: /Usuń trening Push day/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Potwierdź usunięcie' }))

    await waitFor(() => expect(mocks.getRecentWorkouts).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(screen.queryByText('Push day')).not.toBeInTheDocument())

    await act(async () => staleRetryRefresh.resolve([pendingWorkout]))

    expect(screen.queryByText('Push day')).not.toBeInTheDocument()
  })

  it('keeps a failed deletion attached to its workout until retry succeeds', async () => {
    const workoutB = { ...pendingWorkout, id: 'workout-b', label: 'Pull day', materialized: true }
    const firstDelete = deferred<void>()
    const retryDelete = deferred<void>()
    mocks.getRecentWorkouts
      .mockResolvedValueOnce([{ ...pendingWorkout, materialized: true }, workoutB])
      .mockResolvedValueOnce([workoutB])
    mocks.retryWorkoutMaterialization.mockResolvedValue(undefined)
    mocks.deleteWorkout
      .mockReturnValueOnce(firstDelete.promise)
      .mockReturnValueOnce(retryDelete.promise)

    render(<DashboardPage />)

    await screen.findByText('Push day')
    fireEvent.click(screen.getByRole('button', { name: /Usuń trening Push day/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Potwierdź usunięcie' }))

    const pushRow = screen.getByText('Push day').closest('.dashboard-history-row')
    const pullRow = screen.getByText('Pull day').closest('.dashboard-history-row')
    expect(pushRow).not.toBeNull()
    expect(pullRow).not.toBeNull()
    expect(within(pushRow as HTMLElement).getByRole('status')).toHaveTextContent('Usuwanie treningu…')
    expect(within(pullRow as HTMLElement).getByRole('button', { name: /Otwórz trening Pull day/ }))
      .toBeEnabled()
    expect(mocks.deleteWorkout).toHaveBeenLastCalledWith('workout-pending')

    firstDelete.reject(new Error('offline'))
    await act(async () => {
      await firstDelete.promise.catch(() => undefined)
    })

    const failedPushRow = screen.getByText('Push day').closest('.dashboard-history-row')
    expect(failedPushRow).not.toBeNull()
    const alert = await within(failedPushRow as HTMLElement).findByRole('alert')
    expect(alert).toHaveTextContent('Nie udało się usunąć treningu.')
    expect(screen.getByText('Push day')).toBeInTheDocument()

    fireEvent.click(within(alert).getByRole('button', { name: 'Spróbuj ponownie' }))

    const retryingPushRow = screen.getByText('Push day').closest('.dashboard-history-row')
    expect(retryingPushRow).not.toBeNull()
    expect(within(retryingPushRow as HTMLElement).getByRole('status')).toHaveTextContent('Usuwanie treningu…')
    expect(mocks.deleteWorkout).toHaveBeenNthCalledWith(2, 'workout-pending')

    retryDelete.resolve()
    await act(async () => {
      await retryDelete.promise
    })

    await waitFor(() => expect(screen.queryByText('Push day')).not.toBeInTheDocument())
    expect(screen.getByText('Pull day')).toBeInTheDocument()
  })

  it('keeps the pending delete owner when another workout delete is attempted', async () => {
    const workoutA = { ...pendingWorkout, materialized: true }
    const workoutB = { ...pendingWorkout, id: 'workout-b', label: 'Pull day', materialized: true }
    const firstDelete = deferred<void>()
    mocks.getRecentWorkouts
      .mockResolvedValueOnce([workoutA, workoutB])
      .mockResolvedValueOnce([workoutB])
      .mockResolvedValueOnce([])
    mocks.retryWorkoutMaterialization.mockResolvedValue(undefined)
    mocks.deleteWorkout
      .mockReturnValueOnce(firstDelete.promise)
      .mockResolvedValueOnce(undefined)

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

    firstDelete.resolve()
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
    mocks.deleteWorkout.mockResolvedValue(undefined)

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
      days: [{ name: 'Upper', exercises: [] }],
    }])

    render(<DashboardPage />)

    expect(await screen.findAllByText('Upper / Lower')).toHaveLength(2)
    expect(screen.queryByText('Brak zapisanych szablonów')).not.toBeInTheDocument()
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

    mocks.user = { uid: 'user-2' }
    rerender(<DashboardPage />)

    await screen.findByText('Brak zapisanych szablonów')
    await act(async () => obsoleteRequest.reject(new Error('obsolete templates failure')))

    expect(screen.getByText('Brak zapisanych szablonów')).toBeInTheDocument()
    expect(mocks.toastError).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
