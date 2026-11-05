import { planDayIndex } from './planDay'

// Calendar and launch helpers that Home shows the same way on web and native.
export const WEEK_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export const weekdayLabel = (timestamp: number) => WEEK_LABELS[(new Date(timestamp).getDay() + 6) % 7]!

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

// The day after the last finished plan workout; one queue that follows that workout's plan.
export function nextPlanWorkout(
  plans: Array<{ id: string; days: Array<{ id?: unknown; exercises: unknown[] }> }>,
  workouts: Array<{ templateId?: string | null; planDayId?: string | null; finishedAt: number }>,
): { templateId: string; dayIndex: number } | null {
  const last = workouts
    .filter((workout) => plans.some((plan) => plan.id === workout.templateId && plan.days.some((day) => day.exercises.length > 0)))
    .reduce<(typeof workouts)[number] | null>((latest, workout) => (!latest || workout.finishedAt > latest.finishedAt ? workout : latest), null)
  if (!last) return firstLaunchableWorkout(plans)
  const plan = plans.find((candidate) => candidate.id === last.templateId)!
  const done = planDayIndex(plan, last.planDayId)
  const count = plan.days.length
  for (let step = 1; step <= count; step += 1) {
    const dayIndex = done < 0 ? step - 1 : (done + step) % count
    if (plan.days[dayIndex]!.exercises.length > 0) return { templateId: plan.id, dayIndex }
  }
  return null
}
