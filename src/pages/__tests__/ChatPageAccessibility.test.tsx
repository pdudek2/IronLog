import { createElement, type ReactNode } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChatPage from '../ChatPage'

const mocks = vi.hoisted(() => ({
  fetchAvailableClaudeModels: vi.fn(),
  generateTrainingPlan: vi.fn(),
  streamChatReply: vi.fn(),
  navigate: vi.fn(),
  apiKey: 'sk-ant-test-key-longer-than-twenty-characters',
}))

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ user: { uid: 'user-1', email: 'user@example.com' } }),
}))
vi.mock('../../lib/aiKeyStorage', () => ({
  clearClaudeApiKey: () => {
    mocks.apiKey = ''
  },
  clearClaudeModel: vi.fn(),
  getClaudeApiKey: () => mocks.apiKey,
  getClaudeModel: () => 'claude-test',
  hasClaudeApiKey: () => Boolean(mocks.apiKey),
  setClaudeApiKey: (value: string) => {
    mocks.apiKey = value.trim()
    return mocks.apiKey
  },
  setClaudeModel: (value: string) => value.trim(),
}))
vi.mock('../../lib/chatService', () => ({
  AiApiError: class AiApiError extends Error {
    code?: string

    constructor(message: string, code?: string) {
      super(message)
      this.code = code
    }
  },
  fetchAvailableClaudeModels: mocks.fetchAvailableClaudeModels,
  generateTrainingPlan: mocks.generateTrainingPlan,
  streamChatReply: mocks.streamChatReply,
}))
vi.mock('../../lib/templateService', () => ({ createTemplate: vi.fn() }))
vi.mock('../../lib/templateDraftStorage', () => ({ saveTemplateDraft: vi.fn() }))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mocks.navigate }
})
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}))
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

async function openModelSelect() {
  const current = screen.queryByRole('combobox', { name: 'Model Claude' })
  if (current) return current

  fireEvent.click(await screen.findByRole('button', { name: 'Pokaż szczegóły' }))
  return screen.findByRole('combobox', { name: 'Model Claude' })
}

describe('ChatPage accessibility', () => {
  beforeEach(() => {
    mocks.apiKey = 'sk-ant-test-key-longer-than-twenty-characters'
    mocks.fetchAvailableClaudeModels.mockReset()
    mocks.fetchAvailableClaudeModels.mockResolvedValue([
      { id: 'claude-test', label: 'Claude Test' },
    ])
    mocks.generateTrainingPlan.mockReset()
    mocks.streamChatReply.mockReset()
    mocks.navigate.mockReset()
  })

  it('keeps plan inspection available while chat stays read-only without a key', () => {
    mocks.apiKey = ''
    render(<ChatPage />)

    expect(screen.getByLabelText('Status AI Coacha')).toHaveTextContent('Tryb tylko do odczytu')
    const configure = screen.getByRole('button', { name: 'Skonfiguruj klucz' })
    expect(configure).toBeVisible()
    expect(configure).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('textbox', { name: 'Wiadomość do AI Coacha' })).toBeDisabled()
    expect(screen.getByText('Brak historii rozmowy')).toBeVisible()
    expect(screen.queryByText('Zacznij od pytania')).not.toBeInTheDocument()

    fireEvent.click(configure)
    expect(configure).toHaveAttribute('aria-expanded', 'true')
    const controlledPanel = configure.getAttribute('aria-controls')
    expect(controlledPanel).toBeTruthy()
    expect(document.getElementById(controlledPanel!)).toBeVisible()
    fireEvent.click(configure)
    expect(configure).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(screen.getByRole('button', { name: /^Plan/ }))

    expect(screen.getByRole('heading', { name: 'Brief treningowy' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Generuj plan' })).toBeDisabled()
  })

  it('returns to the compact read-only gate after clearing the expanded side-rail key', async () => {
    render(<ChatPage />)

    await openModelSelect()
    fireEvent.click(screen.getByRole('button', { name: 'Usuń lokalnie zapisany klucz' }))

    expect(screen.getByLabelText('Status AI Coacha')).toHaveTextContent('Tryb tylko do odczytu')
    expect(screen.getByRole('button', { name: 'Skonfiguruj klucz' })).toBeVisible()
    expect(screen.queryByLabelText('Twój klucz', { selector: 'input' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Skonfiguruj klucz' }))
    expect(screen.getByLabelText('Twój klucz', { selector: 'input' })).toBeVisible()
  })

  it('keeps the configured side-rail details open after a successful key update', async () => {
    render(<ChatPage />)

    await openModelSelect()
    const key = screen.getByLabelText('Twój klucz', { selector: 'input' })
    fireEvent.change(key, {
      target: { value: 'sk-ant-updated-test-key-longer-than-twenty-characters' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Zaktualizuj klucz' }))

    await waitFor(() => expect(mocks.fetchAvailableClaudeModels).toHaveBeenCalledTimes(2))

    expect(screen.getByLabelText('Twój klucz', { selector: 'input' })).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Model Claude' })).toBeVisible()
  })

  it('labels the model, exposes mode state, and links goal validation', async () => {
    render(<ChatPage />)

    expect(await openModelSelect()).toHaveValue('claude-test')

    const modeGroup = screen.getByRole('group', { name: 'Tryb AI Coacha' })
    const chatMode = within(modeGroup).getByRole('button', { name: /Rozmowa/ })
    const planMode = within(modeGroup).getByRole('button', { name: /^Plan/ })
    expect(chatMode).toHaveAttribute('aria-pressed', 'true')
    expect(planMode).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(planMode)
    expect(planMode).toHaveAttribute('aria-pressed', 'true')

    const goal = screen.getByRole('textbox', { name: 'Cel planu' })
    fireEvent.click(screen.getByRole('button', { name: 'Generuj plan' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Podaj cel planu, zanim uruchomisz generator.')
    expect(goal).toHaveAttribute('aria-invalid', 'true')
    expect(goal).toHaveAccessibleDescription('Podaj cel planu, zanim uruchomisz generator.')
  })

  it('announces a catalog generation failure and lets the user retry', async () => {
    mocks.generateTrainingPlan
      .mockRejectedValueOnce(new Error(
        'Nie udało się załadować katalogu ćwiczeń. Spróbuj ponownie.',
      ))
      .mockResolvedValueOnce({
        plan: {
          name: 'Plan po ponowieniu',
          summary: 'Gotowy plan',
          days: [{ name: 'Dzień 1', exercises: [] }],
        },
        context: { status: 'full', unavailableSources: [] },
      })
    render(<ChatPage />)

    await openModelSelect()
    fireEvent.click(screen.getByRole('button', { name: /^Plan/ }))
    const goal = screen.getByRole('textbox', { name: 'Cel planu' })
    fireEvent.change(goal, { target: { value: 'Budowa siły' } })
    const generatePlan = screen.getByRole('button', { name: 'Generuj plan' })
    fireEvent.click(generatePlan)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nie udało się załadować katalogu ćwiczeń. Spróbuj ponownie.',
    )
    expect(mocks.generateTrainingPlan).toHaveBeenCalledWith(expect.objectContaining({
      request: expect.objectContaining({ goal: 'Budowa siły' }),
    }))
    expect(goal).not.toHaveAttribute('aria-invalid')
    expect(goal).not.toHaveAttribute('aria-describedby')
    const retryGeneratePlan = screen.getByRole('button', { name: 'Generuj plan' })
    expect(retryGeneratePlan).toBeEnabled()

    fireEvent.click(retryGeneratePlan)

    expect(await screen.findByRole('heading', { name: 'Plan po ponowieniu' })).toBeVisible()
    expect(mocks.generateTrainingPlan).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('exposes the selected generated-plan day without relying on color', async () => {
    mocks.generateTrainingPlan.mockResolvedValueOnce({
      plan: {
        name: 'Plan testowy',
        summary: 'Dwa dni',
        days: [
          { name: 'Upper', exercises: [] },
          { name: 'Lower', exercises: [] },
        ],
      },
      context: { status: 'full', unavailableSources: [] },
    })
    render(<ChatPage />)

    await openModelSelect()
    fireEvent.click(screen.getByRole('button', { name: /^Plan/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Cel planu' }), {
      target: { value: 'Siła' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generuj plan' }))

    const dayGroup = await screen.findByRole('group', { name: 'Dzień podglądu planu' })
    const upper = within(dayGroup).getByRole('button', { name: 'Upper' })
    const lower = within(dayGroup).getByRole('button', { name: 'Lower' })
    expect(upper).toHaveAttribute('aria-pressed', 'true')
    expect(lower).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(lower)
    expect(lower).toHaveAttribute('aria-pressed', 'true')
    expect(upper).toHaveAttribute('aria-pressed', 'false')
  })

  it('announces limited context on the generated plan without marking the form invalid', async () => {
    mocks.generateTrainingPlan.mockResolvedValueOnce({
      plan: { name: 'Plan testowy', summary: 'Dwa dni', days: [] },
      context: { status: 'limited', unavailableSources: ['profile', 'workouts'] },
    })
    render(<ChatPage />)

    await openModelSelect()
    fireEvent.click(screen.getByRole('button', { name: /^Plan/ }))
    const goal = screen.getByRole('textbox', { name: 'Cel planu' })
    fireEvent.change(goal, { target: { value: 'Siła' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generuj plan' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Plan powstał bez części danych: profilu i treningów.',
    )
    expect(goal).not.toHaveAttribute('aria-invalid')
  })

  it('announces and associates a retryable model-list failure without blocking chat', async () => {
    mocks.fetchAvailableClaudeModels.mockRejectedValueOnce(new Error('Nie udało się pobrać modeli Claude.'))
    render(<ChatPage />)

    const model = await openModelSelect()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Nie udało się pobrać modeli Claude.')
    expect(model).not.toHaveAttribute('aria-invalid')
    expect(model).toHaveAccessibleDescription('Nie udało się pobrać modeli Claude.')
    expect(screen.getByRole('textbox', { name: 'Wiadomość do AI Coacha' })).toBeEnabled()
  })

  it('keeps rejected key details open so the key can be corrected', async () => {
    const error = Object.assign(
      new Error('Claude API odrzuciło klucz. Sprawdź klucz i zapisz go ponownie.'),
      { code: 'invalid-key' },
    )
    mocks.fetchAvailableClaudeModels
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockResolvedValue([{ id: 'claude-test', label: 'Claude Test' }])
    render(<ChatPage />)

    const configure = await screen.findByRole('button', { name: 'Skonfiguruj klucz' })
    expect(screen.getByLabelText('Status AI Coacha')).toHaveTextContent('Tryb tylko do odczytu')
    expect(screen.getByRole('textbox', { name: 'Wiadomość do AI Coacha' })).toBeDisabled()

    fireEvent.click(configure)
    await waitFor(() => expect(mocks.fetchAvailableClaudeModels).toHaveBeenCalledTimes(2))
    const key = screen.getByLabelText('Twój klucz', { selector: 'input' })
    expect(key).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('Claude API odrzuciło klucz.')

    fireEvent.change(key, {
      target: { value: 'sk-ant-corrected-test-key-longer-than-twenty-characters' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Zaktualizuj klucz' }))

    await waitFor(() => expect(mocks.fetchAvailableClaudeModels).toHaveBeenCalledTimes(3))
    expect(screen.getByLabelText('Status AI Coacha')).toHaveTextContent('Klucz gotowy')
    expect(screen.getByRole('textbox', { name: 'Wiadomość do AI Coacha' })).toBeEnabled()
  })

  it('keeps the API key name stable while announcing its field error', async () => {
    render(<ChatPage />)

    await openModelSelect()
    const key = screen.getByLabelText('Twój klucz', { selector: 'input' })
    fireEvent.change(key, { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: 'Zaktualizuj klucz' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Klucz wygląda na zbyt krótki.')
    expect(key).toHaveAccessibleName('Twój klucz')
    expect(key).toHaveAttribute('aria-invalid', 'true')
    expect(key).toHaveAccessibleDescription(/Klucz wygląda na zbyt krótki/)
  })
})
