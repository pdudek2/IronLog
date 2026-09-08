import type { WorkoutSummary } from './workoutService'

const CATEGORY_WORKLOAD_INSIGHTS: Record<string, string> = {
  chest: 'Chest accounted for most of the work.',
  back: 'Back accounted for most of the work.',
  legs: 'Legs accounted for most of the work.',
  shoulders: 'Shoulders accounted for most of the work.',
  arms: 'Arms accounted for most of the work.',
  core: 'Core accounted for most of the work.',
  cardio: 'Cardio was the main focus.',
}

export function getCategoryWorkloadInsight(
  category: string,
  fallbackLabel: string,
): string {
  return CATEGORY_WORKLOAD_INSIGHTS[category]
    ?? `Most of the work went to the category “${fallbackLabel}”.`
}

export function workoutTitle(workout: Pick<WorkoutSummary, 'label' | 'exercises'>): string {
  if (workout.label?.trim()) return workout.label.trim()
  const names = workout.exercises.map((exercise) => exercise.name.trim()).filter(Boolean)
  if (!names.length) return 'Workout'
  if (names.length <= 2) return names.join(' + ')
  return `${names[0]} +${names.length - 1}`
}
