import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { CoachLimitError, reserveCoachUnits } from '../../api/_lib/coachQuota'
import { clearReviewAdminDatabase, closeReviewAdminDatabase, getReviewAdminDatabase } from '../review/support/adminReviewDatabase'

const db = getReviewAdminDatabase()
const NOON = Date.parse('2026-11-16T12:00:00Z')

beforeEach(async () => {
  await clearReviewAdminDatabase()
})

afterAll(async () => {
  await closeReviewAdminDatabase()
})

describe('coach quota under concurrency', () => {
  it('lets exactly the remaining units through when requests race', async () => {
    await db.collection('dailyAiUsage').doc('racer').set({ userId: 'racer', date: '2026-11-16', used: 18 })
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => reserveCoachUnits('racer', 1, { db, now: NOON })))
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2)
    for (const result of results) if (result.status === 'rejected') expect(result.reason).toBeInstanceOf(CoachLimitError)
    expect((await db.collection('dailyAiUsage').doc('racer').get()).data()).toMatchObject({ used: 20 })
    expect((await db.collection('dailyAiUsage').doc('total_2026-11-16').get()).data()).toEqual({ date: '2026-11-16', used: 2 })
  })
})
