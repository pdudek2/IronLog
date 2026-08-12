import { createElement, type ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import WorkoutPage from '../WorkoutPage'

const mocks = vi.hoisted(() => ({
  activeSessionSyncStatus: 'idle',
  active: null as null | {
    sessionId: string
    startedAt: number
    templateId: null
    label: string
    exercises: []
  },
  closureState: 'idle',
  continueStaleSession: vi.fn(),
  discardStaleSession: vi.fn(),
  ready: true,
  reloadAuthentication: vi.fn(),
  reloadCurrentSession: vi.fn(),
  staleSession: { ageLabel: '2 dni' } as { ageLabel: string } | null,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('../../hooks/useActiveSession', () => ({
  useActiveSession: () => ({
    activeSessionSyncStatus: mocks.activeSessionSyncStatus,
    beginClosure: vi.fn(),
    closureIntent: null,
    closureState: mocks.closureState,
    confirmClosure: vi.fn(),
    continueStaleSession: mocks.continueStaleSession,
    discardStaleSession: mocks.discardStaleSession,
    markClosureError: vi.fn(),
    markClosureUnconfirmed: vi.fn(),
    prepareFinishClosure: vi.fn(),
    ready: mocks.ready,
    reloadAuthentication: mocks.reloadAuthentication,
    reloadCurrentSession: mocks.reloadCurrentSession,
    retryActiveSessionSync: vi.fn(),
    staleSession: mocks.staleSession,
  }),
}))

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ user: { uid: 'user-1' } }),
}))

vi.mock('../../store/profileStore', () => ({
  useProfileStore: () => ({ profile: null }),
}))

vi.mock('../../store/workoutStore', () => {
  const useWorkoutStore = Object.assign(
    () => ({
      active: mocks.active,
      addExercise: vi.fn(),
      setLabel: vi.fn(),
      startWorkout: vi.fn(),
    }),
    { getState: () => ({ active: mocks.active }) },
  )
  return { useWorkoutStore }
})

vi.mock('../../lib/workoutService', () => ({
  getRecentWorkouts: () => new Promise(() => undefined),
}))

vi.mock('../../lib/userExercisesService', () => ({
  getUserExercises: () => new Promise(() => undefined),
}))

vi.mock('../../lib/exerciseDetailService', () => ({
  getExerciseSessions: vi.fn(),
}))

vi.mock('../../lib/overloadService', () => ({
  suggestNextSession: vi.fn(),
}))

vi.mock('../../hooks/useMediaQuery', () => ({ useMediaQuery: () => false }))
vi.mock('../../components/MobileInteractionProvider', () => ({
  useMobileInteraction: () => ({ compactFixedUi: false, visualViewportHeight: null }),
}))
vi.mock('../../router/pageLoaders', () => ({ preloadRouteByPath: vi.fn() }))
vi.mock('../../components/ExercisePicker', () => ({ default: () => null }))
vi.mock('../../components/workout/WorkoutExerciseLedgerItem', () => ({ default: () => null }))

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
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
        delete props.whileTap
        return createElement(tag, props, children)
      }
    },
  }),
}))

function renderStaleSessionPage() {
  render(
    <MemoryRouter>
      <WorkoutPage />
    </MemoryRouter>,
  )
}

describe('WorkoutPage stale-session feedback', () => {
  beforeEach(() => {
    mocks.activeSessionSyncStatus = 'idle'
    mocks.active = null
    mocks.closureState = 'idle'
    mocks.continueStaleSession.mockReset()
    mocks.discardStaleSession.mockReset()
    mocks.ready = true
    mocks.reloadAuthentication.mockReset()
    mocks.reloadCurrentSession.mockReset()
    mocks.staleSession = { ageLabel: '2 dni' }
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
  })

  it('offers a safe retry instead of unlocking an unconfirmed session', () => {
    mocks.activeSessionSyncStatus = 'failed'
    mocks.ready = false
    mocks.staleSession = null
    renderStaleSessionPage()

    expect(screen.getByRole('alert')).toHaveTextContent('Nie udało się wczytać aktualnej sesji.')
    expect(screen.queryByText('Przygotowuję trening...')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))

    expect(mocks.reloadAuthentication).toHaveBeenCalledOnce()
  })

  it('does not show feedback for an ignored continuation', async () => {
    mocks.continueStaleSession.mockResolvedValue({ status: 'ignored' })
    renderStaleSessionPage()

    fireEvent.click(screen.getByRole('button', { name: 'Kontynuuj' }))
    await waitFor(() => expect(mocks.continueStaleSession).toHaveBeenCalledTimes(1))

    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('shows success only for a completed continuation', async () => {
    mocks.continueStaleSession.mockResolvedValue({ status: 'completed' })
    renderStaleSessionPage()

    fireEvent.click(screen.getByRole('button', { name: 'Kontynuuj' }))

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'Wróciłem do zapisanej sesji z odświeżonym timerem.',
    ))
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('shows sync retry feedback when the refreshed stale session cannot be persisted', async () => {
    mocks.continueStaleSession.mockResolvedValue({ status: 'sync_failed' })
    renderStaleSessionPage()

    fireEvent.click(screen.getByRole('button', { name: 'Kontynuuj' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(
      'Sesja została przywrócona lokalnie. Ponów synchronizację.',
    ))
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it('does not show feedback for an ignored discard', async () => {
    mocks.discardStaleSession.mockResolvedValue({ status: 'ignored' })
    renderStaleSessionPage()

    fireEvent.click(screen.getByRole('button', { name: 'Odrzuć i zacznij od nowa' }))
    await waitFor(() => expect(mocks.discardStaleSession).toHaveBeenCalledTimes(1))

    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('shows success for a completed discard', async () => {
    mocks.discardStaleSession.mockResolvedValue({ status: 'discarded', replacement: {} })
    renderStaleSessionPage()

    fireEvent.click(screen.getByRole('button', { name: 'Odrzuć i zacznij od nowa' }))

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'Stara sesja odrzucona. Zaczynamy od nowa.',
    ))
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('does not expose manual server-state repair for an unconfirmed closure', () => {
    mocks.active = {
      sessionId: 'session-1',
      startedAt: Date.now(),
      templateId: null,
      label: 'Push',
      exercises: [],
    }
    mocks.closureState = 'closure_unconfirmed'
    mocks.staleSession = null
    renderStaleSessionPage()

    expect(screen.getByRole('button', { name: 'Spróbuj ponownie' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Wczytaj aktualny stan' })).not.toBeInTheDocument()
  })
})
