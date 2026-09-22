import { getCappedWorkoutFinishedAt } from '../../src/lib/sessionDuration'
import { formatCompactVolume, kgToDisplayWeight, type WeightUnits } from '../../src/shared/weightUnits'
import type { ExerciseSource } from './session'

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

export interface WorkoutMonthGroup {
  key: string
  label: string
  workouts: DerivedWorkout[]
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

export function groupWorkoutsByMonth(workouts: DerivedWorkout[]): WorkoutMonthGroup[] {
  const groups: WorkoutMonthGroup[] = []
  for (const item of workouts) {
    const date = new Date(item.workout.startedAt)
    const key = `${date.getFullYear()}-${date.getMonth()}`
    const current = groups.at(-1)
    if (current?.key === key) current.workouts.push(item)
    else {
      const label = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(item.workout.startedAt)
      groups.push({ key, label: label.charAt(0).toLocaleUpperCase('en-US') + label.slice(1), workouts: [item] })
    }
  }
  return groups
}

export function formatHistoryDate(timestamp: number): string {
  const date = new Date(timestamp)
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return `${weekdays[date.getDay()]}, ${date.getDate()}`
}

export function formatWorkoutDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

export function formatWorkoutDuration(start: number, end: number): string {
  const minutes = Math.round((getCappedWorkoutFinishedAt(start, end) - start) / 60_000)
  if (minutes < 1) return '< 1 min'
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export function formatExercisePreview(exerciseNames: string[]): string {
  if (exerciseNames.length === 0) return 'no exercises'
  const visibleNames = exerciseNames.slice(0, 3)
  const hiddenCount = exerciseNames.length - visibleNames.length
  return `${visibleNames.join(' · ')}${hiddenCount > 0 ? ` · +${hiddenCount}` : ''}`
}

export function workoutVolumeLabel(volumeKg: number, units: WeightUnits): string {
  return formatCompactVolume(volumeKg, units)
}

export function workoutSetVolumeLabel(weightKg: number, reps: number, units: WeightUnits): string {
  return kgToDisplayWeight(weightKg * reps, units).toLocaleString('en-US')
}
