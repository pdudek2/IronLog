import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorkoutSummary } from '../../lib/workoutService'
import { useDashboardStore } from '../../store/dashboardStore'
import DashboardPage from '../DashboardPage'

const mocks = vi.hoisted(() => ({
  getRecentWorkouts: vi.fn(),
  retryWorkoutMaterialization: vi.fn(),
  deleteWorkout: vi.fn(),
  user: { uid: 'user-1' },
  profile: { displayName: 'Patryk', weeklyGoal: 3 },
  setProfile: vi.fn(),
  setLoading: vi.fn(),
  navigate: vi.fn(),
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
  getTemplates: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../lib/userProfile', () => ({
  getProfile: vi.fn(),
}))

vi.mock('../../hooks/useTemplateWorkoutLaunch', () => ({
  useTemplateWorkoutLaunch: () => ({
    pendingLaunch: null,
    launchingTemplateId: null,
    requestTemplateLaunch: vi.fn(),
    confirmTemplateLaunch: vi.fn(),
    cancelTemplateLaunch: vi.fn(),
  }),
}))

vi.mock('../../lib/activeSessionService', () => ({
  hasActiveSessionWork: () => false,
  subscribeToActiveSession: () => vi.fn(),
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
  toast: { success: vi.fn(), error: vi.fn() },
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
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

describe('Dashboard workout projection status', () => {
  beforeEach(() => {
    mocks.getRecentWorkouts.mockReset()
    mocks.retryWorkoutMaterialization.mockReset()
    mocks.deleteWorkout.mockReset()
    useDashboardStore.getState().clearSnapshot()
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
})
