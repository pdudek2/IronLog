import type { ProgressRecordsResult, ProgressSessionLite, ProgressSessionsResult, RecordSummary } from '../../src/shared/progress'

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid progress document.')
  return value as Record<string, unknown>
}

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Invalid progress text.')
  return value
}

function source(value: unknown): 'global' | 'user' {
  if (value !== 'global' && value !== 'user') throw new Error('Invalid progress exercise source.')
  return value
}

function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Invalid progress number.')
  return value
}

export function parseProgressSession(id: string, uid: string, raw: unknown): ProgressSessionLite {
  const data = object(raw)
  if (data.userId !== uid) throw new Error('Progress session belongs to another account.')
  if (!Array.isArray(data.muscleGroups) || !data.muscleGroups.every((group) => typeof group === 'string')) throw new Error('Invalid progress muscle groups.')
  return {
    id, workoutId: text(data.workoutId), exerciseId: text(data.exerciseId), exerciseSource: source(data.exerciseSource),
    finishedAt: number(data.finishedAt), totalVolume: number(data.totalVolume), totalSets: number(data.totalSets),
    bestSetWeight: number(data.bestSetWeight), exerciseName: text(data.exerciseName), muscleGroups: data.muscleGroups,
  }
}

export function parseProgressRecord(id: string, uid: string, raw: unknown): RecordSummary {
  const data = object(raw)
  if (data.userId !== uid) throw new Error('Progress record belongs to another account.')
  return {
    id, exerciseId: text(data.exerciseId), exerciseSource: source(data.exerciseSource), exerciseName: text(data.exerciseName),
    maxWeight: number(data.maxWeight), maxReps: number(data.maxReps), bestVolume: number(data.bestVolume),
    totalSessions: number(data.totalSessions), lastPerformedAt: number(data.lastPerformedAt),
  }
}

export function compareProgressRecords(a: RecordSummary, b: RecordSummary): number {
  return b.maxWeight - a.maxWeight || b.bestVolume - a.bestVolume || b.maxReps - a.maxReps
    || a.exerciseName.localeCompare(b.exerciseName, 'en-US') || a.id.localeCompare(b.id)
}

export type Dataset<T> = { status: 'success'; value: T } | { status: 'error'; error: unknown }
export type ProgressRead<T> = { data: T; fromCache: boolean }
export interface ProgressLoadResult {
  sessions: Dataset<ProgressSessionsResult>
  records: Dataset<ProgressRecordsResult>
  freshness: 'fresh' | 'uncertain'
  fetchedAt: number
}

export async function loadProgressData(uid: string, rangeDays: number, dependencies: {
  recent: (uid: string) => Promise<ProgressRead<Array<{ id: string; materialized: boolean }>>>
  retryMaterialization: (uid: string, workoutId: string) => Promise<void>
  sessions: (uid: string, fromMs: number) => Promise<ProgressRead<ProgressSessionsResult>>
  records: (uid: string) => Promise<ProgressRead<ProgressRecordsResult>>
}, now = Date.now()): Promise<ProgressLoadResult> {
  let freshness: ProgressLoadResult['freshness'] = 'fresh'
  try {
    const recent = await dependencies.recent(uid)
    if (recent.fromCache) freshness = 'uncertain'
    else {
      const attempts = await Promise.allSettled(recent.data.filter((workout) => !workout.materialized)
        .map((workout) => dependencies.retryMaterialization(uid, workout.id)))
      if (attempts.some((attempt) => attempt.status === 'rejected')) freshness = 'uncertain'
    }
  } catch { freshness = 'uncertain' }
  const [sessionResult, recordResult] = await Promise.allSettled([
    dependencies.sessions(uid, now - 2 * rangeDays * 86_400_000), dependencies.records(uid),
  ])
  const dataset = <T>(result: PromiseSettledResult<ProgressRead<T>>): Dataset<T> => result.status === 'rejected'
    ? { status: 'error', error: result.reason }
    : result.value.fromCache ? { status: 'error', error: new Error('Only cached data was available.') }
      : { status: 'success', value: result.value.data }
  return { sessions: dataset(sessionResult), records: dataset(recordResult), freshness, fetchedAt: now }
}

export interface ProgressSnapshot {
  sessions: (ProgressSessionsResult & { rangeDays: number; fetchedAt: number }) | null
  records: ProgressRecordsResult | null
  sessionsError: boolean
  recordsError: boolean
  freshnessUncertain: boolean
}

export function mergeProgressSnapshot(previous: ProgressSnapshot | null, result: ProgressLoadResult, rangeDays: number): ProgressSnapshot {
  return {
    sessions: result.sessions.status === 'success' ? { ...result.sessions.value, rangeDays, fetchedAt: result.fetchedAt } : previous?.sessions ?? null,
    records: result.records.status === 'success' ? result.records.value : previous?.records ?? null,
    sessionsError: result.sessions.status === 'error', recordsError: result.records.status === 'error',
    freshnessUncertain: result.freshness === 'uncertain',
  }
}

export function startProgressRead(load: () => Promise<ProgressLoadResult>, publish: (result: ProgressLoadResult) => void,
  fail: () => void, finish: () => void): () => void {
  let current = true
  void Promise.resolve().then(load).then((result) => { if (current) publish(result) }, () => { if (current) fail() })
    .finally(() => { if (current) finish() })
  return () => { current = false }
}
