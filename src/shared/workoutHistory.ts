// History list formatting shared by web and native, so both show the same dates and month groups.
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
