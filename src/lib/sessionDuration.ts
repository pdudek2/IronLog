export const MAX_ACTIVE_SESSION_AGE_MS = 12 * 60 * 60 * 1000

export function isActiveSessionStale(
  session: { startedAt: number } | null,
  now = Date.now(),
): boolean {
  if (!session || !Number.isFinite(session.startedAt)) return false
  return now - session.startedAt > MAX_ACTIVE_SESSION_AGE_MS
}

export function refreshStaleActiveSession<T extends { startedAt: number }>(
  session: T,
  now = Date.now(),
): T {
  return {
    ...session,
    startedAt: now,
  }
}

export function getCappedWorkoutFinishedAt(startedAt: number, now = Date.now()): number {
  if (!Number.isFinite(startedAt) || !Number.isFinite(now)) return now
  // startedAt comes from the device clock, so a fast device can start "after" the server finishes it.
  if (now <= startedAt) return startedAt
  return Math.min(now, startedAt + MAX_ACTIVE_SESSION_AGE_MS)
}

export function getStaleSessionAgeLabel(startedAt: number, now = Date.now()): string {
  const ageMs = Math.max(0, now - startedAt)
  const days = Math.floor(ageMs / 86_400_000)
  if (days >= 1) return `${days} ${days === 1 ? 'day' : 'days'}`

  const hours = Math.max(1, Math.floor(ageMs / 3_600_000))
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
}
