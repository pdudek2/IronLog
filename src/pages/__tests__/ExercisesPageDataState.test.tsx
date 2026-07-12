import { createElement, type ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
