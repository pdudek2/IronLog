import { exercises, type Category } from '../../data/exercises'
import { kgToDisplayWeight, type WeightUnits } from './weightUnits'
import { addLocalDays } from './week'

const MUSCLE_KEYS = ['chest', 'shoulders', 'triceps', 'back', 'biceps', 'forearms', 'quads', 'hamstrings', 'glutes', 'calves', 'core']
export const PROGRESS_MUSCLE_COLORS: Record<string, string> = Object.fromEntries(MUSCLE_KEYS.map((key) => [key, '#a89f98']))
export const PROGRESS_MUSCLE_LABELS: Record<string, string> = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps', quads: 'Quads',
  hamstrings: 'Hamstrings', glutes: 'Glutes', core: 'Core', calves: 'Calves', forearms: 'Forearms',
}

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

// Monday 00:00:00.000 local dla danej daty
function getWeekMonday(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return d
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
    const label = monday.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
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

export function withoutLeadingEmptyWeeks(points: WeeklyPoint[]): WeeklyPoint[] {
  const first = points.findIndex(({ volume }) => volume > 0)
  return first > 0 ? points.slice(first) : points
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

// Lifts move a few percent at a time, so the axis follows the data instead of starting at 0.
export function strengthChartScale(values: number[], tickCount = 3): { ticks: number[]; lo: number; hi: number } {
  if (!values.length) return { ticks: [0, 1], lo: 0, hi: 1 }
  const least = Math.min(...values)
  const most = Math.max(...values)
  const [min, max] = least === most ? [Math.max(0, least - 2.5), most + 2.5] : [least, most]
  const rough = (max - min) / (tickCount - 1)
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude >= rough)! * magnitude
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const ticks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, index) => Math.round((lo + index * step) * 10_000) / 10_000)
  return { ticks, lo: ticks[0]!, hi: ticks.at(-1)! }
}

export function strengthDeltaLabel(firstKg: number, latestKg: number, firstDate: string, units: WeightUnits): string {
  const delta = Math.round((latestKg - firstKg) * 10_000) / 10_000
  if (!delta) return `No change since ${firstDate}`
  return `${delta > 0 ? '+' : '−'}${kgToDisplayWeight(Math.abs(delta), units)} ${units} since ${firstDate}`
}

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

const SERIES_COLORS = ['#efe7dc', '#a89f98', '#c9bdb0', '#7f766f', '#5f5751']

const MAIN_LIFT_CATEGORIES: Category[] = ['chest', 'back', 'legs', 'shoulders']
const MAIN_LIFT_KEYS = new Set(exercises
  .filter(({ category, equipment }) => equipment === 'barbell' && MAIN_LIFT_CATEGORIES.includes(category))
  .map(({ id }) => `global:${id}`))

export function defaultStrengthKey(series: { key: string }[]): string | null {
  return (series.find(({ key }) => MAIN_LIFT_KEYS.has(key)) ?? series[0])?.key ?? null
}

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
      || a[1].name.localeCompare(b[1].name, 'en-US')
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
        date: new Date(day.timestamp).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
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
