import { useAuthStore } from '../store/authStore'

const CLAUDE_API_KEY_STORAGE = 'ironlog.claudeApiKey'
const CLAUDE_MODEL_STORAGE = 'ironlog.claudeModel'

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function getClaudeApiKey(): string {
  if (!canUseStorage()) return ''
  const storageKey = getAccountKeyStorage()
  return storageKey ? window.localStorage.getItem(storageKey)?.trim() ?? '' : ''
}

function getAccountKeyStorage(): string | null {
  // Legacy keys have no owner, so never adopt one for the next account.
  window.localStorage.removeItem(CLAUDE_API_KEY_STORAGE)
  const { user, loading } = useAuthStore.getState()
  return !loading && user && !user.isAnonymous ? `${CLAUDE_API_KEY_STORAGE}:${user.uid}` : null
}

export function hasClaudeApiKey(): boolean {
  return getClaudeApiKey().length > 0
}

export function setClaudeApiKey(value: string): string {
  if (!canUseStorage()) return ''
  const storageKey = getAccountKeyStorage()
  if (!storageKey) return ''

  const normalized = value.trim()

  if (!normalized) {
    window.localStorage.removeItem(storageKey)
    return ''
  }

  window.localStorage.setItem(storageKey, normalized)
  return normalized
}

export function clearClaudeApiKey() {
  if (!canUseStorage()) return
  const storageKey = getAccountKeyStorage()
  if (storageKey) window.localStorage.removeItem(storageKey)
}

export function getClaudeModel(): string {
  if (!canUseStorage()) return ''
  return window.localStorage.getItem(CLAUDE_MODEL_STORAGE)?.trim() ?? ''
}

export function setClaudeModel(value: string): string {
  if (!canUseStorage()) return ''

  const normalized = value.trim()

  if (!normalized) {
    window.localStorage.removeItem(CLAUDE_MODEL_STORAGE)
    return ''
  }

  window.localStorage.setItem(CLAUDE_MODEL_STORAGE, normalized)
  return normalized
}

export function clearClaudeModel() {
  if (!canUseStorage()) return
  window.localStorage.removeItem(CLAUDE_MODEL_STORAGE)
}
