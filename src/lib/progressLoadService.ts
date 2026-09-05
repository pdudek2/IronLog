import {
  getProgressSessions,
  getRecords,
  type ProgressRecordsResult,
  type ProgressSessionsResult,
} from './progressService'
import { getRecentWorkouts, retryPendingMaterializations } from './workoutService'

export type ProgressDatasetResult<T> =
  | { status: 'success'; value: T }
  | { status: 'error'; error: unknown }

export interface ProgressLoadResult {
  sessions: ProgressDatasetResult<ProgressSessionsResult>
  records: ProgressDatasetResult<ProgressRecordsResult>
  freshness: 'fresh' | 'uncertain'
  fetchedAt: number
}

function toDatasetResult<T>(result: PromiseSettledResult<T>): ProgressDatasetResult<T> {
  return result.status === 'fulfilled'
    ? { status: 'success', value: result.value }
    : { status: 'error', error: result.reason }
}

export async function loadProgressData(
  uid: string,
  rangeDays: number,
  now = Date.now(),
): Promise<ProgressLoadResult> {
  let freshness: ProgressLoadResult['freshness'] = 'fresh'

  try {
    const recent = await getRecentWorkouts(uid, 50)
    const retry = await retryPendingMaterializations(recent)
    if (retry.failed > 0) freshness = 'uncertain'
  } catch {
    freshness = 'uncertain'
  }

  const [sessionsResult, recordsResult] = await Promise.allSettled([
    getProgressSessions(uid, now - 2 * rangeDays * 86_400_000),
    getRecords(uid),
  ])

  return {
    sessions: toDatasetResult(sessionsResult),
    records: toDatasetResult(recordsResult),
    freshness,
    fetchedAt: now,
  }
}
