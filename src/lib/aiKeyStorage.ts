import { useAuthStore } from '../store/authStore'

const OPENROUTER_API_KEY_STORAGE = 'ironlog.openrouterApiKey'
const OPENROUTER_MODEL_STORAGE = 'ironlog.openrouterModel'

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function getOpenRouterApiKey(): string {
  if (!canUseStorage()) return ''
  const storageKey = getAccountKeyStorage()
  return storageKey ? window.localStorage.getItem(storageKey)?.trim() ?? '' : ''
}

function getAccountKeyStorage(): string | null {
  // Legacy keys have no owner, so never adopt one for the next account.
  window.localStorage.removeItem(OPENROUTER_API_KEY_STORAGE)
  const { user, loading } = useAuthStore.getState()
  return !loading && user && !user.isAnonymous ? `${OPENROUTER_API_KEY_STORAGE}:${user.uid}` : null
}

export function hasOpenRouterApiKey(): boolean {
  return getOpenRouterApiKey().length > 0
}

export function setOpenRouterApiKey(value: string): string {
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

export function clearOpenRouterApiKey() {
  if (!canUseStorage()) return
  const storageKey = getAccountKeyStorage()
  if (storageKey) window.localStorage.removeItem(storageKey)
}

export function getOpenRouterModel(): string {
  if (!canUseStorage()) return ''
  return window.localStorage.getItem(OPENROUTER_MODEL_STORAGE)?.trim() ?? ''
}

export function setOpenRouterModel(value: string): string {
  if (!canUseStorage()) return ''

  const normalized = value.trim()

  if (!normalized) {
    window.localStorage.removeItem(OPENROUTER_MODEL_STORAGE)
    return ''
  }

  window.localStorage.setItem(OPENROUTER_MODEL_STORAGE, normalized)
  return normalized
}

export function clearOpenRouterModel() {
  if (!canUseStorage()) return
  window.localStorage.removeItem(OPENROUTER_MODEL_STORAGE)
}
