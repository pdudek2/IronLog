import { type DocumentData, type QueryDocumentSnapshot, type QuerySnapshot, collection, getDocs, limit, orderBy, query, startAfter, where } from 'firebase/firestore'
import { db } from './firebase'

import { type ProgressRecordsResult, type ProgressSessionLite, type ProgressSessionsResult, type RecordSummary } from '../shared/progress'
export * from '../shared/progress'

function toNum(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

const SESSION_LIMIT = 5_000
const RECORD_LIMIT = 1_000
const PAGE_SIZE = 1_000

function normalizeProgressSession(id: string, data: DocumentData): ProgressSessionLite {
  return {
    id,
    workoutId: typeof data.workoutId === 'string' ? data.workoutId : '',
    exerciseId: typeof data.exerciseId === 'string' ? data.exerciseId : '',
    exerciseSource: (data.exerciseSource === 'user' ? 'user' : 'global') as 'user' | 'global',
    finishedAt: toNum(data.finishedAt),
    totalVolume: toNum(data.totalVolume),
    totalSets: toNum(data.totalSets),
    bestSetWeight: toNum(data.bestSetWeight),
    exerciseName: typeof data.exerciseName === 'string' ? data.exerciseName : '',
    muscleGroups: Array.isArray(data.muscleGroups)
      ? data.muscleGroups.filter((g): g is string => typeof g === 'string')
      : [],
  }
}

function normalizeRecord(id: string, data: DocumentData): RecordSummary {
  return {
    id,
    exerciseId: typeof data.exerciseId === 'string' ? data.exerciseId : '',
    exerciseSource: (data.exerciseSource === 'user' ? 'user' : 'global') as 'user' | 'global',
    exerciseName: typeof data.exerciseName === 'string' ? data.exerciseName : '',
    maxWeight: toNum(data.maxWeight),
    maxReps: toNum(data.maxReps),
    bestVolume: toNum(data.bestVolume),
    totalSessions: toNum(data.totalSessions),
    lastPerformedAt: toNum(data.lastPerformedAt),
  }
}

function compareRecords(a: RecordSummary, b: RecordSummary): number {
  return b.maxWeight - a.maxWeight
    || b.bestVolume - a.bestVolume
    || b.maxReps - a.maxReps
    || a.exerciseName.localeCompare(b.exerciseName, 'en-US')
    || a.id.localeCompare(b.id)
}

// ── Queries ──────────────────────────────────────────────────────────────────

export async function getProgressSessions(
  uid: string,
  fromMs: number,
): Promise<ProgressSessionsResult> {
  const sessions: ProgressSessionLite[] = []
  let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null

  while (sessions.length < SESSION_LIMIT + 1) {
    const remaining = SESSION_LIMIT + 1 - sessions.length
    const currentLimit = Math.min(PAGE_SIZE, remaining)
    let snap: QuerySnapshot<DocumentData>
    if (lastDoc) {
      snap = await getDocs(
        query(
          collection(db, 'exerciseSessions'),
          where('userId', '==', uid),
          where('finishedAt', '>=', fromMs),
          orderBy('finishedAt', 'desc'),
          startAfter(lastDoc),
          limit(currentLimit),
        ),
      )
    } else {
      snap = await getDocs(
        query(
          collection(db, 'exerciseSessions'),
          where('userId', '==', uid),
          where('finishedAt', '>=', fromMs),
          orderBy('finishedAt', 'desc'),
          limit(currentLimit),
        ),
      )
    }

    sessions.push(...snap.docs.map((document) => normalizeProgressSession(document.id, document.data())))

    if (snap.docs.length < currentLimit) break

    lastDoc = snap.docs[snap.docs.length - 1] ?? null
    if (!lastDoc) break
  }

  return {
    sessions: sessions.slice(0, SESSION_LIMIT),
    truncated: sessions.length > SESSION_LIMIT,
  }
}

export async function getRecords(uid: string): Promise<ProgressRecordsResult> {
  const records: RecordSummary[] = []
  let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null

  while (records.length < RECORD_LIMIT + 1) {
    const remaining = RECORD_LIMIT + 1 - records.length
    const currentLimit = Math.min(PAGE_SIZE, remaining)
    let snap: QuerySnapshot<DocumentData>
    if (lastDoc) {
      snap = await getDocs(
        query(
          collection(db, 'records'),
          where('userId', '==', uid),
          startAfter(lastDoc),
          limit(currentLimit),
        ),
      )
    } else {
      snap = await getDocs(
        query(
          collection(db, 'records'),
          where('userId', '==', uid),
          limit(currentLimit),
        ),
      )
    }

    records.push(...snap.docs.map((document) => normalizeRecord(document.id, document.data())))

    if (snap.docs.length < currentLimit) break

    lastDoc = snap.docs[snap.docs.length - 1] ?? null
    if (!lastDoc) break
  }

  return {
    records: records.slice(0, RECORD_LIMIT).sort(compareRecords),
    truncated: records.length > RECORD_LIMIT,
  }
}
