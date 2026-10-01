import assert from 'node:assert/strict'
import test from 'node:test'
import { buildNextSessionRecommendation, buildOverloadSuggestion } from '../../src/shared/nextSessionRecommendation'
import { computeReadinessScore, todayKey, type ReadinessEntry } from '../../src/shared/readiness'
import { fixtures, plan, workouts, NOW, readiness } from '../../src/shared/__fixtures__/readiness'
import { parseReadiness, ReadinessController, ReadinessDataError, recommendationHistory, type ReadinessState } from './readiness'
import type { ReadResult } from './scopedRead'
import { kgToDisplayWeight } from '../../src/shared/weightUnits'

for (const fixture of fixtures) test(`shared ${fixture.tone} fixture uses source-aware progression and trims`, () => {
  const entry = readiness(fixture.values)
  assert.equal(computeReadinessScore(entry).score, fixture.score)
  const result = buildNextSessionRecommendation(plan, 0, entry, workouts, NOW)
  assert.equal(result.tone, fixture.tone)
  assert.deepEqual(result.exercises.map(e => [e.sets, e.weight, e.reps]), fixture.expected)
  assert.deepEqual([...result.overrides.values()].map(e => [e.sets, e.weight, e.reps]), fixture.expected)
  const canonical = result.exercises[0]!.weight
  assert.equal(kgToDisplayWeight(canonical, 'kg'), canonical)
  assert.ok(kgToDisplayWeight(canonical, 'lbs') > canonical)
  assert.equal(result.overrides.get('global:same')?.weight, canonical)
})
test('shared no-history, score thresholds and strict 21-day gap boundary', () => {
  assert.deepEqual(buildNextSessionRecommendation(plan, 0, readiness(fixtures[2].values), [], NOW).exercises.map(e => e.weight), [70,25,60,10])
  assert.equal(computeReadinessScore({ sleep: 2, mood: 3, soreness: 3 }).tone, 'mid')
  assert.equal(computeReadinessScore({ sleep: 5, mood: 3, soreness: 3 }).score, 70)
  assert.equal(computeReadinessScore({ sleep: 5, mood: 3, soreness: 3 }).tone, 'high')
  const history = [0,1,2].map(() => ({ bestSetWeight: 72.5, finishedAt: NOW - 21 * 86_400_000 }))
  assert.equal(buildOverloadSuggestion(history, NOW)?.suggestedWeight, 75)
  assert.equal(buildOverloadSuggestion(history, NOW + 1)?.suggestedWeight, 70)
  const stale = workouts.map(w => ({ ...w, finishedAt: NOW - 22 * 86_400_000 }))
  assert.equal(buildNextSessionRecommendation(plan, 0, readiness(fixtures[0].values), stale, NOW).exercises[0]?.weight, 70)
  assert.equal(buildOverloadSuggestion(history.slice(0,2), NOW), null)
})
test('strict parsing rejects owner/date/invalid values/timestamps; local midnight is not UTC', () => {
  const entry = readiness(fixtures[1].values)
  assert.deepEqual(parseReadiness('owner', entry.date, entry), entry)
  for (const patch of [{ userId: 'foreign' }, { date: '2026-09-30' }, { sleep: 0 }, { mood: 3.5 }, { soreness: '3' }, { createdAt: NaN }, { createdAt: -1 }]) assert.throws(() => parseReadiness('owner', entry.date, { ...entry, ...patch }), ReadinessDataError)
  assert.throws(() => parseReadiness('owner', '2026-02-30', { ...entry, date: '2026-02-30' }), ReadinessDataError)
  assert.equal(todayKey(new Date(2026, 9, 1, 23, 59)), '2026-10-01')
  assert.equal(todayKey(new Date(2026, 9, 2, 0, 0)), '2026-10-02')
  assert.equal(recommendationHistory([{ id: 'a', startedAt: 1, finishedAt: 2, materialized: true, exercises: [{ exerciseId: 'same', exerciseSource: 'user', name: 'Custom', sets: [{ weight: 30, reps: 9 }] }] }])[0]?.exercises[0]?.exerciseSource, 'user')
})
const tick = () => new Promise(resolve => setImmediate(resolve))
function harness(milliseconds = 20) {
  let now = new Date(2026, 9, 1, 12)
  const entries = new Map<string, ReadinessEntry>()
  let cache = false, readError = false
  const writes: ReadinessEntry[] = [], states: ReadinessState[] = []
  const port = {
    now: () => now,
    read: async (_uid: string, date: string): Promise<ReadResult<ReadinessEntry | null>> => { if (readError) throw Error('offline'); return { data: entries.get(date) ?? null, fromCache: cache } },
    write: async (entry: ReadinessEntry) => { writes.push(entry); entries.set(entry.date, entry) },
  }
  const controller = new ReadinessController('owner', port, state => states.push(state), milliseconds)
  return { controller, entries, port, writes, states,
    set now(value: Date) { now = value }, set cache(value: boolean) { cache = value }, set readError(value: boolean) { readError = value } }
}
for (const failure of ['cache', 'read', 'malformed']) test(`${failure} cannot invent defaults or enable a write`, async () => {
  const h = harness()
  if (failure === 'cache') h.cache = true
  if (failure === 'read') h.readError = true
  if (failure === 'malformed') h.entries.set('2026-10-01', { ...readiness(fixtures[1].values), mood: 0 })
  await h.controller.load(); await h.controller.save()
  assert.notEqual(h.controller.state.status, 'ready'); assert.equal(h.controller.state.values, null); assert.equal(h.writes.length, 0)
})
test('defaults only after absence; double tap saves submitted snapshot once', async () => {
  const h = harness(); await h.controller.load()
  assert.deepEqual(h.controller.state.values, fixtures[1].values)
  h.controller.change(fixtures[2].values)
  await Promise.all([h.controller.save(), h.controller.save()])
  assert.equal(h.writes.length, 1); assert.deepEqual(h.controller.state.entry, readiness(fixtures[2].values))
})
test('bounded uncertain write preserves original outcome and inputs until settled, even if server read matches', async () => {
  const h = harness(5); await h.controller.load()
  let finish!: () => void
  h.port.write = async entry => { h.writes.push(entry); h.entries.set(entry.date, entry); await new Promise<void>(resolve => { finish = resolve }) }
  h.controller.change(fixtures[2].values)
  await h.controller.save()
  assert.equal(h.controller.state.pending, true); assert.equal(h.controller.state.entry, null)
  await h.controller.save(); assert.equal(h.writes.length, 1)
  h.controller.change(fixtures[0].values); assert.deepEqual(h.controller.state.values, fixtures[2].values)
  finish(); await tick(); await h.controller.reconcile()
  assert.equal(h.controller.state.pending, false); assert.deepEqual(h.controller.state.entry, readiness(fixtures[2].values))
})
test('failed/uncertain save retains inputs; reconnect nonmatch unlocks before explicit retry', async () => {
  const h = harness(); await h.controller.load(); h.controller.change(fixtures[0].values)
  h.port.write = async () => { throw Error('lost connection') }; h.readError = true
  await h.controller.save(); assert.equal(h.controller.state.pending, true)
  h.readError = false; await h.controller.reconcile()
  assert.equal(h.controller.state.pending, false); assert.deepEqual(h.controller.state.values, fixtures[0].values)
  h.port.write = async entry => { h.writes.push(entry); h.entries.set(entry.date, entry) }
  await h.controller.save(); assert.equal(h.controller.state.entry?.sleep, 1)
})
test('definite rejection unlocks without hiding values or allowing duplicate writes', async () => {
  const h = harness(); await h.controller.load(); h.controller.change(fixtures[0].values)
  h.port.write = async () => { throw { code: 'firestore/permission-denied' } }
  await h.controller.save(); assert.equal(h.controller.state.pending, false); assert.equal(h.controller.state.values?.sleep, 1)
})
test('midnight/resume fences a late read and keeps new day absent', async () => {
  const h = harness(); let release!: (value: ReadResult<ReadinessEntry | null>) => void
  const normal = h.port.read
  h.port.read = async (_uid, date) => date === '2026-10-01' ? new Promise(resolve => { release = resolve }) : normal(_uid,date)
  const loading = h.controller.load(); h.now = new Date(2026,9,2); h.controller.refreshDay(); await tick()
  release({ data: readiness(fixtures[2].values), fromCache: false }); await loading
  assert.equal(h.controller.state.date, '2026-10-02'); assert.equal(h.controller.state.entry, null); assert.equal(h.controller.state.status, 'ready')
})
test('pending yesterday remains owned across day change; late completion cannot become today’s score', async () => {
  const h = harness(5); await h.controller.load(); let finish!: () => void
  h.port.write = async entry => { h.writes.push(entry); await new Promise<void>(resolve => { finish = resolve }); h.entries.set(entry.date,entry) }
  await h.controller.save(); h.now = new Date(2026,9,2); h.controller.refreshDay(); await tick()
  await h.controller.save(); assert.equal(h.writes.length,1); assert.equal(h.controller.state.entry,null)
  finish(); await tick(); await h.controller.reconcile()
  assert.equal(h.controller.state.pending,false); assert.equal(h.controller.state.entry,null); assert.equal(h.controller.state.date,'2026-10-02')
  await h.controller.save(); assert.equal(h.writes.length,2)
  h.controller.dispose(); finish()
})
test('disposed owner suppresses a late save/read publication into a new account', async () => {
  const h = harness(); await h.controller.load(); let finish!: () => void
  h.port.write = async () => new Promise<void>(resolve => { finish = resolve })
  const saving = h.controller.save(); await tick(); const count = h.states.length
  h.controller.dispose(); finish(); await saving
  assert.equal(h.states.length,count)
})
