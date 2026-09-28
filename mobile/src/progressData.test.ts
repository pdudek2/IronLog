import assert from 'node:assert/strict'
import { test } from 'node:test'

import { aggregateActivityHeatmap, aggregatePeriodComparison, aggregateStrengthProgression, formatProgressVolume, type ProgressSessionLite, type RecordSummary } from '../../src/shared/progress'
import { loadProgressData, mergeProgressSnapshot, parseProgressRecord, parseProgressSession, startProgressRead, type ProgressLoadResult } from './progressData'

const now = new Date('2026-09-28T12:00:00Z').getTime()
const session = (overrides: Partial<ProgressSessionLite> = {}): ProgressSessionLite => ({
  id: 'entry', workoutId: 'workout', exerciseId: 'bench', exerciseSource: 'global', finishedAt: now,
  totalVolume: 240, totalSets: 3, bestSetWeight: 80, exerciseName: 'Bench Press', muscleGroups: ['chest'], ...overrides,
})
const record: RecordSummary = { id: 'record', exerciseId: 'bench', exerciseSource: 'global', exerciseName: 'Bench Press',
  maxWeight: 80, maxReps: 3, bestVolume: 240, totalSessions: 1, lastPerformedAt: now }
const successful = (sessions = [session()]): ProgressLoadResult => ({
  sessions: { status: 'success', value: { sessions, truncated: false } },
  records: { status: 'success', value: { records: [record], truncated: false } }, freshness: 'fresh', fetchedAt: now,
})

test('native progress parser preserves source identity and rejects other owners or malformed data', () => {
  const rawSession = { userId: 'alice', workoutId: 'workout', exerciseId: 'bench', exerciseSource: 'user', finishedAt: now,
    totalVolume: 240, totalSets: 3, bestSetWeight: 80, exerciseName: 'Bench Press', muscleGroups: ['chest'] }
  assert.equal(parseProgressSession('entry', 'alice', rawSession).exerciseSource, 'user')
  assert.throws(() => parseProgressSession('entry', 'bob', rawSession), /another account/)
  assert.throws(() => parseProgressSession('entry', 'alice', { ...rawSession, exerciseSource: 'unknown' }), /source/)
  assert.throws(() => parseProgressSession('entry', 'alice', { ...rawSession, totalVolume: -1 }), /number/)
  const rawRecord = { userId: 'alice', exerciseId: 'bench', exerciseSource: 'global', exerciseName: 'Bench Press',
    maxWeight: 80, maxReps: 3, bestVolume: 240, totalSessions: 1, lastPerformedAt: now }
  assert.equal(parseProgressRecord('record', 'alice', rawRecord).maxWeight, 80)
  assert.throws(() => parseProgressRecord('record', 'bob', rawRecord), /another account/)
})

test('recent pending projection recovery precedes independent period and record reads', async () => {
  const calls: string[] = []
  const result = await loadProgressData('alice', 90, {
    recent: async (uid) => { calls.push(`recent:${uid}`); return { data: [{ id: 'pending', materialized: false }], fromCache: false } },
    retryMaterialization: async (uid, id) => { calls.push(`retry:${uid}:${id}`) },
    sessions: async (uid, from) => { calls.push(`sessions:${uid}:${from}`); return { data: { sessions: [], truncated: false }, fromCache: false } },
    records: async (uid) => { calls.push(`records:${uid}`); throw new Error('offline') },
  }, now)
  assert.deepEqual(calls.slice(0, 2), ['recent:alice', 'retry:alice:pending'])
  assert.ok(calls.includes(`sessions:alice:${now - 180 * 86_400_000}`))
  assert.equal(result.sessions.status, 'success')
  assert.equal(result.records.status, 'error')
  assert.equal(result.freshness, 'fresh')
})

test('cached reads and failed materialization stay uncertain without replacing verified datasets', async () => {
  const result = await loadProgressData('alice', 30, {
    recent: async () => ({ data: [{ id: 'pending', materialized: false }], fromCache: false }),
    retryMaterialization: async () => { throw new Error('offline') },
    sessions: async () => ({ data: { sessions: [], truncated: false }, fromCache: true }),
    records: async () => ({ data: { records: [], truncated: false }, fromCache: false }),
  }, now)
  assert.equal(result.freshness, 'uncertain')
  assert.equal(result.sessions.status, 'error')
  const previous = mergeProgressSnapshot(null, successful(), 90)
  const merged = mergeProgressSnapshot(previous, result, 30)
  assert.equal(merged.sessions?.rangeDays, 90)
  assert.equal(merged.sessions?.sessions.length, 1)
  assert.equal(merged.records?.records.length, 0)
  assert.equal(merged.sessionsError, true)
  assert.equal(merged.recordsError, false)
  assert.equal((merged.sessions?.rangeDays ?? 0) >= 365, false, 'shorter coverage cannot represent a requested year')
})

test('disposed range/account request cannot publish after a newer request', async () => {
  let finishOld!: (value: ProgressLoadResult) => void
  const pending = new Promise<ProgressLoadResult>((resolve) => { finishOld = resolve })
  const published: number[] = []
  const dispose = startProgressRead(() => pending, (result) => published.push(result.fetchedAt), () => {}, () => {})
  await Promise.resolve()
  dispose()
  startProgressRead(async () => ({ ...successful(), fetchedAt: now + 1 }), (result) => published.push(result.fetchedAt), () => {}, () => {})
  finishOld(successful())
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(published, [now + 1])
})

test('shared calculations keep source-aware days, zero weights, boundaries, and lbs presentation', () => {
  const current = session({ finishedAt: now - 89 * 86_400_000, exerciseSource: 'global' })
  const previous = session({ id: 'older', workoutId: 'older', finishedAt: now - 91 * 86_400_000, exerciseSource: 'user' })
  const sameId = session({ id: 'mine', workoutId: 'mine', exerciseSource: 'user', bestSetWeight: 100 })
  const zero = session({ id: 'zero', workoutId: 'zero', exerciseId: 'squat', bestSetWeight: 0 })
  const comparison = aggregatePeriodComparison([current, previous], 90, now)
  assert.equal(comparison.currentSessions, 1)
  assert.equal(comparison.previousSessions, 1)
  const strength = aggregateStrengthProgression([current, sameId, zero])
  assert.deepEqual(strength.series.map((item) => item.key).sort(), ['global:bench', 'user:bench'])
  const heatmap = aggregateActivityHeatmap([current, sameId], 12, now)
  assert.equal(heatmap.length, 84)
  assert.equal(heatmap.filter((cell) => cell.volume > 0).length, 1)
  assert.equal(formatProgressVolume(1000, 'lbs'), '2.2k lbs')
})
