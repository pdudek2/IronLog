import { createElement, type ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TemplateEditorPage from '../TemplateEditorPage'

const mocks = vi.hoisted(() => ({
  getUserExercises: vi.fn(),
  navigate: vi.fn(),
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
  createTemplate: vi.fn(),
  getTemplate: vi.fn(),
  updateTemplate: vi.fn(),
}))
vi.mock('../../components/ExercisePicker', () => ({ default: () => null }))
vi.mock('../../components/ConfirmDialog', () => ({ default: () => null }))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mocks.navigate }
})
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_target, tag: string | symbol) => {
      if (typeof tag !== 'string') return undefined
      return ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => {
        delete props.initial
        delete props.animate
        delete props.transition
        delete props.whileTap
        return createElement(tag, props, children)
      }
    },
  }),
}))

describe('TemplateEditorPage accessibility', () => {
  beforeEach(() => {
    mocks.getUserExercises.mockReset()
    mocks.getUserExercises.mockResolvedValue([])
    mocks.navigate.mockReset()
  })

  it('labels the plan and day names and gives delete action full context', async () => {
    render(
      <MemoryRouter initialEntries={['/templates/new?draft=ai']}>
        <TemplateEditorPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('textbox', { name: 'Nazwa' })).toHaveValue('Upper / Lower')
    expect(screen.getByRole('textbox', { name: 'Dzień 1' })).toHaveValue('Upper A')
    expect(screen.getByRole('button', {
      name: 'Usuń ćwiczenie Bench Press z dnia Upper A',
    })).toBeInTheDocument()
  })
})
