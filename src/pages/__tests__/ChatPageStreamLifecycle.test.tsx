import { createElement, type ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { streamChatReply } from '../../lib/chatService'
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

async function sendPrompt(prompt: string) {
  const composer = screen.getByRole('textbox', { name: 'Wiadomość do AI Coacha' })
  await waitFor(() => expect(composer).toBeEnabled())
  fireEvent.change(composer, {
    target: { value: prompt },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Wyślij' }))
}

describe('ChatPage stream lifecycle', () => {
  beforeEach(() => {
    pendingReplies.length = 0
    mocks.fetchAvailableClaudeModels.mockReset()
    mocks.fetchAvailableClaudeModels.mockResolvedValue([
      { id: 'claude-test', label: 'Claude Test' },
    ])
    mocks.generateTrainingPlan.mockReset()
    mocks.streamChatReply.mockReset()
    mocks.streamChatReply.mockImplementation(deferredReply)
    mocks.navigate.mockReset()
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
      first.resolve('Spóźniona odpowiedź')
    })
    await waitFor(() => expect(screen.queryByText('Spóźniona odpowiedź')).not.toBeInTheDocument())
    expect(screen.queryByText('Czy progresuję?')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('keeps one question and exposes retry after a mode-change abort', async () => {
    render(<ChatPage />)
    await sendPrompt('Czy progresuję?')
    const first = pendingReplies[0]

    fireEvent.click(screen.getByRole('button', { name: /^Plan/ }))
    expect(first.options.signal).toBeInstanceOf(AbortSignal)
    expect(first.options.signal.aborted).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Rozmowa/ }))

    expect(screen.getByRole('status')).toHaveTextContent('Generowanie przerwane')
    fireEvent.click(screen.getByRole('button', { name: 'Ponów odpowiedź AI' }))
    expect(screen.getAllByText('Czy progresuję?')).toHaveLength(1)
    expect(mocks.streamChatReply).toHaveBeenCalledTimes(2)
  })

  it('aborts the active generation on unmount', async () => {
    const { unmount } = render(<ChatPage />)
    await sendPrompt('Czy progresuję?')
    const first = pendingReplies[0]

    unmount()

    expect(first.options.signal).toBeInstanceOf(AbortSignal)
    expect(first.options.signal.aborted).toBe(true)
  })

  it('clears a partial chunk and exposes retry after a generation failure', async () => {
    render(<ChatPage />)
    await sendPrompt('Czy progresuję?')
    const first = pendingReplies[0]

    act(() => first.options.onChunk('Częściowa odpowiedź'))
    expect(screen.getByText('Częściowa odpowiedź')).toBeInTheDocument()

    await act(async () => {
      first.reject(new Error('Połączenie zostało zerwane.'))
    })

    expect(screen.queryByText('Częściowa odpowiedź')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Połączenie zostało zerwane.')
    expect(screen.getByRole('button', { name: 'Ponów odpowiedź AI' })).toBeEnabled()
  })

  it('retries a failed answer without duplicating the question and commits success', async () => {
    render(<ChatPage />)
    await sendPrompt('Czy progresuję?')
    const first = pendingReplies[0]

    await act(async () => {
      first.reject(new Error('Awaria testowa.'))
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ponów odpowiedź AI' }))
    const retry = pendingReplies[1]

    expect(screen.getAllByText('Czy progresuję?')).toHaveLength(1)
    expect(mocks.streamChatReply).toHaveBeenCalledTimes(2)

    await act(async () => {
      retry.options.onChunk('Pełna odpowiedź')
      retry.resolve('Pełna odpowiedź')
    })

    expect(screen.getAllByText('Pełna odpowiedź')).toHaveLength(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Wiadomość do AI Coacha' })).toBeEnabled()
  })

  it('ignores stale rejection and finally while the retry generation is streaming', async () => {
    render(<ChatPage />)
    await sendPrompt('Czy progresuję?')
    const first = pendingReplies[0]

    fireEvent.click(screen.getByRole('button', { name: /^Plan/ }))
    fireEvent.click(screen.getByRole('button', { name: /Rozmowa/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Ponów odpowiedź AI' }))
    const retry = pendingReplies[1]
    const composer = screen.getByRole('textbox', { name: 'Wiadomość do AI Coacha' })

    await act(async () => {
      first.reject(new Error('Spóźniona awaria.'))
    })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('Spóźniona awaria.')).not.toBeInTheDocument()
    expect(composer).toBeDisabled()

    await act(async () => {
      retry.resolve('Aktualna odpowiedź')
    })

    expect(screen.getByText('Aktualna odpowiedź')).toBeInTheDocument()
    expect(composer).toBeEnabled()
  })
})
