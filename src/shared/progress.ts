import { exercises, type Category } from '../../data/exercises'
import { kgToDisplayWeight, type WeightUnits } from './weightUnits'
import { addLocalDays } from './week'

const MUSCLE_KEYS = ['chest', 'shoulders', 'triceps', 'back', 'biceps', 'forearms', 'quads', 'hamstrings', 'glutes', 'adductors', 'calves', 'core']
export const PROGRESS_MUSCLE_COLORS: Record<string, string> = Object.fromEntries(MUSCLE_KEYS.map((key) => [key, '#a89f98']))
export const PROGRESS_MUSCLE_LABELS: Record<string, string> = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps', quads: 'Quads',
  hamstrings: 'Hamstrings', glutes: 'Glutes', adductors: 'Adductors', core: 'Core', calves: 'Calves', forearms: 'Forearms',
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
  // Older documents may lack these; 0 reps and null category are the fallbacks.
  bestSetReps?: number
  category?: string | null
  // Assisted exercises only: the set with the least assistance, since the stored best set has the most.
  leastAssisted?: { weight: number; reps: number }
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

// ── All exercises ───────────────────────────────────────────────────────────

const DAY_MS = 86_400_000
const ASSISTED = new Set(['assisted-pull-up'])
const catalogueMuscles = new Map(exercises.map(({ id, muscles }) => [id, muscles]))

export function isAssistedExercise(exerciseId: string | undefined, exerciseSource: 'global' | 'user' | undefined): boolean {
  return exerciseSource === 'global' && !!exerciseId && ASSISTED.has(exerciseId)
}

// The weight of an assisted exercise is help, not load, so it never counts as volume.
export function countsTowardVolume(exerciseId: string | undefined, exerciseSource: 'global' | 'user' | undefined): boolean {
  return !isAssistedExercise(exerciseId, exerciseSource)
}

// Reads the optional fields of an `exerciseSessions` document; old or odd values fall back instead of failing the load.
export function progressExtras(data: Record<string, unknown>, exerciseId: string, exerciseSource: 'global' | 'user'): Pick<ProgressSessionLite, 'bestSetReps' | 'category' | 'leastAssisted'> {
  const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
  let leastAssisted: BestSet | undefined
  if (isAssistedExercise(exerciseId, exerciseSource) && Array.isArray(data.sets)) {
    for (const raw of data.sets as unknown[]) {
      const set = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
      const weight = finite(set.weight)
      const reps = finite(set.reps)
      if (weight === null || reps === null || reps === 0) continue
      if (!leastAssisted || better({ weight, reps }, leastAssisted, true)) leastAssisted = { weight, reps }
    }
  }
  return {
    bestSetReps: finite(data.bestSetReps) ?? 0,
    category: typeof data.category === 'string' ? data.category : null,
    ...(leastAssisted ? { leastAssisted } : {}),
  }
}

export interface SummaryWeek {
  weekStart: number
  weekLabel: string
  volume: number
  current: boolean
}

export interface BestSet {
  weight: number
  reps: number
}

export interface ExerciseSummaryRow {
  key: string
  exerciseId: string
  exerciseSource: 'global' | 'user'
  exerciseName: string
  sessions: number
  best: BestSet
  assisted: boolean
  // kg when the best weight moved, otherwise reps; null without sessions in the previous period.
  change: { unit: 'kg' | 'reps'; value: number } | null
}

export interface AllExercisesSummary {
  weeks: SummaryWeek[]
  fullWeeks: number
  // Mean volume of the full weeks in the range; null before the first full week.
  averageVolume: number | null
  // Percent against the same mean in the period before; null with fewer than 2 full weeks on either side.
  averageDelta: number | null
  workouts: number
  previousWorkouts: number
  // Per full week, or for the current week alone while there is no full week yet.
  muscles: { muscle: string; sets: number }[]
  muscleBasis: 'average' | 'thisWeek'
  exercises: ExerciseSummaryRow[]
}

function bestOf(session: ProgressSessionLite, assisted: boolean): BestSet {
  if (assisted && session.leastAssisted) return session.leastAssisted
  return { weight: session.bestSetWeight, reps: session.bestSetReps ?? 0 }
}

// Server rule: heavier wins, then more reps. With assistance, less help wins.
function better(a: BestSet, b: BestSet, assisted: boolean): boolean {
  if (a.weight !== b.weight) return assisted ? a.weight < b.weight : a.weight > b.weight
  return a.reps > b.reps
}

function mondayOf(ms: number): number {
  return getWeekMonday(new Date(ms)).getTime()
}

export function summarizeAllExercises(sessions: ProgressSessionLite[], rangeDays: number, anchorMs = Date.now()): AllExercisesSummary {
  const rangeStart = anchorMs - rangeDays * DAY_MS
  const previousStart = rangeStart - rangeDays * DAY_MS
  const currentMonday = mondayOf(anchorMs)
  const firstMonday = sessions.length ? mondayOf(Math.min(...sessions.map(({ finishedAt }) => finishedAt))) : currentMonday
  const rangeMonday = mondayOf(rangeStart)
  // Weeks that start inside the range, and none before the first workout.
  const firstFullWeek = Math.max(firstMonday, rangeMonday >= rangeStart ? rangeMonday : addLocalDays(new Date(rangeMonday), 7).getTime())

  const weekVolume = new Map<number, number>()
  for (const session of sessions) {
    if (!countsTowardVolume(session.exerciseId, session.exerciseSource)) continue
    const monday = mondayOf(session.finishedAt)
    weekVolume.set(monday, (weekVolume.get(monday) ?? 0) + session.totalVolume)
  }
  const mondays: number[] = []
  for (let monday = firstFullWeek; monday <= currentMonday; monday = addLocalDays(new Date(monday), 7).getTime()) mondays.push(monday)
  const weeks = mondays.map((monday) => ({
    weekStart: monday,
    weekLabel: new Date(monday).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
    volume: weekVolume.get(monday) ?? 0,
    current: monday === currentMonday,
  }))
  const full = weeks.filter(({ current }) => !current)
  const previousMondays: number[] = []
  for (let monday = addLocalDays(new Date(firstFullWeek), -7).getTime(); previousMondays.length < full.length && monday >= firstMonday; monday = addLocalDays(new Date(monday), -7).getTime()) previousMondays.push(monday)
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
  const averageVolume = full.length ? mean(full.map(({ volume }) => volume)) : null
  const previousAverage = previousMondays.length >= 2 ? mean(previousMondays.map((monday) => weekVolume.get(monday) ?? 0)) : null
  const averageDelta = averageVolume !== null && full.length >= 2 && previousAverage ? calcDelta(averageVolume, previousAverage) : null

  const workoutsIn = (from: number, to: number) => new Set(sessions.filter(({ finishedAt }) => finishedAt >= from && finishedAt < to).map(({ workoutId }) => workoutId)).size

  const muscleBasis = full.length ? 'average' : 'thisWeek'
  const muscleFrom = muscleBasis === 'average' ? firstFullWeek : currentMonday
  const muscleTo = muscleBasis === 'average' ? currentMonday : Infinity
  const muscleSets = new Map<string, number>()
  for (const session of sessions) {
    if (session.finishedAt < muscleFrom || session.finishedAt >= muscleTo || session.category === 'cardio') continue
    const muscles = (session.exerciseSource === 'global' ? catalogueMuscles.get(session.exerciseId) : undefined) ?? session.muscleGroups
    muscles.forEach((muscle, index) => muscleSets.set(muscle, (muscleSets.get(muscle) ?? 0) + session.totalSets * (index === 0 ? 1 : 0.5)))
  }
  const divisor = Math.max(full.length, 1)
  const muscles = [...muscleSets].map(([muscle, sets]) => ({ muscle, sets: sets / divisor })).sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle))

  const rows = new Map<string, ExerciseSummaryRow & { latest: number; previous: BestSet | null; workouts: Set<string> }>()
  for (const session of [...sessions].sort((a, b) => a.finishedAt - b.finishedAt)) {
    if (session.finishedAt < previousStart) continue
    const key = `${session.exerciseSource}:${session.exerciseId}`
    const assisted = isAssistedExercise(session.exerciseId, session.exerciseSource)
    const set = bestOf(session, assisted)
    const row = rows.get(key) ?? { key, exerciseId: session.exerciseId, exerciseSource: session.exerciseSource, exerciseName: session.exerciseName, sessions: 0, best: { weight: 0, reps: 0 }, assisted, change: null, latest: 0, previous: null, workouts: new Set<string>() }
    if (session.finishedAt < rangeStart) {
      if (!row.previous || better(set, row.previous, assisted)) row.previous = set
    } else {
      if (!row.workouts.size || better(set, row.best, assisted)) row.best = set
      row.workouts.add(session.workoutId)
      row.exerciseName = session.exerciseName
      row.latest = session.finishedAt
    }
    rows.set(key, row)
  }
  const exercisesInRange = [...rows.values()].filter(({ workouts }) => workouts.size > 0).map(({ latest: _latest, previous, workouts, ...row }) => ({
    ...row,
    sessions: workouts.size,
    change: !previous ? null : row.best.weight !== previous.weight
      ? { unit: 'kg' as const, value: Math.round((row.best.weight - previous.weight) * 1000) / 1000 }
      : { unit: 'reps' as const, value: row.best.reps - previous.reps },
  }))
  exercisesInRange.sort((a, b) => b.sessions - a.sessions || a.exerciseName.localeCompare(b.exerciseName, 'en-US') || a.key.localeCompare(b.key))

  return {
    weeks, fullWeeks: full.length, averageVolume, averageDelta,
    workouts: workoutsIn(rangeStart, Infinity), previousWorkouts: workoutsIn(previousStart, rangeStart),
    muscles, muscleBasis, exercises: exercisesInRange,
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
