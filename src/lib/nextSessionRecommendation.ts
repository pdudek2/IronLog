import { buildOverloadSuggestion, type OverloadHistoryEntry } from './overloadService'
import { computeReadinessScore, type ReadinessEntry } from './readinessService'
import {
  templateExerciseKey,
  type TemplateExerciseOverride,
  type TemplateExerciseOverrideMap,
  type WorkoutTemplate,
} from './templateService'
import type { WorkoutExerciseSummary, WorkoutSummary } from './workoutService'
import type { ExerciseSource } from '../store/workoutStore'

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

interface ExerciseHistoryEntry extends OverloadHistoryEntry {
  bestSetReps: number
}

function matchesExercise(
  exercise: WorkoutExerciseSummary,
  exerciseId: string,
  exerciseSource: ExerciseSource,
): boolean {
  return exercise.exerciseId === exerciseId
    && (exercise.exerciseSource ?? 'global') === exerciseSource
}

function exerciseHistory(
  workouts: WorkoutSummary[],
  exerciseId: string,
  exerciseSource: ExerciseSource,
): ExerciseHistoryEntry[] {
  return [...workouts]
    .sort((a, b) => b.finishedAt - a.finishedAt)
    .flatMap((workout) => {
      const exercise = workout.exercises.find((item) => (
        matchesExercise(item, exerciseId, exerciseSource)
      ))
      if (!exercise) return []
      const bestSet = exercise.sets.reduce((best, set) => (
        !best
        || set.weight > best.weight
        || (set.weight === best.weight && set.reps > best.reps)
          ? set
          : best
      ), exercise.sets[0])

      return [{
        bestSetWeight: Math.max(0, bestSet?.weight ?? 0),
        bestSetReps: Math.max(0, bestSet?.reps ?? 0),
        finishedAt: workout.finishedAt,
      }]
    })
}

export function buildNextSessionRecommendation(
  template: WorkoutTemplate,
  dayIndex: number,
  readiness: ReadinessEntry,
  workouts: WorkoutSummary[],
  now = Date.now(),
): NextSessionRecommendation {
  const day = template.days[dayIndex] ?? template.days[0]
  const score = computeReadinessScore(readiness)
  const exercises = day?.exercises ?? []
  const overrides = new Map<string, TemplateExerciseOverride>()

  const recommendedExercises = exercises.map((exercise, index): NextSessionExercise => {
    const key = templateExerciseKey(exercise.exerciseId, exercise.exerciseSource)
    const history = exerciseHistory(workouts, exercise.exerciseId, exercise.exerciseSource)
    const latest = history[0]
    const progression = buildOverloadSuggestion(history, now)
    const applyProgression = progression && (score.tone !== 'low' || progression.delta < 0)
    const baseWeight = latest?.bestSetWeight && latest.bestSetWeight > 0
      ? latest.bestSetWeight
      : exercise.targetWeight
    const weight = applyProgression ? progression.suggestedWeight : baseWeight
    const weightDelta = applyProgression ? progression.delta : 0

    // ponytail: template exercises have no compound/accessory role; mid readiness trims
    // only the final two slots once a day is large enough to make that heuristic safe.
    const trimSets = score.tone === 'low'
      || (score.tone === 'mid' && exercises.length >= 4 && index >= exercises.length - 2)
    const sets = trimSets ? Math.max(1, exercise.sets - 1) : exercise.sets
    const setsDelta = sets - exercise.sets
    const reps = latest?.bestSetReps && latest.bestSetReps > 0
      ? latest.bestSetReps
      : exercise.targetReps
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
