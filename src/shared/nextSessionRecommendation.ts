import { computeReadinessScore, type ReadinessEntry } from './readiness'
import { exercises as exerciseCatalogue } from '../../data/exercises'
import { buildProgression, type ProgressionSession } from './progression'
import { exerciseRoles } from './compression'
import type { WeightUnits } from './weightUnits'

type ExerciseSource = 'global' | 'user'
export interface RecommendationTemplate {
  name: string
  days: { name: string; exercises: { exerciseId: string; exerciseSource: ExerciseSource; name: string; sets: number; targetReps: number; targetWeight: number }[] }[]
}
export interface RecommendationWorkout {
  finishedAt: number
  exercises: { exerciseId?: string; exerciseSource?: ExerciseSource; sets: { weight: number; reps: number }[] }[]
}
export interface TemplateExerciseOverride { sets?: number; weight?: number; reps?: number }
export type TemplateExerciseOverrideMap = ReadonlyMap<string, TemplateExerciseOverride>
export function templateExerciseKey(exerciseId: string, source: ExerciseSource): string { return `${source}:${exerciseId}` }

export function applyOverload<T extends { weight: string; reps: string; done: boolean }>(sets: T[], values: { weight?: number; reps?: number }): T[] {
  return sets.map((set) => (set.done ? set : {
    ...set,
    ...(values.weight !== undefined ? { weight: String(values.weight) } : {}),
    ...(values.reps !== undefined ? { reps: String(values.reps) } : {}),
  }))
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
}

export interface NextSessionRecommendation {
  dayName: string
  score: number
  tone: 'low' | 'mid' | 'high'
  label: string
  exercises: NextSessionExercise[]
  overrides: TemplateExerciseOverrideMap
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
    return sets.length ? [{ finishedAt: workout.finishedAt, sets }] : []
  })
}

function catalogueMeta(exerciseId: string, exerciseSource: ExerciseSource): { equipment?: string; category?: string; muscles: readonly string[] } {
  // shortcut: user exercises fall back to the history step on Train; pass their metadata here if that proves wrong.
  const entry = exerciseSource === 'global' ? exerciseCatalogue.find((exercise) => exercise.id === exerciseId) : undefined
  return { equipment: entry?.equipment, category: entry?.category, muscles: entry?.muscles ?? [] }
}

export function buildNextSessionRecommendation(
  template: RecommendationTemplate,
  dayIndex: number,
  readiness: ReadinessEntry,
  workouts: RecommendationWorkout[],
  now = Date.now(),
  units: WeightUnits = 'kg',
): NextSessionRecommendation {
  const day = template.days[dayIndex] ?? template.days[0]
  const score = computeReadinessScore(readiness)
  const exercises = day?.exercises ?? []
  const overrides = new Map<string, TemplateExerciseOverride>()
  const roles = exerciseRoles(exercises.map((exercise) => catalogueMeta(exercise.exerciseId, exercise.exerciseSource)))

  const recommendedExercises = exercises.map((exercise, index): NextSessionExercise => {
    const key = templateExerciseKey(exercise.exerciseId, exercise.exerciseSource)
    const sessions = exerciseProgressionSessions(workouts, exercise.exerciseId, exercise.exerciseSource)
    const { equipment, category } = catalogueMeta(exercise.exerciseId, exercise.exerciseSource)
    const progression = buildProgression({
      sessions,
      target: { reps: exercise.targetReps, sets: exercise.sets },
      equipment,
      category,
      units,
      lowReadiness: score.tone === 'low',
      now,
    })
    const latest = [...sessions].sort((a, b) => b.finishedAt - a.finishedAt)[0]
    const lastWeight = latest ? Math.max(0, ...latest.sets.map((set) => set.weight)) : 0
    // A very long break leaves the start weight to the user (empty field).
    const weight = progression ? progression.weight ?? 0 : lastWeight > 0 ? lastWeight : exercise.targetWeight
    const weightDelta = progression?.change === 'weight' ? progression.delta : 0

    // Low readiness: one set less, the main lift never below 2 (Specyfikacja punktu 3); mid cuts nothing.
    const floor = roles[index] === 'main' ? Math.min(2, exercise.sets) : 1
    const sets = score.tone === 'low' ? Math.max(floor, exercise.sets - 1) : exercise.sets
    const setsDelta = sets - exercise.sets
    const reps = progression?.reps ?? exercise.targetReps
    overrides.set(key, { sets, weight, reps })

    return {
      exerciseId: exercise.exerciseId,
      exerciseSource: exercise.exerciseSource,
      name: exercise.name,
      sets,
      reps,
      weight,
      setsDelta,
      weightDelta,
    }
  })

  return {
    dayName: day?.name?.trim() || template.name,
    score: score.score,
    tone: score.tone,
    label: score.label,
    exercises: recommendedExercises,
    overrides,
  }
}
