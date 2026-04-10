import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import { db } from './firebase'

export interface ExerciseSession {
  id: string
  workoutId: string
  startedAt: number
  label: string | null
  totalSets: number
  totalReps: number
  totalVolume: number
  bestSetWeight: number
  bestSetReps: number
  sets: { weight: number; reps: number }[]
}

export interface ExerciseRecord {
  exerciseId: string
  exerciseName: string
  maxWeight: number
  maxReps: number
  totalSessions: number
  bestVolume: number
  lastPerformedAt: number
}

function toNum(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

function asRecord(v: unknown): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return {}
  return v as Record<string, unknown>
}

export async function getExerciseSessions(
  uid: string,
  exerciseId: string,
  count = 10
): Promise<ExerciseSession[]> {
  const q = query(
    collection(db, 'exerciseSessions'),
    where('userId', '==', uid),
    where('exerciseId', '==', exerciseId),
    orderBy('startedAt', 'desc'),
    limit(count)
  )
  const snap = await getDocs(q)
  return snap.docs.map((docSnap) => {
    const d = asRecord(docSnap.data())
    return {
      id: docSnap.id,
      workoutId: typeof d.workoutId === 'string' ? d.workoutId : '',
      startedAt: toNum(d.startedAt),
      label: typeof d.label === 'string' && d.label.trim() ? d.label : null,
      totalSets: toNum(d.totalSets),
      totalReps: toNum(d.totalReps),
      totalVolume: toNum(d.totalVolume),
      bestSetWeight: toNum(d.bestSetWeight),
      bestSetReps: toNum(d.bestSetReps),
      sets: Array.isArray(d.sets)
        ? d.sets.map((s) => {
            const r = asRecord(s)
            return { weight: toNum(r.weight), reps: toNum(r.reps) }
          })
        : [],
    }
  })
}

export async function getExerciseRecord(
  uid: string,
  exerciseId: string
): Promise<ExerciseRecord | null> {
  const q = query(
    collection(db, 'records'),
    where('userId', '==', uid),
    where('exerciseId', '==', exerciseId),
    limit(1)
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = asRecord(snap.docs[0].data())
  return {
    exerciseId: typeof d.exerciseId === 'string' ? d.exerciseId : exerciseId,
    exerciseName: typeof d.exerciseName === 'string' ? d.exerciseName : '',
    maxWeight: toNum(d.maxWeight),
    maxReps: toNum(d.maxReps),
    totalSessions: toNum(d.totalSessions),
    bestVolume: toNum(d.bestVolume),
    lastPerformedAt: toNum(d.lastPerformedAt),
  }
}
