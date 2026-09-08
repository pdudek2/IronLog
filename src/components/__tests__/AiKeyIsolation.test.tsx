import type { User } from 'firebase/auth'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AiKeyPanel from '../AiKeyPanel'
import ChatPage from '../../pages/ChatPage'
import { useAuthStore } from '../../store/authStore'
import { clearOpenRouterApiKey, getOpenRouterApiKey, hasOpenRouterApiKey, setOpenRouterApiKey } from '../../lib/aiKeyStorage'

const mocks = vi.hoisted(() => ({
  fetchAvailableOpenRouterModels: vi.fn(),
  streamChatReply: vi.fn(),
}))
vi.mock('../../lib/chatService', () => ({
  AiApiError: class AiApiError extends Error {},
  fetchAvailableOpenRouterModels: mocks.fetchAvailableOpenRouterModels,
  streamChatReply: mocks.streamChatReply,
  generateTrainingPlan: vi.fn(),
}))
vi.mock('../../lib/templateService', () => ({ createTemplate: vi.fn() }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))

const KEY_A = 'sk-ant-test-only-account-a-key'
const KEY_B = 'sk-ant-test-only-account-b-key'
function account(uid: string | null, loading = false, isAnonymous = false) {
  act(() => useAuthStore.setState({
    user: uid ? { uid, email: `${uid}@example.com`, isAnonymous } as User : null,
    loading,
  }))
}

beforeEach(() => {
  window.localStorage.clear()
  account('a')
  mocks.fetchAvailableOpenRouterModels.mockReset().mockResolvedValue([{ id: 'claude-test', label: 'OpenRouter Test' }])
  mocks.streamChatReply.mockReset().mockResolvedValue('Response')
})

describe('account-owned OpenRouter API keys', () => {
  it('never reuses an old Claude or direct OpenAI key for OpenRouter', () => {
    window.localStorage.setItem('ironlog.claudeApiKey:a', 'old-claude-key')
    window.localStorage.setItem('ironlog.openaiApiKey:a', 'old-openai-key')
    expect(getOpenRouterApiKey()).toBe('')
    setOpenRouterApiKey(KEY_A)
    expect(getOpenRouterApiKey()).toBe(KEY_A)
    expect(window.localStorage.getItem('ironlog.claudeApiKey:a')).toBe('old-claude-key')
  })
  it('retains each owner key through A → logout → B → A and clears only the current owner', () => {
    expect(setOpenRouterApiKey(` ${KEY_A} `)).toBe(KEY_A)
    account(null)
    expect(getOpenRouterApiKey()).toBe('')
    expect(setOpenRouterApiKey(KEY_B)).toBe('')
    clearOpenRouterApiKey()
    account('b')
    expect(hasOpenRouterApiKey()).toBe(false)
    setOpenRouterApiKey(KEY_B)
    account('a')
    expect(getOpenRouterApiKey()).toBe(KEY_A)
    clearOpenRouterApiKey()
    expect(hasOpenRouterApiKey()).toBe(false)
    account('b')
    expect(getOpenRouterApiKey()).toBe(KEY_B)
    setOpenRouterApiKey('  ')
    expect(hasOpenRouterApiKey()).toBe(false)
  })

  it.each(['pending', 'anonymous'] as const)('blocks reads, writes and deletion for %s auth', (state) => {
    setOpenRouterApiKey(KEY_A)
    account('a', state === 'pending', state === 'anonymous')
    expect(getOpenRouterApiKey()).toBe('')
    expect(setOpenRouterApiKey(KEY_B)).toBe('')
    clearOpenRouterApiKey()
    account('a')
    expect(getOpenRouterApiKey()).toBe(KEY_A)
  })

  it.each([null, 'a'])('drops the unowned legacy key with initial user %s instead of adopting it', (uid) => {
    account(uid, uid === null)
    window.localStorage.setItem('ironlog.openrouterApiKey', KEY_A)
    expect(getOpenRouterApiKey()).toBe('')
    expect(window.localStorage.getItem('ironlog.openrouterApiKey')).toBeNull()
    account('b')
    expect(hasOpenRouterApiKey()).toBe(false)
    account('a')
    expect(hasOpenRouterApiKey()).toBe(false)
  })

  it('resets panel draft, visibility and stale model responses on owner changes', async () => {
    let finishModels!: (models: Array<{ id: string; label: string }>) => void
    mocks.fetchAvailableOpenRouterModels.mockImplementationOnce(() => new Promise((resolve) => { finishModels = resolve }))
    setOpenRouterApiKey(KEY_A)
    const onConfiguredChange = vi.fn()
    render(<AiKeyPanel onConfiguredChange={onConfiguredChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show key' }))
    fireEvent.change(screen.getByLabelText('Your key'), { target: { value: 'unsaved-account-a-secret' } })
    account('b')
    expect(screen.getByLabelText('Your key')).toHaveValue('')
    expect(screen.getByLabelText('Your key')).toHaveAttribute('type', 'password')
    await act(async () => finishModels([{ id: 'stale-model', label: 'Stale model' }]))
    expect(onConfiguredChange).not.toHaveBeenCalled()
    expect(mocks.fetchAvailableOpenRouterModels).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByLabelText('Your key'), { target: { value: KEY_B } })
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))
    await waitFor(() => expect(mocks.fetchAvailableOpenRouterModels).toHaveBeenLastCalledWith(KEY_B))
    account(null)
    expect(screen.queryByLabelText('Your key')).not.toBeInTheDocument()
    account('a')
    expect(screen.getByLabelText('Your key')).toHaveValue(KEY_A)
    await waitFor(() => expect(mocks.fetchAvailableOpenRouterModels).toHaveBeenLastCalledWith(KEY_A))
  })

  it('gates Chat for B without a key and sends only B’s newly saved key', async () => {
    setOpenRouterApiKey(KEY_A)
    render(<ChatPage />)
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message AI Coach' })).toBeEnabled())
    account('b')
    expect(screen.queryByRole('textbox', { name: 'Message AI Coach' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Set up key' }))
    expect(screen.getByLabelText('Your key')).toHaveValue('')
    fireEvent.change(screen.getByLabelText('Your key'), { target: { value: KEY_B } })
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))
    const composer = await screen.findByRole('textbox', { name: 'Message AI Coach' })
    fireEvent.change(composer, { target: { value: 'Jak ćwiczyć?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(mocks.streamChatReply).toHaveBeenCalledWith(expect.objectContaining({ apiKey: KEY_B })))
    expect(mocks.streamChatReply).toHaveBeenCalledTimes(1)
    account('a')
    expect(getOpenRouterApiKey()).toBe(KEY_A)
  })
})
