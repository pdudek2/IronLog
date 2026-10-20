// Calendar and launch helpers that Home shows the same way on web and native.
export const WEEK_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export function addLocalDays(date: Date, days: number): Date {
  const next = new Date(date.getTime())
  next.setDate(next.getDate() + days)
  return next
}

export function getWeekDates(now: Date): Date[] {
  const monday = new Date(now)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, index) => addLocalDays(monday, index))
}

export function formatWeekRange(dates: Date[]): string {
  const start = dates[0]
  const end = dates.at(-1)
  if (!start || !end) return ''
  const startMonth = start.toLocaleDateString('en-US', { month: 'short' })
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' })
  return start.getMonth() === end.getMonth()
    ? `${startMonth} ${start.getDate()}–${end.getDate()}`
    : `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}`
}

export function getGreeting(now: Date): string {
  const hour = now.getHours()
  if (hour < 6) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Hello'
  return 'Good evening'
}

// The first plan day that has exercises, used when Home has no saved choice.
export function firstLaunchableWorkout(
  templates: Array<{ id: string; days: Array<{ exercises: unknown[] }> }>,
): { templateId: string; dayIndex: number } | null {
  for (const template of templates) {
    const dayIndex = template.days.findIndex((day) => day.exercises.length > 0)
    if (dayIndex >= 0) return { templateId: template.id, dayIndex }
  }
  return null
}
