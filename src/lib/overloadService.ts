import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import { db } from './firebase'
import type { ExerciseSource } from '../store/workoutStore'
import type { ProgressionSession } from '../shared/progression'

// The engine reads the latest session, the last three within 14 days and the date gap.
export async function readProgressionSessions(
  uid: string,
  exerciseId: string,
  source: ExerciseSource,
): Promise<ProgressionSession[]> {
  const snap = await getDocs(
    query(
      collection(db, 'exerciseSessions'),
      where('userId', '==', uid),
      where('exerciseId', '==', exerciseId),
      where('exerciseSource', '==', source),
      orderBy('finishedAt', 'desc'),
      limit(3),
    ),
  )
  return snap.docs.map((document) => {
    const data = document.data()
    const sets: unknown[] = Array.isArray(data.sets) ? data.sets : []
    return {
      finishedAt: typeof data.finishedAt === 'number' ? data.finishedAt : 0,
      sets: sets.flatMap((set) => {
        if (!set || typeof set !== 'object') return []
        const { weight, reps } = set as { weight?: unknown; reps?: unknown }
        return typeof weight === 'number' && typeof reps === 'number' ? [{ weight, reps }] : []
      }),
    }
  })
}
