import { computeReadinessScore, type ReadinessEntry } from './readiness'
import { exercises as exerciseCatalogue } from '../../data/exercises'
import { buildProgression, type ProgressionSession } from './progression'
import { calibration, compressDay, estimateSec, exerciseKey, exerciseRoles, sessionBlocks, workoutSeconds, type CalibrationSample, type CompressionResult, type DayExercise, type Role } from './compression'
import { isShortened, type CompressionProposal, type CompressionRecord, type LaunchItem } from './compressionRecord'
import type { WeightUnits } from './weightUnits'

type ExerciseSource = 'global' | 'user'
export interface RecommendationTemplate {
  name: string
  days: { name: string; exercises: { exerciseId: string; exerciseSource: ExerciseSource; name: string; sets: number; targetReps: number; targetWeight: number }[] }[]
}
export interface RecommendationWorkout {
  finishedAt: number
  startedAt?: number
  templateId?: string | null
  planDayId?: string | null
  compression?: CompressionRecord | null
  exercises: { exerciseId?: string; exerciseSource?: ExerciseSource; group?: string; sets: { weight: number; reps: number; completedAt?: number }[] }[]
}
export interface ExerciseMeta { muscles: readonly string[]; equipment?: string; category?: string }
export interface TodayOptions {
  // Minutes the user has today; null keeps the usual day.
  budgetMin?: number | null
  straight?: boolean
  // Keeps the plan's sets when a break or a low check-in would cut them.
  fullSets?: boolean
  // This plan day, for calibration and rotation.
  templateId?: string | null
  planDayId?: string | null
  // Metadata of the user's own exercises by `source:id`; the global catalogue covers the rest.
  userExercises?: ReadonlyMap<string, ExerciseMeta>
}
// What a plan start launches instead of the plain day: the ordered list, and the record of a non-usual start.
export interface TemplateLaunch { items: LaunchItem[]; compression?: CompressionRecord | null; proposals?: CompressionProposal[] | null }
export function templateExerciseKey(exerciseId: string, source: ExerciseSource): string { return `${source}:${exerciseId}` }

export function applyOverload<T extends { weight: string; reps: string; done: boolean }>(sets: T[], values: { weight?: number; reps?: number }): T[] {
  return sets.map((set) => (set.done ? set : {
    ...set,
    ...(values.weight !== undefined ? { weight: String(values.weight) } : {}),
    ...(values.reps !== undefined ? { reps: String(values.reps) } : {}),
  }))
}

// A logged weight goes to the open sets that have none, so the next "Log set" cannot record 0 by accident, and to the open
// sets after it while they all still share one weight it changed (a tail the user varied stays). Only a change within
// 80–125% of that tail moves it: below is a warm-up, far above is a top set before planned back-off sets.
export function carryLoggedWeight<T extends { weight: string; done: boolean }>(sets: T[], logged: T): T[] {
  const weight = Number.parseFloat(logged.weight)
  if (!logged.done || !(weight > 0)) return sets
  const at = sets.indexOf(logged)
  const tail = new Set(sets.flatMap((set, index) => {
    const own = Number.parseFloat(set.weight)
    return index > at && !set.done && own > 0 ? [own] : []
  }))
  const shared = tail.size === 1 ? [...tail][0]! : null
  const follow = shared !== null && shared !== weight && weight >= shared * 0.8 && weight <= shared * 1.25
  return sets.map((set, index) => {
    if (set.done) return set
    const own = Number.parseFloat(set.weight)
    return !(own > 0) || (follow && index > at) ? { ...set, weight: logged.weight } : set
  })
}

export interface NextSessionExercise {
  exerciseId: string
  exerciseSource: ExerciseSource
  name: string
  sets: number
  reps: number
  weight: number
  setsDelta: number
  weightDelta: number
  // The first set is a test after a long break (progression engine, rule 6).
  trial: boolean
}

export interface NextSessionRecommendation {
  dayName: string
  // Null without today's readiness entry.
  score: number | null
  tone: 'low' | 'mid' | 'high' | null
  label: string | null
  // Full days since the latest workout when it is a break (15+), else null.
  breakDays: number | null
  // Sets after readiness and the break, before time compression.
  exercises: NextSessionExercise[]
  compression: CompressionResult
  calibration: { factor: number; samples: number; source: 'day' | 'user' | 'none' }
  // Today's start in session order; dropped exercises are absent.
  launch: LaunchItem[]
  // Null for the usual day.
  record: CompressionRecord | null
}

const DAY_MS = 86_400_000
const BREAK_DAYS = 15

// The first workout back after 15–28 days loses a set per exercise, after 29+ half its sets (rounded up); the main lift
// keeps 2. A later workout measures from this one, so only the first is cut (Specyfikacja etapu 2B).
export function breakSets(sets: number, role: Role, breakDays: number | null): number {
  if (breakDays === null || breakDays < BREAK_DAYS || role === 'cardio') return sets
  const floor = role === 'main' ? Math.min(2, sets) : 1
  return Math.max(floor, breakDays > 28 ? Math.ceil(sets / 2) : sets - 1)
}

// Repeated entries of one exercise in a workout count as one session, as in workoutProjection.
function exerciseProgressionSessions(
  workouts: RecommendationWorkout[],
  exerciseId: string,
  exerciseSource: ExerciseSource,
): ProgressionSession[] {
  return workouts.flatMap((workout) => {
    const sets = workout.exercises
      .filter((exercise) => exercise.exerciseId === exerciseId && (exercise.exerciseSource ?? 'global') === exerciseSource)
      .flatMap((exercise) => exercise.sets)
    return sets.length ? [{ finishedAt: workout.finishedAt, sets, shortened: isShortened(workout.compression, exerciseId, exerciseSource, sets) }] : []
  })
}

// What a finished workout did, in the model's blocks: its exercises in order, pairs and circuits by group.
function doneEstimateSec(workout: RecommendationWorkout, meta: (exerciseId: string, source: ExerciseSource) => ExerciseMeta): number {
  const exercises = workout.exercises.filter((exercise) => exercise.exerciseId && exercise.sets.length)
  const roles = exerciseRoles(exercises.map((exercise) => meta(exercise.exerciseId!, exercise.exerciseSource ?? 'global')))
  const blocks = sessionBlocks(exercises.map((exercise) => exercise.sets.length), exercises.map((exercise) => exercise.group))
  return estimateSec(blocks, roles, workout.compression?.shortRest ?? false, workout.compression?.readiness === 'low')
}

// A workout cut mid-session mixes long and short rests, so its model does not say how fast the user is.
function calibrationSample(workout: RecommendationWorkout, meta: (exerciseId: string, source: ExerciseSource) => ExerciseMeta): CalibrationSample[] {
  if (workout.startedAt === undefined || workout.compression?.cut) return []
  const realSec = workoutSeconds(workout.startedAt, workout.exercises.flatMap((exercise) => exercise.sets))
  return realSec === null ? [] : [{ realSec: realSec / 1000, estimateSec: doneEstimateSec(workout, meta) }]
}

export function catalogueMeta(exerciseId: string, exerciseSource: ExerciseSource, userExercises?: ReadonlyMap<string, ExerciseMeta>): ExerciseMeta {
  if (exerciseSource === 'user') return userExercises?.get(templateExerciseKey(exerciseId, 'user')) ?? { muscles: [] }
  const entry = exerciseCatalogue.find((exercise) => exercise.id === exerciseId)
  return { equipment: entry?.equipment, category: entry?.category, muscles: entry?.muscles ?? [] }
}

// Roles of a session's exercises, for the rest timer; user exercises without metadata count as unknown compounds.
export function sessionRoles(exercises: { exerciseId: string; exerciseSource: ExerciseSource }[], userExercises?: ReadonlyMap<string, ExerciseMeta>) {
  return exerciseRoles(exercises.map((exercise) => catalogueMeta(exercise.exerciseId, exercise.exerciseSource, userExercises)))
}

export function buildNextSessionRecommendation(
  template: RecommendationTemplate,
  dayIndex: number,
  readiness: ReadinessEntry | null,
  workouts: RecommendationWorkout[],
  now = Date.now(),
  units: WeightUnits = 'kg',
  options: TodayOptions = {},
): NextSessionRecommendation {
  const day = template.days[dayIndex] ?? template.days[0]
  const score = readiness ? computeReadinessScore(readiness) : null
  const low = score?.tone === 'low'
  const exercises = day?.exercises ?? []
  const meta = (exerciseId: string, source: ExerciseSource) => catalogueMeta(exerciseId, source, options.userExercises)
  const metas = exercises.map((exercise) => meta(exercise.exerciseId, exercise.exerciseSource))
  const roles = exerciseRoles(metas)
  const latestAt = workouts.reduce((latest, workout) => Math.max(latest, workout.finishedAt), -Infinity)
  const gap = Number.isFinite(latestAt) ? Math.floor((now - latestAt) / DAY_MS) : null
  const breakDays = gap !== null && gap >= BREAK_DAYS ? gap : null

  const recommendedExercises = exercises.map((exercise, index): NextSessionExercise => {
    const sessions = exerciseProgressionSessions(workouts, exercise.exerciseId, exercise.exerciseSource)
    const { equipment, category } = metas[index]!
    const progression = buildProgression({
      sessions,
      target: { reps: exercise.targetReps, sets: exercise.sets, weight: exercise.targetWeight },
      equipment,
      category,
      units,
      lowReadiness: low,
      now,
    })
    const latest = [...sessions].sort((a, b) => b.finishedAt - a.finishedAt)[0]
    const lastWeight = latest ? Math.max(0, ...latest.sets.map((set) => set.weight)) : 0
    // A very long break leaves the start weight to the user (empty field).
    const weight = progression ? progression.weight ?? 0 : lastWeight > 0 ? lastWeight : exercise.targetWeight
    const weightDelta = progression?.change === 'weight' ? progression.delta : 0

    // Low readiness: one set less, the main lift never below 2 (Specyfikacja punktu 3); mid cuts nothing. A break cuts
    // the same way or harder; the harder cut wins, the two never add up. Full sets undoes both.
    const floor = roles[index] === 'main' ? Math.min(2, exercise.sets) : 1
    const afterReadiness = low ? Math.max(floor, exercise.sets - 1) : exercise.sets
    const sets = options.fullSets ? exercise.sets : Math.min(afterReadiness, breakSets(exercise.sets, roles[index]!, breakDays))
    const setsDelta = sets - exercise.sets
    const reps = progression?.reps ?? exercise.targetReps

    return {
      exerciseId: exercise.exerciseId,
      exerciseSource: exercise.exerciseSource,
      name: exercise.name,
      sets,
      reps,
      weight,
      setsDelta,
      weightDelta,
      trial: progression?.trial != null,
    }
  })

  const newest = [...workouts].sort((a, b) => b.finishedAt - a.finishedAt)
  const sameDay = newest.filter((workout) => options.planDayId && workout.templateId === options.templateId && workout.planDayId === options.planDayId)
  const pace = calibration(sameDay.flatMap((workout) => calibrationSample(workout, meta)), newest.flatMap((workout) => calibrationSample(workout, meta)))
  // Rotation: what the last workout of this day dropped or cut goes last today.
  const protectedKeys = new Map((sameDay[0]?.compression?.exercises ?? []).filter((entry) => entry.sets < entry.plannedSets)
    .map((entry) => [exerciseKey(entry), entry.sets === 0 ? 2 : 1] as const))
  const dayExercises: DayExercise[] = exercises.map((exercise, index) => ({ exerciseId: exercise.exerciseId, exerciseSource: exercise.exerciseSource, sets: recommendedExercises[index]!.sets, ...metas[index]! }))
  const budgetMin = options.budgetMin ?? null
  const compression = compressDay({ exercises: dayExercises, budgetMin, straight: options.straight, lowReadiness: low, factor: pace.factor, protectedKeys })
  const launch = compression.blocks.flatMap((block) => block.items.filter((item) => item.sets > 0).map((item): LaunchItem => ({
    dayExerciseIndex: item.index, sets: item.sets, weight: recommendedExercises[item.index]!.weight, reps: recommendedExercises[item.index]!.reps,
    ...(block.group && block.items.filter((other) => other.sets > 0).length > 1 ? { group: block.group } : {}),
  })))
  // A low check-in keeps its record with Full sets: the session's rests and the pace calibration follow it.
  const changed = budgetMin !== null || compression.mode !== 'full' || breakDays !== null || low || recommendedExercises.some((exercise) => exercise.setsDelta !== 0)
  const minutes = (sec: number) => Math.round(sec / 6) / 10

  return {
    dayName: day?.name?.trim() || template.name,
    score: score?.score ?? null,
    tone: score?.tone ?? null,
    label: score?.label ?? null,
    breakDays,
    exercises: recommendedExercises,
    compression,
    calibration: pace,
    launch,
    record: changed ? {
      v: 1, budgetMin, mode: compression.mode === 'full' ? 'readiness' : compression.mode, shortRest: compression.shortRest,
      estimateMin: minutes(compression.estimateSec), fullEstimateMin: minutes(compression.fullEstimateSec),
      factor: Math.round(pace.factor * 1000) / 1000, samples: pace.samples, calibration: pace.source, readiness: score?.tone ?? null,
      ...(breakDays !== null ? { breakDays } : {}),
      exercises: exercises.map((exercise, index) => ({ dayExerciseIndex: index, exerciseId: exercise.exerciseId, exerciseSource: exercise.exerciseSource, plannedSets: exercise.sets, sets: compression.sets[index]! })),
    } : null,
  }
}

// Start launches today's version once the user gave a time, checked in or comes back from a break; an untouched day starts
// the plan as written. Today's version keeps the plan's weights and reps: a check-in or a shorter day only changes sets.
export function todayLaunch(plan: NextSessionRecommendation | null, checkedIn: boolean, choice: { budgetMin: number | null; proposals: CompressionProposal[] }): TemplateLaunch | undefined {
  if (!plan || (choice.budgetMin === null && !choice.proposals.length && !checkedIn && plan.breakDays === null)) return undefined
  const items = plan.launch.map(({ dayExerciseIndex, sets, group }) => ({ dayExerciseIndex, sets, ...(group ? { group } : {}) }))
  return { items, ...(plan.record ? { compression: plan.record } : {}), ...(choice.proposals.length ? { proposals: choice.proposals } : {}) }
}
