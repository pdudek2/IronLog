import { createElement, type ReactNode } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TemplateWorkoutLaunch } from '../../hooks/useTemplateWorkoutLaunch'
import type { WorkoutTemplate } from '../../lib/templateService'
import TemplatesPage from '../TemplatesPage'

const templates: WorkoutTemplate[] = [
  {
    id: 'template-a',
    userId: 'user-1',
    name: 'Plan A',
    createdAt: 1,
    updatedAt: 2,
    days: [{
      name: 'Dzień A',
      exercises: [{
        exerciseId: 'squat',
        exerciseSource: 'global',
        name: 'Squat',
        sets: 3,
        targetReps: 5,
        targetWeight: 100,
      }],
    }],
  },
  {
    id: 'template-b',
    userId: 'user-1',
    name: 'Plan B',
    createdAt: 1,
    updatedAt: 2,
    days: [{ name: 'Dzień B', exercises: [] }],
  },
]

const mocks = vi.hoisted(() => ({
  getTemplates: vi.fn(),
  navigate: vi.fn(),
  requestTemplateLaunch: vi.fn(),
  confirmTemplateLaunch: vi.fn(),
  cancelTemplateLaunch: vi.fn(),
  retryTemplateLaunch: vi.fn(),
  dismissTemplateLaunchError: vi.fn(),
  launchState: {} as TemplateWorkoutLaunch,
}))

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ user: { uid: 'user-1' } }),
}))
vi.mock('../../lib/templateService', () => ({
  getTemplates: mocks.getTemplates,
  deleteTemplate: vi.fn(),
}))
vi.mock('../../hooks/useTemplateWorkoutLaunch', () => ({
  useTemplateWorkoutLaunch: () => mocks.launchState,
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

function idleLaunchState(): TemplateWorkoutLaunch {
  return {
    pendingLaunch: null,
    launchOperation: null,
    launchingTemplateId: null,
    requestTemplateLaunch: mocks.requestTemplateLaunch,
    confirmTemplateLaunch: mocks.confirmTemplateLaunch,
    cancelTemplateLaunch: mocks.cancelTemplateLaunch,
    retryTemplateLaunch: mocks.retryTemplateLaunch,
    dismissTemplateLaunchError: mocks.dismissTemplateLaunchError,
  }
}

async function renderPage() {
  render(<TemplatesPage />)
  await screen.findByRole('heading', { name: 'Plan A' })
}

function cardFor(name: string): HTMLElement {
  const card = screen.getByRole('heading', { name }).closest('article')
  if (!card) throw new Error(`Missing card for ${name}`)
  return card
}

describe('TemplatesPage launch actions', () => {
  beforeEach(() => {
    mocks.getTemplates.mockReset()
    mocks.getTemplates.mockResolvedValue(templates)
    mocks.navigate.mockReset()
    mocks.requestTemplateLaunch.mockReset()
    mocks.confirmTemplateLaunch.mockReset()
    mocks.cancelTemplateLaunch.mockReset()
    mocks.retryTemplateLaunch.mockReset()
    mocks.dismissTemplateLaunchError.mockReset()
    mocks.launchState = idleLaunchState()
  })

  it('shows pending copy only on the exact primary control', async () => {
    mocks.launchState = {
      ...idleLaunchState(),
      launchOperation: {
        target: {
          template: templates[0],
          dayIndex: 0,
          requestKey: 'templates:template-a:primary',
        },
        replaceExisting: false,
        status: 'pending',
        errorMessage: null,
      },
      launchingTemplateId: 'template-a',
    }

    await renderPage()

    const card = cardFor('Plan A')
    expect(within(card).getByRole('button', { name: 'Uruchom szablon Plan A' }))
      .toHaveTextContent('Uruchamiam…')
    expect(within(card).getByTestId('template-day-summary-template-a-0'))
      .not.toHaveTextContent('Uruchamiam…')
    expect(cardFor('Plan B')).not.toHaveTextContent('Uruchamiam…')
  })

  it('marks the card busy and disables every launch action while one launch is pending', async () => {
    mocks.launchState = {
      ...idleLaunchState(),
      launchOperation: {
        target: {
          template: templates[0],
          dayIndex: 0,
          requestKey: 'templates:template-a:summary:0',
        },
        replaceExisting: false,
        status: 'pending',
        errorMessage: null,
      },
      launchingTemplateId: 'template-a',
    }

    await renderPage()

    const card = cardFor('Plan A')
    expect(card).toHaveAttribute('aria-busy', 'true')
    expect(within(card).getByTestId('template-day-summary-template-a-0'))
      .toHaveTextContent('Uruchamiam…')
    expect(within(card).getByRole('button', { name: 'Uruchom szablon Plan A' }))
      .not.toHaveTextContent('Uruchamiam…')
    within(card).getAllByRole('button', { name: /Uruchom/ }).forEach((button) => {
      expect(button).toBeDisabled()
    })
  })

  it('renders the retryable error in the matching card and wires retry and dismiss', async () => {
    mocks.launchState = {
      ...idleLaunchState(),
      launchOperation: {
        target: {
          template: templates[0],
          dayIndex: 0,
          requestKey: 'templates:template-a:detail:0',
        },
        replaceExisting: true,
        status: 'error',
        errorMessage: 'Nie udało się uruchomić planu.',
      },
    }

    await renderPage()

    const matchingCard = cardFor('Plan A')
    const otherCard = cardFor('Plan B')
    const alert = within(matchingCard).getByRole('alert')
    expect(alert).toHaveTextContent('Nie udało się uruchomić planu.')
    expect(otherCard).not.toContainElement(alert)
    expect(matchingCard).toHaveAttribute('aria-describedby', alert.id)
    expect(within(matchingCard).getByRole('button', { name: 'Uruchom szablon Plan A' }))
      .toHaveAttribute('aria-describedby', alert.id)
    expect(within(matchingCard).getByTestId('template-day-summary-template-a-0'))
      .toHaveAttribute('aria-describedby', alert.id)
    expect(within(otherCard).getByRole('button', { name: 'Uruchom szablon Plan B' }))
      .not.toHaveAttribute('aria-describedby')

    fireEvent.click(within(alert).getByRole('button', { name: 'Spróbuj ponownie' }))
    fireEvent.click(within(alert).getByRole('button', { name: 'Zamknij' }))

    await waitFor(() => {
      expect(mocks.retryTemplateLaunch).toHaveBeenCalledTimes(1)
      expect(mocks.dismissTemplateLaunchError).toHaveBeenCalledTimes(1)
    })
  })
})
