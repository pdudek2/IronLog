const requestBuckets = new Map<string, number[]>()

export class RateLimitError extends Error {
  retryAfterSeconds: number

  constructor(retryAfterSeconds: number) {
    super('Zbyt wiele żądań. Odczekaj chwilę i spróbuj ponownie.')
    this.name = 'RateLimitError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

interface AssertRateLimitOptions {
  key: string
  limit?: number
  windowMs?: number
}

export function assertRateLimit({
  key,
  limit = 8,
  windowMs = 60_000,
}: AssertRateLimitOptions): void {
  const now = Date.now()
  const recent = (requestBuckets.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs)

  if (recent.length >= limit) {
    const oldest = recent[0] ?? now
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000))
    throw new RateLimitError(retryAfterSeconds)
  }

  recent.push(now)
  requestBuckets.set(key, recent)
}
