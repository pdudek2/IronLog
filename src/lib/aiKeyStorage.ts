const CLAUDE_API_KEY_STORAGE = 'ironlog.claudeApiKey'
const CLAUDE_MODEL_STORAGE = 'ironlog.claudeModel'

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function getClaudeApiKey(): string {
  if (!canUseStorage()) return ''
  return window.localStorage.getItem(CLAUDE_API_KEY_STORAGE)?.trim() ?? ''
}

export function hasClaudeApiKey(): boolean {
  return getClaudeApiKey().length > 0
}

export function setClaudeApiKey(value: string): string {
  if (!canUseStorage()) return ''

  const normalized = value.trim()

  if (!normalized) {
    window.localStorage.removeItem(CLAUDE_API_KEY_STORAGE)
    return ''
  }

  window.localStorage.setItem(CLAUDE_API_KEY_STORAGE, normalized)
  return normalized
}

export function clearClaudeApiKey() {
  if (!canUseStorage()) return
  window.localStorage.removeItem(CLAUDE_API_KEY_STORAGE)
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
