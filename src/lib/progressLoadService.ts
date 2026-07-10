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

const SESSION_WINDOW_MS = 180 * 86_400_000

function toDatasetResult<T>(result: PromiseSettledResult<T>): ProgressDatasetResult<T> {
  return result.status === 'fulfilled'
    ? { status: 'success', value: result.value }
    : { status: 'error', error: result.reason }
}

export async function loadProgressData(
  uid: string,
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
    getProgressSessions(uid, now - SESSION_WINDOW_MS),
    getRecords(uid),
  ])

  return {
    sessions: toDatasetResult(sessionsResult),
    records: toDatasetResult(recordsResult),
    freshness,
    fetchedAt: now,
  }
}
