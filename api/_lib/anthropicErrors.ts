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
      message: 'Claude API rejected your key. Check it and save it again.',
    }
  }

  if (status === 429) {
    return {
      status: 429,
      code: 'rate-limited',
      message: 'Claude API reported a limit or insufficient credits. Wait a moment or check your Anthropic account.',
    }
  }

  if (status === 404) {
    return {
      status: 400,
      code: 'model-unavailable',
      message: 'The selected Claude model is unavailable for this key. Choose another model in settings.',
    }
  }

  return {
    status: status >= 500 ? 503 : 502,
    code: 'upstream-unavailable',
    message: 'Claude API is temporarily unavailable. Try again shortly.',
  }
}

export function anthropicNetworkError(): ApiError {
  return new ApiError(503, 'Could not connect to Claude API. Try again shortly.', {
    code: 'network-retryable',
  })
}

export function anthropicApiError(status: number): ApiError {
  const classified = classifyAnthropicStatus(status)
  return new ApiError(classified.status, classified.message, { code: classified.code })
}
