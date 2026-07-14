import { createElement, type ReactNode } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TemplateEditorPage from '../TemplateEditorPage'

const mocks = vi.hoisted(() => ({
  createTemplate: vi.fn(),
  getUserExercises: vi.fn(),
}))

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ user: { uid: 'user-1' } }),
}))
vi.mock('../../lib/userExercisesService', () => ({
  getUserExercises: mocks.getUserExercises,
}))
vi.mock('../../lib/templateDraftStorage', () => ({
  readTemplateDraft: () => ({
    name: 'Upper / Lower',
    days: [{
      name: 'Upper A',
      exercises: [{
        exerciseId: 'bench-press',
        exerciseSource: 'global',
        name: 'Bench Press',
        sets: 4,
        targetReps: 8,
        targetWeight: 60,
      }],
    }],
  }),
  clearTemplateDraft: vi.fn(),
}))
vi.mock('../../lib/templateService', () => ({
  createTemplate: mocks.createTemplate,
  getTemplate: vi.fn(),
  updateTemplate: vi.fn(),
}))
vi.mock('../../components/ExercisePicker', () => ({ default: () => null }))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
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

function renderEditor() {
  const router = createMemoryRouter([
    { path: '/templates/new', element: <TemplateEditorPage /> },
    { path: '/templates', element: <p>Lista planów</p> },
  ], { initialEntries: ['/templates/new?draft=ai'] })

  render(<RouterProvider router={router} />)
}

describe('TemplateEditorPage accessibility', () => {
  beforeEach(() => {
    mocks.createTemplate.mockReset()
    mocks.createTemplate.mockResolvedValue(undefined)
    mocks.getUserExercises.mockReset()
    mocks.getUserExercises.mockResolvedValue([])
  })

  it('labels the plan and day names and gives delete action full context', async () => {
    renderEditor()

    expect(await screen.findByRole('textbox', { name: 'Nazwa' })).toHaveValue('Upper / Lower')
    expect(screen.getByRole('textbox', { name: 'Dzień 1' })).toHaveValue('Upper A')
    expect(screen.getByRole('button', {
      name: 'Usuń ćwiczenie Bench Press z dnia Upper A',
    })).toBeInTheDocument()
  })

  it('treats an imported AI draft as unsaved', async () => {
    renderEditor()

    fireEvent.click(await screen.findByRole('button', { name: 'Wróć' }))

    expect(await screen.findByRole('dialog', { name: 'Opuścić edytor?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Opuść bez zapisu' })).toBeEnabled()
  })

  it('does not allow leaving while template save is pending', async () => {
    let resolveSave!: () => void
    mocks.createTemplate.mockReturnValue(new Promise((resolve) => { resolveSave = () => resolve(undefined) }))
    renderEditor()

    fireEvent.change(await screen.findByRole('textbox', { name: 'Nazwa' }), {
      target: { value: 'Upper / Lower zmieniony' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz szablon' }))
    fireEvent.click(screen.getByRole('button', { name: 'Wróć' }))

    const dialog = await screen.findByRole('dialog', { name: 'Zapis w toku' })
    expect(within(dialog).getByRole('button', { name: 'Zapisuję...' })).toBeDisabled()

    resolveSave()
    expect(await screen.findByText('Lista planów')).toBeInTheDocument()
  })

  it('keeps the draft dirty and retryable after a failed save', async () => {
    mocks.createTemplate.mockRejectedValueOnce(new Error('write failed'))
    renderEditor()

    const save = await screen.findByRole('button', { name: 'Zapisz szablon' })
    fireEvent.click(save)
    await waitFor(() => expect(save).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Wróć' }))

    expect(await screen.findByRole('dialog', { name: 'Opuścić edytor?' })).toBeInTheDocument()
  })
})
