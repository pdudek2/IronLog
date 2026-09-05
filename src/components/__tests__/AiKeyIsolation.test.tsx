import type { User } from 'firebase/auth'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AiKeyPanel from '../AiKeyPanel'
import ChatPage from '../../pages/ChatPage'
import { useAuthStore } from '../../store/authStore'
import { clearClaudeApiKey, getClaudeApiKey, hasClaudeApiKey, setClaudeApiKey } from '../../lib/aiKeyStorage'

const mocks = vi.hoisted(() => ({
  fetchAvailableClaudeModels: vi.fn(),
  streamChatReply: vi.fn(),
}))
vi.mock('../../lib/chatService', () => ({
  AiApiError: class AiApiError extends Error {},
  fetchAvailableClaudeModels: mocks.fetchAvailableClaudeModels,
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
  mocks.fetchAvailableClaudeModels.mockReset().mockResolvedValue([{ id: 'claude-test', label: 'Claude Test' }])
  mocks.streamChatReply.mockReset().mockResolvedValue('Odpowiedź')
})

describe('account-owned Claude API keys', () => {
  it('retains each owner key through A → logout → B → A and clears only the current owner', () => {
    expect(setClaudeApiKey(` ${KEY_A} `)).toBe(KEY_A)
    account(null)
    expect(getClaudeApiKey()).toBe('')
    expect(setClaudeApiKey(KEY_B)).toBe('')
    clearClaudeApiKey()
    account('b')
    expect(hasClaudeApiKey()).toBe(false)
    setClaudeApiKey(KEY_B)
    account('a')
    expect(getClaudeApiKey()).toBe(KEY_A)
    clearClaudeApiKey()
    expect(hasClaudeApiKey()).toBe(false)
    account('b')
    expect(getClaudeApiKey()).toBe(KEY_B)
    setClaudeApiKey('  ')
    expect(hasClaudeApiKey()).toBe(false)
  })

  it.each(['pending', 'anonymous'] as const)('blocks reads, writes and deletion for %s auth', (state) => {
    setClaudeApiKey(KEY_A)
    account('a', state === 'pending', state === 'anonymous')
    expect(getClaudeApiKey()).toBe('')
    expect(setClaudeApiKey(KEY_B)).toBe('')
    clearClaudeApiKey()
    account('a')
    expect(getClaudeApiKey()).toBe(KEY_A)
  })

  it.each([null, 'a'])('drops the unowned legacy key with initial user %s instead of adopting it', (uid) => {
    account(uid, uid === null)
    window.localStorage.setItem('ironlog.claudeApiKey', KEY_A)
    expect(getClaudeApiKey()).toBe('')
    expect(window.localStorage.getItem('ironlog.claudeApiKey')).toBeNull()
    account('b')
    expect(hasClaudeApiKey()).toBe(false)
    account('a')
    expect(hasClaudeApiKey()).toBe(false)
  })

  it('resets panel draft, visibility and stale model responses on owner changes', async () => {
    let finishModels!: (models: Array<{ id: string; label: string }>) => void
    mocks.fetchAvailableClaudeModels.mockImplementationOnce(() => new Promise((resolve) => { finishModels = resolve }))
    setClaudeApiKey(KEY_A)
    const onConfiguredChange = vi.fn()
    render(<AiKeyPanel onConfiguredChange={onConfiguredChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pokaż klucz' }))
    fireEvent.change(screen.getByLabelText('Twój klucz'), { target: { value: 'unsaved-account-a-secret' } })
    account('b')
    expect(screen.getByLabelText('Twój klucz')).toHaveValue('')
    expect(screen.getByLabelText('Twój klucz')).toHaveAttribute('type', 'password')
    await act(async () => finishModels([{ id: 'stale-model', label: 'Stale model' }]))
    expect(onConfiguredChange).not.toHaveBeenCalled()
    expect(mocks.fetchAvailableClaudeModels).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByLabelText('Twój klucz'), { target: { value: KEY_B } })
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz klucz' }))
    await waitFor(() => expect(mocks.fetchAvailableClaudeModels).toHaveBeenLastCalledWith(KEY_B))
    account(null)
    expect(screen.queryByLabelText('Twój klucz')).not.toBeInTheDocument()
    account('a')
    expect(screen.getByLabelText('Twój klucz')).toHaveValue(KEY_A)
    await waitFor(() => expect(mocks.fetchAvailableClaudeModels).toHaveBeenLastCalledWith(KEY_A))
  })

  it('gates Chat for B without a key and sends only B’s newly saved key', async () => {
    setClaudeApiKey(KEY_A)
    render(<ChatPage />)
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Wiadomość do AI Coacha' })).toBeEnabled())
    account('b')
    expect(screen.queryByRole('textbox', { name: 'Wiadomość do AI Coacha' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Skonfiguruj klucz' }))
    expect(screen.getByLabelText('Twój klucz')).toHaveValue('')
    fireEvent.change(screen.getByLabelText('Twój klucz'), { target: { value: KEY_B } })
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz klucz' }))
    const composer = await screen.findByRole('textbox', { name: 'Wiadomość do AI Coacha' })
    fireEvent.change(composer, { target: { value: 'Jak ćwiczyć?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Wyślij' }))
    await waitFor(() => expect(mocks.streamChatReply).toHaveBeenCalledWith(expect.objectContaining({ apiKey: KEY_B })))
    expect(mocks.streamChatReply).toHaveBeenCalledTimes(1)
    account('a')
    expect(getClaudeApiKey()).toBe(KEY_A)
  })
})
