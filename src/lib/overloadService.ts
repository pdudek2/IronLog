import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import { db } from './firebase'
import type { ExerciseSource } from '../store/workoutStore'

import { buildOverloadSuggestion, type OverloadSuggestion } from '../shared/nextSessionRecommendation'
export { buildOverloadSuggestion, type OverloadHistoryEntry, type OverloadSuggestion, type OverloadReason } from '../shared/nextSessionRecommendation'

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
