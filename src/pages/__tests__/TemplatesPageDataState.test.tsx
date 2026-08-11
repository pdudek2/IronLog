import { createElement, type ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TemplatesPage from '../TemplatesPage'

const mocks = vi.hoisted(() => ({
  getTemplates: vi.fn(),
  navigate: vi.fn(),
  user: { uid: 'user-1' },
}))

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ user: mocks.user }),
}))
vi.mock('../../lib/templateService', () => ({
  getTemplates: mocks.getTemplates,
  deleteTemplate: vi.fn(),
}))
vi.mock('../../hooks/useTemplateWorkoutLaunch', () => ({
  useTemplateWorkoutLaunch: () => ({
    pendingLaunch: null,
    launchOperation: null,
    launchingTemplateId: null,
    requestTemplateLaunch: vi.fn(),
    confirmTemplateLaunch: vi.fn(),
    cancelTemplateLaunch: vi.fn(),
    retryTemplateLaunch: vi.fn(),
    dismissTemplateLaunchError: vi.fn(),
  }),
}))
vi.mock('../../components/ConfirmDialog', () => ({ default: () => null }))
vi.mock('../../components/TemplateLaunchConfirmDialog', () => ({ default: () => null }))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mocks.navigate }
})
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
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

describe('TemplatesPage data states', () => {
  beforeEach(() => {
    mocks.getTemplates.mockReset()
    mocks.navigate.mockReset()
  })

  it('keeps error ahead of empty state and reaches empty only after retry succeeds', async () => {
    mocks.getTemplates
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([])

    render(<TemplatesPage />)

    expect(await screen.findByText('Nie udało się pobrać szablonów')).toBeInTheDocument()
    expect(screen.queryByText('Nie masz jeszcze planu')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Utwórz pierwszy plan' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))

    expect(await screen.findByText('Nie masz jeszcze planu')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Utwórz pierwszy plan' })).toBeInTheDocument()
    expect(screen.getByText('Upper / Lower · 4 dni')).toBeInTheDocument()
    expect(mocks.getTemplates).toHaveBeenCalledTimes(2)
  })

  it('uses correct singular forms in the plan summary', async () => {
    mocks.getTemplates.mockResolvedValue([{
      id: 'template-1',
      userId: 'user-1',
      name: 'Plan testowy',
      createdAt: 1,
      updatedAt: 1,
      days: [{ name: 'Dzień 1', exercises: [] }],
    }])

    render(<TemplatesPage />)

    expect(await screen.findByLabelText('Podsumowanie planów')).toHaveTextContent('1 plan')
    expect(screen.getByLabelText('Podsumowanie planów')).toHaveTextContent('1 dzień')
  })
})
