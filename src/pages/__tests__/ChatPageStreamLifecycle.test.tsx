import { createElement, type ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { streamChatReply } from '../../lib/chatService'
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

interface PendingReply {
  options: Parameters<typeof streamChatReply>[0]
  resolve: (value: string) => void
  reject: (error: unknown) => void
}

const pendingReplies: PendingReply[] = []

function deferredReply(options: PendingReply['options']): Promise<string> {
  return new Promise((resolve, reject) => {
    pendingReplies.push({ options, resolve, reject })
  })
}

function reportFullContext(reply: PendingReply) {
  act(() => reply.options.onContext({ status: 'full', unavailableSources: [] }))
}

function rejectWithLateChunkOnAbort(options: PendingReply['options']): Promise<string> {
  return new Promise((resolve, reject) => {
    pendingReplies.push({ options, resolve, reject })
    options.signal.addEventListener('abort', () => {
      options.onChunk('Spóźniony tekst po unmount')
      reject(new DOMException('Komponent odmontowany.', 'AbortError'))
    }, { once: true })
  })
}

async function sendPrompt(prompt: string) {
  const composer = screen.getByRole('textbox', { name: 'Message AI Coach' })
  await waitFor(() => expect(composer).toBeEnabled())
  fireEvent.change(composer, {
    target: { value: prompt },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
}

describe('ChatPage stream lifecycle', () => {
  beforeEach(() => {
    pendingReplies.length = 0
    mocks.apiKey = 'sk-ant-test-key-longer-than-twenty-characters'
    mocks.fetchAvailableClaudeModels.mockReset()
    mocks.fetchAvailableClaudeModels.mockResolvedValue([
      { id: 'claude-test', label: 'Claude Test' },
    ])
    mocks.generateTrainingPlan.mockReset()
    mocks.streamChatReply.mockReset()
    mocks.streamChatReply.mockImplementation(deferredReply)
    mocks.navigate.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('aborts and invalidates a generation when Reset is pressed', async () => {
    render(<ChatPage />)
    await sendPrompt('Czy progresuję?')
    const first = pendingReplies[0]

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(first.options.signal).toBeInstanceOf(AbortSignal)
    expect(first.options.signal.aborted).toBe(true)

    await act(async () => {
      first.options.onChunk('Spóźniony tekst')
      first.resolve('Spóźniona response')
    })
    await waitFor(() => expect(screen.queryByText('Spóźniona response')).not.toBeInTheDocument())
    expect(screen.queryByText('Czy progresuję?')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows limited context during streaming and keeps it on the completed answer', async () => {
    render(<ChatPage />)
    await sendPrompt('Czy progresuję?')
    const pending = pendingReplies[0]

    act(() => {
      pending.options.onContext({ status: 'limited', unavailableSources: ['readiness', 'records'] })
      pending.options.onChunk('Response')
    })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Response was created with some data unavailable: readiness and records.',
    )

    await act(async () => pending.resolve('Response'))
    expect(screen.getByRole('status')).toHaveTextContent(
      'Response was created with some data unavailable: readiness and records.',
    )
  })

  it('shows limited context before the first stream chunk while keeping the thinking placeholder', async () => {
    render(<ChatPage />)
    await sendPrompt('Czy progresuję?')
    const pending = pendingReplies[0]

    act(() => {
      pending.options.onContext({ status: 'limited', unavailableSources: ['readiness', 'records'] })
    })

    expect(screen.getByText('Analyzing context...')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Response was created with some data unavailable: readiness and records.',
    )
  })

  it('keeps full context silent before the first stream chunk', async () => {
    render(<ChatPage />)
    await sendPrompt('Czy progresuję?')
    const pending = pendingReplies[0]

    reportFullContext(pending)

    expect(screen.getByText('Analyzing context...')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByText(/with some data unavailable/)).not.toBeInTheDocument()
  })

  it('ignores stale context metadata after Reset', async () => {
    render(<ChatPage />)
    await sendPrompt('Czy progresuję?')
    const pending = pendingReplies[0]
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

    act(() => pending.options.onContext({ status: 'limited', unavailableSources: ['records'] }))
    expect(screen.queryByText(/with some data unavailable/)).not.toBeInTheDocument()
  })

  it('keeps one question and exposes retry after a mode-change abort', async () => {
    render(<ChatPage />)
    await sendPrompt('Czy progresuję?')
    const first = pendingReplies[0]

    fireEvent.click(screen.getByRole('button', { name: /^Plan/ }))
    expect(first.options.signal).toBeInstanceOf(AbortSignal)
    expect(first.options.signal.aborted).toBe(true)
    act(() => first.options.onContext({ status: 'limited', unavailableSources: ['records'] }))
    fireEvent.click(screen.getByRole('button', { name: /Chat/ }))

    expect(screen.getByRole('status')).toHaveTextContent('Generation stopped')
    expect(screen.queryByText(/with some data unavailable/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry AI response' }))
    expect(screen.getAllByText('Czy progresuję?')).toHaveLength(1)
    expect(mocks.streamChatReply).toHaveBeenCalledTimes(2)
  })

  it('aborts the active generation on unmount', async () => {
    mocks.streamChatReply.mockImplementationOnce(rejectWithLateChunkOnAbort)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { unmount } = render(<ChatPage />)
    await sendPrompt('Czy progresuję?')
    const first = pendingReplies[0]

    unmount()
    await act(async () => Promise.resolve())

    expect(first.options.signal).toBeInstanceOf(AbortSignal)
    expect(first.options.signal.aborted).toBe(true)
    expect(screen.queryByText('Spóźniony tekst po unmount')).not.toBeInTheDocument()
    expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(/unmounted component|not wrapped in act/i)
  })

  it('does not retry an interrupted generation after the API key is removed', async () => {
    render(<ChatPage />)
    await sendPrompt('Czy progresuję?')

    fireEvent.click(screen.getByRole('button', { name: /^Plan/ }))
    mocks.apiKey = ''
    fireEvent.click(screen.getByRole('button', { name: /Chat/ }))
    expect(screen.getByRole('status')).toHaveTextContent('Generation stopped')

    fireEvent.click(screen.getByRole('button', { name: 'Retry AI response' }))

    expect(mocks.streamChatReply).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toHaveTextContent('Add a Claude API key to use AI Coach.')
    expect(screen.queryByRole('button', { name: 'Retry AI response' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Message AI Coach' })).not.toBeInTheDocument()
  })

  it('returns to the compact read-only state when the API key disappears', async () => {
    render(<ChatPage />)
    await sendPrompt('Czy progresuję?')

    fireEvent.click(screen.getByRole('button', { name: /^Plan/ }))
    mocks.apiKey = ''
    fireEvent.click(screen.getByRole('button', { name: /Chat/ }))
    expect(screen.getByRole('status')).toHaveTextContent('Generation stopped')

    fireEvent.click(screen.getByRole('button', { name: 'Retry AI response' }))

    expect(screen.getByLabelText('Chat with AI Coach')).toBeVisible()
    expect(within(screen.getByRole('log')).getByText('Czy progresuję?')).toBeVisible()
    expect(screen.getByText('Add a local Claude key')).toBeVisible()
    expect(screen.queryByRole('textbox', { name: 'Message AI Coach' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Analyze my last week of training.' }))
      .not.toBeInTheDocument()
    expect(screen.queryByLabelText('Your key', { selector: 'input' })).not.toBeInTheDocument()
    expect(mocks.streamChatReply).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Set up key' }))
    const key = screen.getByLabelText('Your key', { selector: 'input' })
    expect(key).toBeVisible()
    fireEvent.change(key, {
      target: { value: 'sk-ant-restored-test-key-longer-than-twenty-characters' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message AI Coach' })).toBeEnabled())
    expect(screen.queryByText('Add a Claude API key to use AI Coach.')).not.toBeInTheDocument()
  })

  it('clears failed-generation feedback when a new send finds no API key', async () => {
    render(<ChatPage />)
    await sendPrompt('Czy progresuję?')
    const first = pendingReplies[0]

    await act(async () => {
      first.reject(new Error('Awaria testowa.'))
    })
    expect(screen.getByRole('button', { name: 'Retry AI response' })).toBeEnabled()

    mocks.apiKey = ''
    fireEvent.change(screen.getByRole('textbox', { name: 'Message AI Coach' }), {
      target: { value: 'Nowe pytanie' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(mocks.streamChatReply).toHaveBeenCalledTimes(1)
    expect(within(screen.getByRole('log')).queryByText('Nowe pytanie')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Add a Claude API key to use AI Coach.')
    expect(screen.queryByText('Awaria testowa.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry AI response' })).not.toBeInTheDocument()
  })

  it('clears a partial chunk and exposes retry after a generation failure', async () => {
    render(<ChatPage />)
    await sendPrompt('Czy progresuję?')
    const first = pendingReplies[0]

    act(() => first.options.onChunk('Częściowa response'))
    expect(screen.getByText('Częściowa response')).toBeInTheDocument()

    await act(async () => {
      first.reject(new Error('Połączenie zostało zerwane.'))
    })

    expect(screen.queryByText('Częściowa response')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Połączenie zostało zerwane.')
    expect(screen.getByRole('button', { name: 'Retry AI response' })).toBeEnabled()
  })

  it('retries a failed answer without duplicating the question and commits success', async () => {
    render(<ChatPage />)
    await sendPrompt('Czy progresuję?')
    const first = pendingReplies[0]

    await act(async () => {
      first.reject(new Error('Awaria testowa.'))
    })
    fireEvent.click(screen.getByRole('button', { name: 'Retry AI response' }))
    const retry = pendingReplies[1]

    expect(screen.getAllByText('Czy progresuję?')).toHaveLength(1)
    expect(mocks.streamChatReply).toHaveBeenCalledTimes(2)

    reportFullContext(retry)
    await act(async () => {
      retry.options.onChunk('Pełna response')
      retry.resolve('Pełna response')
    })

    expect(screen.getAllByText('Pełna response')).toHaveLength(1)
    expect(screen.queryByText(/with some data unavailable/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Message AI Coach' })).toBeEnabled()
  })

  it('ignores stale rejection and finally while the retry generation is streaming', async () => {
    render(<ChatPage />)
    await sendPrompt('Czy progresuję?')
    const first = pendingReplies[0]

    fireEvent.click(screen.getByRole('button', { name: /^Plan/ }))
    fireEvent.click(screen.getByRole('button', { name: /Chat/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Retry AI response' }))
    const retry = pendingReplies[1]
    const composer = screen.getByRole('textbox', { name: 'Message AI Coach' })

    await act(async () => {
      first.options.onContext({ status: 'limited', unavailableSources: ['records'] })
      first.reject(new Error('Spóźniona awaria.'))
    })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('Spóźniona awaria.')).not.toBeInTheDocument()
    expect(screen.queryByText(/with some data unavailable/)).not.toBeInTheDocument()
    expect(composer).toBeDisabled()

    act(() => retry.options.onContext({ status: 'limited', unavailableSources: ['profile'] }))
    await act(async () => {
      retry.resolve('Aktualna response')
    })

    expect(screen.getByText('Aktualna response')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Response was created with some data unavailable: profile.',
    )
    expect(composer).toBeEnabled()
  })
})
