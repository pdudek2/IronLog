import { createHash } from 'node:crypto'

export class RateLimitError extends Error {
  retryAfterSeconds: number

  constructor(retryAfterSeconds: number) {
    super('Zbyt wiele żądań. Odczekaj chwilę i spróbuj ponownie.')
    this.name = 'RateLimitError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export interface RateLimitStore {
  read(key: string): Promise<number[]>
  write(key: string, timestamps: number[]): Promise<void>
  consume?(
    key: string,
    options: Required<Pick<AssertRateLimitOptions, 'limit' | 'windowMs' | 'now'>>,
  ): Promise<void>
}

interface AssertRateLimitOptions {
  key: string
  limit?: number
  windowMs?: number
  now?: number
  store?: RateLimitStore
}

class FirestoreRateLimitStore implements RateLimitStore {
  async read(key: string): Promise<number[]> {
    const { adminDb } = await import('./firebaseAdmin.js')
    const snap = await adminDb.collection('aiRateLimits').doc(documentIdForKey(key)).get()
    const timestamps = snap.exists ? snap.data()?.timestamps : null
    return Array.isArray(timestamps) ? timestamps.flatMap((value) => Number.isFinite(value) ? [Number(value)] : []) : []
  }

  async write(key: string, timestamps: number[]): Promise<void> {
    const { adminDb } = await import('./firebaseAdmin.js')
    await adminDb.collection('aiRateLimits').doc(documentIdForKey(key)).set({
      keyHash: documentIdForKey(key),
      timestamps,
      updatedAt: Date.now(),
    }, { merge: true })
  }

  async consume(
    key: string,
    options: Required<Pick<AssertRateLimitOptions, 'limit' | 'windowMs' | 'now'>>,
  ): Promise<void> {
    const { adminDb } = await import('./firebaseAdmin.js')
    const ref = adminDb.collection('aiRateLimits').doc(documentIdForKey(key))

    await adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref)
      const stored = snap.exists ? snap.data()?.timestamps : null
      const recent = normalizeTimestamps(stored, options.now, options.windowMs)

      if (recent.length >= options.limit) {
        throw buildRateLimitError(recent, options.now, options.windowMs)
      }

      recent.push(options.now)
      transaction.set(ref, {
        keyHash: documentIdForKey(key),
        timestamps: recent,
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
  const options = { limit, windowMs, now }

  if (store.consume) {
    await store.consume(key, options)
    return
  }

  const recent = normalizeTimestamps(await store.read(key), now, windowMs)

  if (recent.length >= limit) {
    throw buildRateLimitError(recent, now, windowMs)
  }

  recent.push(now)
  await store.write(key, recent)
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
