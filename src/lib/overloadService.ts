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

export interface OverloadHistoryEntry {
  bestSetWeight: number
  finishedAt: number
}

function roundToHalf(value: number): number {
  return Math.max(0, Math.round(value * 2) / 2)
}

export function buildOverloadSuggestion(
  history: OverloadHistoryEntry[],
  now = Date.now(),
): OverloadSuggestion | null {
  if (history.length < 3) return null

  const latest = history[0]
  if (!latest || latest.bestSetWeight <= 0) return null

  if (now - latest.finishedAt > THREE_WEEKS_MS) {
    return {
      suggestedWeight: roundToHalf(latest.bestSetWeight - 2.5),
      delta: -2.5,
      reason: 'deload_gap',
      lastWeight: latest.bestSetWeight,
      basedOnSessions: history.length,
    }
  }

  return {
    suggestedWeight: roundToHalf(latest.bestSetWeight + 2.5),
    delta: 2.5,
    reason: 'progressive',
    lastWeight: latest.bestSetWeight,
    basedOnSessions: history.length,
  }
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

  return buildOverloadSuggestion(snap.docs.map((document) => {
    const data = document.data()
    return {
      bestSetWeight: typeof data.bestSetWeight === 'number' ? data.bestSetWeight : 0,
      finishedAt: typeof data.finishedAt === 'number' ? data.finishedAt : 0,
    }
  }))
}
