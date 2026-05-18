interface ApiErrorOptions {
  cause?: unknown
}

export class ApiError extends Error {
  readonly status: number
  readonly cause?: unknown

  constructor(status: number, message: string, options?: ApiErrorOptions) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.cause = options?.cause
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}
