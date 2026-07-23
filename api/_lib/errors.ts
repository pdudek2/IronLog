interface ApiErrorOptions {
  cause?: unknown
  code?: string
}

export class ApiError extends Error {
  readonly status: number
  readonly cause?: unknown
  readonly code?: string

  constructor(status: number, message: string, options?: ApiErrorOptions) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.cause = options?.cause
    this.code = options?.code
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}
