import { collection, getDocs, limit, query, where } from 'firebase/firestore'
import { db } from './firebase'

export interface ProgressSessionLite {
  id: string
  workoutId: string
  finishedAt: number
  totalVolume: number
  totalSets: number
  exerciseName: string
  muscleGroups: string[]
}

export interface RecordSummary {
  id: string
  exerciseId: string
  exerciseSource: 'global' | 'user'
  exerciseName: string
  maxWeight: number
  maxReps: number
  bestVolume: number
  totalSessions: number
  lastPerformedAt: number
}

export interface WeeklyPoint {
  weekLabel: string  // "7 kwi"
  weekStart: number  // ms Monday 00:00 local
  volume: number
  sessions: number
}

export interface MuscleBalancePoint {
  muscle: string
  count: number
}

function toNum(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

// Monday 00:00:00.000 local dla danej daty
function getWeekMonday(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return d
}

// ── Queries ──────────────────────────────────────────────────────────────────

export async function getProgressSessions(
  uid: string,
  fromMs: number,
): Promise<ProgressSessionLite[]> {
  const snap = await getDocs(
    query(
      collection(db, 'exerciseSessions'),
      where('userId', '==', uid),
    ),
  )
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      workoutId: typeof data.workoutId === 'string' ? data.workoutId : '',
      finishedAt: toNum(data.finishedAt),
      totalVolume: toNum(data.totalVolume),
      totalSets: toNum(data.totalSets),
      exerciseName: typeof data.exerciseName === 'string' ? data.exerciseName : '',
      muscleGroups: Array.isArray(data.muscleGroups)
        ? data.muscleGroups.filter((g): g is string => typeof g === 'string')
        : [],
    }
  })
    .filter((s) => s.finishedAt >= fromMs)
    .sort((a, b) => b.finishedAt - a.finishedAt)
    .slice(0, 500)
}

export async function getRecords(uid: string): Promise<RecordSummary[]> {
  const snap = await getDocs(
    query(collection(db, 'records'), where('userId', '==', uid), limit(200)),
  )
  return snap.docs
    .map((d) => {
      const data = d.data()
      return {
        id: d.id,
        exerciseId: typeof data.exerciseId === 'string' ? data.exerciseId : '',
        exerciseSource: (data.exerciseSource === 'user' ? 'user' : 'global') as 'user' | 'global',
        exerciseName: typeof data.exerciseName === 'string' ? data.exerciseName : '',
        maxWeight: toNum(data.maxWeight),
        maxReps: toNum(data.maxReps),
        bestVolume: toNum(data.bestVolume),
        totalSessions: toNum(data.totalSessions),
        lastPerformedAt: toNum(data.lastPerformedAt),
      }
    })
    .sort((a, b) => b.maxWeight - a.maxWeight)
}

// ── Aggregations (pure, client-side) ─────────────────────────────────────────

export function aggregateWeeklyVolume(
  sessions: ProgressSessionLite[],
  weeks = 12,
): WeeklyPoint[] {
  const now = new Date()
  const buckets = new Map<number, WeeklyPoint>()

  // Wygeneruj puste buckety dla ostatnich `weeks` tygodni
  for (let i = weeks - 1; i >= 0; i--) {
    const monday = getWeekMonday(new Date(now.getTime() - i * 7 * 86_400_000))
    const label = monday.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })
    buckets.set(monday.getTime(), { weekStart: monday.getTime(), weekLabel: label, volume: 0, sessions: 0 })
  }

  // Deduplikuj sesje per workout (jeden trening = jedna sesja w wykresie)
  const seenWorkouts = new Set<string>()
  const workoutVolume = new Map<string, number>()

  for (const s of sessions) {
    if (!seenWorkouts.has(s.workoutId)) {
      seenWorkouts.add(s.workoutId)
      workoutVolume.set(s.workoutId, 0)
    }
    workoutVolume.set(s.workoutId, (workoutVolume.get(s.workoutId) ?? 0) + s.totalVolume)
  }

  // Przypisz wolumen do tygodnia
  const assignedWorkouts = new Set<string>()
  for (const s of sessions) {
    if (assignedWorkouts.has(s.workoutId)) continue
    assignedWorkouts.add(s.workoutId)

    const monday = getWeekMonday(new Date(s.finishedAt))
    const key = monday.getTime()
    const bucket = buckets.get(key)
    if (!bucket) continue

    bucket.volume += workoutVolume.get(s.workoutId) ?? 0
    bucket.sessions += 1
  }

  return [...buckets.values()]
}

export function aggregateMuscleBalance(
  sessions: ProgressSessionLite[],
  topN = 8,
): MuscleBalancePoint[] {
  const counts = new Map<string, number>()

  for (const s of sessions) {
    for (const muscle of s.muscleGroups) {
      counts.set(muscle, (counts.get(muscle) ?? 0) + 1)
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([muscle, count]) => ({ muscle, count }))
}
