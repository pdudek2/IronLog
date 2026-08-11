import { createElement, type ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import WorkoutPage from '../WorkoutPage'

const mocks = vi.hoisted(() => ({
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
  reloadCurrentSession: vi.fn(),
  staleSession: { ageLabel: '2 dni' } as { ageLabel: string } | null,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('../../hooks/useActiveSession', () => ({
  useActiveSession: () => ({
    activeSessionSyncStatus: 'idle',
    beginClosure: vi.fn(),
    closureIntent: null,
    closureState: mocks.closureState,
    confirmClosure: vi.fn(),
    continueStaleSession: mocks.continueStaleSession,
    discardStaleSession: mocks.discardStaleSession,
    markClosureError: vi.fn(),
    markClosureUnconfirmed: vi.fn(),
    ready: true,
    reloadAuthentication: vi.fn(),
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
    mocks.active = null
    mocks.closureState = 'idle'
    mocks.continueStaleSession.mockReset()
    mocks.discardStaleSession.mockReset()
    mocks.reloadCurrentSession.mockReset()
    mocks.staleSession = { ageLabel: '2 dni' }
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
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

  it('shows an error for a real current continuation failure', async () => {
    const currentError = new Error('current continuation failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.continueStaleSession.mockRejectedValue(currentError)
    renderStaleSessionPage()

    fireEvent.click(screen.getByRole('button', { name: 'Kontynuuj' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(
      'Nie udało się przywrócić sesji. Spróbuj ponownie.',
    ))
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalledWith('[continue stale session error]', currentError)
    consoleError.mockRestore()
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

  it('lets an unconfirmed closure reload the authoritative server state', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Wczytaj aktualny stan' }))

    expect(mocks.reloadCurrentSession).toHaveBeenCalledOnce()
  })
})
