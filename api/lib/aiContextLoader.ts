import type { Firestore } from 'firebase-admin/firestore'
import {
  buildAiUserContext,
  type AiContextProfileInput,
  type AiContextRecordInput,
  type AiContextSource,
  type AiContextSourceStatuses,
  type AiContextWorkoutInput,
  type AiReadinessInput,
  type AiUserContext,
} from '../../server/aiContext.js'
import { ApiError } from './errors.js'
import { adminDb } from './firebaseAdmin.js'

export const AI_CONTEXT_READ_LIMITS = {
  profile: 1,
  readiness: 31,
  workouts: 31,
  records: 6,
} as const

export const AI_CONTEXT_DOCUMENT_READ_BUDGET = Object.values(AI_CONTEXT_READ_LIMITS)
  .reduce((sum, limit) => sum + limit, 0)

export interface AiContextReaders {
  profile(uid: string): Promise<AiContextProfileInput | null>
  readiness(uid: string): Promise<AiReadinessInput[]>
  workouts(uid: string): Promise<AiContextWorkoutInput[]>
  records(uid: string): Promise<AiContextRecordInput[]>
}

export function createFirestoreAiContextReaders(database: Firestore = adminDb): AiContextReaders {
  return {
    async profile(uid) {
      const snapshot = await database.collection('users').doc(uid).get()
      const data = snapshot.exists ? snapshot.data() : null
      return data ? {
        displayName: typeof data.displayName === 'string' ? data.displayName : null,
        primaryGoal: typeof data.primaryGoal === 'string' ? data.primaryGoal : null,
        weeklyGoal: typeof data.weeklyGoal === 'number' ? data.weeklyGoal : null,
        units: typeof data.units === 'string' ? data.units : null,
      } : null
    },
    async readiness(uid) {
      const snapshot = await database.collection('readiness')
        .where('userId', '==', uid)
        .orderBy('date', 'desc')
        .limit(AI_CONTEXT_READ_LIMITS.readiness)
        .get()
      return snapshot.docs.map((document) => {
        const data = document.data()
        return {
          date: typeof data.date === 'string' ? data.date : '',
          createdAt: Number(data.createdAt ?? 0),
          sleep: Number(data.sleep ?? 3),
          mood: Number(data.mood ?? 3),
          soreness: Number(data.soreness ?? 3),
        }
      })
    },
    async workouts(uid) {
      const snapshot = await database.collection('workouts')
        .where('userId', '==', uid)
        .orderBy('startedAt', 'desc')
        .limit(AI_CONTEXT_READ_LIMITS.workouts)
        .get()
      return snapshot.docs.map((document) => {
        const data = document.data()
        return {
          label: typeof data.label === 'string' ? data.label : null,
          startedAt: Number(data.startedAt ?? 0),
          exercises: Array.isArray(data.exercises) ? data.exercises : [],
        }
      })
    },
    async records(uid) {
      const snapshot = await database.collection('records')
        .where('userId', '==', uid)
        .orderBy('maxWeight', 'desc')
        .limit(AI_CONTEXT_READ_LIMITS.records)
        .get()
      return snapshot.docs.map((document) => {
        const data = document.data()
        return {
          exerciseName: typeof data.exerciseName === 'string' ? data.exerciseName : 'Ćwiczenie',
          maxWeight: Number(data.maxWeight ?? 0),
          maxReps: Number(data.maxReps ?? 0),
          bestVolume: Number(data.bestVolume ?? 0),
          lastPerformedAt: Number(data.lastPerformedAt ?? 0),
        }
      })
    },
  }
}

const SOURCE_ORDER: AiContextSource[] = ['profile', 'readiness', 'workouts', 'records']

export async function loadAiUserContext(
  uid: string,
  readers: AiContextReaders = createFirestoreAiContextReaders(),
): Promise<AiUserContext> {
  const settled = await Promise.allSettled([
    readers.profile(uid),
    readers.readiness(uid),
    readers.workouts(uid),
    readers.records(uid),
  ] as const)

  const sources = Object.fromEntries(settled.map((result, index) => {
    const source = SOURCE_ORDER[index]
    if (result.status === 'rejected') {
      console.error('[ai-chat context source unavailable]', {
        source,
        errorName: result.reason instanceof Error ? result.reason.name : 'UnknownError',
      })
    }
    return [source, result.status === 'fulfilled' ? 'available' : 'unavailable']
  })) as AiContextSourceStatuses

  if (SOURCE_ORDER.every((source) => sources[source] === 'unavailable')) {
    throw new ApiError(503, 'Nie udało się załadować kontekstu. Spróbuj ponownie.', {
      code: 'ai_context_unavailable',
    })
  }

  const [profile, readiness, workouts, records] = settled
  return buildAiUserContext({
    sources,
    profile: profile.status === 'fulfilled' ? profile.value : null,
    readinessEntries: readiness.status === 'fulfilled' ? readiness.value : [],
    workouts: workouts.status === 'fulfilled' ? workouts.value : [],
    records: records.status === 'fulfilled' ? records.value : [],
  })
}
