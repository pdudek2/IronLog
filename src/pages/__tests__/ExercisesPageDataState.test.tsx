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
  searchExercises: vi.fn(() => [{
    id: 'squat',
    name: 'Przysiad',
    category: 'legs',
    equipment: 'barbell',
    muscles: ['quads'],
  }]),
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

    expect(await screen.findByText('Could not load your exercises')).toBeInTheDocument()
    expect(screen.queryByText('None własnych exercises')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add pierwsze' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add custom' })).toBeDisabled()
    expect(screen.getByText('Przysiad')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(mocks.toastError).not.toHaveBeenCalled()
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
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Skos hantlami')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add custom' })).toBeEnabled()
    expect(mocks.getUserExercises).toHaveBeenCalledTimes(2)
  })

  it('keeps the destructive action in the edit dialog instead of the compact row', async () => {
    mocks.getUserExercises.mockResolvedValueOnce([customExercise])

    render(<ExercisesPage />)

    const edit = await screen.findByRole('button', { name: 'Edit exercise Skos hantlami' })
    expect(screen.queryByRole('button', { name: 'Remove exercise Skos hantlami' })).not.toBeInTheDocument()

    fireEvent.click(edit)
    const dialog = screen.getByRole('dialog', { name: 'Edit custom exercise' })
    expect(within(dialog).getByRole('button', { name: 'Remove exercise' })).toBeInTheDocument()
  })

  it('keeps one create action after a successful empty response', async () => {
    mocks.getUserExercises.mockResolvedValueOnce([])

    render(<ExercisesPage />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Add custom' })).toBeEnabled())
    expect(screen.queryByText('None własnych exercises')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add pierwsze' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add custom' })).toHaveLength(1)
    expect(screen.queryByLabelText('Summary biblioteki exercises')).not.toBeInTheDocument()

    const globalHeading = screen.getByRole('heading', { name: 'Shared library' })
    const globalSection = globalHeading.closest('section')
    expect(globalSection).not.toBeNull()
    expect(within(globalSection as HTMLElement).getByText('1')).toBeInTheDocument()
  })

  it('keeps commands and both catalogs inside one workbench width owner', async () => {
    mocks.getUserExercises.mockResolvedValueOnce([])

    render(<ExercisesPage />)

    const page = await screen.findByTestId('exercises-page')
    const workbench = page.closest('.workbench-page')
    expect(workbench).not.toBeNull()
    expect(workbench).toContainElement(screen.getByLabelText('Search exercises'))
    expect(workbench).toContainElement(screen.getByRole('heading', { name: 'Shared library' }))
  })

  it('exposes filter state and exactly one open action per exercise', async () => {
    mocks.getUserExercises.mockResolvedValueOnce([])
    render(<ExercisesPage />)

    const filterToggle = screen.getByRole('button', { name: 'Filters' })
    expect(filterToggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(filterToggle)
    expect(filterToggle).toHaveAttribute('aria-expanded', 'true')

    const muscleGroup = await screen.findByRole('group', { name: 'Exercise category' })
    const equipmentGroup = screen.getByRole('group', { name: 'Equipment' })
    const allMuscles = within(muscleGroup).getByRole('button', { name: 'All' })
    const chest = within(muscleGroup).getByRole('button', { name: 'Chest' })

    expect(allMuscles).toHaveAttribute('aria-pressed', 'true')
    expect(chest).toHaveAttribute('aria-pressed', 'false')
    expect(within(equipmentGroup).getByRole('button', { name: 'All' }))
      .toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(chest)
    expect(chest).toHaveAttribute('aria-pressed', 'true')
    expect(allMuscles).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(allMuscles)
    expect(screen.getAllByRole('button', { name: 'Open exercise Przysiad' })).toHaveLength(1)
  })

  it('announces only a field-specific name validation error and exposes muscle state', async () => {
    mocks.getUserExercises.mockResolvedValueOnce([])
    render(<ExercisesPage />)

    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Add custom' }),
    ).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Add custom' }))
    const dialog = screen.getByRole('dialog', { name: 'Add custom exercise' })
    const name = within(dialog).getByRole('textbox', { name: 'Name *' })
    const muscles = within(dialog).getByRole('group', { name: 'Muscle groups' })
    const chest = within(muscles).getByRole('button', { name: 'Chest' })

    expect(chest).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(chest)
    expect(chest).toHaveAttribute('aria-pressed', 'true')

    const submit = within(dialog).getByRole('button', { name: 'Add exercise' })
    submit.focus()
    fireEvent.click(submit)
    expect(name).toHaveFocus()
    expect(within(dialog).getAllByRole('alert')).toHaveLength(1)
    expect(name.nextElementSibling).toBe(within(dialog).getByRole('alert'))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Name must contain at least 2 characters.')
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveAccessibleDescription('Name must contain at least 2 characters.')
  })

  it('announces a create failure without marking the valid name field as invalid', async () => {
    mocks.getUserExercises.mockResolvedValueOnce([])
    mocks.createUserExercise.mockRejectedValueOnce(new Error('Nie udało się zapisać exercises.'))
    render(<ExercisesPage />)

    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Add custom' }),
    ).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Add custom' }))
    const dialog = screen.getByRole('dialog', { name: 'Add custom exercise' })
    const name = within(dialog).getByRole('textbox', { name: 'Name *' })
    fireEvent.change(name, { target: { value: 'Exercise testowe' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add exercise' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Nie udało się zapisać exercises.')
    expect(mocks.createUserExercise).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ name: 'Exercise testowe' }),
    )
    expect(name).not.toHaveAttribute('aria-invalid')
    expect(name).not.toHaveAttribute('aria-describedby')
  })

  it('keeps the create form open and announces a duplicate-name conflict', async () => {
    mocks.getUserExercises.mockResolvedValueOnce([])
    mocks.createUserExercise.mockRejectedValueOnce(
      new Error('Exercise o nazwie "Concurrent Curl" już istnieje.'),
    )
    render(<ExercisesPage />)

    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Add custom' }),
    ).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Add custom' }))
    const dialog = screen.getByRole('dialog', { name: 'Add custom exercise' })
    const name = within(dialog).getByRole('textbox', { name: 'Name *' })
    fireEvent.change(name, { target: { value: 'Concurrent Curl' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add exercise' }))

    expect(await within(dialog).findByRole('alert'))
      .toHaveTextContent('Exercise o nazwie "Concurrent Curl" już istnieje.')
    expect(within(dialog).getByRole('textbox', { name: 'Name *' }))
      .toHaveValue('Concurrent Curl')
  })

  it('exposes the selected category in the exercise picker', () => {
    render(
      <ExercisePicker
        onSelect={vi.fn()}
        onClose={vi.fn()}
        userExercisesState={{ status: 'success', data: [] }}
        onRetryUserExercises={vi.fn()}
      />,
    )

    const categoryGroup = screen.getByRole('group', { name: 'Exercise category' })
    const allCategories = within(categoryGroup).getByRole('button', { name: 'All' })
    const chest = within(categoryGroup).getByRole('button', { name: 'Chest' })

    expect(allCategories).toHaveAttribute('aria-pressed', 'true')
    expect(chest).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(chest)
    expect(chest).toHaveAttribute('aria-pressed', 'true')
    expect(allCategories).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps global picker results usable when the user catalog fails', () => {
    const onSelect = vi.fn()
    const onRetry = vi.fn()

    render(
      <ExercisePicker
        onSelect={onSelect}
        onClose={vi.fn()}
        userExercisesState={{ status: 'error', error: new Error('offline') }}
        onRetryUserExercises={onRetry}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not load your exercises. The shared library is still available.',
    )
    fireEvent.click(screen.getByRole('button', { name: /^Przysiad/ }))
    expect(onSelect).toHaveBeenCalledWith('squat', 'Przysiad', 'global')

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('does not apply a late create result to a different user resource', async () => {
    let resolveCreate: (exercise: typeof customExercise) => void = () => undefined
    const createRequest = new Promise<typeof customExercise>((resolve) => {
      resolveCreate = resolve
    })
    const userTwoExercise = { ...customExercise, id: 'user-two', name: 'Exercise B' }
    mocks.getUserExercises
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([userTwoExercise])
    mocks.createUserExercise.mockReturnValueOnce(createRequest)

    const view = render(<ExercisesPage />)
    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Add custom' }),
    ).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Add custom' }))
    fireEvent.change(await screen.findByPlaceholderText('E.g. Banded Pull-apart'), {
      target: { value: 'Exercise A' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add exercise' }))
    await waitFor(() => expect(mocks.createUserExercise).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ name: 'Exercise A' }),
    ))

    mocks.currentUser = { uid: 'user-2' }
    await act(async () => resolveCreate({ ...customExercise, id: 'user-one', name: 'Exercise A' }))
    expect(mocks.toastSuccess).not.toHaveBeenCalled()

    view.rerender(<ExercisesPage />)
    expect(await screen.findByText('Exercise B')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    expect(screen.getByText('Exercise B')).toBeInTheDocument()
    expect(screen.queryByText('Exercise A')).not.toBeInTheDocument()
  })
})
