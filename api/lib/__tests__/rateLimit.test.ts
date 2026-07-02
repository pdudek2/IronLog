import { describe, expect, it } from 'vitest'
import { RateLimitError, assertRateLimit, type RateLimitStore } from '../rateLimit'

class MemoryRateLimitStore implements RateLimitStore {
  buckets = new Map<string, number[]>()

  async read(key: string): Promise<number[]> {
    return this.buckets.get(key) ?? []
  }

  async write(key: string, timestamps: number[]): Promise<void> {
    this.buckets.set(key, timestamps)
  }
}

describe('assertRateLimit', () => {
  it('allows requests below the limit and stores timestamps', async () => {
    const store = new MemoryRateLimitStore()

    await assertRateLimit({ key: 'user-a', limit: 2, windowMs: 60_000, now: 1_000, store })
    await assertRateLimit({ key: 'user-a', limit: 2, windowMs: 60_000, now: 2_000, store })

    expect(store.buckets.get('user-a')).toEqual([1_000, 2_000])
  })

  it('rejects requests at the limit with retry-after seconds', async () => {
    const store = new MemoryRateLimitStore()
    await assertRateLimit({ key: 'user-a', limit: 2, windowMs: 60_000, now: 1_000, store })
    await assertRateLimit({ key: 'user-a', limit: 2, windowMs: 60_000, now: 2_000, store })

    await expect(assertRateLimit({ key: 'user-a', limit: 2, windowMs: 60_000, now: 10_000, store }))
      .rejects.toMatchObject({ retryAfterSeconds: 51 })
  })

  it('drops timestamps outside the current window', async () => {
    const store = new MemoryRateLimitStore()
    store.buckets.set('user-a', [1_000, 2_000])

    await assertRateLimit({ key: 'user-a', limit: 2, windowMs: 60_000, now: 61_999, store })

    expect(store.buckets.get('user-a')).toEqual([2_000, 61_999])
  })

  it('throws RateLimitError instances', async () => {
    const store = new MemoryRateLimitStore()
    store.buckets.set('user-a', [1_000])

    await expect(assertRateLimit({ key: 'user-a', limit: 1, windowMs: 60_000, now: 2_000, store }))
      .rejects.toBeInstanceOf(RateLimitError)
  })
})
