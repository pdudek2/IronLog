import { describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { CoachLimitError, COACH_DAILY_TOTAL, nextUtcMidnight, readCoachQuota, refundCoachUnits, reserveCoachUnits } from '../coachQuota'

// Enough of Firestore for one-at-a-time transactions over plain documents.
function memoryDb(seed: Record<string, Record<string, unknown>> = {}) {
  const docs = new Map(Object.entries(seed))
  const ref = (id: string) => ({ id, get: async () => snapshot(id) })
  const snapshot = (id: string) => ({ exists: docs.has(id), data: () => docs.get(id) })
  const db = {
    collection: () => ({ doc: ref }),
    runTransaction: async <T>(work: (transaction: unknown) => Promise<T>) => work({
      get: async (target: { id: string }) => snapshot(target.id),
      set: (target: { id: string }, data: Record<string, unknown>) => { docs.set(target.id, { ...data }) },
      update: (target: { id: string }, data: Record<string, unknown>) => { docs.set(target.id, { ...docs.get(target.id), ...data }) },
    }),
  }
  return { db: db as unknown as Firestore, docs }
}

const NOON = Date.parse('2026-11-16T12:00:00Z')
const limitCode = (promise: Promise<unknown>) => promise.then(() => 'accepted', (error: unknown) => error instanceof CoachLimitError ? error.code : String(error))

describe('coach quota', () => {
  it('allows 20 units a person a day, then refuses with the next UTC midnight', async () => {
    const { db, docs } = memoryDb()
    for (let i = 0; i < 20; i++) await reserveCoachUnits('me', 1, { db, now: NOON })
    await expect(reserveCoachUnits('me', 1, { db, now: NOON })).rejects.toMatchObject({ code: 'daily-limit', resetAt: '2026-11-17T00:00:00.000Z' })
    expect(docs.get('me')).toEqual({ userId: 'me', date: '2026-11-16', used: 20 })
    expect(docs.get('total_2026-11-16')).toEqual({ date: '2026-11-16', used: 20 })
  })

  it('refuses a plan of 5 at 16 used but still takes a message', async () => {
    const { db } = memoryDb({ me: { userId: 'me', date: '2026-11-16', used: 16 } })
    expect(await limitCode(reserveCoachUnits('me', 5, { db, now: NOON }))).toBe('daily-limit')
    expect(await limitCode(reserveCoachUnits('me', 1, { db, now: NOON }))).toBe('accepted')
  })

  it('refuses everyone once the shared daily total is spent', async () => {
    const { db, docs } = memoryDb({ 'total_2026-11-16': { date: '2026-11-16', used: COACH_DAILY_TOTAL } })
    expect(await limitCode(reserveCoachUnits('fresh', 1, { db, now: NOON }))).toBe('daily-limit-all')
    expect(docs.has('fresh')).toBe(false)
  })

  it('starts each UTC day from zero', async () => {
    const { db } = memoryDb({ me: { userId: 'me', date: '2026-11-15', used: 20 } })
    expect(await reserveCoachUnits('me', 5, { db, now: NOON })).toMatchObject({ day: '2026-11-16', used: 5 })
    expect(await readCoachQuota('me', { db, now: NOON })).toEqual({ used: 5, limit: 20, resetAt: '2026-11-17T00:00:00.000Z' })
  })

  it('refunds into the reservation day, never below zero, and leaves a counter from a new day alone', async () => {
    const { db, docs } = memoryDb()
    const reservation = await reserveCoachUnits('me', 5, { db, now: NOON })
    await refundCoachUnits(reservation, { db })
    expect(docs.get('me')?.used).toBe(0)
    await refundCoachUnits(reservation, { db })
    expect(docs.get('total_2026-11-16')?.used).toBe(0)

    const lateNight = await reserveCoachUnits('me', 1, { db, now: Date.parse('2026-11-16T23:59:59Z') })
    await reserveCoachUnits('me', 2, { db, now: Date.parse('2026-11-17T00:00:01Z') })
    await refundCoachUnits(lateNight, { db })
    expect(docs.get('me')).toEqual({ userId: 'me', date: '2026-11-17', used: 2 })
    expect(docs.get('total_2026-11-16')?.used).toBe(0)
    expect(docs.get('total_2026-11-17')?.used).toBe(2)
  })

  it('never creates a counter when refunding', async () => {
    const { db, docs } = memoryDb()
    await refundCoachUnits({ uid: 'ghost', day: '2026-11-16', cost: 1, used: 1 }, { db })
    expect(docs.size).toBe(0)
  })

  it('resets at the next UTC midnight', () => {
    expect(nextUtcMidnight(Date.parse('2026-12-31T23:30:00Z'))).toBe('2027-01-01T00:00:00.000Z')
  })
})
