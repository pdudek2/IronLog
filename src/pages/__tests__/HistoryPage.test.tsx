import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import HistoryPage from '../HistoryPage'

const mocks = vi.hoisted(() => ({
  getWorkoutHistory: vi.fn(),
  getUserExercises: vi.fn(),
  navigate: vi.fn(),
  toastError: vi.fn(),
  user: { uid: 'user-1' },
}))

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ user: mocks.user }),
}))

vi.mock('../../lib/workoutService', async () => {
  const actual = await vi.importActual<typeof import('../../lib/workoutService')>('../../lib/workoutService')
  return { ...actual, getWorkoutHistory: mocks.getWorkoutHistory }
})

vi.mock('../../lib/userExercisesService', () => ({
  getUserExercises: mocks.getUserExercises,
}))

vi.mock('../../data/exercises', () => ({
  exercises: [],
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mocks.navigate }
})

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError },
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

describe('HistoryPage range state', () => {
  beforeEach(() => {
    mocks.getWorkoutHistory.mockReset()
    mocks.getUserExercises.mockReset()
    mocks.navigate.mockReset()
    mocks.toastError.mockReset()
    mocks.user = { uid: 'user-1' }
    mocks.getUserExercises.mockResolvedValue([])
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => vi.restoreAllMocks())

  it('shows stored workouts in one action when the default range is empty', async () => {
    mocks.getWorkoutHistory.mockResolvedValue({
      workouts: [{
        id: 'older-workout',
        startedAt: Date.now() - 120 * 86_400_000,
        finishedAt: Date.now() - 120 * 86_400_000 + 3_600_000,
        materialized: true,
        label: 'Starsza sesja',
        exercises: [{ name: 'Przysiad', sets: [{ weight: 80, reps: 5 }] }],
      }],
      truncated: false,
    })

    render(<HistoryPage />)

    const action = await screen.findByRole('button', { name: 'Pokaż wszystko' })
    expect(screen.queryByText('Starsza sesja')).not.toBeInTheDocument()
    fireEvent.click(action)

    expect(screen.getByText('Starsza sesja')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Wszystko' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps workout history visible while a failed user catalog remains retryable', async () => {
    mocks.getWorkoutHistory.mockResolvedValue({
      workouts: [{
        id: 'recent-workout',
        startedAt: Date.now() - 86_400_000,
        finishedAt: Date.now() - 86_400_000 + 3_600_000,
        materialized: true,
        label: 'Wieczorna sesja',
        exercises: [{
          exerciseId: 'custom-row',
          exerciseSource: 'user',
          name: 'Wiosłowanie własne',
          sets: [{ weight: 50, reps: 8 }],
        }],
      }],
      truncated: false,
    })
    mocks.getUserExercises
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([])

    render(<HistoryPage />)

    expect(await screen.findByText('Wieczorna sesja')).toBeInTheDocument()
    expect(screen.queryByText('Nie udało się pobrać historii')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Nie udało się wczytać Twoich ćwiczeń. Historia nadal jest dostępna, ale część kategorii może być niepełna.',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('names broad exercise buckets as categories', async () => {
    mocks.getWorkoutHistory.mockResolvedValue({
      workouts: [{
        id: 'categorized-workout',
        startedAt: Date.now() - 86_400_000,
        finishedAt: Date.now() - 86_400_000 + 3_600_000,
        materialized: true,
        label: 'Plecy',
        exercises: [{
          exerciseId: 'custom-row',
          exerciseSource: 'user',
          name: 'Wiosłowanie własne',
          sets: [{ weight: 50, reps: 8 }],
        }],
      }],
      truncated: false,
    })
    mocks.getUserExercises.mockResolvedValue([{
      id: 'custom-row',
      name: 'Wiosłowanie własne',
      category: 'back',
      equipment: 'barbell',
      muscles: ['back'],
    }])

    render(<HistoryPage />)

    const categories = await screen.findByRole('group', { name: 'Kategorie ćwiczeń' })
    expect(within(categories).getByRole('button', { name: 'Plecy' })).toBeInTheDocument()
  })

  it('renders a failed history load as a flat retryable result state', async () => {
    mocks.getWorkoutHistory.mockRejectedValueOnce(new Error('offline'))

    const { container } = render(<HistoryPage />)

    const retry = await screen.findByRole('button', { name: 'Spróbuj ponownie' })
    const results = container.querySelector('.history-results')

    expect(results).toContainElement(retry)
    expect(results?.querySelector('.surface-panel')).toBeNull()
  })

  it('ignores a history failure that arrives after unmount', async () => {
    const request = deferred<never>()
    mocks.getWorkoutHistory.mockReturnValueOnce(request.promise)
    const { unmount } = render(<HistoryPage />)

    unmount()
    await act(async () => request.reject(new Error('late history failure')))

    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('keeps newer history visible when an older request rejects later', async () => {
    const olderRequest = deferred<never>()
    const newerHistory = {
      workouts: [{
        id: 'newer-workout',
        startedAt: Date.now() - 86_400_000,
        finishedAt: Date.now() - 86_400_000 + 3_600_000,
        materialized: true,
        label: 'Nowsza sesja',
        exercises: [{ name: 'Przysiad', sets: [{ weight: 80, reps: 5 }] }],
      }],
      truncated: false,
    }
    mocks.getWorkoutHistory
      .mockReturnValueOnce(olderRequest.promise)
      .mockResolvedValueOnce(newerHistory)

    const { rerender } = render(<HistoryPage />)
    await waitFor(() => expect(mocks.getWorkoutHistory).toHaveBeenCalledTimes(1))

    mocks.user = { uid: 'user-2' }
    rerender(<HistoryPage />)

    expect(await screen.findByText('Nowsza sesja')).toBeInTheDocument()
    await act(async () => olderRequest.reject(new Error('obsolete history failure')))

    expect(screen.getByText('Nowsza sesja')).toBeInTheDocument()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('groups filtered workouts by month without changing their order', async () => {
    const now = new Date()
    const currentMonthWorkout = new Date(
      now.getFullYear(),
      now.getMonth(),
      Math.max(now.getDate() - 1, 1),
      12,
    ).getTime()
    const secondCurrentMonthWorkout = currentMonthWorkout - 3_600_000
    const previousMonthWorkout = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      15,
      12,
    ).getTime()

    mocks.getWorkoutHistory.mockResolvedValue({
      workouts: [
        {
          id: 'current-a',
          startedAt: currentMonthWorkout,
          finishedAt: currentMonthWorkout + 3_600_000,
          materialized: true,
          label: 'Bieżąca A',
          exercises: [{ name: 'Przysiad', sets: [{ weight: 80, reps: 5 }] }],
        },
        {
          id: 'current-b',
          startedAt: secondCurrentMonthWorkout,
          finishedAt: secondCurrentMonthWorkout + 3_600_000,
          materialized: true,
          label: 'Bieżąca B',
          exercises: [{ name: 'Wiosłowanie', sets: [{ weight: 60, reps: 8 }] }],
        },
        {
          id: 'previous',
          startedAt: previousMonthWorkout,
          finishedAt: previousMonthWorkout + 3_600_000,
          materialized: true,
          label: 'Poprzedni miesiąc',
          exercises: [{ name: 'Martwy ciąg', sets: [{ weight: 100, reps: 5 }] }],
        },
      ],
      truncated: false,
    })

    render(<HistoryPage />)

    await screen.findByText('Bieżąca A')
    const monthHeadings = screen.getAllByRole('heading', { level: 2 })
    const currentGroup = monthHeadings[0]?.closest('section')
    const previousGroup = monthHeadings[1]?.closest('section')

    expect(monthHeadings).toHaveLength(2)
    expect(currentGroup).not.toBeNull()
    expect(previousGroup).not.toBeNull()
    expect(within(currentGroup as HTMLElement).getAllByRole('button').map((row) => row.textContent))
      .toEqual([
        expect.stringContaining('Bieżąca A'),
        expect.stringContaining('Bieżąca B'),
      ])
    expect(within(previousGroup as HTMLElement).getByText('Poprzedni miesiąc')).toBeInTheDocument()
  })

  it('keeps each workout row compact by truncating exercise names and removing duplicate row metadata blocks', async () => {
    const startedAt = new Date(2026, 7, 30, 18, 0).getTime()

    mocks.getWorkoutHistory.mockResolvedValue({
      workouts: [{
        id: 'compact-row',
        startedAt,
        finishedAt: startedAt + 3_600_000,
        materialized: true,
        label: 'Pełne ciało',
        exercises: [
          { name: 'Przysiad', sets: [{ weight: 100, reps: 5 }] },
          { name: 'Wiosłowanie', sets: [{ weight: 70, reps: 8 }] },
          { name: 'Wyciskanie', sets: [{ weight: 60, reps: 6 }] },
          { name: 'Martwy ciąg', sets: [{ weight: 120, reps: 3 }] },
          { name: 'Podciąganie', sets: [{ weight: 0, reps: 10 }] },
        ],
      }],
      truncated: false,
    })

    render(<HistoryPage />)

    const row = await screen.findByRole('button', { name: /Pełne ciało/i })

    expect(within(row).getByText('Przysiad · Wiosłowanie · Wyciskanie · +2')).toBeInTheDocument()
    expect(within(row).queryByText(/Martwy ciąg/)).not.toBeInTheDocument()
    expect(within(row).queryByLabelText('Kategorie ćwiczeń')).not.toBeInTheDocument()
    expect(within(row).queryByLabelText('Statystyki treningu')).not.toBeInTheDocument()
    expect(within(row).getByText('niedz., 30')).toBeInTheDocument()
    expect(within(row).getByText('1h 0m')).toBeInTheDocument()
    expect(within(row).getByText('1.8k kg')).toBeInTheDocument()
    expect(within(row).getByText('5 serii')).toBeInTheDocument()
  })
})
