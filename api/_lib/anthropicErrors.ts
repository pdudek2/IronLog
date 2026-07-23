import { ApiError } from './errors.js'

export interface ClassifiedAnthropicError {
  status: number
  code: 'invalid-key' | 'rate-limited' | 'model-unavailable' | 'upstream-unavailable' | 'network-retryable'
  message: string
}

export function classifyAnthropicStatus(status: number): ClassifiedAnthropicError {
  if (status === 401 || status === 403) {
    return {
      status: 401,
      code: 'invalid-key',
      message: 'Claude API odrzuciło klucz. Sprawdź klucz i zapisz go ponownie.',
    }
  }

  if (status === 429) {
    return {
      status: 429,
      code: 'rate-limited',
      message: 'Claude API zgłosiło limit lub brak środków na kluczu. Odczekaj chwilę albo sprawdź konto Anthropic.',
    }
  }

  if (status === 404) {
    return {
      status: 400,
      code: 'model-unavailable',
      message: 'Wybrany model Claude nie jest dostępny dla tego klucza. Wybierz inny model w konfiguracji.',
    }
  }

  return {
    status: status >= 500 ? 503 : 502,
    code: 'upstream-unavailable',
    message: 'Claude API jest chwilowo niedostępne. Spróbuj ponownie za chwilę.',
  }
}

export function anthropicNetworkError(): ApiError {
  return new ApiError(503, 'Nie udało się połączyć z Claude API. Spróbuj ponownie za chwilę.', {
    code: 'network-retryable',
  })
}

export function anthropicApiError(status: number): ApiError {
  const classified = classifyAnthropicStatus(status)
  return new ApiError(classified.status, classified.message, { code: classified.code })
}
