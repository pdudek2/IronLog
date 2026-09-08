import { createElement, type ReactNode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TemplatesPage from '../TemplatesPage'

const mocks = vi.hoisted(() => ({
  getTemplates: vi.fn(),
  navigate: vi.fn(),
  toastError: vi.fn(),
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
  return {
    ...actual,
    Link: ({ to, children, ...props }: { to: string; children?: ReactNode } & Record<string, unknown>) => (
      <a href={to} {...props}>{children}</a>
    ),
    useNavigate: () => mocks.navigate,
  }
})
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: mocks.toastError },
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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

describe('TemplatesPage data states', () => {
  beforeEach(() => {
    mocks.getTemplates.mockReset()
    mocks.navigate.mockReset()
    mocks.toastError.mockReset()
  })

  it('keeps error ahead of empty state and reaches empty only after retry succeeds', async () => {
    mocks.getTemplates
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([])

    render(<TemplatesPage />)

    expect(await screen.findByText('Could not load templates')).toBeInTheDocument()
    expect(screen.queryByText('You have no plans yet')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create your first plan' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('You have no plans yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Exercises' })).toHaveAttribute('href', '/exercises')
    expect(screen.getByRole('button', { name: 'Create your first plan' })).toBeInTheDocument()
    expect(screen.getByText('Upper / Lower · 4 days')).toBeInTheDocument()
    expect(mocks.getTemplates).toHaveBeenCalledTimes(2)
  })

  it('uses correct singular forms in the plan summary', async () => {
    mocks.getTemplates.mockResolvedValue([{
      id: 'template-1',
      userId: 'user-1',
      name: 'Plan testowy',
      createdAt: 1,
      updatedAt: 1,
      days: [{ name: 'Day 1', exercises: [] }],
    }])

    render(<TemplatesPage />)

    expect(await screen.findByLabelText('Plan summary')).toHaveTextContent('1 plan')
    expect(screen.getByRole('link', { name: 'Exercises' })).toHaveAttribute('href', '/exercises')
    expect(screen.getByLabelText('Plan summary')).not.toHaveTextContent('1 day')
  })

  it('ignores a templates failure that arrives after unmount', async () => {
    const request = deferred<never>()
    mocks.getTemplates.mockReturnValueOnce(request.promise)
    const { unmount } = render(<TemplatesPage />)

    unmount()
    await act(async () => request.reject(new Error('late templates failure')))

    expect(mocks.toastError).not.toHaveBeenCalled()
  })
})
