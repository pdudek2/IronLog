import { ApiError } from './errors.js'

export interface ClassifiedOpenRouterError {
  status: number
  code: 'invalid-key' | 'rate-limited' | 'model-unavailable' | 'upstream-unavailable' | 'network-retryable'
  message: string
}

export function classifyOpenRouterStatus(status: number): ClassifiedOpenRouterError {
  if (status === 401 || status === 403) {
    return {
      status: 401,
      code: 'invalid-key',
      message: 'OpenRouter API rejected your key. Check it and save it again.',
    }
  }

  if (status === 429 || status === 402) {
    return {
      status: 429,
      code: 'rate-limited',
      message: 'OpenRouter API reported a limit or insufficient credits. Wait a moment or check your OpenRouter account.',
    }
  }

  if (status === 404) {
    return {
      status: 400,
      code: 'model-unavailable',
      message: 'The selected OpenRouter model is unavailable for this key. Check model access in your OpenRouter account.',
    }
  }

  return {
    status: status >= 500 ? 503 : 502,
    code: 'upstream-unavailable',
    message: 'OpenRouter API is temporarily unavailable. Try again shortly.',
  }
}

export function openrouterNetworkError(): ApiError {
  return new ApiError(503, 'Could not connect to OpenRouter API. Try again shortly.', {
    code: 'network-retryable',
  })
}

export function openrouterApiError(status: number): ApiError {
  const classified = classifyOpenRouterStatus(status)
  return new ApiError(classified.status, classified.message, { code: classified.code })
}
