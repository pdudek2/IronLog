import { type DocumentData, type QueryDocumentSnapshot, type QuerySnapshot, collection, getDocs, limit, orderBy, query, startAfter, where } from 'firebase/firestore'
import { db } from './firebase'

export interface ProgressSessionLite {
  id: string
  workoutId: string
  exerciseId: string
  exerciseSource: 'global' | 'user'
  finishedAt: number
  totalVolume: number
  totalSets: number
  bestSetWeight: number
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
  const sessions: ProgressSessionLite[] = []
  let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null
  const batchSize = 500
  const maxDocs = 5_000

  while (sessions.length < maxDocs) {
    const remaining = maxDocs - sessions.length
    const currentLimit = Math.min(batchSize, remaining)
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

    sessions.push(...snap.docs.map((d) => {
      const data = d.data()
      return {
        id: d.id,
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
    }))

    if (snap.docs.length < currentLimit) break

    lastDoc = snap.docs[snap.docs.length - 1] ?? null
    if (!lastDoc) break
  }

  return sessions
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

// ── Period Comparison ───────────────────────────────────────────────────────

export interface PeriodComparison {
  currentSessions: number
  previousSessions: number
  sessionsDelta: number
  currentVolume: number
  previousVolume: number
  volumeDelta: number
  currentAvgVolume: number
  previousAvgVolume: number
  avgVolumeDelta: number
}

function calcDelta(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return ((current - previous) / previous) * 100
}

function countUniqueWorkouts(sessions: ProgressSessionLite[]): { count: number; volume: number } {
  const seen = new Set<string>()
  let volume = 0
  for (const s of sessions) {
    if (!seen.has(s.workoutId)) {
      seen.add(s.workoutId)
    }
    volume += s.totalVolume
  }
  return { count: seen.size, volume }
}

export function aggregatePeriodComparison(
  sessions: ProgressSessionLite[],
  rangeDays: number,
): PeriodComparison {
  const cutoffMs = Date.now() - rangeDays * 86_400_000
  const current = sessions.filter((s) => s.finishedAt >= cutoffMs)
  const previous = sessions.filter((s) => s.finishedAt < cutoffMs)

  const cur = countUniqueWorkouts(current)
  const prev = countUniqueWorkouts(previous)

  const curAvg = cur.count > 0 ? cur.volume / cur.count : 0
  const prevAvg = prev.count > 0 ? prev.volume / prev.count : 0

  return {
    currentSessions: cur.count,
    previousSessions: prev.count,
    sessionsDelta: calcDelta(cur.count, prev.count),
    currentVolume: cur.volume,
    previousVolume: prev.volume,
    volumeDelta: calcDelta(cur.volume, prev.volume),
    currentAvgVolume: curAvg,
    previousAvgVolume: prevAvg,
    avgVolumeDelta: calcDelta(curAvg, prevAvg),
  }
}

// ── Strength Progression ────────────────────────────────────────────────────

export interface StrengthPoint {
  date: string
  timestamp: number
  [exerciseName: string]: number | string
}

export interface StrengthSeries {
  exerciseName: string
  color: string
}

const SERIES_COLORS = ['#5aa6ff', '#19d59f', '#a78bfa', '#38bdf8', '#fb923c']

export function aggregateStrengthProgression(
  sessions: ProgressSessionLite[],
  topN = 5,
): { data: StrengthPoint[]; series: StrengthSeries[] } {
  // Znajdź top N najczęściej trenowanych ćwiczeń
  const exerciseCounts = new Map<string, { count: number; name: string }>()
  for (const s of sessions) {
    if (s.bestSetWeight <= 0) continue
    const key = `${s.exerciseSource}:${s.exerciseId}`
    const existing = exerciseCounts.get(key)
    if (existing) {
      existing.count++
    } else {
      exerciseCounts.set(key, { count: 1, name: s.exerciseName })
    }
  }

  const topExercises = [...exerciseCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, topN)

  if (topExercises.length === 0) return { data: [], series: [] }

  const topKeys = new Set(topExercises.map(([key]) => key))
  const topNames = new Map(topExercises.map(([key, val]) => [key, val.name]))

  // Zgrupuj bestSetWeight per dzień per ćwiczenie
  const dayMap = new Map<string, { timestamp: number; weights: Map<string, number> }>()

  for (const s of sessions) {
    const key = `${s.exerciseSource}:${s.exerciseId}`
    if (!topKeys.has(key) || s.bestSetWeight <= 0) continue

    const d = new Date(s.finishedAt)
    const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

    let day = dayMap.get(dayKey)
    if (!day) {
      day = { timestamp: s.finishedAt, weights: new Map() }
      dayMap.set(dayKey, day)
    }

    const current = day.weights.get(key) ?? 0
    if (s.bestSetWeight > current) {
      day.weights.set(key, s.bestSetWeight)
    }
  }

  // Zbuduj punkty danych posortowane chronologicznie
  const data: StrengthPoint[] = [...dayMap.entries()]
    .sort((a, b) => a[1].timestamp - b[1].timestamp)
    .map(([, day]) => {
      const point: StrengthPoint = {
        date: new Date(day.timestamp).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }),
        timestamp: day.timestamp,
      }
      for (const [key, weight] of day.weights) {
        const name = topNames.get(key) ?? key
        point[name] = weight
      }
      return point
    })

  const series: StrengthSeries[] = topExercises.map(([key], i) => ({
    exerciseName: topNames.get(key) ?? key,
    color: SERIES_COLORS[i % SERIES_COLORS.length],
  }))

  return { data, series }
}

// ── Activity Heatmap ────────────────────────────────────────────────────────

export interface HeatmapDay {
  date: string
  dayOfWeek: number   // 0=pon, 6=niedz
  weekIndex: number
  volume: number
  level: 0 | 1 | 2 | 3 | 4
}

export function aggregateActivityHeatmap(
  sessions: ProgressSessionLite[],
  weeks = 12,
): HeatmapDay[] {
  // Wygeneruj grid: weeks tygodni × 7 dni
  const now = new Date()
  const startMonday = getWeekMonday(new Date(now.getTime() - (weeks - 1) * 7 * 86_400_000))

  const grid: HeatmapDay[] = []
  const volumeByDate = new Map<string, number>()

  // Zsumuj wolumen per dzień
  for (const s of sessions) {
    const d = new Date(s.finishedAt)
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    volumeByDate.set(dateKey, (volumeByDate.get(dateKey) ?? 0) + s.totalVolume)
  }

  // Wygeneruj komórki gridu
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const cellDate = new Date(startMonday.getTime() + (w * 7 + d) * 86_400_000)
      if (cellDate > now) {
        grid.push({ date: '', dayOfWeek: d, weekIndex: w, volume: 0, level: 0 })
        continue
      }
      const dateKey = `${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(2, '0')}-${String(cellDate.getDate()).padStart(2, '0')}`
      const volume = volumeByDate.get(dateKey) ?? 0
      grid.push({ date: dateKey, dayOfWeek: d, weekIndex: w, volume, level: 0 })
    }
  }

  // Oblicz kwantyle z niepustych dni
  const nonZero = grid.filter((c) => c.volume > 0).map((c) => c.volume).sort((a, b) => a - b)
  if (nonZero.length > 0) {
    const p25 = nonZero[Math.floor(nonZero.length * 0.25)] ?? 0
    const p50 = nonZero[Math.floor(nonZero.length * 0.5)] ?? 0
    const p75 = nonZero[Math.floor(nonZero.length * 0.75)] ?? 0

    for (const cell of grid) {
      if (cell.volume <= 0) { cell.level = 0; continue }
      if (cell.volume <= p25) { cell.level = 1; continue }
      if (cell.volume <= p50) { cell.level = 2; continue }
      if (cell.volume <= p75) { cell.level = 3; continue }
      cell.level = 4
    }
  }

  return grid
}
