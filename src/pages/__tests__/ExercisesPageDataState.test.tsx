import { createElement, type ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ExercisePicker from '../../components/ExercisePicker'
import ExercisesPage from '../ExercisesPage'

const mocks = vi.hoisted(() => ({
  currentUser: { uid: 'user-1' },
  getUserExercises: vi.fn(),
  createUserExercise: vi.fn(),
  navigate: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('../../store/authStore', () => {
  const useAuthStore = Object.assign(
    () => ({ user: mocks.currentUser }),
    { getState: () => ({ user: mocks.currentUser }) },
  )
  return { useAuthStore }
})

vi.mock('../../data/exercises', () => ({
  searchExercises: vi.fn(() => []),
  exercises: [{
    id: 'squat',
    name: 'Przysiad',
    category: 'legs',
    equipment: 'barbell',
    muscles: ['quads'],
  }],
}))

vi.mock('../../lib/userExercisesService', () => ({
  getUserExercises: mocks.getUserExercises,
  createUserExercise: mocks.createUserExercise,
  updateUserExercise: vi.fn(),
  deleteUserExercise: vi.fn(),
}))

vi.mock('../../hooks/useDialogA11y', () => ({ useDialogA11y: vi.fn() }))
vi.mock('../../components/ConfirmDialog', () => ({ default: () => null }))
vi.mock('@number-flow/react', () => ({
  default: ({ value }: { value: number }) => <>{value}</>,
}))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mocks.navigate }
})
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

const customExercise = {
  id: 'incline-db',
  name: 'Skos hantlami',
  category: 'chest',
  equipment: 'dumbbell',
  muscles: ['chest'],
}

describe('ExercisesPage user library states', () => {
  beforeEach(() => {
    mocks.currentUser = { uid: 'user-1' }
    mocks.getUserExercises.mockReset()
    mocks.createUserExercise.mockReset()
    mocks.navigate.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
  })

  it('shows a persistent error, unknown counts and the usable global catalog', async () => {
    mocks.getUserExercises.mockRejectedValueOnce(new Error('offline'))

    render(<ExercisesPage />)

    expect(await screen.findByText('Nie udało się wczytać Twoich ćwiczeń')).toBeInTheDocument()
    expect(screen.queryByText('Brak własnych ćwiczeń')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Dodaj pierwsze' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dodaj własne' })).toBeDisabled()
    expect(screen.getByText('Przysiad')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(mocks.toastError).toHaveBeenCalledWith('Nie udało się wczytać Twoich ćwiczeń.')
  })

  it('does not show an error toast when a request rejects after unmount', async () => {
    let rejectRequest: (error: Error) => void = () => undefined
    const request = new Promise<never>((_resolve, reject) => {
      rejectRequest = reject
    })
    mocks.getUserExercises.mockReturnValueOnce(request)

    const { unmount } = render(<ExercisesPage />)
    unmount()
    rejectRequest(new Error('offline'))
    await request.catch(() => undefined)

    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('recovers from an error and replaces the unknown state with the full list', async () => {
    mocks.getUserExercises
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([customExercise])

    render(<ExercisesPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Spróbuj ponownie' }))

    expect(await screen.findByText('Skos hantlami')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dodaj własne' })).toBeEnabled()
    expect(mocks.getUserExercises).toHaveBeenCalledTimes(2)
  })

  it('shows the first-resource CTA only after a successful empty response', async () => {
    mocks.getUserExercises.mockResolvedValueOnce([])

    render(<ExercisesPage />)

    expect(await screen.findByText('Brak własnych ćwiczeń')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dodaj pierwsze' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dodaj własne' })).toBeEnabled()
  })

  it('exposes filter state and exactly one open action per exercise', async () => {
    mocks.getUserExercises.mockResolvedValueOnce([])
    render(<ExercisesPage />)

    const muscleGroup = await screen.findByRole('group', { name: 'Partia' })
    const equipmentGroup = screen.getByRole('group', { name: 'Sprzęt' })
    const allMuscles = within(muscleGroup).getByRole('button', { name: 'Wszystkie' })
    const chest = within(muscleGroup).getByRole('button', { name: 'Klatka' })

    expect(allMuscles).toHaveAttribute('aria-pressed', 'true')
    expect(chest).toHaveAttribute('aria-pressed', 'false')
    expect(within(equipmentGroup).getByRole('button', { name: 'Wszystkie' }))
      .toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(chest)
    expect(chest).toHaveAttribute('aria-pressed', 'true')
    expect(allMuscles).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(allMuscles)
    expect(screen.getAllByRole('button', { name: 'Otwórz ćwiczenie Przysiad' })).toHaveLength(1)
  })

  it('announces only a field-specific name validation error and exposes muscle state', async () => {
    mocks.getUserExercises.mockResolvedValueOnce([])
    render(<ExercisesPage />)

    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Dodaj własne' }),
    ).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj własne' }))
    const dialog = screen.getByRole('dialog', { name: 'Dodaj własne ćwiczenie' })
    const name = within(dialog).getByRole('textbox', { name: 'Nazwa *' })
    const muscles = within(dialog).getByRole('group', { name: 'Partie mięśniowe' })
    const chest = within(muscles).getByRole('button', { name: 'Klatka' })

    expect(chest).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(chest)
    expect(chest).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Dodaj ćwiczenie' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Nazwa musi mieć co najmniej 2 znaki.')
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveAccessibleDescription('Nazwa musi mieć co najmniej 2 znaki.')
  })

  it('announces a create failure without marking the valid name field as invalid', async () => {
    mocks.getUserExercises.mockResolvedValueOnce([])
    mocks.createUserExercise.mockRejectedValueOnce(new Error('Nie udało się zapisać ćwiczenia.'))
    render(<ExercisesPage />)

    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Dodaj własne' }),
    ).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj własne' }))
    const dialog = screen.getByRole('dialog', { name: 'Dodaj własne ćwiczenie' })
    const name = within(dialog).getByRole('textbox', { name: 'Nazwa *' })
    fireEvent.change(name, { target: { value: 'Ćwiczenie testowe' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dodaj ćwiczenie' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Nie udało się zapisać ćwiczenia.')
    expect(mocks.createUserExercise).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ name: 'Ćwiczenie testowe' }),
    )
    expect(name).not.toHaveAttribute('aria-invalid')
    expect(name).not.toHaveAttribute('aria-describedby')
  })

  it('keeps the create form open and announces a duplicate-name conflict', async () => {
    mocks.getUserExercises.mockResolvedValueOnce([])
    mocks.createUserExercise.mockRejectedValueOnce(
      new Error('Ćwiczenie o nazwie "Concurrent Curl" już istnieje.'),
    )
    render(<ExercisesPage />)

    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Dodaj własne' }),
    ).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj własne' }))
    const dialog = screen.getByRole('dialog', { name: 'Dodaj własne ćwiczenie' })
    const name = within(dialog).getByRole('textbox', { name: 'Nazwa *' })
    fireEvent.change(name, { target: { value: 'Concurrent Curl' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dodaj ćwiczenie' }))

    expect(await within(dialog).findByRole('alert'))
      .toHaveTextContent('Ćwiczenie o nazwie "Concurrent Curl" już istnieje.')
    expect(within(dialog).getByRole('textbox', { name: 'Nazwa *' }))
      .toHaveValue('Concurrent Curl')
  })

  it('exposes the selected category in the exercise picker', () => {
    render(<ExercisePicker onSelect={vi.fn()} onClose={vi.fn()} />)

    const categoryGroup = screen.getByRole('group', { name: 'Kategoria ćwiczenia' })
    const allCategories = within(categoryGroup).getByRole('button', { name: 'Wszystkie' })
    const chest = within(categoryGroup).getByRole('button', { name: 'Klatka' })

    expect(allCategories).toHaveAttribute('aria-pressed', 'true')
    expect(chest).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(chest)
    expect(chest).toHaveAttribute('aria-pressed', 'true')
    expect(allCategories).toHaveAttribute('aria-pressed', 'false')
  })

  it('does not apply a late create result to a different user resource', async () => {
    let resolveCreate: (exercise: typeof customExercise) => void = () => undefined
    const createRequest = new Promise<typeof customExercise>((resolve) => {
      resolveCreate = resolve
    })
    const userTwoExercise = { ...customExercise, id: 'user-two', name: 'Ćwiczenie B' }
    mocks.getUserExercises
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([userTwoExercise])
    mocks.createUserExercise.mockReturnValueOnce(createRequest)

    const view = render(<ExercisesPage />)
    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Dodaj własne' }),
    ).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj własne' }))
    fireEvent.change(await screen.findByPlaceholderText('np. Banded Pull-apart'), {
      target: { value: 'Ćwiczenie A' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj ćwiczenie' }))
    await waitFor(() => expect(mocks.createUserExercise).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ name: 'Ćwiczenie A' }),
    ))

    mocks.currentUser = { uid: 'user-2' }
    await act(async () => resolveCreate({ ...customExercise, id: 'user-one', name: 'Ćwiczenie A' }))
    expect(mocks.toastSuccess).not.toHaveBeenCalled()

    view.rerender(<ExercisesPage />)
    expect(await screen.findByText('Ćwiczenie B')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    expect(screen.getByText('Ćwiczenie B')).toBeInTheDocument()
    expect(screen.queryByText('Ćwiczenie A')).not.toBeInTheDocument()
  })
})
