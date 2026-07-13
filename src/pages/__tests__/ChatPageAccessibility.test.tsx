import { createElement, type ReactNode } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChatPage from '../ChatPage'

const mocks = vi.hoisted(() => ({
  fetchAvailableClaudeModels: vi.fn(),
  generateTrainingPlan: vi.fn(),
  streamChatReply: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ user: { uid: 'user-1', email: 'user@example.com' } }),
}))
vi.mock('../../lib/aiKeyStorage', () => ({
  clearClaudeApiKey: vi.fn(),
  clearClaudeModel: vi.fn(),
  getClaudeApiKey: () => 'sk-ant-test-key-longer-than-twenty-characters',
  getClaudeModel: () => 'claude-test',
  hasClaudeApiKey: () => true,
  setClaudeApiKey: (value: string) => value.trim(),
  setClaudeModel: (value: string) => value.trim(),
}))
vi.mock('../../lib/chatService', () => ({
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

describe('ChatPage accessibility', () => {
  beforeEach(() => {
    mocks.fetchAvailableClaudeModels.mockReset()
    mocks.fetchAvailableClaudeModels.mockResolvedValue([
      { id: 'claude-test', label: 'Claude Test' },
    ])
    mocks.generateTrainingPlan.mockReset()
    mocks.streamChatReply.mockReset()
    mocks.navigate.mockReset()
  })

  it('labels the model, exposes mode state, and links goal validation', async () => {
    render(<ChatPage />)

    expect(await screen.findByRole('combobox', { name: 'Model Claude' })).toHaveValue('claude-test')

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

  it('exposes the selected generated-plan day without relying on color', async () => {
    mocks.generateTrainingPlan.mockResolvedValueOnce({
      name: 'Plan testowy',
      summary: 'Dwa dni',
      days: [
        { name: 'Upper', exercises: [] },
        { name: 'Lower', exercises: [] },
      ],
    })
    render(<ChatPage />)

    await screen.findByRole('combobox', { name: 'Model Claude' })
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

  it('announces and associates a model-list failure', async () => {
    mocks.fetchAvailableClaudeModels.mockRejectedValueOnce(new Error('Nie udało się pobrać modeli Claude.'))
    render(<ChatPage />)

    const model = await screen.findByRole('combobox', { name: 'Model Claude' })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Nie udało się pobrać modeli Claude.')
    expect(model).toHaveAttribute('aria-invalid', 'true')
    expect(model).toHaveAccessibleDescription('Nie udało się pobrać modeli Claude.')
  })

  it('keeps the API key name stable while announcing its field error', async () => {
    render(<ChatPage />)

    await screen.findByRole('combobox', { name: 'Model Claude' })
    const key = screen.getByLabelText('Twój klucz', { selector: 'input' })
    fireEvent.change(key, { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: 'Zaktualizuj klucz' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Klucz wygląda na zbyt krótki.')
    expect(key).toHaveAccessibleName('Twój klucz')
    expect(key).toHaveAttribute('aria-invalid', 'true')
    expect(key).toHaveAccessibleDescription(/Klucz wygląda na zbyt krótki/)
  })
})
