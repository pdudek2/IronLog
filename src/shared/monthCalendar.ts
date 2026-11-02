interface CalendarWorkout {
  id: string
  startedAt: number
}

export function monthCalendar(monthOffset: number, workouts: CalendarWorkout[], now = new Date()) {
  const first = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const year = first.getFullYear()
  const month = first.getMonth()
  const newestByDay = new Map<number, string>()
  for (const workout of [...workouts].sort((left, right) => left.startedAt - right.startedAt)) {
    const date = new Date(workout.startedAt)
    if (date.getFullYear() === year && date.getMonth() === month) newestByDay.set(date.getDate(), workout.id)
  }
  const today = monthOffset === 0 ? now.getDate() : null
  return {
    label: first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    leadingBlanks: (first.getDay() + 6) % 7,
    days: Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) => ({
      day: index + 1,
      today: index + 1 === today,
      workoutId: newestByDay.get(index + 1) ?? null,
    })),
  }
}
