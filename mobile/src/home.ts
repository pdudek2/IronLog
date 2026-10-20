import { getCappedWorkoutFinishedAt } from '../../src/lib/sessionDuration'
import type { SavedWorkout } from './history'
import { deriveWorkout } from './history'
import type { ReadState } from './scopedRead'
import { WEEK_LABELS, addLocalDays, formatWeekRange, getGreeting, getWeekDates } from '../../src/shared/week'

export interface HomeProfile {
  displayName: string
  weeklyGoal: number
  units: 'kg' | 'lbs'
}

export function canShowHomeSummary(state: ReadState<{ workouts: unknown[] }>): boolean {
  return state.status === 'ready' && (!state.fromCache || state.data.workouts.length > 0)
}

export function parseHomeProfile(uid: string, value: unknown): HomeProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid profile')
  const profile = value as Record<string, unknown>
  if ((profile.userId !== undefined && profile.userId !== uid)
    || typeof profile.displayName !== 'string' || !profile.displayName.trim()
    || !Number.isInteger(profile.weeklyGoal) || (profile.weeklyGoal as number) < 1
    || (profile.units !== 'kg' && profile.units !== 'lbs')) throw new Error('Invalid profile')
  return { displayName: profile.displayName.trim(), weeklyGoal: profile.weeklyGoal as number, units: profile.units }
}

export { WEEK_LABELS, addLocalDays, formatWeekRange, getGreeting, getWeekDates }

export function deriveHome(workouts: SavedWorkout[], now: Date) {
  const dates = getWeekDates(now)
  const weekStart = dates[0]!.getTime()
  const weekEnd = addLocalDays(dates[6]!, 1).getTime()
  const previousStart = addLocalDays(dates[0]!, -7).getTime()
  const weekly = workouts.filter((workout) => workout.startedAt >= weekStart && workout.startedAt < weekEnd)
  const previous = workouts.filter((workout) => workout.startedAt >= previousStart && workout.startedAt < weekStart)
  const volume = (items: SavedWorkout[]) => items.reduce((sum, workout) => sum + deriveWorkout(workout, new Map()).totalVolume, 0)
  const weeklyVolume = volume(weekly)
  const previousVolume = volume(previous)
  const days = dates.map((date, index) => {
    const start = date.getTime()
    const end = addLocalDays(date, 1).getTime()
    const daily = weekly.filter((workout) => workout.startedAt >= start && workout.startedAt < end)
    return {
      label: WEEK_LABELS[index]!, date,
      volume: volume(daily),
      sets: daily.reduce((sum, workout) => sum + workout.exercises.reduce((inner, exercise) => inner + exercise.sets.length, 0), 0),
      workouts: daily.length,
      isToday: date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate(),
    }
  })
  return {
    dates, days, weeklyDone: weekly.length, weeklyVolume,
    activeDays: days.filter((day) => day.workouts > 0).length,
    peakDay: days.reduce<(typeof days)[number] | null>((peak, day) => !peak || day.volume > peak.volume ? day : peak, null),
    averageMinutes: weekly.length ? Math.round(weekly.reduce((sum, workout) => sum + getCappedWorkoutFinishedAt(workout.startedAt, workout.finishedAt) - workout.startedAt, 0) / weekly.length / 60_000) : 0,
    averageVolume: weekly.length ? Math.round(weeklyVolume / weekly.length) : 0,
    sessionsDelta: weekly.length - previous.length,
    volumeDelta: previousVolume > 0 && weekly.length > 0 ? Math.round((weeklyVolume - previousVolume) / previousVolume * 100) : null,
    recent: workouts.slice(0, 4),
  }
}
