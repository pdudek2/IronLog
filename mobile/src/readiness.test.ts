import assert from 'node:assert/strict'
import test from 'node:test'
import { buildNextSessionRecommendation } from '../../src/shared/nextSessionRecommendation'
import { computeReadinessScore, todayKey, type ReadinessEntry } from '../../src/shared/readiness'
import { fixtures, plan, workouts, NOW, readiness } from '../../src/shared/__fixtures__/readiness'
import { parseReadiness, ReadinessController, ReadinessDataError, recommendationHistory, todayLaunch, type ReadinessState } from './readiness'
import type { ReadResult } from './scopedRead'
import { kgToDisplayWeight } from '../../src/shared/weightUnits'

for (const fixture of fixtures) test(`shared ${fixture.tone} fixture uses source-aware progression and trims`, () => {
  const entry = readiness(fixture.values)
  assert.equal(computeReadinessScore(entry).score, fixture.score)
  const result = buildNextSessionRecommendation(plan, 0, entry, workouts, NOW)
  assert.equal(result.tone, fixture.tone)
  assert.deepEqual(result.exercises.map(e => [e.sets, e.weight, e.reps]), fixture.expected)
  assert.deepEqual(result.launch.map(e => [e.sets, e.weight, e.reps]), fixture.expected)
  const canonical = result.exercises[0]!.weight
  assert.equal(kgToDisplayWeight(canonical, 'kg'), canonical)
  assert.ok(kgToDisplayWeight(canonical, 'lbs') > canonical)
  assert.equal(result.launch[0]?.weight, canonical)
})
test('shared no-history, score thresholds and the break boundary', () => {
  assert.deepEqual(buildNextSessionRecommendation(plan, 0, readiness(fixtures[2].values), [], NOW).exercises.map(e => e.weight), [70,25,60,10])
  assert.equal(computeReadinessScore({ sleep: 2, mood: 3, soreness: 3 }).tone, 'mid')
  assert.equal(computeReadinessScore({ sleep: 5, mood: 3, soreness: 3 }).score, 70)
  assert.equal(computeReadinessScore({ sleep: 5, mood: 3, soreness: 3 }).tone, 'high')
  const high = readiness(fixtures[2].values)
  const at = (days: number) => buildNextSessionRecommendation(plan, 0, high, workouts.map(w => ({ ...w, finishedAt: NOW - days * 86_400_000 })), NOW).exercises[0]?.weight
  assert.equal(at(14), 75)
  assert.equal(at(15), 72.5)
  assert.equal(at(40), 70)
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
test('today\'s launch: an untouched day starts as written; a shorter day without a check-in keeps the usual weights', () => {
  const entry = readiness(fixtures[0].values)
  const usual = { budgetMin: null, proposals: [] }
  assert.equal(todayLaunch(buildNextSessionRecommendation(plan, 0, null, workouts, NOW), false, usual), undefined)
  const short = buildNextSessionRecommendation(plan, 0, null, workouts, NOW, 'kg', { budgetMin: 20 })
  const proposals = [{ budgetMin: 20, mode: short.record?.mode ?? 'usual' as const }]
  const plain = todayLaunch(short, false, { budgetMin: 20, proposals })!
  assert.ok(plain.items.length > 0 && plain.items.every(item => item.weight === undefined && item.reps === undefined))
  assert.deepEqual(plain.proposals, proposals)
  const checked = todayLaunch(buildNextSessionRecommendation(plan, 0, entry, workouts, NOW), true, usual)!
  assert.ok(checked.items.every(item => typeof item.weight === 'number' && typeof item.reps === 'number'))
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
test('defaults only after absence; each tap saves once, a tap during a save follows it, a saved day can change', async () => {
  const h = harness(); await h.controller.load()
  assert.deepEqual(h.controller.state.values, fixtures[1].values)
  await Promise.all([h.controller.choose(fixtures[2].values), h.controller.save(), h.controller.choose(fixtures[2].values)])
  assert.equal(h.writes.length, 1); assert.deepEqual(h.controller.state.entry, readiness(fixtures[2].values))
  const saving = h.controller.choose(fixtures[0].values); h.controller.choose(fixtures[1].values)
  assert.deepEqual(h.controller.state.values, fixtures[1].values)
  await saving; await tick(); await tick()
  assert.deepEqual(h.writes.map(w => w.sleep), [fixtures[2].values.sleep, fixtures[0].values.sleep, fixtures[1].values.sleep])
  assert.deepEqual(h.controller.state.entry && { sleep: h.controller.state.entry.sleep, mood: h.controller.state.entry.mood, soreness: h.controller.state.entry.soreness }, fixtures[1].values)
})
test('bounded uncertain write preserves original outcome and inputs until settled, even if server read matches', async () => {
  const h = harness(5); await h.controller.load()
  let finish!: () => void
  h.port.write = async entry => { h.writes.push(entry); h.entries.set(entry.date, entry); await new Promise<void>(resolve => { finish = resolve }) }
  await h.controller.choose(fixtures[2].values)
  assert.equal(h.controller.state.pending, true); assert.equal(h.controller.state.entry, null)
  await h.controller.save(); assert.equal(h.writes.length, 1)
  await h.controller.choose(fixtures[0].values); assert.equal(h.writes.length, 1)
  finish(); await tick(); await h.controller.reconcile()
  assert.deepEqual(h.controller.state.entry, readiness(fixtures[2].values))
  await tick(); assert.deepEqual(h.writes.map(w => w.sleep), [fixtures[2].values.sleep, fixtures[0].values.sleep])
})
test('failed/uncertain save retains inputs; reconnect nonmatch unlocks before explicit retry', async () => {
  const h = harness(); await h.controller.load()
  h.port.write = async () => { throw Error('lost connection') }; h.readError = true
  await h.controller.choose(fixtures[0].values); assert.equal(h.controller.state.pending, true)
  h.readError = false; await h.controller.reconcile()
  assert.equal(h.controller.state.pending, false); assert.deepEqual(h.controller.state.values, fixtures[0].values)
  h.port.write = async entry => { h.writes.push(entry); h.entries.set(entry.date, entry) }
  await h.controller.save(); assert.equal(h.controller.state.entry?.sleep, 1)
})
test('definite rejection unlocks without hiding values or allowing duplicate writes', async () => {
  const h = harness(); await h.controller.load()
  h.port.write = async () => { throw { code: 'firestore/permission-denied' } }
  await h.controller.choose(fixtures[0].values); assert.equal(h.controller.state.pending, false); assert.equal(h.controller.state.values?.sleep, 1)
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
