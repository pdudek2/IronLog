// No runtime imports: the API imports this file directly.
export const PLAN_DAY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

// Days saved before ids existed read as d<index>; the next plan save stores exactly these ids.
export function planDayId(day: { id?: unknown }, index: number): string {
  return typeof day.id === 'string' && PLAN_DAY_ID_PATTERN.test(day.id) ? day.id : `d${index}`
}

// A day added in an editor never takes d<index>: after a deletion that id can belong to a surviving day.
export function newPlanDayId(): string {
  return `day-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function planDayIndex(plan: { days: { id?: unknown }[] }, dayId: string | null | undefined): number {
  return dayId ? plan.days.findIndex((day, index) => planDayId(day, index) === dayId) : -1
}
