import { createElement, type ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  const current = screen.queryByRole('combobox', { name: 'Claude model' })
  if (current) return current

  fireEvent.click(await screen.findByRole('button', { name: 'Settings' }))
  return screen.findByRole('combobox', { name: 'Claude model' })
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

    expect(screen.getByText('Add a local Claude key')).toBeVisible()
    const configure = screen.getByRole('button', { name: 'Set up key' })
    expect(configure).toBeVisible()
    expect(configure).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('textbox', { name: 'Message AI Coach' })).not.toBeInTheDocument()
    expect(screen.getByText('No conversation history')).toBeVisible()
    expect(screen.queryByText('Zacznij od pytania')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument()

    const controlledPanel = configure.getAttribute('aria-controls')
    expect(controlledPanel).toBeTruthy()
    fireEvent.click(configure)
    expect(screen.queryByText('Add a local Claude key')).not.toBeInTheDocument()
    expect(document.getElementById(controlledPanel!)).toBeVisible()
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    fireEvent.click(cancel)
    expect(screen.getByRole('button', { name: 'Set up key' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Add a local Claude key')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: /^Plan/ }))

    expect(screen.getByRole('heading', { name: 'Workout brief' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Generate plan' })).toBeDisabled()
  })

  it('returns to the compact read-only gate after clearing the expanded side-rail key', async () => {
    render(<ChatPage />)

    await openModelSelect()
    fireEvent.click(screen.getByRole('button', { name: 'Remove locally stored key' }))

    expect(screen.getByText('Add a local Claude key')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Set up key' })).toBeVisible()
    expect(screen.queryByLabelText('Your key', { selector: 'input' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Set up key' }))
    expect(screen.getByLabelText('Your key', { selector: 'input' })).toBeVisible()
  })

  it('keeps the configured side-rail details open after a successful key update', async () => {
    render(<ChatPage />)

    await openModelSelect()
    const key = screen.getByLabelText('Your key', { selector: 'input' })
    fireEvent.change(key, {
      target: { value: 'sk-ant-updated-test-key-longer-than-twenty-characters' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Update key' }))

    await waitFor(() => expect(mocks.fetchAvailableClaudeModels).toHaveBeenCalledTimes(2))

    expect(screen.getByLabelText('Your key', { selector: 'input' })).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Claude model' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Collapse' })).toBeVisible()
  })

  it('labels the model, exposes mode state, and links goal validation', async () => {
    render(<ChatPage />)

    expect(await openModelSelect()).toHaveValue('claude-test')

    const modeGroup = screen.getByRole('group', { name: 'AI Coach mode' })
    const chatMode = within(modeGroup).getByRole('button', { name: /Chat/ })
    const planMode = within(modeGroup).getByRole('button', { name: /^Plan/ })
    expect(chatMode).toHaveAttribute('aria-pressed', 'true')
    expect(planMode).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(planMode)
    expect(planMode).toHaveAttribute('aria-pressed', 'true')

    const goal = screen.getByRole('textbox', { name: 'Plan goal' })
    const generate = screen.getByRole('button', { name: 'Generate plan' })
    generate.focus()
    fireEvent.click(generate)

    expect(goal).toHaveFocus()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(goal.nextElementSibling).toBe(screen.getByRole('alert'))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a plan goal before starting the generator.')
    expect(goal).toHaveAttribute('aria-invalid', 'true')
    expect(goal).toHaveAccessibleDescription('Enter a plan goal before starting the generator.')
  })

  it('announces a catalog generation failure and lets the user retry', async () => {
    mocks.generateTrainingPlan
      .mockRejectedValueOnce(new Error(
        'Could not load the exercise library. Try again.',
      ))
      .mockResolvedValueOnce({
        plan: {
          name: 'Plan po ponowieniu',
          summary: 'Ready plan',
          days: [{ name: 'Day 1', exercises: [] }],
        },
        context: { status: 'full', unavailableSources: [] },
      })
    render(<ChatPage />)

    await openModelSelect()
    fireEvent.click(screen.getByRole('button', { name: /^Plan/ }))
    const goal = screen.getByRole('textbox', { name: 'Plan goal' })
    fireEvent.change(goal, { target: { value: 'Budowa siły' } })
    const generatePlan = screen.getByRole('button', { name: 'Generate plan' })
    fireEvent.click(generatePlan)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load the exercise library. Try again.',
    )
    expect(mocks.generateTrainingPlan).toHaveBeenCalledWith(expect.objectContaining({
      request: expect.objectContaining({ goal: 'Budowa siły' }),
    }))
    expect(goal).not.toHaveAttribute('aria-invalid')
    expect(goal).not.toHaveAttribute('aria-describedby')
    const retryGeneratePlan = screen.getByRole('button', { name: 'Generate plan' })
    expect(retryGeneratePlan).toBeEnabled()

    fireEvent.click(retryGeneratePlan)

    expect(await screen.findByRole('heading', { name: 'Plan po ponowieniu' })).toBeVisible()
    expect(mocks.generateTrainingPlan).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('retains the selected conversation workspace when a delayed plan completes', async () => {
    let finish!: (value: unknown) => void
    mocks.generateTrainingPlan.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    render(<ChatPage />)
    await openModelSelect()
    fireEvent.click(screen.getByRole('button', { name: /^Plan/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Plan goal' }), { target: { value: 'Strength' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate plan' }))
    fireEvent.click(screen.getByRole('button', { name: /^Chat/ }))
    await act(async () => finish({ plan: { name: 'Opóźniony plan', summary: 'Ready', days: [] }, context: { status: 'full', unavailableSources: [] } }))
    expect(screen.getByRole('textbox', { name: 'Message AI Coach' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Opóźniony plan' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Plan/ }))
    expect(screen.getByRole('heading', { name: 'Opóźniony plan' })).toBeVisible()
  })

  it('exposes the selected generated-plan day without relying on color', async () => {
    mocks.generateTrainingPlan.mockResolvedValueOnce({
      plan: {
        name: 'Plan testowy',
        summary: 'Dwa days',
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
    fireEvent.change(screen.getByRole('textbox', { name: 'Plan goal' }), {
      target: { value: 'Strength' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate plan' }))

    const dayGroup = await screen.findByRole('group', { name: 'Plan preview day' })
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
      plan: { name: 'Plan testowy', summary: 'Dwa days', days: [] },
      context: { status: 'limited', unavailableSources: ['profile', 'workouts'] },
    })
    render(<ChatPage />)

    await openModelSelect()
    fireEvent.click(screen.getByRole('button', { name: /^Plan/ }))
    const goal = screen.getByRole('textbox', { name: 'Plan goal' })
    fireEvent.change(goal, { target: { value: 'Strength' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate plan' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Plan was created with some data unavailable: profile and workouts.',
    )
    expect(goal).not.toHaveAttribute('aria-invalid')
  })

  it('announces and associates a retryable model-list failure without blocking chat', async () => {
    mocks.fetchAvailableClaudeModels.mockRejectedValueOnce(new Error('Could not load Claude models.'))
    render(<ChatPage />)

    const model = await openModelSelect()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not load Claude models.')
    expect(model).not.toHaveAttribute('aria-invalid')
    expect(model).toHaveAccessibleDescription('Could not load Claude models.')
    expect(screen.getByRole('textbox', { name: 'Message AI Coach' })).toBeEnabled()
  })

  it('keeps rejected key details open so the key can be corrected', async () => {
    const error = Object.assign(
      new Error('Claude API rejected your key. Check it and save it again.'),
      { code: 'invalid-key' },
    )
    mocks.fetchAvailableClaudeModels
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockResolvedValue([{ id: 'claude-test', label: 'Claude Test' }])
    render(<ChatPage />)

    const configure = await screen.findByRole('button', { name: 'Set up key' })
    expect(screen.getByText('Add a local Claude key')).toBeVisible()
    expect(screen.queryByRole('textbox', { name: 'Message AI Coach' })).not.toBeInTheDocument()

    fireEvent.click(configure)
    await waitFor(() => expect(mocks.fetchAvailableClaudeModels).toHaveBeenCalledTimes(2))
    const key = screen.getByLabelText('Your key', { selector: 'input' })
    expect(key).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('Claude API rejected your key.')

    fireEvent.change(key, {
      target: { value: 'sk-ant-corrected-test-key-longer-than-twenty-characters' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Update key' }))

    await waitFor(() => expect(mocks.fetchAvailableClaudeModels).toHaveBeenCalledTimes(3))
    expect(screen.getByRole('textbox', { name: 'Message AI Coach' })).toBeEnabled()
    expect(screen.queryByText('Add a local Claude key')).not.toBeInTheDocument()
  })

  it('clears the missing-key plan alert after successful key recovery', async () => {
    render(<ChatPage />)

    await openModelSelect()
    fireEvent.click(screen.getByRole('button', { name: /^Plan/ }))
    mocks.apiKey = ''
    fireEvent.click(screen.getByRole('button', { name: 'Generate plan' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Add a Claude API key to unlock the plan generator.')
    let key = screen.queryByLabelText('Your key', { selector: 'input' })
    if (!key) {
      fireEvent.click(screen.getByRole('button', { name: 'Set up key' }))
      key = screen.getByLabelText('Your key', { selector: 'input' })
    }
    fireEvent.change(key, {
      target: { value: 'sk-ant-restored-plan-key-longer-than-twenty-characters' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))

    await waitFor(() => expect(screen.queryByText('Add a local Claude key')).not.toBeInTheDocument())
    expect(screen.queryByText('Add a Claude API key to unlock the plan generator.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate plan' })).toBeEnabled()
  })

  it('keeps the API key name stable while announcing its field error', async () => {
    render(<ChatPage />)

    await openModelSelect()
    const key = screen.getByLabelText('Your key', { selector: 'input' })
    fireEvent.change(key, { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update key' }))

    expect(screen.getByRole('alert')).toHaveTextContent('This key looks too short.')
    expect(key).toHaveAccessibleName('Your key')
    expect(key).toHaveAttribute('aria-invalid', 'true')
    expect(key).toHaveAccessibleDescription(/This key looks too short/)
  })
})
