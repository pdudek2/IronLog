import { createElement, type ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ActiveWorkout } from '../../store/workoutStore'
import type { WorkoutClosureIntent } from '../../lib/workoutClosureIntent'
import WorkoutPage from '../WorkoutPage'
import { WorkoutClosureError } from '../../lib/workoutClosureService'

const mocks = vi.hoisted(() => ({
  activeSessionSyncStatus: 'idle',
  active: null as ActiveWorkout | null,
  beginClosure: vi.fn(),
  closureIntent: null as WorkoutClosureIntent | null,
  closureState: 'idle',
  continueStaleSession: vi.fn(),
  discardWorkoutLifecycle: vi.fn(),
  discardStaleSession: vi.fn(),
  finalizeWorkout: vi.fn(),
  markClosureError: vi.fn(),
  markClosureUnconfirmed: vi.fn(),
  prepareFinishClosure: vi.fn(),
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
    beginClosure: mocks.beginClosure,
    closureIntent: mocks.closureIntent,
    closureState: mocks.closureState,
    confirmClosure: vi.fn(),
    continueStaleSession: mocks.continueStaleSession,
    discardStaleSession: mocks.discardStaleSession,
    markClosureError: mocks.markClosureError,
    markClosureUnconfirmed: mocks.markClosureUnconfirmed,
    prepareFinishClosure: mocks.prepareFinishClosure,
    ready: mocks.ready,
    reloadAuthentication: mocks.reloadAuthentication,
    reloadCurrentSession: mocks.reloadCurrentSession,
    retryActiveSessionSync: vi.fn(),
    staleSession: mocks.staleSession,
  }),
}))

vi.mock('../../lib/workoutLifecycle', () => ({
  discardWorkoutLifecycle: mocks.discardWorkoutLifecycle,
  finishWorkoutLifecycle: ({ request }: { request: () => Promise<unknown> }) => request(),
}))

vi.mock('../../lib/workoutClosureService', () => ({
  finalizeWorkout: mocks.finalizeWorkout,
  WorkoutClosureError: class WorkoutClosureError extends Error {
    readonly kind: 'ambiguous' | 'definitive'
    readonly status?: number
    readonly code?: string

    constructor(
      kind: 'ambiguous' | 'definitive',
      message: string,
      options: { status?: number; code?: string } = {},
    ) {
      super(message)
      this.kind = kind
      this.status = options.status
      this.code = options.code
    }
  },
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
  suggestNextSession: vi.fn().mockResolvedValue(null),
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
    mocks.beginClosure.mockReset()
    mocks.closureIntent = null
    mocks.closureState = 'idle'
    mocks.continueStaleSession.mockReset()
    mocks.discardWorkoutLifecycle.mockReset()
    mocks.discardStaleSession.mockReset()
    mocks.finalizeWorkout.mockReset()
    mocks.markClosureError.mockReset()
    mocks.markClosureUnconfirmed.mockReset()
    mocks.prepareFinishClosure.mockReset()
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

  it('retries an ambiguous finish with the persisted revision without preparing again', async () => {
    const session: ActiveWorkout = {
      sessionId: 'session-recovery',
      startedAt: Date.now(),
      templateId: null,
      label: 'Push',
      exercises: [{
        exerciseId: 'bench-press',
        exerciseSource: 'global',
        name: 'Bench Press',
        sets: [{ weight: '80', reps: '5', done: true }],
      }],
    }
    const preparedIntent: WorkoutClosureIntent = {
      action: 'finish',
      session,
      createdAt: 1_797_000_000_000,
      sessionRevision: 'revision-recovery',
    }
    mocks.active = session
    mocks.closureIntent = preparedIntent
    mocks.closureState = 'closure_unconfirmed'
    mocks.staleSession = null
    mocks.beginClosure.mockReturnValue(preparedIntent)
    mocks.finalizeWorkout.mockResolvedValue({
      workoutId: session.sessionId,
      status: 'materialized',
    })
    renderStaleSessionPage()

    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))

    await waitFor(() => expect(mocks.finalizeWorkout).toHaveBeenCalledWith(
      'session-recovery',
      'revision-recovery',
    ))
    expect(mocks.prepareFinishClosure).not.toHaveBeenCalled()
  })

  it('shows precise feedback after reloading a session changed on another device', async () => {
    const session: ActiveWorkout = {
      sessionId: 'session-changed',
      startedAt: Date.now(),
      templateId: null,
      label: 'Push',
      exercises: [{
        exerciseId: 'bench-press',
        exerciseSource: 'global',
        name: 'Bench Press',
        sets: [{ weight: '80', reps: '5', done: true }],
      }],
    }
    const conflict = new WorkoutClosureError('definitive', 'changed', {
      code: 'active_session_changed',
      status: 409,
    })
    mocks.active = session
    mocks.staleSession = null
    mocks.beginClosure.mockReturnValue({ action: 'finish', session, createdAt: Date.now() })
    mocks.prepareFinishClosure.mockResolvedValue({ status: 'ready', sessionRevision: 'stale-revision' })
    mocks.finalizeWorkout.mockRejectedValue(conflict)
    mocks.markClosureError.mockResolvedValue('active_session_changed')
    renderStaleSessionPage()

    fireEvent.click(screen.getByRole('button', { name: 'Zakończ' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(
      'Sesja zmieniła się na innym urządzeniu. Sprawdź dane i zakończ ją ponownie.',
    ))
    expect(mocks.markClosureError).toHaveBeenCalledWith(conflict)
    expect(mocks.markClosureUnconfirmed).not.toHaveBeenCalled()
  })

  it('does not claim reconciliation when the authoritative conflict reload fails', async () => {
    const session: ActiveWorkout = {
      sessionId: 'session-changed',
      startedAt: Date.now(),
      templateId: null,
      label: 'Push',
      exercises: [{
        exerciseId: 'bench-press',
        exerciseSource: 'global',
        name: 'Bench Press',
        sets: [{ weight: '80', reps: '5', done: true }],
      }],
    }
    const conflict = new WorkoutClosureError('definitive', 'changed', {
      code: 'active_session_changed',
      status: 409,
    })
    mocks.active = session
    mocks.staleSession = null
    mocks.beginClosure.mockReturnValue({ action: 'finish', session, createdAt: Date.now() })
    mocks.prepareFinishClosure.mockResolvedValue({ status: 'ready', sessionRevision: 'stale-revision' })
    mocks.finalizeWorkout.mockRejectedValue(conflict)
    mocks.markClosureError.mockResolvedValue(null)
    renderStaleSessionPage()

    fireEvent.click(screen.getByRole('button', { name: 'Zakończ' }))

    await waitFor(() => expect(mocks.markClosureError).toHaveBeenCalledWith(conflict))
    expect(mocks.toastError).not.toHaveBeenCalledWith(
      'Sesja zmieniła się na innym urządzeniu. Sprawdź dane i zakończ ją ponownie.',
    )
    expect(mocks.markClosureUnconfirmed).not.toHaveBeenCalled()
  })

  it('offers only authoritative reload while a revision conflict remains unresolved', () => {
    mocks.active = {
      sessionId: 'session-changed',
      startedAt: Date.now(),
      templateId: null,
      label: 'Stale local session',
      exercises: [],
    }
    mocks.activeSessionSyncStatus = 'failed'
    mocks.closureState = 'active_session_changed'
    mocks.staleSession = null
    renderStaleSessionPage()

    expect(screen.getByRole('alert')).toHaveTextContent('Sesja zmieniła się na innym urządzeniu.')
    expect(screen.queryByRole('button', { name: 'Ponów synchronizację' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Wczytaj aktualną sesję' }))

    expect(mocks.reloadCurrentSession).toHaveBeenCalledOnce()
    expect(mocks.prepareFinishClosure).not.toHaveBeenCalled()
    expect(mocks.finalizeWorkout).not.toHaveBeenCalled()
  })

  it('does not finalize when finish preparation was superseded', async () => {
    const session: ActiveWorkout = {
      sessionId: 'session-superseded',
      startedAt: Date.now(),
      templateId: null,
      label: 'Push',
      exercises: [{
        exerciseId: 'bench-press',
        exerciseSource: 'global',
        name: 'Bench Press',
        sets: [{ weight: '80', reps: '5', done: true }],
      }],
    }
    const intent: WorkoutClosureIntent = {
      action: 'finish',
      session,
      createdAt: Date.now(),
    }
    mocks.active = session
    mocks.staleSession = null
    mocks.beginClosure.mockReturnValue(intent)
    mocks.prepareFinishClosure.mockResolvedValue({ status: 'failed' })
    renderStaleSessionPage()

    fireEvent.click(screen.getByRole('button', { name: 'Zakończ' }))

    await waitFor(() => expect(mocks.prepareFinishClosure).toHaveBeenCalledWith(intent))
    expect(mocks.finalizeWorkout).not.toHaveBeenCalled()
  })

  it('discards an empty session instead of sending a finalize request', async () => {
    const emptySession: ActiveWorkout = {
      sessionId: 'session-empty',
      startedAt: Date.now(),
      templateId: null,
      label: 'Push',
      exercises: [],
    }
    mocks.active = emptySession
    mocks.staleSession = null
    mocks.beginClosure.mockImplementation((action: 'finish' | 'discard') => ({
      action,
      session: emptySession,
      createdAt: Date.now(),
    }))
    mocks.discardWorkoutLifecycle.mockResolvedValue({ status: 'discarded' })
    renderStaleSessionPage()

    fireEvent.click(screen.getByRole('button', { name: 'Zakończ' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Zakończyć bez zapisu?')
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Nie zaznaczono żadnej serii jako wykonanej. Sesja zostanie odrzucona bez zapisywania treningu.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Odrzuć sesję' }))

    await waitFor(() => expect(mocks.discardWorkoutLifecycle).toHaveBeenCalledOnce())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mocks.beginClosure).toHaveBeenCalledWith('discard', emptySession)
    expect(mocks.prepareFinishClosure).not.toHaveBeenCalled()
    expect(mocks.finalizeWorkout).not.toHaveBeenCalled()
  })
})
