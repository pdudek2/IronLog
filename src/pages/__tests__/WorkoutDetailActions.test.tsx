import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorkoutSummary } from '../../lib/workoutService'
import WorkoutDetailPage from '../WorkoutDetailPage'

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
}))

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ user: { uid: 'user-1' } }),
}))

vi.mock('../../lib/workoutService', async () => {
  const actual = await vi.importActual<typeof import('../../lib/workoutService')>('../../lib/workoutService')
  return {
    ...actual,
    getWorkout: mocks.getWorkout,
    deleteWorkout: mocks.deleteWorkout,
    updateWorkout: mocks.updateWorkout,
  }
})

vi.mock('../../lib/userExercisesService', () => ({
  getUserExercises: mocks.getUserExercises,
}))

vi.mock('../../components/ExercisePicker', () => ({ default: () => null }))

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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/workout/workout-1', state: { workoutPreview: workout } }]}>
      <Routes>
        <Route path="/workout/:id" element={<WorkoutDetailPage />} />
        <Route path="/history" element={<p>Historia treningów</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('WorkoutDetailPage delete action', () => {
  beforeEach(() => {
    mocks.getWorkout.mockReset()
    mocks.getWorkout.mockResolvedValue(workout)
    mocks.deleteWorkout.mockReset()
    mocks.updateWorkout.mockReset()
    mocks.getUserExercises.mockReset()
    mocks.getUserExercises.mockResolvedValue([])
  })

  it('keeps the workout visible after failure and retries the exact deletion before navigating', async () => {
    const firstDelete = deferred<void>()
    const retryDelete = deferred<void>()
    mocks.deleteWorkout
      .mockReturnValueOnce(firstDelete.promise)
      .mockReturnValueOnce(retryDelete.promise)

    renderPage()

    expect(screen.getByRole('heading', { name: 'Push day.' })).toBeInTheDocument()
    const mobileActions = screen.getByRole('group', { name: 'Akcje treningu' })
    fireEvent.click(within(mobileActions).getByRole('button', { name: 'Usuń trening' }))
    fireEvent.click(screen.getByRole('button', { name: 'Usuń' }))

    expect(screen.getByRole('status')).toHaveTextContent('Usuwanie treningu…')
    expect(screen.getByRole('heading', { name: 'Push day.' })).toBeInTheDocument()
    expect(mocks.deleteWorkout).toHaveBeenLastCalledWith('workout-1')

    firstDelete.reject(new Error('offline'))
    await act(async () => {
      await firstDelete.promise.catch(() => undefined)
    })

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Nie udało się usunąć treningu.')
    expect(mobileActions).toContainElement(alert)
    expect(screen.getAllByText('Nie udało się usunąć treningu.')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Push day.' })).toBeInTheDocument()
    expect(screen.queryByText('Historia treningów')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))

    expect(screen.getByRole('status')).toHaveTextContent('Usuwanie treningu…')
    expect(mocks.deleteWorkout).toHaveBeenNthCalledWith(2, 'workout-1')

    retryDelete.resolve()
    await act(async () => {
      await retryDelete.promise
    })

    await waitFor(() => expect(screen.getByText('Historia treningów')).toBeInTheDocument())
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
    expect(screen.getByRole('heading', { name: 'Push day.' })).toBeInTheDocument()
    expect(screen.queryByText('Historia treningów')).not.toBeInTheDocument()
    expect(mocks.deleteWorkout).toHaveBeenCalledTimes(1)
  })
})
