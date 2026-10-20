import { createHash } from 'node:crypto'

export class RateLimitError extends Error {
  retryAfterSeconds: number

  constructor(retryAfterSeconds: number) {
    super('Too many requests. Wait a moment and try again.')
    this.name = 'RateLimitError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

type RateLimitWindow = Required<Pick<AssertRateLimitOptions, 'limit' | 'windowMs' | 'now'>>

export interface RateLimitStore {
  consume(key: string, options: RateLimitWindow): Promise<void>
}

// Timestamps to store after this request, or a RateLimitError when the window is full.
export function nextRateLimitTimestamps(stored: unknown, { limit, windowMs, now }: RateLimitWindow): number[] {
  const recent = normalizeTimestamps(stored, now, windowMs)
  if (recent.length >= limit) throw buildRateLimitError(recent, now, windowMs)
  return [...recent, now]
}

interface AssertRateLimitOptions {
  key: string
  limit?: number
  windowMs?: number
  now?: number
  store?: RateLimitStore
}

class FirestoreRateLimitStore implements RateLimitStore {
  async consume(key: string, options: RateLimitWindow): Promise<void> {
    const { adminDb } = await import('./firebaseAdmin.js')
    const ref = adminDb.collection('aiRateLimits').doc(documentIdForKey(key))

    await adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref)
      const timestamps = nextRateLimitTimestamps(snap.exists ? snap.data()?.timestamps : null, options)
      transaction.set(ref, {
        keyHash: documentIdForKey(key),
        timestamps,
        updatedAt: options.now,
        windowMs: options.windowMs,
      }, { merge: true })
    })
  }
}

const defaultStore = new FirestoreRateLimitStore()

export async function assertRateLimit({
  key,
  limit = 8,
  windowMs = 60_000,
  now = Date.now(),
  store = defaultStore,
}: AssertRateLimitOptions): Promise<void> {
  await store.consume(key, { limit, windowMs, now })
}

function normalizeTimestamps(raw: unknown, now: number, windowMs: number): number[] {
  if (!Array.isArray(raw)) return []

  return raw
    .flatMap((value) => {
      const timestamp = Number(value)
      return Number.isFinite(timestamp) ? [timestamp] : []
    })
    .filter((timestamp) => now - timestamp < windowMs)
    .sort((a, b) => a - b)
}

function buildRateLimitError(recent: number[], now: number, windowMs: number): RateLimitError {
  const oldest = recent[0] ?? now
  const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000))
  return new RateLimitError(retryAfterSeconds)
}

function documentIdForKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}
