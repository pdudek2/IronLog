import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  })

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
})
