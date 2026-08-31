import { createElement, type ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    days: [
      {
        name: 'Dzień A',
        exercises: [{
          exerciseId: 'squat',
          exerciseSource: 'global',
          name: 'Squat',
          sets: 3,
          targetReps: 5,
          targetWeight: 100,
        }],
      },
      {
        name: 'Dzień A2',
        exercises: [{
          exerciseId: 'bench-press',
          exerciseSource: 'global',
          name: 'Bench Press',
          sets: 3,
          targetReps: 8,
          targetWeight: 80,
        }],
      },
    ],
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
  deleteTemplate: vi.fn(),
  navigate: vi.fn(),
  requestTemplateLaunch: vi.fn(),
  confirmTemplateLaunch: vi.fn(),
  cancelTemplateLaunch: vi.fn(),
  retryTemplateLaunch: vi.fn(),
  dismissTemplateLaunchError: vi.fn(),
  launchState: {} as TemplateWorkoutLaunch,
  user: { uid: 'user-1' },
}))

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ user: mocks.user }),
}))
vi.mock('../../lib/templateService', () => ({
  getTemplates: mocks.getTemplates,
  deleteTemplate: mocks.deleteTemplate,
}))
vi.mock('../../hooks/useTemplateWorkoutLaunch', () => ({
  useTemplateWorkoutLaunch: () => mocks.launchState,
}))
vi.mock('../../components/ConfirmDialog', () => ({
  default: ({ onConfirm, onCancel }: { onConfirm: () => void, onCancel: () => void }) => (
    <div>
      <button type="button" onClick={onConfirm}>Potwierdź usunięcie</button>
      <button type="button" onClick={onCancel}>Anuluj usunięcie</button>
    </div>
  ),
}))
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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

describe('TemplatesPage launch actions', () => {
  beforeEach(() => {
    mocks.getTemplates.mockReset()
    mocks.getTemplates.mockResolvedValue(templates)
    mocks.deleteTemplate.mockReset()
    mocks.navigate.mockReset()
    mocks.requestTemplateLaunch.mockReset()
    mocks.confirmTemplateLaunch.mockReset()
    mocks.cancelTemplateLaunch.mockReset()
    mocks.retryTemplateLaunch.mockReset()
    mocks.dismissTemplateLaunchError.mockReset()
    mocks.launchState = idleLaunchState()
  })

  it('renders one complete canonical row and launch action for every day', async () => {
    await renderPage()

    const planACard = cardFor('Plan A')
    expect(within(planACard).getAllByRole('button', {
      name: /Uruchom dzień Dzień A2? z szablonu Plan A/,
    })).toHaveLength(2)
    expect(within(cardFor('Plan B')).getAllByRole('button', {
      name: 'Uruchom dzień Dzień B z szablonu Plan B',
    })).toHaveLength(1)
    expect(within(planACard).queryByRole('button', { name: 'Uruchom szablon Plan A' }))
      .not.toBeInTheDocument()

    const secondDayRow = within(planACard)
      .getByTestId('template-day-detail-template-a-1')
      .closest('.planner-day-row')
    expect(secondDayRow).toHaveTextContent('Dzień A2')
    expect(secondDayRow).toHaveTextContent('1 ćwiczenie')
    expect(secondDayRow).toHaveTextContent('Bench Press')
  })

  it('launches the selected day with its exact template, index and request key', async () => {
    await renderPage()

    fireEvent.click(within(cardFor('Plan A')).getByRole('button', {
      name: 'Uruchom dzień Dzień A2 z szablonu Plan A',
    }))

    expect(mocks.requestTemplateLaunch).toHaveBeenCalledTimes(1)
    expect(mocks.requestTemplateLaunch).toHaveBeenCalledWith(
      templates[0],
      1,
      'templates:template-a:detail:1',
    )
  })

  it('shows pending copy only on the exact day control', async () => {
    mocks.launchState = {
      ...idleLaunchState(),
      launchOperation: {
        target: {
          template: templates[0],
          dayIndex: 0,
          requestKey: 'templates:template-a:detail:0',
        },
        replaceExisting: false,
        status: 'pending',
        errorMessage: null,
      },
      launchingTemplateId: 'template-a',
    }

    await renderPage()

    const card = cardFor('Plan A')
    expect(within(card).getByTestId('template-day-detail-template-a-0'))
      .toHaveTextContent('Uruchamiam…')
    expect(within(card).getByTestId('template-day-detail-template-a-1'))
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
          requestKey: 'templates:template-a:detail:0',
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
    expect(within(card).getByTestId('template-day-detail-template-a-0'))
      .toHaveTextContent('Uruchamiam…')
    expect(within(card).getByTestId('template-day-detail-template-a-1'))
      .not.toHaveTextContent('Uruchamiam…')
    screen.getAllByRole('button', { name: /Uruchom dzień/ }).forEach((button) => {
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
    expect(within(matchingCard).getByTestId('template-day-detail-template-a-0'))
      .toHaveAttribute('aria-describedby', alert.id)
    expect(within(matchingCard).getByTestId('template-day-detail-template-a-1'))
      .toHaveAttribute('aria-describedby', alert.id)
    expect(within(otherCard).getByTestId('template-day-detail-template-b-0'))
      .not.toHaveAttribute('aria-describedby')

    fireEvent.click(within(alert).getByRole('button', { name: 'Spróbuj ponownie' }))
    fireEvent.click(within(alert).getByRole('button', { name: 'Zamknij' }))

    await waitFor(() => {
      expect(mocks.retryTemplateLaunch).toHaveBeenCalledTimes(1)
      expect(mocks.dismissTemplateLaunchError).toHaveBeenCalledTimes(1)
    })
  })

  it('keeps a failed deletion attached to its plan until retry succeeds', async () => {
    const firstDelete = deferred<void>()
    const retryDelete = deferred<void>()
    mocks.deleteTemplate
      .mockReturnValueOnce(firstDelete.promise)
      .mockReturnValueOnce(retryDelete.promise)

    await renderPage()

    fireEvent.click(within(cardFor('Plan A')).getByRole('button', { name: 'Usuń szablon Plan A' }))
    fireEvent.click(screen.getByRole('button', { name: 'Potwierdź usunięcie' }))

    const pending = within(cardFor('Plan A')).getByRole('status')
    expect(pending).toHaveTextContent('Usuwanie planu…')
    expect(cardFor('Plan A')).toBeInTheDocument()
    expect(within(cardFor('Plan B')).getByRole('button', { name: 'Edytuj szablon Plan B' }))
      .toBeEnabled()
    expect(mocks.deleteTemplate).toHaveBeenLastCalledWith('template-a')

    firstDelete.reject(new Error('offline'))
    await act(async () => {
      await firstDelete.promise.catch(() => undefined)
    })

    const alert = await within(cardFor('Plan A')).findByRole('alert')
    expect(alert).toHaveTextContent('Nie udało się usunąć planu.')
    expect(cardFor('Plan A')).toBeInTheDocument()

    fireEvent.click(within(alert).getByRole('button', { name: 'Spróbuj ponownie' }))

    expect(within(cardFor('Plan A')).getByRole('status')).toHaveTextContent('Usuwanie planu…')
    expect(mocks.deleteTemplate).toHaveBeenNthCalledWith(2, 'template-a')
    expect(cardFor('Plan A')).toBeInTheDocument()

    retryDelete.resolve()
    await act(async () => {
      await retryDelete.promise
    })

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Plan A' })).not.toBeInTheDocument()
    })
    expect(cardFor('Plan B')).toBeInTheDocument()
  })

  it('keeps the pending delete owner when another plan delete is attempted', async () => {
    const firstDelete = deferred<void>()
    mocks.deleteTemplate
      .mockReturnValueOnce(firstDelete.promise)
      .mockResolvedValueOnce(undefined)

    await renderPage()

    fireEvent.click(within(cardFor('Plan A')).getByRole('button', { name: 'Usuń szablon Plan A' }))
    fireEvent.click(screen.getByRole('button', { name: 'Potwierdź usunięcie' }))

    const planBDelete = within(cardFor('Plan B')).getByRole('button', { name: 'Usuń szablon Plan B' })
    fireEvent.click(planBDelete)
    const secondConfirm = screen.queryByRole('button', { name: 'Potwierdź usunięcie' })
    if (secondConfirm) fireEvent.click(secondConfirm)

    expect(mocks.deleteTemplate).toHaveBeenCalledTimes(1)
    expect(planBDelete).toBeDisabled()
    expect(within(cardFor('Plan B')).getByRole('button', { name: 'Edytuj szablon Plan B' }))
      .toBeEnabled()
    expect(within(cardFor('Plan A')).getByRole('status')).toHaveTextContent('Usuwanie planu…')
    expect(within(cardFor('Plan B')).queryByRole('status')).not.toBeInTheDocument()

    firstDelete.resolve()
    await act(async () => {
      await firstDelete.promise
    })

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Plan A' })).not.toBeInTheDocument()
    })
    const availablePlanBDelete = within(cardFor('Plan B')).getByRole('button', {
      name: 'Usuń szablon Plan B',
    })
    expect(availablePlanBDelete).toBeEnabled()

    fireEvent.click(availablePlanBDelete)
    fireEvent.click(screen.getByRole('button', { name: 'Potwierdź usunięcie' }))

    await waitFor(() => {
      expect(mocks.deleteTemplate).toHaveBeenNthCalledWith(2, 'template-b')
      expect(screen.queryByRole('heading', { name: 'Plan B' })).not.toBeInTheDocument()
    })
  })

  it('dismisses deletion feedback without mutating the plan', async () => {
    mocks.deleteTemplate.mockRejectedValueOnce(new Error('offline'))

    await renderPage()

    fireEvent.click(within(cardFor('Plan A')).getByRole('button', { name: 'Usuń szablon Plan A' }))
    fireEvent.click(screen.getByRole('button', { name: 'Potwierdź usunięcie' }))

    await act(async () => {
      await expect(mocks.deleteTemplate.mock.results[0]?.value).rejects.toThrow('offline')
    })
    const alert = await within(cardFor('Plan A')).findByRole('alert')
    fireEvent.click(within(alert).getByRole('button', { name: 'Zamknij' }))

    expect(within(cardFor('Plan A')).queryByRole('alert')).not.toBeInTheDocument()
    expect(cardFor('Plan A')).toBeInTheDocument()
    expect(mocks.deleteTemplate).toHaveBeenCalledTimes(1)
  })

  it('keeps an unresolved plan A delete error when plan B delete is attempted', async () => {
    mocks.deleteTemplate.mockRejectedValueOnce(new Error('offline'))

    await renderPage()

    fireEvent.click(within(cardFor('Plan A')).getByRole('button', { name: 'Usuń szablon Plan A' }))
    fireEvent.click(screen.getByRole('button', { name: 'Potwierdź usunięcie' }))

    await act(async () => {
      await expect(mocks.deleteTemplate.mock.results[0]?.value).rejects.toThrow('offline')
    })

    const alert = await within(cardFor('Plan A')).findByRole('alert')
    const planBDelete = within(cardFor('Plan B')).getByRole('button', { name: 'Usuń szablon Plan B' })

    expect(planBDelete).toBeDisabled()
    fireEvent.click(planBDelete)
    expect(screen.queryByRole('button', { name: 'Potwierdź usunięcie' })).not.toBeInTheDocument()
    expect(within(cardFor('Plan A')).getByRole('alert')).toBe(alert)
    expect(mocks.deleteTemplate).toHaveBeenCalledTimes(1)
  })

  it('shows structure immediately when the library has at most two plans', async () => {
    await renderPage()

    expect(within(cardFor('Plan A')).getByText('Squat')).toBeInTheDocument()
    expect(within(cardFor('Plan A')).queryByRole('button', { name: 'Struktura' }))
      .not.toBeInTheDocument()
  })

  it('keeps structure collapsible when the library has more than two plans', async () => {
    mocks.getTemplates.mockResolvedValue([
      ...templates,
      {
        ...templates[1],
        id: 'template-c',
        name: 'Plan C',
      },
    ])
    await renderPage()

    const card = cardFor('Plan A')
    expect(within(card).queryByText('Squat')).not.toBeInTheDocument()
    fireEvent.click(within(card).getByRole('button', { name: 'Struktura' }))
    await waitFor(() => {
      const expandedCard = cardFor('Plan A')
      expect(within(expandedCard).getByText('Squat')).toBeInTheDocument()
      expect(within(expandedCard).getByRole('button', { name: 'Zwiń' }))
        .toHaveAttribute('aria-expanded', 'true')
    })
  })
})
