import { createElement, type ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChatPage from '../ChatPage'

const mocks = vi.hoisted(() => ({
  fetchCoachQuota: vi.fn(),
  fetchAvailableOpenRouterModels: vi.fn(),
  generateTrainingPlan: vi.fn(),
  streamChatReply: vi.fn(),
  apiKey: '',
}))

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ user: { uid: 'user-1', email: 'user@example.com' } }),
}))
vi.mock('../../lib/aiKeyStorage', () => ({
  clearOpenRouterApiKey: () => { mocks.apiKey = '' },
  clearOpenRouterModel: vi.fn(),
  getOpenRouterApiKey: () => mocks.apiKey,
  getOpenRouterModel: () => '',
  hasOpenRouterApiKey: () => Boolean(mocks.apiKey),
  setOpenRouterApiKey: (value: string) => { mocks.apiKey = value.trim(); return mocks.apiKey },
  setOpenRouterModel: (value: string) => value.trim(),
}))
vi.mock('../../lib/chatService', () => ({
  AiApiError: class AiApiError extends Error {
    code?: string
    resetAt?: string
    constructor(message: string, code?: string, resetAt?: string) {
      super(message)
      this.code = code
      this.resetAt = resetAt
    }
  },
  fetchAvailableOpenRouterModels: mocks.fetchAvailableOpenRouterModels,
  fetchCoachQuota: mocks.fetchCoachQuota,
  generateTrainingPlan: mocks.generateTrainingPlan,
  streamChatReply: mocks.streamChatReply,
}))
vi.mock('../../lib/templateService', () => ({ createTemplate: vi.fn() }))
vi.mock('../../lib/templateDraftStorage', () => ({ saveTemplateDraft: vi.fn() }))
vi.mock('../../lib/workoutService', () => ({ getRecentWorkouts: vi.fn(async () => []) }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }))
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_target, tag: string | symbol) => typeof tag !== 'string' ? undefined
      : ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => {
        delete props.initial
        delete props.animate
        delete props.transition
        return createElement(tag, props, children)
      },
  }),
}))

const RESET = '2026-11-17T00:00:00.000Z'
const quota = (used: number) => ({ used, limit: 20, resetAt: RESET, shared: true })

async function send(text: string) {
  const composer = await screen.findByRole('textbox', { name: 'Message AI Coach' })
  await waitFor(() => expect(composer).toBeEnabled())
  fireEvent.change(composer, { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
}

describe('ChatPage on the shared key', () => {
  beforeEach(() => {
    mocks.apiKey = ''
    mocks.fetchCoachQuota.mockReset().mockResolvedValue(quota(3))
    mocks.streamChatReply.mockReset()
    mocks.generateTrainingPlan.mockReset()
  })

  it('answers without a key, says where the data goes and counts down', async () => {
    mocks.streamChatReply.mockImplementation(async (options: { onQuota?: (usage: { used: number; limit: number }) => void }) => {
      options.onQuota?.({ used: 4, limit: 20 })
      return 'Tak.'
    })
    render(<ChatPage />)
    expect(screen.getByText(/sends your question, profile, check-ins, workouts and records to OpenRouter/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', '/privacy')
    expect(await screen.findByText('17 of 20 left today')).toBeVisible()
    await send('Czy progresuję?')
    await waitFor(() => expect(mocks.streamChatReply).toHaveBeenCalledWith(expect.objectContaining({ apiKey: '' })))
    expect(await screen.findByText('16 of 20 left today')).toBeVisible()
  })

  it('locks the composer with the reset time once the allowance is spent, without offering a retry', async () => {
    const { AiApiError } = await import('../../lib/chatService')
    mocks.streamChatReply.mockRejectedValue(new AiApiError("Today's Coach limit is used up.", 'daily-limit', RESET))
    mocks.fetchCoachQuota.mockResolvedValueOnce(quota(3)).mockResolvedValue(quota(20))
    render(<ChatPage />)
    await send('Czy progresuję?')
    const time = new Date(RESET).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    expect(await screen.findByRole('alert')).toHaveTextContent(`Today's Coach limit is used up. It resets at ${time}.`)
    expect(screen.getByRole('textbox', { name: 'Message AI Coach' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Retry AI response' })).not.toBeInTheDocument()
  })

  it('a refused plan with units left still lets the user chat, because the lock follows the server counter', async () => {
    const { AiApiError } = await import('../../lib/chatService')
    mocks.fetchCoachQuota.mockResolvedValueOnce(quota(12)).mockResolvedValue(quota(16))
    mocks.generateTrainingPlan.mockRejectedValue(new AiApiError("Today's Coach limit is used up.", 'daily-limit', RESET))
    render(<ChatPage />)
    expect(await screen.findByText('8 of 20 left today')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /Plan/ }))
    fireEvent.change(screen.getByLabelText('Plan goal'), { target: { value: 'Siła' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate plan' }))
    expect(await screen.findByText("A plan uses 5 of today's 20 Coach messages; 4 left.")).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /Chat/ }))
    expect(screen.getByRole('textbox', { name: 'Message AI Coach' })).toBeEnabled()
  })

  it('lifts a spent allowance by itself at the reset time', async () => {
    mocks.fetchCoachQuota
      .mockResolvedValueOnce({ ...quota(20), resetAt: new Date(Date.now() + 100).toISOString() })
      .mockResolvedValue(quota(0))
    render(<ChatPage />)
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message AI Coach' })).toBeDisabled())
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message AI Coach' })).toBeEnabled(), { timeout: 4_000 })
    expect(screen.getByText('20 of 20 left today')).toBeVisible()
  })

  it('keeps retry for the per-minute limit, which has no code', async () => {
    const { AiApiError } = await import('../../lib/chatService')
    mocks.streamChatReply.mockRejectedValue(new AiApiError('Too many requests. Wait a moment and try again.'))
    render(<ChatPage />)
    await send('Czy progresuję?')
    expect(await screen.findByRole('button', { name: 'Retry AI response' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Message AI Coach' })).toBeEnabled()
  })

  it('disables the plan when fewer than 5 units are left, while chat still works', async () => {
    mocks.fetchCoachQuota.mockResolvedValue(quota(17))
    render(<ChatPage />)
    expect(await screen.findByText('3 of 20 left today')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /Plan/ }))
    expect(screen.getByRole('button', { name: 'Generate plan' })).toBeDisabled()
    expect(screen.getByText("A plan uses 5 of today's 20 Coach messages; 3 left.")).toBeVisible()
  })

  it('offers only the own-key path when the server has no key', async () => {
    mocks.fetchCoachQuota.mockResolvedValue({ ...quota(0), shared: false })
    render(<ChatPage />)
    expect(await screen.findByText(/Coach is not available right now/)).toBeVisible()
    expect(screen.queryByRole('textbox', { name: 'Message AI Coach' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use your own OpenRouter key' })).toBeVisible()
  })

  it('drops the counter once the user saves their own key', async () => {
    mocks.fetchAvailableOpenRouterModels.mockResolvedValue([{ id: 'openai/gpt-5.6-luna', label: 'GPT-5.6 Luna' }])
    render(<ChatPage />)
    expect(await screen.findByText('17 of 20 left today')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Use your own OpenRouter key' }))
    fireEvent.change(screen.getByLabelText('Your key'), { target: { value: 'sk-or-own-key-long-enough-for-tests' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save key' })) })
    expect(await screen.findByText('Responses are billed to your OpenRouter API key.')).toBeVisible()
    expect(screen.queryByText('17 of 20 left today')).not.toBeInTheDocument()
  })
})
