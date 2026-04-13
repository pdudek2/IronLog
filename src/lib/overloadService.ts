import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import { db } from './firebase'
import type { ExerciseSource } from '../store/workoutStore'

export type OverloadReason = 'progressive' | 'deload_gap' | 'maintain'

export interface OverloadSuggestion {
  suggestedWeight: number  // zaokrąglone do 0.5
  delta: number            // -2.5 | 0 | +2.5
  reason: OverloadReason
  lastWeight: number
  basedOnSessions: number
}

const THREE_WEEKS_MS = 21 * 24 * 60 * 60 * 1000

function roundToHalf(value: number): number {
  return Math.max(0, Math.round(value * 2) / 2)
}

export async function suggestNextSession(
  uid: string,
  exerciseId: string,
  source: ExerciseSource,
): Promise<OverloadSuggestion | null> {
  const snap = await getDocs(
    query(
      collection(db, 'exerciseSessions'),
      where('userId', '==', uid),
      where('exerciseId', '==', exerciseId),
      where('exerciseSource', '==', source),
      orderBy('finishedAt', 'desc'),
      limit(3),
    ),
  ).catch((err) => { console.error('[overloadService] query failed', err); return null })

  if (!snap || snap.empty) return null

  const sessions = snap.docs.map((d) => d.data())
  if (sessions.length < 3) return null

  const lastWeight = typeof sessions[0].bestSetWeight === 'number' ? sessions[0].bestSetWeight : 0
  const lastFinishedAt = typeof sessions[0].finishedAt === 'number' ? sessions[0].finishedAt : 0

  if (lastWeight === 0) return null

  // Przerwa > 3 tygodnie → deload
  if (Date.now() - lastFinishedAt > THREE_WEEKS_MS) {
    return {
      suggestedWeight: roundToHalf(lastWeight - 2.5),
      delta: -2.5,
      reason: 'deload_gap',
      lastWeight,
      basedOnSessions: sessions.length,
    }
  }

  // 3 udane sesje pod rząd → progresja
  return {
    suggestedWeight: roundToHalf(lastWeight + 2.5),
    delta: 2.5,
    reason: 'progressive',
    lastWeight,
    basedOnSessions: sessions.length,
  }
}
