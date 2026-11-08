import { createElement, type ReactNode } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TemplateEditorPage from '../TemplateEditorPage'
import { importPlanText } from '../../shared/planImport'

const mocks = vi.hoisted(() => ({
  createTemplate: vi.fn(),
  createUserExercise: vi.fn(),
}))

vi.mock('../../store/profileStore', () => ({ useProfileStore: () => ({ profile: { units: 'kg' } }) }))
vi.mock('../../store/authStore', () => {
  const state = { user: { uid: 'user-1' } }
  return { useAuthStore: Object.assign(() => state, { getState: () => state }) }
})
vi.mock('../../lib/userExercisesService', () => ({
  getUserExercises: async () => [],
  createUserExercise: mocks.createUserExercise,
}))
vi.mock('../../lib/templateService', () => ({
  createTemplate: mocks.createTemplate,
  getTemplate: vi.fn(),
  updateTemplate: vi.fn(),
}))
vi.mock('../../components/ExercisePicker', () => ({
  default: ({ open, title, suggestions = [], onSelect }: {
    open: boolean
    title?: string
    suggestions?: { exerciseId: string; exerciseSource: 'global' | 'user'; name: string }[]
    onSelect: (id: string, name: string, source: 'global' | 'user') => void
  }) => (open ? (
    <div role="dialog" aria-label={title}>
      {suggestions.map((item) => (
        <button key={item.exerciseId} type="button" onClick={() => onSelect(item.exerciseId, item.name, item.exerciseSource)}>{item.name}</button>
      ))}
    </div>
  ) : null),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }))
vi.mock('framer-motion', () => ({
  useReducedMotion: () => true,
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  motion: new Proxy({}, {
    get: (_target, tag: string | symbol) => {
      if (typeof tag !== 'string') return undefined
      return ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => {
        for (const key of ['initial', 'animate', 'exit', 'transition', 'whileTap']) delete props[key]
        return createElement(tag, props, children)
      }
    },
  }),
}))

const PASTED = `Upper / Lower

Upper
Wyciskanie sztangi na ławce 4x8 60 kg
Biceps 3x12 14 kg
Out odwodziciel 3x15 55 kg

Lower
Przysiad 4x6 90kg
3x12118 kg`

function renderPasted() {
  const pasted = importPlanText(PASTED)
  const router = createMemoryRouter([
    { path: '/templates/new', element: <TemplateEditorPage /> },
    { path: '/templates', element: <p>Plans list</p> },
  ], { initialEntries: [{ pathname: '/templates/new', state: { pasted } }] })
  render(<RouterProvider router={router} />)
  return router
}

describe('TemplateEditorPage with a pasted plan', () => {
  beforeEach(() => {
    mocks.createTemplate.mockReset()
    mocks.createTemplate.mockResolvedValue(undefined)
    mocks.createUserExercise.mockReset()
    mocks.createUserExercise.mockImplementation(async (_uid: string, input: { name: string }) => ({
      id: 'own-1', name: input.name, category: 'legs', equipment: 'machine', muscles: [],
    }))
  })

  it('blocks saving until every line is an exercise, then saves only plan fields', async () => {
    const router = renderPasted()

    expect(await screen.findByRole('textbox', { name: 'Name' })).toHaveValue('Upper / Lower')
    const skipped = screen.getByRole('region', { name: 'Lines not added' })
    expect(within(skipped).getByText('3x12118 kg')).toBeInTheDocument()
    expect(screen.getByTestId('template-save-dock')).toHaveTextContent('Choose 2 exercises to save')
    expect(screen.getByRole('button', { name: 'Save plan' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Choose exercise for Biceps' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Choose for “Biceps”' })).getByRole('button', { name: 'Barbell Curl' }))
    expect(screen.getByText('Biceps 3x12 14 kg')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Create “Out odwodziciel”' }))
    const form = screen.getByRole('dialog', { name: 'Add custom exercise' })
    expect(within(form).getByRole('textbox', { name: 'Name' })).toHaveValue('Out odwodziciel')
    fireEvent.click(within(form).getByRole('button', { name: 'Add exercise' }))
    expect(await screen.findByText('mine')).toBeInTheDocument()

    expect(screen.queryByText(/to save$/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save plan' }))
    await screen.findByText('Plans list')
    expect(router.state.historyAction).toBe('REPLACE')

    const input = mocks.createTemplate.mock.calls[0]?.[1]
    expect(input.name).toBe('Upper / Lower')
    expect(input.days.map((day: { name: string }) => day.name)).toEqual(['Upper', 'Lower'])
    expect(input.days[0].exercises).toEqual([
      { exerciseId: 'bench-press', exerciseSource: 'global', name: 'Bench Press', sets: 4, targetReps: 8, targetWeight: 60 },
      { exerciseId: 'barbell-curl', exerciseSource: 'global', name: 'Barbell Curl', sets: 3, targetReps: 12, targetWeight: 14 },
      { exerciseId: 'own-1', exerciseSource: 'user', name: 'Out odwodziciel', sets: 3, targetReps: 15, targetWeight: 55 },
    ])
    expect(mocks.createUserExercise).toHaveBeenCalledWith('user-1', expect.objectContaining({ name: 'Out odwodziciel' }))
  })
})
