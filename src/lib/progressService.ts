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

export interface ProgressSessionsResult {
  sessions: ProgressSessionLite[]
  truncated: boolean
}

export interface ProgressRecordsResult {
  records: RecordSummary[]
  truncated: boolean
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

const SESSION_LIMIT = 5_000
const RECORD_LIMIT = 1_000
const PAGE_SIZE = 500

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
    || a.exerciseName.localeCompare(b.exerciseName, 'pl')
    || a.id.localeCompare(b.id)
}

// Monday 00:00:00.000 local dla danej daty
function getWeekMonday(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return d
}

function addLocalDays(date: Date, days: number): Date {
  const next = new Date(date.getTime())
  next.setDate(next.getDate() + days)
  return next
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

// ── Aggregations (pure, client-side) ─────────────────────────────────────────

export function aggregateWeeklyVolume(
  sessions: ProgressSessionLite[],
  weeks = 12,
  anchorMs = Date.now(),
): WeeklyPoint[] {
  const now = new Date(anchorMs)
  const buckets = new Map<number, WeeklyPoint>()

  // Wygeneruj puste buckety dla ostatnich `weeks` tygodni
  for (let i = weeks - 1; i >= 0; i--) {
    const monday = getWeekMonday(addLocalDays(now, -i * 7))
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
  anchorMs = Date.now(),
): PeriodComparison {
  const cutoffMs = anchorMs - rangeDays * 86_400_000
  const previousCutoffMs = cutoffMs - rangeDays * 86_400_000
  const current = sessions.filter((s) => s.finishedAt >= cutoffMs)
  const previous = sessions.filter((s) => s.finishedAt >= previousCutoffMs && s.finishedAt < cutoffMs)

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
  [key: string]: number | string
}

export interface StrengthSeries {
  key: string
  exerciseName: string
  color: string
}

const SERIES_COLORS = ['#f0435a', '#8fb8a0', '#f0a75a', '#d97b91', '#b8a8b2']

export function aggregateStrengthProgression(
  sessions: ProgressSessionLite[],
  limit?: number,
): { data: StrengthPoint[]; series: StrengthSeries[] } {
  // Znajdź najczęściej trenowane ćwiczenia
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

  const rankedExercises = [...exerciseCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count
      || a[1].name.localeCompare(b[1].name, 'pl')
      || a[0].localeCompare(b[0]))

  const selectedExercises = limit === undefined
    ? rankedExercises
    : rankedExercises.slice(0, limit)

  if (selectedExercises.length === 0) return { data: [], series: [] }

  const topKeys = new Set(selectedExercises.map(([key]) => key))

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
        point[key] = weight
      }
      return point
    })

  const series: StrengthSeries[] = selectedExercises.map(([key, meta], i) => ({
    key,
    exerciseName: meta.name,
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
  anchorMs = Date.now(),
): HeatmapDay[] {
  // Wygeneruj grid: weeks tygodni × 7 dni
  const now = new Date(anchorMs)
  const startMonday = getWeekMonday(now)
  startMonday.setDate(startMonday.getDate() - (weeks - 1) * 7)

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
      const cellDate = addLocalDays(startMonday, w * 7 + d)
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
