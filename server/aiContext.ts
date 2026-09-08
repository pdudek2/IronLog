import { pluralize } from '../src/lib/pluralize.js'

const DAY_MS = 24 * 60 * 60 * 1000
const MONTH_WINDOW_DAYS = 30
const RECENT_WORKOUT_LIMIT = 4

export const AI_CONTEXT_SOURCES = ['profile', 'readiness', 'workouts', 'records'] as const
export type AiContextSource = typeof AI_CONTEXT_SOURCES[number]
export type AiContextSourceStatus = 'available' | 'limited' | 'unavailable'
export type AiContextSourceStatuses = Record<AiContextSource, AiContextSourceStatus>

export const AVAILABLE_AI_CONTEXT_SOURCES: AiContextSourceStatuses = {
  profile: 'available',
  readiness: 'available',
  workouts: 'available',
  records: 'available',
}

export interface AiContextSetInput {
  weight?: number | string
  reps?: number | string
}

export interface AiContextExerciseInput {
  name?: string
  sets?: AiContextSetInput[]
}

export interface AiContextWorkoutInput {
  label?: string | null
  startedAt: number
  exercises: unknown
}

export interface AiReadinessInput {
  date?: string
  createdAt: number
  sleep: number
  mood: number
  soreness: number
}

export interface AiContextRecordInput {
  exerciseName: string
  maxWeight: number
  maxReps: number
  bestVolume: number
  lastPerformedAt?: number
}

export interface AiContextProfileInput {
  displayName?: string | null
  primaryGoal?: string | null
  weeklyGoal?: number | null
  units?: string | null
}

export interface AiWorkoutExerciseSummary {
  name: string
  setCount: number
  totalVolume: number
  setsSummary: string
}

export interface AiWorkoutSummary {
  label: string
  startedAt: number
  exerciseCount: number
  totalVolume: number
  exercises: AiWorkoutExerciseSummary[]
}

export interface AiMonthlyInsights {
  windowDays: number
  workoutCount: number
  totalVolume: number
  averageWorkoutVolume: number
  signals: string[]
  recommendations: string[]
}

export interface AiUserContext {
  sources: AiContextSourceStatuses
  displayName: string | null
  primaryGoal: string | null
  weeklyGoal: number | null
  units: string | null
  readiness: {
    score: number
    label: string
    date: string
  } | null
  recentWorkouts: AiWorkoutSummary[]
  topRecords: Array<{
    exerciseName: string
    maxWeight: number
    maxReps: number
    bestVolume: number
  }>
  monthlyInsights: AiMonthlyInsights
}

export interface BuildAiUserContextInput {
  now?: number
  workoutReadLimit?: number
  sources?: AiContextSourceStatuses
  profile: AiContextProfileInput | null
  readinessEntries: AiReadinessInput[]
  workouts: AiContextWorkoutInput[]
  records: AiContextRecordInput[]
}

interface WeeklyBucket {
  index: number
  workouts: number
  volume: number
}

export function createEmptyAiUserContext(): AiUserContext {
  return {
    sources: { ...AVAILABLE_AI_CONTEXT_SOURCES },
    displayName: null,
    primaryGoal: null,
    weeklyGoal: null,
    units: null,
    readiness: null,
    recentWorkouts: [],
    topRecords: [],
    monthlyInsights: {
      windowDays: MONTH_WINDOW_DAYS,
      workoutCount: 0,
      totalVolume: 0,
      averageWorkoutVolume: 0,
      signals: ['No workouts in the last 30 days.'],
      recommendations: ['Start with an easy baseline session and rebuild consistency.'],
    },
  }
}

export function buildAiUserContext({
  now = Date.now(),
  workoutReadLimit,
  sources,
  profile,
  readinessEntries,
  workouts,
  records,
}: BuildAiUserContextInput): AiUserContext {
  const resolvedSources = sources
    ? { ...sources }
    : { ...AVAILABLE_AI_CONTEXT_SOURCES }
  const sortedWorkouts = workouts
    .slice()
    .sort((a, b) => b.startedAt - a.startedAt)

  if (resolvedSources.workouts === 'available'
    && workoutReadLimit !== undefined
    && sortedWorkouts.length >= workoutReadLimit
    && !(sortedWorkouts[sortedWorkouts.length - 1]?.startedAt < now - MONTH_WINDOW_DAYS * DAY_MS)) {
    resolvedSources.workouts = 'limited'
  }

  const recentWorkouts = sortedWorkouts
    .slice(0, RECENT_WORKOUT_LIMIT)
    .map(summarizeWorkout)

  const latestReadiness = readinessEntries
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)[0]

  const readiness = latestReadiness
    ? {
        ...computeReadinessScore(latestReadiness),
        date: String(latestReadiness.date ?? ''),
      }
    : null

  const topRecords = records
    .slice()
    .sort((a, b) => {
      const weightDiff = b.maxWeight - a.maxWeight
      if (weightDiff !== 0) return weightDiff
      return (b.lastPerformedAt ?? 0) - (a.lastPerformedAt ?? 0)
    })
    .slice(0, 6)
    .map((record) => ({
      exerciseName: record.exerciseName,
      maxWeight: record.maxWeight,
      maxReps: record.maxReps,
      bestVolume: record.bestVolume,
    }))

  return {
    sources: resolvedSources,
    displayName: readOptionalString(profile?.displayName),
    primaryGoal: readOptionalString(profile?.primaryGoal),
    weeklyGoal: typeof profile?.weeklyGoal === 'number' ? profile.weeklyGoal : null,
    units: readOptionalString(profile?.units),
    readiness,
    recentWorkouts,
    topRecords,
    monthlyInsights: buildMonthlyInsights({
      now,
      weeklyGoal: typeof profile?.weeklyGoal === 'number' ? profile.weeklyGoal : null,
      workouts: sortedWorkouts,
      readinessEntries,
      sources: resolvedSources,
    }),
  }
}

export function buildChatContextSections(context: AiUserContext) {
  const profileLine = context.sources.profile === 'unavailable'
    ? 'Profile: data temporarily unavailable.'
    : [
        context.displayName ? `User: ${context.displayName}` : null,
        context.primaryGoal ? `Primary goal: ${context.primaryGoal}` : null,
        context.weeklyGoal ? `Weekly goal: ${context.weeklyGoal} ${pluralize(context.weeklyGoal, 'session', 'sessions')}` : null,
        context.units ? `Units: ${context.units}` : null,
      ].filter(Boolean).join(' | ') || 'Profile: no data.'

  const readinessLine = context.sources.readiness === 'unavailable'
    ? 'Readiness: data temporarily unavailable.'
    : context.readiness
      ? `Readiness: ${context.readiness.score}/100 (${context.readiness.label}), day ${context.readiness.date}`
      : 'Readiness: no current or recent entry.'

  const workoutsLine = context.sources.workouts === 'unavailable'
    ? 'Workout history: data temporarily unavailable.'
    : formatRecentWorkouts(context.recentWorkouts)

  const recordsLine = context.sources.records === 'unavailable'
    ? 'Records: data temporarily unavailable.'
    : formatRecords(context.topRecords)

  const monthlyLine = context.sources.workouts !== 'available'
    ? [
        context.sources.workouts === 'limited'
          ? 'The 30-day analysis is incomplete: the read limit covers only the most recent workouts. Do not calculate monthly totals or infer weaker weeks from this subset.'
          : 'Workout analysis: data temporarily unavailable.',
        ...context.monthlyInsights.signals.map((signal) => `- ${signal}`),
        ...context.monthlyInsights.recommendations.map((recommendation) => `Recommendation: ${recommendation}`),
      ].join('\n')
    : formatMonthlyInsights(context.monthlyInsights)

  return {
    profileLine,
    readinessLine,
    workoutsHeading: 'RECENT 4 WORKOUTS',
    workoutsLine,
    monthlyHeading: 'SIGNALS FROM THE LAST 30 DAYS',
    monthlyLine,
    recordsHeading: 'TOP RECORDS',
    recordsLine,
  }
}

function formatRecentWorkouts(workouts: AiWorkoutSummary[]): string {
  if (workouts.length === 0) return 'No recent workouts.'
  return workouts.map((workout) => {
    const date = new Date(workout.startedAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
    const exerciseLines = workout.exercises.length > 0
      ? workout.exercises
          .map((exercise) => `  - ${exercise.name}: ${exercise.setCount} ${pluralize(exercise.setCount, 'set', 'sets')}, ${exercise.totalVolume} kg volume, sets [${exercise.setsSummary}]`)
          .join('\n')
      : '  - no exercise details'
    return `${date} — ${workout.label} — ${workout.exerciseCount} ${pluralize(workout.exerciseCount, 'exercise', 'exercises')} — ${workout.totalVolume} kg\n${exerciseLines}`
  }).join('\n')
}

function formatRecords(records: AiUserContext['topRecords']): string {
  if (records.length === 0) return 'No records.'
  return records
    .map((record) => `${record.exerciseName}: max ${record.maxWeight} kg, reps ${record.maxReps}, volume ${record.bestVolume}`)
    .join('\n')
}

function formatMonthlyInsights(insights: AiMonthlyInsights): string {
  return [
    `${insights.workoutCount} ${pluralize(insights.workoutCount, 'workout', 'workouts')} / ${insights.totalVolume} kg over the last ${insights.windowDays} days.`,
    `Average ${insights.averageWorkoutVolume} kg per workout.`,
    ...insights.signals.map((signal) => `- ${signal}`),
    ...insights.recommendations.map((recommendation) => `Recommendation: ${recommendation}`),
  ].join('\n')
}

export function summarizeWorkout(workout: AiContextWorkoutInput): AiWorkoutSummary {
  const exercises = summarizeWorkoutExercises(workout.exercises)

  return {
    label: readOptionalString(workout.label) ?? 'Session',
    startedAt: finiteNumber(workout.startedAt),
    exerciseCount: Array.isArray(workout.exercises) ? workout.exercises.length : exercises.length,
    totalVolume: exercises.reduce((sum, exercise) => sum + exercise.totalVolume, 0),
    exercises,
  }
}

function summarizeWorkoutExercises(exercises: unknown): AiWorkoutExerciseSummary[] {
  if (!Array.isArray(exercises)) return []

  return exercises.flatMap((exercise) => {
    const record = asRecord(exercise)
    const name = readOptionalString(record.name) ?? 'Exercise'
    const rawSets = Array.isArray(record.sets) ? record.sets : []
    const normalizedSets = rawSets
      .map((set) => {
        const setRecord = asRecord(set)
        return {
          weight: finiteNumber(setRecord.weight ?? setRecord.weightKg),
          reps: finiteNumber(setRecord.reps),
        }
      })
      .filter((set) => set.reps > 0 && set.weight >= 0)

    if (normalizedSets.length === 0) return []

    const totalVolume = normalizedSets.reduce((sum, set) => sum + set.weight * set.reps, 0)
    const setsSummary = normalizedSets
      .slice(0, 6)
      .map((set) => `${set.weight}x${set.reps}`)
      .join(', ')

    return [{
      name,
      setCount: normalizedSets.length,
      totalVolume,
      setsSummary,
    }]
  })
}

function buildMonthlyInsights({
  now,
  weeklyGoal,
  workouts,
  readinessEntries,
  sources,
}: {
  now: number
  weeklyGoal: number | null
  workouts: AiContextWorkoutInput[]
  readinessEntries: AiReadinessInput[]
  sources: AiContextSourceStatuses
}): AiMonthlyInsights {
  const since = now - MONTH_WINDOW_DAYS * DAY_MS
  const signals: string[] = []
  const recommendations: string[] = []
  const lowReadinessStreak = sources.readiness === 'available'
    ? findLowReadinessStreak(readinessEntries, since, now)
    : []
  if (lowReadinessStreak.length >= 2) {
    signals.push(`readiness was low for ${lowReadinessStreak.length} consecutive days; the main signals were sleep, mood and soreness.`)
    recommendations.push('After this period, use 80–90% of normal volume for 1–2 workouts rather than making up for everything in one session.')
  }

  if (sources.workouts !== 'available') {
    return {
      windowDays: MONTH_WINDOW_DAYS,
      workoutCount: 0,
      totalVolume: 0,
      averageWorkoutVolume: 0,
      signals,
      recommendations,
    }
  }

  const monthlyWorkouts = workouts
    .filter((workout) => workout.startedAt >= since && workout.startedAt <= now)
    .map(summarizeWorkout)

  const totalVolume = monthlyWorkouts.reduce((sum, workout) => sum + workout.totalVolume, 0)
  const averageWorkoutVolume = monthlyWorkouts.length > 0 ? Math.round(totalVolume / monthlyWorkouts.length) : 0
  const weeklyBuckets = buildWeeklyBuckets(now, monthlyWorkouts)
  const goal = weeklyGoal ?? 3
  const weakBuckets = sources.profile === 'available'
    ? weeklyBuckets.filter((bucket) => {
        if (bucket.workouts === 0) return false
        const belowGoal = bucket.workouts < goal
        const strongerNeighbor = weeklyBuckets.some((candidate) => candidate.workouts >= goal || candidate.volume >= bucket.volume * 1.6)
        return belowGoal && strongerNeighbor
      })
    : []

  for (const bucket of weakBuckets.slice(0, 2)) {
    signals.push(`A weaker week was detected (week ${bucket.index + 1}): ${bucket.workouts} ${pluralize(bucket.workouts, 'workout', 'workouts')} and ${bucket.volume} kg volume against a goal of ${goal} ${pluralize(goal, 'session', 'sessions')}.`)
  }

  if (monthlyWorkouts.length === 0) {
    signals.push('No workouts in the last 30 days.')
    recommendations.push('Start with an easy baseline session and rebuild consistency.')
  } else if (weakBuckets.length > 0 && recommendations.length === 0) {
    recommendations.push('After a weaker week, make your first workout back lighter and assess readiness after warming up.')
  }

  const exerciseCounts = new Map<string, number>()
  for (const workout of monthlyWorkouts) {
    for (const exercise of workout.exercises) {
      exerciseCounts.set(exercise.name, (exerciseCounts.get(exercise.name) ?? 0) + 1)
    }
  }
  const topExercises = [...exerciseCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => `${name} (${count}x)`)

  if (topExercises.length > 0) {
    signals.push(`Most frequent exercises: ${topExercises.join(', ')}.`)
  }

  return {
    windowDays: MONTH_WINDOW_DAYS,
    workoutCount: monthlyWorkouts.length,
    totalVolume,
    averageWorkoutVolume,
    signals,
    recommendations,
  }
}

function buildWeeklyBuckets(now: number, workouts: AiWorkoutSummary[]): WeeklyBucket[] {
  const buckets: WeeklyBucket[] = Array.from({ length: 4 }, (_, index) => ({
    index,
    workouts: 0,
    volume: 0,
  }))

  for (const workout of workouts) {
    const ageDays = Math.floor((now - workout.startedAt) / DAY_MS)
    const index = Math.min(3, Math.max(0, Math.floor(ageDays / 7)))
    buckets[index].workouts += 1
    buckets[index].volume += workout.totalVolume
  }

  return buckets
}

function findLowReadinessStreak(entries: AiReadinessInput[], since: number, now: number): AiReadinessInput[] {
  const chronological = entries
    .filter((entry) => entry.createdAt >= since && entry.createdAt <= now)
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)

  let best: AiReadinessInput[] = []
  let current: Array<{ entry: AiReadinessInput; dayNumber: number }> = []

  for (const entry of chronological) {
    const dayNumber = calendarDayNumber(entry.date)
    if (dayNumber === null || computeReadinessScore(entry).score >= 55) {
      current = []
      continue
    }

    const previous = current[current.length - 1]
    const item = { entry, dayNumber }
    current = previous && dayNumber === previous.dayNumber + 1 ? [...current, item] : [item]

    if (current.length > best.length) best = current.map((candidate) => candidate.entry)
  }

  return best
}

function calendarDayNumber(value: string | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null

  const [year, month, day] = value.split('-').map(Number)
  const timestamp = Date.UTC(year, month - 1, day)
  const parsed = new Date(timestamp)
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) return null

  return Math.floor(timestamp / DAY_MS)
}

function computeReadinessScore(entry: { sleep: number; mood: number; soreness: number }) {
  const raw = entry.sleep * 0.4 + entry.mood * 0.3 + (6 - entry.soreness) * 0.3
  const score = Math.round(((raw - 1) / 4) * 100)

  if (score >= 70) return { score, label: 'Ready' }
  if (score >= 40) return { score, label: 'Moderate' }
  return { score, label: 'Rest' }
}

function readOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized ? normalized : null
}

function finiteNumber(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}
