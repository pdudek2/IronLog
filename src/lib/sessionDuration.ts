import type { ActiveWorkout } from '../store/workoutStore.js'

export const MAX_ACTIVE_SESSION_AGE_MS = 12 * 60 * 60 * 1000

export function isActiveSessionStale(
  session: Pick<ActiveWorkout, 'startedAt'> | null,
  now = Date.now(),
): boolean {
  if (!session || !Number.isFinite(session.startedAt)) return false
  return now - session.startedAt > MAX_ACTIVE_SESSION_AGE_MS
}

export function refreshStaleActiveSession(
  session: ActiveWorkout,
  now = Date.now(),
): ActiveWorkout {
  return {
    ...session,
    startedAt: now,
  }
}

export function getCappedWorkoutFinishedAt(startedAt: number, now = Date.now()): number {
  if (!Number.isFinite(startedAt) || !Number.isFinite(now)) return now
  if (now <= startedAt) return now
  return Math.min(now, startedAt + MAX_ACTIVE_SESSION_AGE_MS)
}

export function getStaleSessionAgeLabel(startedAt: number, now = Date.now()): string {
  const ageMs = Math.max(0, now - startedAt)
  const days = Math.floor(ageMs / 86_400_000)
  if (days >= 1) return `${days} ${days === 1 ? 'dzień' : 'dni'}`

  const hours = Math.max(1, Math.floor(ageMs / 3_600_000))
  return `${hours} ${hours === 1 ? 'godzinę' : hours < 5 ? 'godziny' : 'godzin'}`
}
