import { createElement, type ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ActiveWorkout } from '../../store/workoutStore'
import type { WorkoutClosureIntent } from '../../lib/workoutClosureIntent'
import WorkoutPage from '../WorkoutPage'
import { WorkoutClosureError } from '../../lib/workoutClosureService'

const mocks = vi.hoisted(() => ({
  addExercise: vi.fn(),
  removeExercise: vi.fn(),
  activeSessionSyncStatus: 'idle',
  active: null as ActiveWorkout | null,
  beginClosure: vi.fn(),
  closureIntent: null as WorkoutClosureIntent | null,
  closureState: 'idle',
  continueStaleSession: vi.fn(),
  discardWorkoutLifecycle: vi.fn(),
  discardStaleSession: vi.fn(),
  finalizeWorkout: vi.fn(),
  getRecentWorkouts: vi.fn(),
  markClosureError: vi.fn(),
  markClosureUnconfirmed: vi.fn(),
  prepareFinishClosure: vi.fn(),
  ready: true,
  reloadAuthentication: vi.fn(),
  reloadCurrentSession: vi.fn(),
  setLabel: vi.fn(),
  startNewSession: vi.fn(),
  staleSession: { ageLabel: '2 days' } as { ageLabel: string } | null,
  storeActive: undefined as ActiveWorkout | null | undefined,
  storeUid: undefined as string | null | undefined,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  uid: 'user-1' as string | null,
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
    startNewSession: mocks.startNewSession,
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
  useAuthStore: Object.assign(
    () => ({ user: mocks.uid ? { uid: mocks.uid } : null }),
    { getState: () => {
      const uid = mocks.storeUid === undefined ? mocks.uid : mocks.storeUid
      return { user: uid ? { uid } : null }
    } },
  ),
}))

vi.mock('../../store/profileStore', () => ({
  useProfileStore: () => ({ profile: null }),
}))

vi.mock('../../store/workoutStore', () => {
  const useWorkoutStore = Object.assign(
    () => ({
      active: mocks.active,
      restTimer: null,
      addExercise: mocks.addExercise,
      setLabel: mocks.setLabel,
      startWorkout: vi.fn(),
    }),
    { getState: () => ({
      active: mocks.storeActive === undefined ? mocks.active : mocks.storeActive,
      removeExercise: mocks.removeExercise,
    }) },
  )
  return { useWorkoutStore }
})

vi.mock('../../lib/workoutService', () => ({
  getRecentWorkouts: mocks.getRecentWorkouts,
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
vi.mock('../../components/workout/WorkoutExerciseLedgerItem', () => ({
  default: ({ exerciseIndex, onRemoveExercise }: { exerciseIndex: number; onRemoveExercise(index: number): void }) => (
    <button onClick={() => onRemoveExercise(exerciseIndex)}>Remove exercise {exerciseIndex}</button>
  ),
}))

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
  return render(
    <MemoryRouter>
      <WorkoutPage />
    </MemoryRouter>,
  )
}

function WorkoutResultRoute() {
  const location = useLocation()
  const state = location.state as {
    workoutResult?: { workoutId?: unknown; status?: unknown }
  } | null

  return (
    <output data-testid="workout-result-route">
      {location.pathname}|{String(state?.workoutResult?.workoutId)}|{String(state?.workoutResult?.status)}
    </output>
  )
}

describe('WorkoutPage stale-session feedback', () => {
  beforeEach(() => {
    mocks.addExercise.mockReset()
    mocks.removeExercise.mockReset()
    mocks.activeSessionSyncStatus = 'idle'
    mocks.active = null
    mocks.beginClosure.mockReset()
    mocks.closureIntent = null
    mocks.closureState = 'idle'
    mocks.continueStaleSession.mockReset()
    mocks.discardWorkoutLifecycle.mockReset()
    mocks.discardStaleSession.mockReset()
    mocks.finalizeWorkout.mockReset()
    mocks.getRecentWorkouts.mockReset().mockImplementation(() => new Promise(() => undefined))
    mocks.markClosureError.mockReset()
    mocks.markClosureUnconfirmed.mockReset()
    mocks.prepareFinishClosure.mockReset()
    mocks.ready = true
    mocks.reloadAuthentication.mockReset()
    mocks.reloadCurrentSession.mockReset()
    mocks.setLabel.mockReset()
    mocks.startNewSession.mockReset()
    mocks.staleSession = { ageLabel: '2 days' }
    mocks.storeActive = undefined
    mocks.storeUid = undefined
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.uid = 'user-1'
  })

  it('minimizes an idle session without changing its workout data', () => {
    const session: ActiveWorkout = {
      sessionId: 'session-minimize',
      startedAt: 500,
      label: 'Push',
      exercises: [{
        exerciseId: 'bench-press',
        exerciseSource: 'global',
        name: 'Bench Press',
        sets: [{ weight: '80', reps: '5', done: true }],
      }],
    }
    mocks.active = session
    mocks.staleSession = null

    render(
      <MemoryRouter initialEntries={['/workout/new']}>
        <Routes>
          <Route path="/workout/new" element={<WorkoutPage />} />
          <Route path="/dashboard" element={<output>Dashboard route</output>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Your workout keeps running')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Minimize workout' }))

    expect(screen.getByText('Dashboard route')).toBeInTheDocument()
    expect(mocks.active).toEqual(session)
    expect(mocks.beginClosure).not.toHaveBeenCalled()
    expect(mocks.startNewSession).not.toHaveBeenCalled()
  })

  it('keeps minimize unavailable while session closure is locked', () => {
    mocks.active = {
      sessionId: 'session-closing',
      startedAt: 500,
      label: 'Push',
      exercises: [],
    }
    mocks.staleSession = null
    mocks.closureState = 'submitting'

    renderStaleSessionPage()

    expect(screen.getByRole('button', { name: 'Minimize workout' })).toBeDisabled()
  })

  it('presents authoritative absence as a direct new-workout entry', () => {
    mocks.staleSession = null
    renderStaleSessionPage()

    expect(screen.getByRole('heading', { name: 'New workout' })).toBeInTheDocument()
    expect(screen.queryByText('Nie ma aktywnej sessions')).not.toBeInTheDocument()
    expect(screen.queryByText(/zakończona albo usunięta na innym urządzeniu/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Start a new session' }))
    expect(mocks.startNewSession).toHaveBeenCalledOnce()
  })

  it('keeps recent exercises as flat source-aware add actions', async () => {
    mocks.active = {
      sessionId: 'session-empty',
      startedAt: Date.now(),
      templateId: null,
      label: '',
      exercises: [],
    }
    mocks.staleSession = null
    mocks.getRecentWorkouts.mockResolvedValue([
      {
        exercises: [
          {
            exerciseId: 'bench-press',
            exerciseSource: 'global',
            name: 'Bench Press',
            sets: [],
          },
          {
            exerciseId: 'custom-row',
            exerciseSource: 'user',
            name: 'Wiosłowanie na wyciągu',
            sets: [],
          },
        ],
      },
    ])
    renderStaleSessionPage()

    expect(await screen.findByRole('heading', { name: 'Recently used' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add exercise' })).toHaveLength(1)
    expect(screen.queryByText('Szybki start')).not.toBeInTheDocument()
    expect(screen.queryByText('Add pierwszy ruch')).not.toBeInTheDocument()
    expect(screen.queryByText(/Choose an exercise, wpisz pierwszą serię/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Użyte .* w ostatnich sesjach/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Wiosłowanie na wyciągu/ }))
    expect(mocks.addExercise).toHaveBeenCalledWith('custom-row', 'Wiosłowanie na wyciągu', 'user')
  })

  it('offers a safe retry instead of unlocking an unconfirmed session', () => {
    mocks.activeSessionSyncStatus = 'failed'
    mocks.ready = false
    mocks.staleSession = null
    renderStaleSessionPage()

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the current session.')
    expect(screen.queryByText('Preparing workout...')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(mocks.reloadAuthentication).toHaveBeenCalledOnce()
  })

  it('does not show feedback for an ignored continuation', async () => {
    mocks.continueStaleSession.mockResolvedValue({ status: 'ignored' })
    renderStaleSessionPage()

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(mocks.continueStaleSession).toHaveBeenCalledTimes(1))

    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('shows success only for a completed continuation', async () => {
    mocks.continueStaleSession.mockResolvedValue({ status: 'completed' })
    renderStaleSessionPage()

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'Saved session resumed with a refreshed timer.',
    ))
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('clamps the elapsed timer when the active session starts in the future', () => {
    const now = new Date('2026-08-31T01:12:00+02:00').getTime()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now)
    mocks.staleSession = null
    mocks.active = {
      sessionId: 'session-future',
      startedAt: now + 30 * 60_000,
      templateId: null,
      label: 'Push',
      exercises: [{
        exerciseId: 'bench-press',
        exerciseSource: 'global',
        name: 'Bench Press',
        sets: [{ weight: '85', reps: '5', done: false }],
      }],
    }

    renderStaleSessionPage()

    expect(screen.getByTestId('elapsed-session-timer')).toHaveTextContent('00:00')
    nowSpy.mockRestore()
  })

  it('shows sync retry feedback when the refreshed stale session cannot be persisted', async () => {
    mocks.continueStaleSession.mockResolvedValue({ status: 'sync_failed' })
    renderStaleSessionPage()

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(
      'Session restored locally. Retry sync.',
    ))
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it('does not show feedback for an ignored discard', async () => {
    mocks.discardStaleSession.mockResolvedValue({ status: 'ignored' })
    renderStaleSessionPage()

    fireEvent.click(screen.getByRole('button', { name: 'Discard and start again' }))
    await waitFor(() => expect(mocks.discardStaleSession).toHaveBeenCalledTimes(1))

    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('shows success for a completed discard', async () => {
    mocks.discardStaleSession.mockResolvedValue({ status: 'discarded', replacement: {} })
    renderStaleSessionPage()

    fireEvent.click(screen.getByRole('button', { name: 'Discard and start again' }))

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'Old session discarded. Starting fresh.',
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

    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible()
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

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(mocks.finalizeWorkout).toHaveBeenCalledWith(
      'session-recovery',
      'revision-recovery',
    ))
    expect(mocks.prepareFinishClosure).not.toHaveBeenCalled()
  })

  it.each(['materialized', 'projection_pending'] as const)(
    'opens the confirmed workout result after a %s finish',
    async (status) => {
      const session: ActiveWorkout = {
        sessionId: `session-${status}`,
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
      const intent = { action: 'finish' as const, session, createdAt: Date.now() }
      mocks.active = session
      mocks.staleSession = null
      mocks.beginClosure.mockReturnValue(intent)
      mocks.prepareFinishClosure.mockResolvedValue({ status: 'ready', sessionRevision: 'revision-1' })
      mocks.finalizeWorkout.mockResolvedValue({ workoutId: 'confirmed-workout', status })

      render(
        <MemoryRouter initialEntries={['/workout/new']}>
          <Routes>
            <Route path="/workout/new" element={<WorkoutPage />} />
            <Route path="/workout/:id" element={<WorkoutResultRoute />} />
          </Routes>
        </MemoryRouter>,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Finish' }))

      expect(await screen.findByTestId('workout-result-route')).toHaveTextContent(
        `/workout/confirmed-workout|confirmed-workout|${status}`,
      )
      expect(mocks.finalizeWorkout).toHaveBeenCalledOnce()
    },
  )

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

    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(
      'The session changed on another device. Check the data and finish it again.',
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

    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))

    await waitFor(() => expect(mocks.markClosureError).toHaveBeenCalledWith(conflict))
    expect(mocks.toastError).not.toHaveBeenCalledWith(
      'The session changed on another device. Check the data and finish it again.',
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

    expect(screen.getByRole('alert')).toHaveTextContent('The session changed on another device.')
    expect(screen.queryByRole('button', { name: 'Retry sync' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Load current session' }))

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

    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))

    await waitFor(() => expect(mocks.prepareFinishClosure).toHaveBeenCalledWith(intent))
    expect(mocks.finalizeWorkout).not.toHaveBeenCalled()
  })

  it('does not finalize entered unfinished sets without confirmation', async () => {
    mocks.staleSession = null
    mocks.active = {
      sessionId: 'finish-review', startedAt: Date.now(), templateId: null,
      exercises: [{
        clientId: 'bench', exerciseId: 'bench-press', exerciseSource: 'global',
        name: 'Bench Press', sets: [
          { clientId: 's1', weight: '60', reps: '8', done: true },
          { clientId: 's2', weight: '60', reps: '8', done: false },
        ],
      }],
    }
    renderStaleSessionPage()

    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))

    const dialog = await screen.findByRole('dialog', { name: 'Finish workout?' })
    expect(dialog).toHaveTextContent('Unfinished sets: 1')
    expect(mocks.beginClosure).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Continue workout' }))
    expect(mocks.beginClosure).not.toHaveBeenCalled()
    expect(mocks.active.exercises[0].sets).toHaveLength(2)
  })

  it('keeps an incomplete workout after Escape cancellation', async () => {
    mocks.staleSession = null
    mocks.active = {
      sessionId: 'cancel-Escape', startedAt: Date.now(), templateId: null,
      exercises: [{ exerciseId: 'bench', exerciseSource: 'global', name: 'Bench', sets: [
        { weight: '60', reps: '8', done: true },
        { weight: '', reps: '', done: false },
      ] }],
    }
    renderStaleSessionPage()
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    await screen.findByRole('dialog', { name: 'Finish workout?' })

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Finish workout?' })).not.toBeInTheDocument())
    expect(mocks.beginClosure).not.toHaveBeenCalled()
  })

  it.each(['session', 'account', 'missing session', 'missing account'])(
    'cannot finalize after the %s changes while confirmation is open', async (change) => {
    mocks.staleSession = null
    const session: ActiveWorkout = {
      sessionId: 'identity-original', startedAt: Date.now(), templateId: null,
      exercises: [{ exerciseId: 'bench', exerciseSource: 'global', name: 'Bench', sets: [
        { weight: '60', reps: '8', done: true },
        { weight: '', reps: '', done: false },
      ] }],
    }
    mocks.active = session
    const view = renderStaleSessionPage()
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    await screen.findByRole('button', { name: 'Save completed sets' })

    if (change === 'session') mocks.active = { ...session, sessionId: 'identity-replacement' }
    else if (change === 'account') mocks.uid = 'user-2'
    else if (change === 'missing session') mocks.active = null
    else mocks.uid = null
    view.rerender(<MemoryRouter><WorkoutPage /></MemoryRouter>)

    expect(mocks.beginClosure).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Finish workout?' })).not.toBeInTheDocument()
    },
  )

  it('requires fresh confirmation after a replacement session briefly takes over', async () => {
    mocks.staleSession = null
    const session: ActiveWorkout = {
      sessionId: 'identity-return', startedAt: Date.now(), templateId: null,
      exercises: [{ exerciseId: 'bench', exerciseSource: 'global', name: 'Bench', sets: [
        { weight: '60', reps: '8', done: true },
        { weight: '60', reps: '8', done: false },
      ] }],
    }
    mocks.active = session
    const view = renderStaleSessionPage()
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    await screen.findByRole('dialog', { name: 'Finish workout?' })

    mocks.active = { ...session, sessionId: 'identity-temporary' }
    view.rerender(<MemoryRouter><WorkoutPage /></MemoryRouter>)
    expect(screen.queryByRole('dialog', { name: 'Finish workout?' })).not.toBeInTheDocument()
    mocks.active = session
    view.rerender(<MemoryRouter><WorkoutPage /></MemoryRouter>)

    expect(screen.queryByRole('dialog', { name: 'Finish workout?' })).not.toBeInTheDocument()
    expect(mocks.beginClosure).not.toHaveBeenCalled()
  })

  it('finalizes the latest same-session payload after confirmation', async () => {
    mocks.staleSession = null
    const session: ActiveWorkout = {
      sessionId: 'same-session', startedAt: Date.now(), templateId: null,
      exercises: [{ exerciseId: 'bench', exerciseSource: 'global', name: 'Bench', sets: [
        { weight: '60', reps: '8', done: true },
        { weight: '', reps: '', done: false },
      ] }],
    }
    mocks.active = session
    mocks.prepareFinishClosure.mockResolvedValue({ status: 'failed' })
    renderStaleSessionPage()
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    const latest = {
      ...session,
      exercises: [{ ...session.exercises[0], sets: [
        { weight: '62.5', reps: '8', done: true },
        { weight: '', reps: '', done: false },
      ] }],
    }
    const intent = { action: 'finish' as const, session: latest, createdAt: Date.now() }
    mocks.storeActive = latest
    mocks.beginClosure.mockReturnValue(intent)

    fireEvent.click(screen.getByRole('button', { name: 'Save completed sets' }))

    await waitFor(() => expect(mocks.prepareFinishClosure).toHaveBeenCalledWith(intent))
    expect(mocks.beginClosure).toHaveBeenCalledWith('finish', latest)
    expect(mocks.finalizeWorkout).not.toHaveBeenCalled()
  })

  it('finishes directly when all sets are completed', async () => {
    mocks.staleSession = null
    const session: ActiveWorkout = {
      sessionId: 'all-done', startedAt: Date.now(), templateId: null,
      exercises: [{ exerciseId: 'bench', exerciseSource: 'global', name: 'Bench', sets: [
        { weight: '60', reps: '8', done: true },
      ] }],
    }
    const intent = { action: 'finish' as const, session, createdAt: Date.now() }
    mocks.active = session
    mocks.beginClosure.mockReturnValue(intent)
    mocks.prepareFinishClosure.mockResolvedValue({ status: 'failed' })
    renderStaleSessionPage()

    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))

    await waitFor(() => expect(mocks.prepareFinishClosure).toHaveBeenCalledWith(intent))
    expect(screen.queryByRole('dialog', { name: 'Finish workout?' })).not.toBeInTheDocument()
  })

  it('starts only one effective closure when confirmation is double-clicked', async () => {
    mocks.staleSession = null
    const session: ActiveWorkout = {
      sessionId: 'double-finish', startedAt: Date.now(), templateId: null,
      exercises: [{ exerciseId: 'bench', exerciseSource: 'global', name: 'Bench', sets: [
        { weight: '60', reps: '8', done: true },
        { weight: '', reps: '', done: false },
      ] }],
    }
    const intent = { action: 'finish' as const, session, createdAt: Date.now() }
    mocks.active = session
    mocks.storeActive = session
    mocks.storeUid = 'user-1'
    mocks.beginClosure.mockReturnValue(intent)
    mocks.prepareFinishClosure.mockResolvedValue({ status: 'failed' })
    renderStaleSessionPage()
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))

    const confirm = screen.getByRole('button', { name: 'Save completed sets' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)

    expect(mocks.beginClosure).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(mocks.prepareFinishClosure).toHaveBeenCalledOnce())
    expect(mocks.finalizeWorkout).not.toHaveBeenCalled()
  })

  it('reapplies the empty-session guard when the same session loses its completed set', async () => {
    mocks.staleSession = null
    const session: ActiveWorkout = {
      sessionId: 'same-empty', startedAt: Date.now(), templateId: null,
      exercises: [{ exerciseId: 'bench', exerciseSource: 'global', name: 'Bench', sets: [
        { weight: '60', reps: '8', done: true },
        { weight: '', reps: '', done: false },
      ] }],
    }
    mocks.active = session
    renderStaleSessionPage()
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    mocks.storeActive = {
      ...session,
      exercises: [{ ...session.exercises[0], sets: session.exercises[0].sets.map((set) => ({ ...set, done: false })) }],
    }

    fireEvent.click(screen.getByRole('button', { name: 'Save completed sets' }))

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Finish without saving?' })).toBeVisible())
    expect(mocks.beginClosure).not.toHaveBeenCalled()
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

    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Finish without saving?')
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'No sets are marked complete. The session will be discarded without saving a workout.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Discard session' }))

    await waitFor(() => expect(mocks.discardWorkoutLifecycle).toHaveBeenCalledOnce())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mocks.beginClosure).toHaveBeenCalledWith('discard', emptySession)
    expect(mocks.prepareFinishClosure).not.toHaveBeenCalled()
    expect(mocks.finalizeWorkout).not.toHaveBeenCalled()
  })
})


describe('WorkoutPage exercise removal identity', () => {
  it.each(['preceding removed', 'selected removed', 'session replaced', 'client IDs replaced'])(
    'does not remove the wrong exercise when %s while confirmation is open', async (change) => {
      mocks.staleSession = null
      mocks.closureState = 'idle'
      mocks.closureIntent = null
      mocks.ready = true
      mocks.removeExercise.mockReset()
      mocks.getRecentWorkouts.mockReturnValue(new Promise(() => undefined))
      const exercises = ['x', 'y', 'z'].map((clientId) => ({
        clientId, exerciseId: clientId, exerciseSource: 'global' as const, name: clientId,
        sets: [{ clientId: `set-${clientId}`, weight: '80', reps: '5', done: false }],
      }))
      mocks.active = { sessionId: 'original', startedAt: Date.now(), templateId: null, exercises }
      renderStaleSessionPage()
      fireEvent.click(screen.getByRole('button', { name: 'Remove exercise 1' }))
      await screen.findByRole('dialog', { name: 'Remove exercise?' })
      mocks.active = {
        ...mocks.active!,
        sessionId: change === 'session replaced' ? 'replacement' : 'original',
        exercises: change === 'preceding removed' ? exercises.slice(1)
          : change === 'selected removed' ? [exercises[0]!, exercises[2]!]
            : change === 'client IDs replaced' ? exercises.map((exercise) => ({ ...exercise, clientId: `${exercise.clientId}-new` }))
              : exercises,
      }
      fireEvent.click(screen.getByRole('button', { name: 'Remove exercise' }))
      if (change === 'preceding removed') expect(mocks.removeExercise).toHaveBeenCalledWith(0)
      else expect(mocks.removeExercise).not.toHaveBeenCalled()
    },
  )
})
