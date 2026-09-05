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
      signals: ['Brak treningów w ostatnich 30 dniach.'],
      recommendations: ['Zacznij od spokojnej sesji bazowej i odbuduj regularność.'],
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
    ? 'Profil: dane chwilowo niedostępne.'
    : [
        context.displayName ? `Użytkownik: ${context.displayName}` : null,
        context.primaryGoal ? `Cel główny: ${context.primaryGoal}` : null,
        context.weeklyGoal ? `Cel tygodniowy: ${context.weeklyGoal} sesje` : null,
        context.units ? `Jednostki: ${context.units}` : null,
      ].filter(Boolean).join(' | ') || 'Profil: brak danych.'

  const readinessLine = context.sources.readiness === 'unavailable'
    ? 'Readiness: dane chwilowo niedostępne.'
    : context.readiness
      ? `Readiness: ${context.readiness.score}/100 (${context.readiness.label}), dzień ${context.readiness.date}`
      : 'Readiness: brak dzisiejszego lub ostatniego wpisu.'

  const workoutsLine = context.sources.workouts === 'unavailable'
    ? 'Historia treningów: dane chwilowo niedostępne.'
    : formatRecentWorkouts(context.recentWorkouts)

  const recordsLine = context.sources.records === 'unavailable'
    ? 'Rekordy: dane chwilowo niedostępne.'
    : formatRecords(context.topRecords)

  const monthlyLine = context.sources.workouts !== 'available'
    ? [
        context.sources.workouts === 'limited'
          ? 'Analiza 30 dni jest niepełna: limit odczytu obejmuje tylko najnowsze treningi. Nie wyliczaj sum miesięcznych ani nie wnioskuj o słabszych tygodniach z tego wycinka.'
          : 'Analiza treningów: dane chwilowo niedostępne.',
        ...context.monthlyInsights.signals.map((signal) => `- ${signal}`),
        ...context.monthlyInsights.recommendations.map((recommendation) => `Rekomendacja: ${recommendation}`),
      ].join('\n')
    : formatMonthlyInsights(context.monthlyInsights)

  return {
    profileLine,
    readinessLine,
    workoutsHeading: 'OSTATNIE 4 TRENINGI',
    workoutsLine,
    monthlyHeading: 'SYGNAŁY Z OSTATNICH 30 DNI',
    monthlyLine,
    recordsHeading: 'TOP REKORDY',
    recordsLine,
  }
}

function formatRecentWorkouts(workouts: AiWorkoutSummary[]): string {
  if (workouts.length === 0) return 'Brak ostatnich treningów.'
  return workouts.map((workout) => {
    const date = new Date(workout.startedAt).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })
    const exerciseLines = workout.exercises.length > 0
      ? workout.exercises
          .map((exercise) => `  - ${exercise.name}: ${exercise.setCount} serie, ${exercise.totalVolume} kg volume, sety [${exercise.setsSummary}]`)
          .join('\n')
      : '  - brak szczegółów ćwiczeń'
    return `${date} — ${workout.label} — ${workout.exerciseCount} ćwiczeń — ${workout.totalVolume} kg\n${exerciseLines}`
  }).join('\n')
}

function formatRecords(records: AiUserContext['topRecords']): string {
  if (records.length === 0) return 'Brak rekordów.'
  return records
    .map((record) => `${record.exerciseName}: max ${record.maxWeight} kg, reps ${record.maxReps}, volume ${record.bestVolume}`)
    .join('\n')
}

function formatMonthlyInsights(insights: AiMonthlyInsights): string {
  return [
    `${insights.workoutCount} treningów / ${insights.totalVolume} kg w ostatnich ${insights.windowDays} dniach.`,
    `Średnio ${insights.averageWorkoutVolume} kg na trening.`,
    ...insights.signals.map((signal) => `- ${signal}`),
    ...insights.recommendations.map((recommendation) => `Rekomendacja: ${recommendation}`),
  ].join('\n')
}

export function summarizeWorkout(workout: AiContextWorkoutInput): AiWorkoutSummary {
  const exercises = summarizeWorkoutExercises(workout.exercises)

  return {
    label: readOptionalString(workout.label) ?? 'Sesja',
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
    const name = readOptionalString(record.name) ?? 'Ćwiczenie'
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
    signals.push(`readiness był obniżony przez ${lowReadinessStreak.length} dni z rzędu; główne sygnały to sen/nastrój/obolałość.`)
    recommendations.push('Po takim okresie wracaj przez 1-2 treningi na 80-90% normalnej objętości zamiast nadrabiać wszystko jedną sesją.')
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
    signals.push(`Wykryto słabszy tydzień ${bucket.index + 1}: ${bucket.workouts} treningów i ${bucket.volume} kg objętości względem celu ${goal} sesji.`)
  }

  if (monthlyWorkouts.length === 0) {
    signals.push('Brak treningów w ostatnich 30 dniach.')
    recommendations.push('Zacznij od spokojnej sesji bazowej i odbuduj regularność.')
  } else if (weakBuckets.length > 0 && recommendations.length === 0) {
    recommendations.push('Po słabszym tygodniu zrób pierwszy trening powrotny lżej i oceniaj gotowość po rozgrzewce.')
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
    signals.push(`Najczęściej powtarzane ćwiczenia: ${topExercises.join(', ')}.`)
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

  if (score >= 70) return { score, label: 'Gotowy' }
  if (score >= 40) return { score, label: 'Umiarkowany' }
  return { score, label: 'Odpoczynek' }
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
