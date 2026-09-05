import type { WorkoutSummary } from './workoutService'

const CATEGORY_WORKLOAD_INSIGHTS: Record<string, string> = {
  chest: 'Najwięcej pracy poszło na klatkę.',
  back: 'Najwięcej pracy poszło na plecy.',
  legs: 'Najwięcej pracy wykonały nogi.',
  shoulders: 'Najwięcej pracy poszło w barki.',
  arms: 'Najwięcej pracy poszło w ramiona.',
  core: 'Najwięcej pracy wykonał core.',
  cardio: 'Najmocniejszym akcentem było cardio.',
}

export function getCategoryWorkloadInsight(
  category: string,
  fallbackLabel: string,
): string {
  return CATEGORY_WORKLOAD_INSIGHTS[category]
    ?? `Najwięcej pracy przypadło kategorii „${fallbackLabel}”.`
}

export function workoutTitle(workout: Pick<WorkoutSummary, 'label' | 'exercises'>): string {
  if (workout.label?.trim()) return workout.label.trim()
  const names = workout.exercises.map((exercise) => exercise.name.trim()).filter(Boolean)
  if (!names.length) return 'Trening'
  if (names.length <= 2) return names.join(' + ')
  return `${names[0]} +${names.length - 1}`
}
