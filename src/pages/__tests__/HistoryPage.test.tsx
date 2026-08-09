import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import HistoryPage from '../HistoryPage'

const mocks = vi.hoisted(() => ({
  getWorkoutHistory: vi.fn(),
  getUserExercises: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ user: { uid: 'user-1' } }),
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
  toast: { error: vi.fn() },
}))

describe('HistoryPage range state', () => {
  beforeEach(() => {
    mocks.getWorkoutHistory.mockReset()
    mocks.getUserExercises.mockReset()
    mocks.navigate.mockReset()
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
})
