import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ExerciseDetailPage from '../ExerciseDetailPage'

const mocks = vi.hoisted(() => ({
  getUserExercises: vi.fn(),
  getExerciseSessions: vi.fn(),
  getExerciseRecord: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ user: { uid: 'user-1' } }),
}))

vi.mock('../../lib/userExercisesService', () => ({
  getUserExercises: mocks.getUserExercises,
}))

vi.mock('../../lib/exerciseDetailService', () => ({
  getExerciseSessions: mocks.getExerciseSessions,
  getExerciseRecord: mocks.getExerciseRecord,
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ source: 'user', id: 'custom-row' }),
    useNavigate: () => mocks.navigate,
  }
})

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => {
      delete props.initial
      delete props.animate
      delete props.transition
      return <div {...props}>{children}</div>
    },
  },
}))

beforeEach(() => {
  mocks.getUserExercises.mockReset()
  mocks.getExerciseSessions.mockReset()
  mocks.getExerciseRecord.mockReset()
  mocks.navigate.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => vi.restoreAllMocks())

it('keeps sessions and records visible while user exercise metadata is retryable', async () => {
  mocks.getUserExercises
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce([{
      id: 'custom-row',
      name: 'Wiosłowanie własne',
      category: 'back',
      equipment: 'cable',
      muscles: ['back'],
    }])
  mocks.getExerciseSessions.mockResolvedValue([{
    id: 'session-1',
    workoutId: 'workout-1',
    startedAt: Date.now() - 86_400_000,
    label: 'Dzień siły',
    totalSets: 3,
    totalReps: 24,
    totalVolume: 1_800,
    bestSetWeight: 80,
    bestSetReps: 8,
    sets: [{ weight: 80, reps: 8 }],
  }])
  mocks.getExerciseRecord.mockResolvedValue({
    exerciseId: 'custom-row',
    exerciseName: 'Wiosłowanie własne',
    maxWeight: 95,
    maxReps: 10,
    totalSessions: 4,
    bestVolume: 2_100,
    lastPerformedAt: Date.now() - 86_400_000,
  })

  render(<ExerciseDetailPage />)

  expect(await screen.findByRole('heading', { name: 'custom-row' })).toBeInTheDocument()
  expect(screen.getByText('Dzień siły')).toBeInTheDocument()
  expect(screen.getByText('Rekord')).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Nie udało się wczytać nazwy i kategorii tego ćwiczenia. Historia i rekordy nadal są dostępne.',
  )

  fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))
  expect(await screen.findByRole('heading', { name: 'Wiosłowanie własne' })).toBeInTheDocument()
})
