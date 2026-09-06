import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearWorkoutDeleteRecovery, writeWorkoutDeleteRecovery } from '../../lib/workoutDeleteRecovery'
import type { WorkoutSummary } from '../../lib/workoutService'
import WorkoutDetailPage from '../WorkoutDetailPage'
import { useAuthStore } from '../../store/authStore'
import { useProfileStore } from '../../store/profileStore'
import type { User } from 'firebase/auth'

const workout: WorkoutSummary = {
  id: 'workout-1',
  startedAt: Date.UTC(2026, 6, 11, 8),
  finishedAt: Date.UTC(2026, 6, 11, 9),
  materialized: true,
  label: 'Push day',
  exercises: [{
    exerciseId: 'bench-press',
    exerciseSource: 'global',
    name: 'Wyciskanie',
    sets: [{ weight: 80, reps: 5 }],
  }],
}

const mocks = vi.hoisted(() => ({
  getWorkout: vi.fn(),
  deleteWorkout: vi.fn(),
  updateWorkout: vi.fn(),
  getUserExercises: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('../../lib/workoutService', async () => {
  const actual = await vi.importActual<typeof import('../../lib/workoutService')>('../../lib/workoutService')
  return {
    ...actual,
    getWorkout: mocks.getWorkout,
    // Persistence belongs to the service; reproduce its resolved-result contract in this UI mock.
    deleteWorkout: async (id: string) => {
      const uid = useAuthStore.getState().user!.uid
      const result = await mocks.deleteWorkout(id)
      if (result.status === 'deleted') clearWorkoutDeleteRecovery(uid, id)
      else writeWorkoutDeleteRecovery(uid, { workoutId: id, status: result.status })
      return result
    },
    updateWorkout: mocks.updateWorkout,
  }
})

vi.mock('../../lib/userExercisesService', () => ({
  getUserExercises: mocks.getUserExercises,
}))

vi.mock('../../components/ExercisePicker', () => ({ default: () => null }))

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

function renderPage(initialEntries: Array<string | { pathname: string; state?: unknown }> = [
  { pathname: '/workout/workout-1', state: { workoutPreview: workout } },
]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/workout/:id" element={<WorkoutDetailPage />} />
        <Route path="/history" element={<p>Historia treningów</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('WorkoutDetailPage delete action', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { uid: 'user-1' } as User })
    mocks.getWorkout.mockReset()
    mocks.getWorkout.mockResolvedValue(workout)
    mocks.deleteWorkout.mockReset()
    mocks.updateWorkout.mockReset()
    mocks.updateWorkout.mockResolvedValue({ status: 'materialized' })
    mocks.getUserExercises.mockReset()
    mocks.getUserExercises.mockResolvedValue([])
    mocks.toastSuccess.mockReset()
    mocks.toastError.mockReset()
    localStorage.clear()
    useProfileStore.getState().setProfile('user-1', {
      displayName: 'Tester', weeklyGoal: 3, primaryGoal: 'strength', units: 'kg', createdAt: 1,
    })
  })

  it.each([
    { label: 'Push day', expectedName: 'Push day' },
    { label: null, expectedName: 'Klatka' },
  ])('identifies the delete target $expectedName and initially focuses cancellation', async ({ label, expectedName }) => {
    mocks.getWorkout.mockResolvedValueOnce({ ...workout, label })
    renderPage(['/workout/workout-1'])
    fireEvent.click((await screen.findAllByRole('button', { name: 'Usuń trening' }))[0])
    const dialog = screen.getByRole('dialog', { name: 'Usunąć trening?' })
    const date = new Date(workout.startedAt).toLocaleDateString('pl-PL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
    expect(dialog).toHaveAccessibleDescription(`„${expectedName}” · ${date}. Tej operacji nie można cofnąć.`)
    const cancel = within(dialog).getByRole('button', { name: 'Anuluj' })
    await waitFor(() => expect(cancel).toHaveFocus())
    fireEvent.click(cancel)
    expect(screen.queryByRole('dialog', { name: 'Usunąć trening?' })).not.toBeInTheDocument()
    expect(mocks.deleteWorkout).not.toHaveBeenCalled()
  })

  it('shows a read error instead of absence and retries successfully', async () => {
    const retryRead = deferred<WorkoutSummary>()
    mocks.getWorkout.mockRejectedValueOnce(new Error('offline')).mockReturnValueOnce(retryRead.promise)
    renderPage(['/workout/workout-1'])
    expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się wczytać treningu.')
    expect(screen.queryByText('Trening nie istnieje.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))
    expect(screen.getByText('Ładowanie treningu...')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await act(async () => { retryRead.resolve(workout) })
    expect(screen.getByRole('heading', { name: 'Push day' })).toBeInTheDocument()
    expect(mocks.getWorkout).toHaveBeenNthCalledWith(2, 'workout-1')
  })

  it('shows confirmed absence separately from a failed read', async () => {
    mocks.getWorkout.mockResolvedValueOnce(null)
    renderPage(['/workout/workout-1'])
    expect(await screen.findByText('Trening nie istnieje.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Spróbuj ponownie' })).not.toBeInTheDocument()
  })

  it('preserves preview on a read error and replaces it after retry', async () => {
    mocks.getWorkout.mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ...workout, label: 'Updated workout' })
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Wyświetlam ostatnie dostępne dane.')
    expect(screen.getByRole('heading', { name: 'Push day' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))
    expect(await screen.findByRole('heading', { name: 'Updated workout' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps deletion recovery available when the workout read fails', async () => {
    writeWorkoutDeleteRecovery('user-1', { workoutId: 'workout-1', status: 'unknown' })
    mocks.getWorkout.mockRejectedValueOnce(new Error('offline'))
    mocks.deleteWorkout.mockResolvedValueOnce({ status: 'deleted' })
    renderPage(['/workout/workout-1'])
    expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się potwierdzić usunięcia')
    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))
    await screen.findByText('Historia treningów')
    expect(mocks.deleteWorkout).toHaveBeenCalledWith('workout-1')
    expect(mocks.getWorkout).toHaveBeenCalledTimes(1)
  })

  it('ignores the old route response after navigating to another workout', async () => {
    const oldRead = deferred<WorkoutSummary>()
    mocks.getWorkout.mockReturnValueOnce(oldRead.promise)
      .mockResolvedValueOnce({ ...workout, id: 'workout-2', label: 'Other workout' })
    render(
      <MemoryRouter initialEntries={['/workout/workout-1']}>
        <Link to="/workout/workout-2">Next workout</Link>
        <Routes><Route path="/workout/:id" element={<WorkoutDetailPage />} /></Routes>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('link', { name: 'Next workout' }))
    await screen.findByRole('heading', { name: 'Other workout' })
    await act(async () => { oldRead.resolve(workout) })
    expect(screen.getByRole('heading', { name: 'Other workout' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Push day' })).not.toBeInTheDocument()
  })

  it('drops the old account preview and ignores its late read failure', async () => {
    const oldRead = deferred<WorkoutSummary>()
    const newRead = deferred<WorkoutSummary | null>()
    mocks.getWorkout.mockReturnValueOnce(oldRead.promise).mockReturnValueOnce(newRead.promise)
    renderPage()
    await act(async () => { useAuthStore.setState({ user: { uid: 'user-2' } as User }) })
    expect(screen.queryByRole('heading', { name: 'Push day' })).not.toBeInTheDocument()
    expect(screen.getByText('Ładowanie treningu...')).toBeInTheDocument()
    await act(async () => { newRead.resolve(null) })
    await act(async () => { oldRead.reject(new Error('old account request failed')) })
    expect(screen.getByText('Trening nie istnieje.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps the workout visible after failure and retries the exact deletion before navigating', async () => {
    const firstDelete = deferred<{ status: 'cleanup_pending' }>()
    const failedCleanupRetry = deferred<{ status: 'deleted' }>()
    const retryDelete = deferred<{ status: 'deleted' }>()
    mocks.deleteWorkout
      .mockReturnValueOnce(firstDelete.promise)
      .mockReturnValueOnce(failedCleanupRetry.promise)
      .mockReturnValueOnce(retryDelete.promise)

    renderPage()

    expect(screen.getByRole('heading', { name: 'Push day' })).toBeInTheDocument()
    const mobileActions = document.querySelector<HTMLElement>('.workout-detail-mobile-actions')
    if (!mobileActions) throw new Error('Expected mobile workout actions.')
    fireEvent.click(within(mobileActions).getByRole('button', { name: 'Usuń trening' }))
    fireEvent.click(screen.getByRole('button', { name: 'Usuń' }))

    expect(screen.getByRole('status')).toHaveTextContent('Usuwanie treningu…')
    expect(screen.getByRole('heading', { name: 'Push day' })).toBeInTheDocument()
    expect(mocks.deleteWorkout).toHaveBeenLastCalledWith('workout-1')

    firstDelete.resolve({ status: 'cleanup_pending' })
    await act(async () => {
      await firstDelete.promise
    })

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Trening usunięty. Nie udało się odświeżyć statystyk.')
    expect(mobileActions).toContainElement(alert)
    expect(screen.getByRole('heading', { name: 'Push day' })).toBeInTheDocument()
    expect(screen.queryByText('Historia treningów')).not.toBeInTheDocument()
    screen.getAllByRole('button', { name: 'Edytuj trening' }).forEach((button) => {
      expect(button).toBeDisabled()
    })
    screen.getAllByRole('button', { name: 'Usuń trening' }).forEach((button) => {
      expect(button).toBeDisabled()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))

    expect(screen.getByRole('status')).toHaveTextContent('Usuwanie treningu…')
    expect(mocks.deleteWorkout).toHaveBeenNthCalledWith(2, 'workout-1')

    failedCleanupRetry.reject(new Error('offline'))
    await act(async () => {
      await failedCleanupRetry.promise.catch(() => undefined)
    })

    const retryAlert = screen.getByRole('alert')
    expect(retryAlert).toHaveTextContent('Trening usunięty. Nie udało się odświeżyć statystyk.')
    expect(screen.queryByRole('button', { name: 'Zamknij' })).not.toBeInTheDocument()
    screen.getAllByRole('button', { name: 'Edytuj trening' }).forEach((button) => {
      expect(button).toBeDisabled()
    })
    screen.getAllByRole('button', { name: 'Usuń trening' }).forEach((button) => {
      expect(button).toBeDisabled()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))
    expect(mocks.deleteWorkout).toHaveBeenNthCalledWith(3, 'workout-1')

    retryDelete.resolve({ status: 'deleted' })
    await act(async () => {
      await retryDelete.promise
    })

    await waitFor(() => expect(screen.getByText('Historia treningów')).toBeInTheDocument())
  })

  it('restores cleanup retry after reload when the workout document is already gone', async () => {
    const firstDelete = deferred<{ status: 'cleanup_pending' }>()
    const retryDelete = deferred<{ status: 'deleted' }>()
    mocks.deleteWorkout
      .mockReturnValueOnce(firstDelete.promise)
      .mockReturnValueOnce(retryDelete.promise)

    const firstRender = renderPage()

    fireEvent.click(screen.getAllByRole('button', { name: 'Usuń trening' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Usuń' }))

    firstDelete.resolve({ status: 'cleanup_pending' })
    await act(async () => {
      await firstDelete.promise
    })

    expect(await screen.findByText('Trening usunięty. Nie udało się odświeżyć statystyk.')).toBeInTheDocument()

    firstRender.unmount()
    mocks.getWorkout.mockResolvedValueOnce(null)
    renderPage(['/workout/workout-1'])

    expect(await screen.findByText('Trening usunięty. Nie udało się odświeżyć statystyk.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))
    expect(mocks.deleteWorkout).toHaveBeenNthCalledWith(2, 'workout-1')

    retryDelete.resolve({ status: 'deleted' })
    await act(async () => {
      await retryDelete.promise
    })

    await waitFor(() => expect(screen.getByText('Historia treningów')).toBeInTheDocument())
  })

  it('keeps committed cleanup recovery available after reload when the retry request fails', async () => {
    const firstDelete = deferred<{ status: 'cleanup_pending' }>()
    const failedRetry = deferred<{ status: 'deleted' }>()
    mocks.deleteWorkout
      .mockReturnValueOnce(firstDelete.promise)
      .mockReturnValueOnce(failedRetry.promise)

    const firstRender = renderPage()

    fireEvent.click(screen.getAllByRole('button', { name: 'Usuń trening' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Usuń' }))

    firstDelete.resolve({ status: 'cleanup_pending' })
    await act(async () => {
      await firstDelete.promise
    })

    firstRender.unmount()
    mocks.getWorkout.mockResolvedValueOnce(null)
    renderPage(['/workout/workout-1'])

    fireEvent.click(await screen.findByRole('button', { name: 'Spróbuj ponownie' }))
    expect(mocks.deleteWorkout).toHaveBeenNthCalledWith(2, 'workout-1')

    failedRetry.reject(new Error('offline'))
    await act(async () => {
      await failedRetry.promise.catch(() => undefined)
    })

    expect(screen.getByText('Trening usunięty. Nie udało się odświeżyć statystyk.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Spróbuj ponownie' })).toBeInTheDocument()
  })

  it('does not restore recovery after a definite delete rejection', async () => {
    mocks.deleteWorkout.mockRejectedValueOnce(new Error('offline'))

    const firstRender = renderPage()

    fireEvent.click(screen.getAllByRole('button', { name: 'Usuń trening' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Usuń' }))

    await act(async () => {
      await expect(mocks.deleteWorkout.mock.results[0]?.value).rejects.toThrow('offline')
    })

    firstRender.unmount()
    mocks.getWorkout.mockResolvedValueOnce(null)
    renderPage(['/workout/workout-1'])

    expect(await screen.findByText('Trening nie istnieje.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Spróbuj ponownie' })).not.toBeInTheDocument()
  })

  it('dismisses deletion feedback without navigating or mutating the workout', async () => {
    mocks.deleteWorkout.mockRejectedValueOnce(new Error('offline'))

    renderPage()

    fireEvent.click(screen.getAllByRole('button', { name: 'Usuń trening' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Usuń' }))

    await act(async () => {
      await expect(mocks.deleteWorkout.mock.results[0]?.value).rejects.toThrow('offline')
    })
    const alert = await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij' }))

    expect(alert).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Push day' })).toBeInTheDocument()
    expect(screen.queryByText('Historia treningów')).not.toBeInTheDocument()
    expect(mocks.deleteWorkout).toHaveBeenCalledTimes(1)
  })

  it('restores an unknown delete after reload without claiming success when its document is gone', async () => {
    mocks.deleteWorkout.mockResolvedValueOnce({ status: 'unknown' }).mockResolvedValueOnce({ status: 'deleted' })
    const firstRender = renderPage()
    fireEvent.click(screen.getAllByRole('button', { name: 'Usuń trening' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Usuń' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się potwierdzić usunięcia')
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Zamknij' })).not.toBeInTheDocument()
    firstRender.unmount()
    mocks.getWorkout.mockResolvedValueOnce(null)
    renderPage(['/workout/workout-1'])
    expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się potwierdzić usunięcia')
    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))
    await screen.findByText('Historia treningów')
    expect(mocks.deleteWorkout).toHaveBeenNthCalledWith(2, 'workout-1')
  })

  it('does not navigate or notify another account when an old delete completes', async () => {
    const deletion = deferred<{ status: 'deleted' }>()
    mocks.deleteWorkout.mockReturnValueOnce(deletion.promise)
    renderPage()
    fireEvent.click(screen.getAllByRole('button', { name: 'Usuń trening' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Usuń' }))
    await act(async () => { useAuthStore.setState({ user: { uid: 'user-2' } as User }) })
    await act(async () => { deletion.resolve({ status: 'deleted' }) })
    expect(screen.queryByText('Historia treningów')).not.toBeInTheDocument()
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    expect(screen.queryByText('Usuwanie treningu…')).not.toBeInTheDocument()
  })

  it('blocks another deletion while a different workout has unresolved recovery', async () => {
    writeWorkoutDeleteRecovery('user-1', { workoutId: 'other-workout', status: 'unknown' })
    renderPage()
    await waitFor(() => expect(mocks.getWorkout).toHaveBeenCalled())
    screen.getAllByRole('button', { name: 'Usuń trening' }).forEach((button) => expect(button).toBeDisabled())
    expect(screen.getByRole('button', { name: 'Przejdź do odzyskiwania na pulpicie' })).toBeInTheDocument()
    expect(mocks.deleteWorkout).not.toHaveBeenCalled()
  })

  it('does not save a set after its repetitions are cleared', () => {
    renderPage()

    fireEvent.click(screen.getAllByRole('button', { name: 'Edytuj trening' })[0])
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Powtórzenia, Wyciskanie, seria 1' }), {
      target: { value: '' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'Zapisz' })[0])

    expect(mocks.updateWorkout).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith(
      'Każda seria musi zawierać co najmniej jedno powtórzenie.',
    )
  })

  it('accepts a committed update whose projection is pending', async () => {
    mocks.updateWorkout.mockResolvedValue({ status: 'projection_pending' })
    renderPage()

    fireEvent.click(screen.getAllByRole('button', { name: 'Edytuj trening' })[0])
    fireEvent.change(screen.getByLabelText('Typ sesji'), {
      target: { value: 'Pull' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'Zapisz' })[0])

    expect(await screen.findByRole('heading', { name: 'Pull' })).toBeInTheDocument()
    expect(screen.queryByText(/Błąd zapisu/)).not.toBeInTheDocument()
    expect(mocks.toastError).not.toHaveBeenCalled()
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Trening zapisany. Statystyki zostaną zsynchronizowane.')
  })

  it('keeps a custom workout label selected when editing starts', () => {
    renderPage()

    fireEvent.click(screen.getAllByRole('button', { name: 'Edytuj trening' })[0])

    expect(screen.getByRole('combobox', { name: 'Typ sesji' })).toHaveValue('Push day')
  })

  it('shows lbs while a no-op save preserves the original kg payload exactly', async () => {
    useProfileStore.getState().setProfile('user-1', {
      displayName: 'Tester', weeklyGoal: 3, primaryGoal: 'strength', units: 'lbs', createdAt: 1,
    })
    renderPage()

    expect(screen.getByRole('cell', { name: '176.4' })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Edytuj trening' })[0])
    expect(screen.getByRole('spinbutton', { name: 'Ciężar, Wyciskanie, seria 1, lbs' })).toHaveValue(176.4)
    fireEvent.click(screen.getAllByRole('button', { name: 'Zapisz' })[0])

    await waitFor(() => expect(mocks.updateWorkout).toHaveBeenCalledOnce())
    expect(mocks.updateWorkout.mock.calls[0]?.[1].exercises[0].sets[0].weight).toBe(80)
  })

  it('converts only the changed lbs input and keeps a failed draft available to cancel', async () => {
    useProfileStore.getState().setProfile('user-1', {
      displayName: 'Tester', weeklyGoal: 3, primaryGoal: 'strength', units: 'lbs', createdAt: 1,
    })
    mocks.updateWorkout.mockRejectedValueOnce(new Error('offline'))
    renderPage()
    fireEvent.click(screen.getAllByRole('button', { name: 'Edytuj trening' })[0])
    const weightInput = screen.getByRole('spinbutton', { name: 'Ciężar, Wyciskanie, seria 1, lbs' })

    fireEvent.change(weightInput, { target: { value: '100' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Zapisz' })[0])

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Błąd zapisu: offline'))
    expect(mocks.updateWorkout.mock.calls[0]?.[1].exercises[0].sets[0].weight).toBeCloseTo(45.3592, 4)
    expect(weightInput).toHaveValue(100)
    fireEvent.click(screen.getAllByRole('button', { name: 'Anuluj' })[0])
    expect(mocks.updateWorkout).toHaveBeenCalledOnce()
    expect(screen.queryByRole('spinbutton', { name: 'Ciężar, Wyciskanie, seria 1, lbs' })).not.toBeInTheDocument()
  })
})
