export const AI_QUOTA_HEADER = 'X-IronLog-AI-Quota'
export const COACH_DAILY_LIMIT = 20
export const COACH_PLAN_COST = 5

export interface CoachQuotaUsage {
  used: number
  limit: number
}

export function formatQuotaHeader({ used, limit }: CoachQuotaUsage): string {
  return `used=${used};limit=${limit}`
}

export function parseQuotaHeader(value: string | null | undefined): CoachQuotaUsage | null {
  const match = /^used=(\d+);limit=(\d+)$/.exec(value?.trim() ?? '')
  return match ? { used: Number(match[1]), limit: Number(match[2]) } : null
}

export function nextUtcMidnight(now: number): string {
  const date = new Date(now)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)).toISOString()
}

// "01:00" in the viewer's own time, for the moment the daily allowance resets.
export function resetTimeLabel(resetAt: string): string {
  const date = new Date(resetAt)
  return Number.isNaN(date.getTime()) ? 'midnight UTC' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
