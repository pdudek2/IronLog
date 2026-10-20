import { EXERCISE_CATEGORY_LABELS } from '../../src/lib/exerciseLabels'
import { formatCompactVolume, kgToDisplayWeight, type WeightUnits } from '../../src/shared/weightUnits'
import type { ExerciseSource } from './session'
import type { WorkoutMonthGroup as MonthGroup } from '../../src/shared/workoutHistory'
export { formatExercisePreview, formatHistoryDate, formatWorkoutDuration, groupWorkoutsByMonth } from '../../src/shared/workoutHistory'
export type WorkoutMonthGroup = MonthGroup<DerivedWorkout>

export interface SavedWorkoutSet {
  weight: number
  reps: number
}

export interface SavedWorkoutExercise {
  exerciseId?: string
  exerciseSource: ExerciseSource
  name: string
  sets: SavedWorkoutSet[]
}

export interface SavedWorkout {
  id: string
  startedAt: number
  finishedAt: number
  materialized: boolean
  templateId?: string | null
  label?: string | null
  exercises: SavedWorkoutExercise[]
}

export interface DerivedWorkout {
  workout: SavedWorkout
  totalSets: number
  totalReps: number
  totalVolume: number
  categories: Set<string>
  exerciseNames: string[]
}

export type HistoryRange = '30' | '90' | '365' | 'all'

const RANGE_DAYS: Record<Exclude<HistoryRange, 'all'>, number> = {
  '30': 30,
  '90': 90,
  '365': 365,
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

function finiteTimestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function parseSavedWorkout(id: string, uid: string, value: unknown): SavedWorkout {
  const record = asRecord(value)
  if (!record || record.userId !== uid) throw new Error('Workout owner does not match the signed-in account.')
  const startedAt = finiteTimestamp(record.startedAt)
  const finishedAt = finiteTimestamp(record.finishedAt)
  if (startedAt === null || finishedAt === null || startedAt < 0 || finishedAt < startedAt) {
    throw new Error('Workout timestamps are invalid.')
  }
  if (!Array.isArray(record.exercises)) throw new Error('Workout exercises are invalid.')

  const exercises = record.exercises.flatMap((value): SavedWorkoutExercise[] => {
    const exercise = asRecord(value)
    if (!exercise || typeof exercise.name !== 'string' || !exercise.name.trim() || !Array.isArray(exercise.sets)) return []
    const source = exercise.exerciseSource === undefined ? 'global' : exercise.exerciseSource
    if (source !== 'global' && source !== 'user') throw new Error('Workout exercise source is invalid.')
    const sets = exercise.sets.flatMap((value): SavedWorkoutSet[] => {
      const set = asRecord(value)
      if (!set) return []
      const weight = finiteNumber(set.weight ?? set.weightKg)
      const reps = finiteNumber(set.reps)
      if (weight === null || reps === null || weight < 0 || reps <= 0) return []
      return [{ weight, reps }]
    })
    if (sets.length === 0) return []
    const exerciseId = typeof exercise.exerciseId === 'string' && exercise.exerciseId.trim()
      ? exercise.exerciseId
      : undefined
    return [{ ...(exerciseId ? { exerciseId } : {}), exerciseSource: source, name: exercise.name.trim(), sets }]
  })

  const label = typeof record.label === 'string' && record.label.trim() ? record.label.trim() : null
  const templateId = typeof record.templateId === 'string' && record.templateId ? record.templateId : null
  return {
    id,
    startedAt,
    finishedAt,
    materialized: record.materialized === true,
    templateId,
    label,
    exercises,
  }
}

export function deriveWorkout(workout: SavedWorkout, exerciseMap: ReadonlyMap<string, { category?: string }>): DerivedWorkout {
  const categories = new Set<string>()
  let totalSets = 0
  let totalReps = 0
  let totalVolume = 0
  const exerciseNames: string[] = []
  for (const exercise of workout.exercises) {
    exerciseNames.push(exercise.name)
    totalSets += exercise.sets.length
    for (const set of exercise.sets) {
      totalReps += set.reps
      totalVolume += set.weight * set.reps
    }
    if (exercise.exerciseId) {
      const category = exerciseMap.get(`${exercise.exerciseSource}:${exercise.exerciseId}`)?.category
      if (category) categories.add(category)
    }
  }
  return { workout, totalSets, totalReps, totalVolume, categories, exerciseNames }
}

export function filterWorkouts(
  workouts: DerivedWorkout[],
  filters: { range: HistoryRange; rangeAnchorMs: number; search: string; category: string | null },
): DerivedWorkout[] {
  const days = filters.range === 'all' ? null : RANGE_DAYS[filters.range]
  const cutoff = days === null ? 0 : filters.rangeAnchorMs - days * 86_400_000
  const search = filters.search.trim().toLocaleLowerCase('en-US')
  return workouts.filter(({ workout, categories, exerciseNames }) => {
    if (workout.startedAt < cutoff) return false
    if (filters.category && !categories.has(filters.category)) return false
    if (!search) return true
    return (workout.label ?? '').toLocaleLowerCase('en-US').includes(search)
      || exerciseNames.some((name) => name.toLocaleLowerCase('en-US').includes(search))
  })
}

export function formatWorkoutDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

// The category most exercises belong to (first seen wins a tie), shown as a small eyebrow beside the date as on web.
export function workoutFocusLabel(categories: (string | undefined)[]): string | null {
  const counts = new Map<string, number>()
  for (const category of categories) if (category) counts.set(category, (counts.get(category) ?? 0) + 1)
  const top = [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0]
  return top ? EXERCISE_CATEGORY_LABELS[top] ?? null : null
}

export function workoutVolumeLabel(volumeKg: number, units: WeightUnits): string {
  return formatCompactVolume(volumeKg, units)
}

export function workoutSetVolumeLabel(weightKg: number, reps: number, units: WeightUnits): string {
  return kgToDisplayWeight(weightKg * reps, units).toLocaleString('en-US')
}
