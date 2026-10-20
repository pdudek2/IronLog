import { getCappedWorkoutFinishedAt } from '../lib/sessionDuration'

// History list formatting shared by web and native, so both show the same dates, durations and month groups.
export interface WorkoutMonthGroup<T> {
  key: string
  label: string
  workouts: T[]
}

export function groupWorkoutsByMonth<T extends { workout: { startedAt: number } }>(workouts: T[]): WorkoutMonthGroup<T>[] {
  const groups: WorkoutMonthGroup<T>[] = []
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
