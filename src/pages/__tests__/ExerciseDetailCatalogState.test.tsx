import type { ReactNode } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ExerciseDetailPage from '../ExerciseDetailPage'

const mocks = vi.hoisted(() => ({
  getUserExercises: vi.fn(),
  getExerciseSessions: vi.fn(),
  getExerciseRecord: vi.fn(),
  navigate: vi.fn(),
  params: { source: 'user', id: 'custom-row' } as { source: string; id: string },
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
    useParams: () => mocks.params,
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
  mocks.params.source = 'user'
  mocks.params.id = 'custom-row'
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

  expect(await screen.findByRole('heading', { name: 'Wiosłowanie własne' })).toBeInTheDocument()
  expect(screen.getByText('Dzień siły')).toBeInTheDocument()
  expect(screen.getByText('Ciężar max')).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Nie udało się wczytać nazwy i kategorii tego ćwiczenia. Historia i rekordy nadal są dostępne.',
  )

  fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))
  expect(await screen.findByRole('heading', { name: 'Wiosłowanie własne' })).toBeInTheDocument()
})

it('labels the capped session slice separately from the all-time session count', async () => {
  mocks.getUserExercises.mockResolvedValue([{
    id: 'custom-row',
    name: 'Wiosłowanie własne',
    category: 'back',
    equipment: 'cable',
    muscles: ['back'],
  }])
  mocks.getExerciseSessions.mockResolvedValue(Array.from({ length: 10 }, (_, index) => ({
    id: `session-${index}`,
    workoutId: `workout-${index}`,
    startedAt: Date.now() - (index + 1) * 86_400_000,
    label: null,
    totalSets: 3,
    totalReps: 24,
    totalVolume: 1_000,
    bestSetWeight: 80,
    bestSetReps: 8,
    sets: [{ weight: 80, reps: 8 }],
  })))
  mocks.getExerciseRecord.mockResolvedValue({
    exerciseId: 'custom-row',
    exerciseName: 'Wiosłowanie własne',
    maxWeight: 95,
    maxReps: 10,
    totalSessions: 14,
    bestVolume: 2_100,
    lastPerformedAt: Date.now() - 86_400_000,
  })

  render(<ExerciseDetailPage />)

  expect(await screen.findByText('14 sesji łącznie · 10 ostatnich poniżej')).toBeInTheDocument()
  expect(screen.queryByText('Łącznie')).not.toBeInTheDocument()
})

it('uses the record total when recent session rows are unavailable', async () => {
  mocks.getUserExercises.mockResolvedValue([])
  mocks.getExerciseSessions.mockResolvedValue([])
  mocks.getExerciseRecord.mockResolvedValue({
    exerciseId: 'custom-row',
    exerciseName: 'Archiwalne wiosłowanie',
    maxWeight: 95,
    maxReps: 10,
    totalSessions: 4,
    bestVolume: 2_100,
    lastPerformedAt: Date.now() - 86_400_000,
  })

  render(<ExerciseDetailPage />)

  expect(await screen.findByText('4 sesje łącznie')).toBeInTheDocument()
  expect(screen.queryByText(/Brak historii/)).not.toBeInTheDocument()
  expect(screen.getByText('Ciężar max')).toBeInTheDocument()
})

it('shows volume metrics and chronological bar labels without hover', async () => {
  mocks.getUserExercises.mockResolvedValue([{
    id: 'custom-row',
    name: 'Wiosłowanie własne',
    category: 'back',
    equipment: 'cable',
    muscles: ['back'],
  }])
  mocks.getExerciseSessions.mockResolvedValue([
    {
      id: 'session-latest',
      workoutId: 'workout-latest',
      startedAt: Date.UTC(2026, 7, 15),
      label: null,
      totalSets: 3,
      totalReps: 12,
      totalVolume: 900,
      bestSetWeight: 75,
      bestSetReps: 4,
      sets: [{ weight: 75, reps: 4 }],
    },
    {
      id: 'session-middle',
      workoutId: 'workout-middle',
      startedAt: Date.UTC(2026, 7, 10),
      label: null,
      totalSets: 3,
      totalReps: 12,
      totalVolume: 1_200,
      bestSetWeight: 100,
      bestSetReps: 4,
      sets: [{ weight: 100, reps: 4 }],
    },
    {
      id: 'session-oldest',
      workoutId: 'workout-oldest',
      startedAt: Date.UTC(2026, 7, 5),
      label: null,
      totalSets: 3,
      totalReps: 12,
      totalVolume: 1_000,
      bestSetWeight: 85,
      bestSetReps: 4,
      sets: [{ weight: 85, reps: 4 }],
    },
  ])
  mocks.getExerciseRecord.mockResolvedValue(null)

  render(<ExerciseDetailPage />)

  expect(await screen.findByRole('heading', { name: 'Wolumen na sesję' })).toBeInTheDocument()
  expect(within(screen.getByText('Ostatnio').parentElement!).getByText('900 kg')).toBeInTheDocument()
  expect(within(screen.getByText('Maksimum').parentElement!).getByText('1.2k kg')).toBeInTheDocument()

  const chart = screen.getByRole('list', {
    name: 'Wolumen ostatnich 3 sesji. Ostatnio 900 kg. Maksimum 1.2k kg.',
  })
  const sessions = within(chart).getAllByRole('listitem')
  expect(sessions).toHaveLength(3)
  expect(sessions[0]).toHaveAccessibleName(/1\.0k kg/)
  expect(sessions[1]).toHaveAccessibleName(/1\.2k kg/)
  expect(sessions[2]).toHaveAccessibleName(/900 kg/)
})

it('collapses the latest and maximum volume when they are the same fact', async () => {
  mocks.getUserExercises.mockResolvedValue([{
    id: 'custom-row',
    name: 'Wiosłowanie własne',
    category: 'back',
    equipment: 'cable',
    muscles: ['back'],
  }])
  mocks.getExerciseSessions.mockResolvedValue([{
    id: 'session-latest',
    workoutId: 'workout-latest',
    startedAt: Date.UTC(2026, 7, 15),
    label: null,
    totalSets: 3,
    totalReps: 12,
    totalVolume: 1_200,
    bestSetWeight: 100,
    bestSetReps: 4,
    sets: [{ weight: 100, reps: 4 }],
  }])
  mocks.getExerciseRecord.mockResolvedValue(null)

  render(<ExerciseDetailPage />)

  expect(await screen.findByText('Ostatnio · maksimum')).toBeInTheDocument()
  expect(screen.getByRole('list', {
    name: 'Wolumen ostatnich 1 sesji. Ostatnio i maksimum 1.2k kg.',
  })).toBeInTheDocument()
})

it('shows a not-found state for an unknown global exercise without loading history', async () => {
  mocks.params.source = 'global'
  mocks.params.id = 'does-not-exist'

  render(<ExerciseDetailPage />)

  expect(await screen.findByRole('heading', { name: 'Ćwiczenie nie istnieje' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Rozpocznij trening' })).not.toBeInTheDocument()
  expect(mocks.getExerciseSessions).not.toHaveBeenCalled()
  expect(mocks.getExerciseRecord).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: 'Wróć do biblioteki' }))
  expect(mocks.navigate).toHaveBeenCalledWith('/exercises')
})

it('keeps deleted user exercises readable when materialized history remains', async () => {
  mocks.getUserExercises.mockResolvedValue([])
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
    exerciseName: 'Archiwalne wiosłowanie',
    maxWeight: 95,
    maxReps: 10,
    totalSessions: 4,
    bestVolume: 2_100,
    lastPerformedAt: Date.now() - 86_400_000,
  })

  render(<ExerciseDetailPage />)

  expect(await screen.findByRole('heading', { name: 'Archiwalne wiosłowanie' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Ćwiczenie nie istnieje' })).not.toBeInTheDocument()
  expect(screen.getByText('Dzień siły')).toBeInTheDocument()
})

it('does not repeat the global workout start action in an empty exercise state', async () => {
  mocks.getUserExercises.mockResolvedValue([{
    id: 'custom-row',
    name: 'Wiosłowanie własne',
    category: 'back',
    equipment: 'cable',
    muscles: ['back'],
  }])
  mocks.getExerciseSessions.mockResolvedValue([])
  mocks.getExerciseRecord.mockResolvedValue(null)

  render(<ExerciseDetailPage />)

  expect(await screen.findByText(/Brak historii/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Rozpocznij trening' })).not.toBeInTheDocument()
  expect(mocks.navigate).not.toHaveBeenCalled()
})
