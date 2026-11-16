import type { Firestore } from 'firebase-admin/firestore'
import { COACH_DAILY_LIMIT } from '../../src/shared/coachQuota.js'
import { adminDb } from './firebaseAdmin.js'

export const COACH_MODEL = 'openai/gpt-6-luna'
export const COACH_DAILY_TOTAL = 400

export type CoachLimitCode = 'daily-limit' | 'daily-limit-all'

export class CoachLimitError extends Error {
  readonly code: CoachLimitCode
  readonly resetAt: string

  constructor(code: CoachLimitCode, resetAt: string) {
    super(code === 'daily-limit'
      ? "Today's Coach limit is used up."
      : "Coach has reached today's limit for everyone.")
    this.name = 'CoachLimitError'
    this.code = code
    this.resetAt = resetAt
  }
}

export interface CoachReservation {
  uid: string
  day: string
  cost: number
  used: number
}

export const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10)

export function nextUtcMidnight(now: number): string {
  const date = new Date(now)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)).toISOString()
}

const usedOn = (data: unknown, day: string): number => {
  const record = (data ?? {}) as { date?: unknown; used?: unknown }
  return record.date === day && typeof record.used === 'number' ? record.used : 0
}

// Both counters move in one transaction, so concurrent requests can never spend past either cap.
export async function reserveCoachUnits(uid: string, cost: number, options: { db?: Firestore; now?: number } = {}): Promise<CoachReservation> {
  const db = options.db ?? adminDb
  const now = options.now ?? Date.now()
  const day = utcDay(now)
  const userRef = db.collection('dailyAiUsage').doc(uid)
  const totalRef = db.collection('dailyAiUsage').doc(`total_${day}`)
  return db.runTransaction(async (transaction) => {
    const [user, total] = await Promise.all([transaction.get(userRef), transaction.get(totalRef)])
    const userUsed = usedOn(user.data(), day)
    const totalUsed = usedOn(total.data(), day)
    if (userUsed + cost > COACH_DAILY_LIMIT) throw new CoachLimitError('daily-limit', nextUtcMidnight(now))
    if (totalUsed + cost > COACH_DAILY_TOTAL) throw new CoachLimitError('daily-limit-all', nextUtcMidnight(now))
    transaction.set(userRef, { userId: uid, date: day, used: userUsed + cost })
    transaction.set(totalRef, { date: day, used: totalUsed + cost })
    return { uid, day, cost, used: userUsed + cost }
  })
}

// Only for requests OpenRouter never accepted; a counter from another day is left alone and never goes below zero.
export async function refundCoachUnits(reservation: CoachReservation, options: { db?: Firestore } = {}): Promise<void> {
  const db = options.db ?? adminDb
  const userRef = db.collection('dailyAiUsage').doc(reservation.uid)
  const totalRef = db.collection('dailyAiUsage').doc(`total_${reservation.day}`)
  await db.runTransaction(async (transaction) => {
    const [user, total] = await Promise.all([transaction.get(userRef), transaction.get(totalRef)])
    if (user.exists && user.data()?.date === reservation.day) {
      transaction.update(userRef, { used: Math.max(0, usedOn(user.data(), reservation.day) - reservation.cost) })
    }
    if (total.exists) {
      transaction.update(totalRef, { used: Math.max(0, usedOn(total.data(), reservation.day) - reservation.cost) })
    }
  })
}

export async function readCoachQuota(uid: string, options: { db?: Firestore; now?: number } = {}) {
  const db = options.db ?? adminDb
  const now = options.now ?? Date.now()
  const snapshot = await db.collection('dailyAiUsage').doc(uid).get()
  return { used: usedOn(snapshot.data(), utcDay(now)), limit: COACH_DAILY_LIMIT, resetAt: nextUtcMidnight(now) }
}
