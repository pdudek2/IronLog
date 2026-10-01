import assert from 'node:assert/strict'
import test from 'node:test'

import { LaunchJournal, type LaunchStorage } from './launchJournal'
import { WorkoutLaunchController, type LaunchPort, type LaunchState } from './workoutLaunchController'
import {
  buildTemplateSession, claimAbsentSession, firstLaunchableWorkout, parseTemplate, shouldOpenLaunchResult,
  type LaunchResult, type WorkoutTemplate,
} from './workoutLaunch'
import type { ActiveWorkout } from './session'

class MemoryStorage implements LaunchStorage {
  files = new Map<string, string>()
  failClear = false
  async read(uid: string, slot: 0 | 1) { return this.files.get(`${uid}:${slot}`) ?? null }
  async write(uid: string, slot: 0 | 1, value: string) {
    if (this.failClear && JSON.parse(value).kind === 'empty') { this.failClear = false; throw new Error('disk full') }
    this.files.set(`${uid}:${slot}`, value)
  }
}

function template(): WorkoutTemplate {
  return parseTemplate('plan-a', 'owner', {
    userId: 'owner', name: 'Long training plan', updatedAt: 2,
    days: [
      { name: 'Rest', exercises: [] },
      { name: 'Pull', exercises: [
        { exerciseId: 'same', exerciseSource: 'global', name: 'Global row', sets: 2, targetReps: 8, targetWeight: 40 },
        { exerciseId: 'same', exerciseSource: 'user', name: 'Custom row', sets: 1, targetReps: 10, targetWeight: 25 },
      ] },
    ],
  })
}

function harness(storage = new MemoryStorage()) {
  const journal = new LaunchJournal(storage)
  const states: LaunchState[] = []
  const results: LaunchResult[] = []
  let remote: ActiveWorkout | null = null
  let ids = 0
  let claimCalls = 0
  let failClaim: 'none' | 'before' | 'after' | 'closed' = 'none'
  let readOffline = false
  let outcomeOffline = false
  let closed = false
  let currentTemplate: WorkoutTemplate | null = template()
  const port: LaunchPort = {
    readActive: async () => { if (readOffline) throw new Error('offline'); return remote },
    isClosed: async () => { if (outcomeOffline) throw new Error('offline'); return closed },
    readTemplate: async () => currentTemplate,
    readBest: async (_uid, _id, source) => source === 'global'
      ? { bestSetWeight: 55, bestSetReps: 6 } : { bestSetWeight: 0, bestSetReps: 0 },
    claim: async (uid, candidate) => {
      claimCalls += 1
      if (failClaim === 'closed') throw new Error('permission-denied: closedSessions fence')
      if (failClaim === 'before') throw new Error('lost connection')
      const result = await claimAbsentSession({
        read: async () => ({ exists: remote !== null, data: remote ? { userId: uid, ...remote } : null }),
        create: (data) => { remote = { ...candidate, sessionRevision: data.sessionRevision as string } },
      }, uid, candidate, 100)
      if (failClaim === 'after') { readOffline = true; throw new Error('ack lost') }
      return result
    },
    createId: () => `id-${++ids}`, now: () => 100,
  }
  const controller = () => new WorkoutLaunchController('owner', journal, port,
    (state) => states.push(state), (result) => results.push(result))
  return { journal, states, results, controller, port,
    get remote() { return remote }, set remote(value: ActiveWorkout | null) { remote = value },
    get ids() { return ids }, get claimCalls() { return claimCalls },
    set failClaim(value: typeof failClaim) { failClaim = value }, set readOffline(value: boolean) { readOffline = value },
    set outcomeOffline(value: boolean) { outcomeOffline = value }, set closed(value: boolean) { closed = value },
    set currentTemplate(value: WorkoutTemplate | null) { currentTemplate = value },
  }
}

test('parses owned plans and keeps first launchable day and source-aware history fallback', () => {
  const plan = template()
  assert.deepEqual(firstLaunchableWorkout([plan]), { templateId: 'plan-a', dayIndex: 1 })
  assert.throws(() => parseTemplate('plan-a', 'other', { ...plan }), /owner/)
  const history = new Map([['global:same', { bestSetWeight: 55, bestSetReps: 6 }]])
  const session = buildTemplateSession(plan, 1, history, 'session', 'revision', 100)
  assert.equal(session.templateId, 'plan-a')
  assert.equal(session.label, 'Pull')
  assert.deepEqual(session.exercises[0]?.sets.map((set) => [set.weight, set.reps]), [['55', '6'], ['55', '6']])
  assert.deepEqual(session.exercises[1]?.sets.map((set) => [set.weight, set.reps]), [['25', '10']])
  assert.equal(session.exercises[1]?.exerciseSource, 'user')
})

test('transaction creates only when absent, reconciles same candidate, and preserves a competing session', async () => {
  const candidate = buildTemplateSession(template(), 1, new Map(), 'mine', 'revision', 100)
  let stored: Record<string, unknown> | null = null
  const port = { read: async () => ({ exists: stored !== null, data: stored }), create: (data: Record<string, unknown>) => { stored = data } }
  assert.equal((await claimAbsentSession(port, 'owner', candidate, 100)).kind, 'started')
  const edited = { ...stored!, label: 'Edited by another client' }
  stored = edited
  assert.equal((await claimAbsentSession(port, 'owner', candidate, 100)).session.label, 'Edited by another client')
  assert.strictEqual(stored, edited)
  const other = { ...candidate, sessionId: 'other' }
  const conflict = await claimAbsentSession(port, 'owner', other, 100)
  assert.equal(conflict.kind, 'existing')
  assert.strictEqual(stored, edited)
})

test('empty start confirms one session and double tap cannot replace it', async () => {
  const h = harness()
  const controller = h.controller()
  await controller.load()
  await Promise.all([controller.launch({ kind: 'empty' }, () => true), controller.launch({ kind: 'empty' }, () => true)])
  assert.equal(h.claimCalls, 1)
  assert.equal(h.results[0]?.kind, 'started')
  assert.equal(h.remote?.sessionId, h.results[0]?.session.sessionId)
  assert.equal((await h.journal.load('owner')), null)
})

test('selected plan refuses a deleted or changed day without silent fallback', async () => {
  const h = harness()
  const controller = h.controller()
  await controller.load()
  const selected = template()
  h.currentTemplate = { ...selected, days: [{ ...selected.days[0]! }, { name: 'Changed', exercises: selected.days[1]!.exercises }] }
  await controller.launch({ kind: 'template', selection: { templateId: selected.id, dayIndex: 1 }, snapshot: selected }, () => true)
  assert.equal(h.states.at(-1)?.status, 'unavailable')
  assert.equal(h.claimCalls, 0)
  h.currentTemplate = null
  await controller.launch({ kind: 'template', selection: { templateId: selected.id, dayIndex: 1 }, snapshot: selected }, () => true)
  assert.equal(h.states.at(-1)?.status, 'unavailable')
  assert.equal(h.claimCalls, 0)
})

test('same attempt retries after an unknown result using its original identity', async () => {
  const h = harness()
  const controller = h.controller()
  await controller.load()
  h.failClaim = 'before'
  await controller.launch({ kind: 'empty' }, () => true)
  const pending = await h.journal.load('owner')
  assert.equal(h.states.at(-1)?.status, 'retry')
  h.failClaim = 'none'
  await controller.retry(() => true)
  assert.equal(h.remote?.sessionId, pending?.candidate.sessionId)
  assert.equal(h.ids, 2)
  assert.equal(h.claimCalls, 2)
})

test('shared plan launch retains the exact selected day and candidate through recovery', async () => {
  const h = harness()
  const first = h.controller()
  await first.load()
  h.failClaim = 'before'
  const plan = template()
  await first.launch({ kind: 'template', selection: { templateId: plan.id, dayIndex: 1 }, snapshot: plan }, () => true)
  assert.deepEqual(h.states.at(-1)?.selection, { templateId: plan.id, dayIndex: 1 })
  const pending = await h.journal.load('owner')
  first.dispose()
  const restored = h.controller()
  await restored.load()
  assert.equal(h.states.at(-1)?.selection?.templateId, plan.id)
  assert.equal(h.states.at(-1)?.selection?.dayIndex, 1)
  h.failClaim = 'none'
  await restored.retry(() => true)
  assert.equal(h.results.at(-1)?.session.sessionId, pending?.candidate.sessionId)
  assert.equal(h.results.at(-1)?.session.label, 'Pull')
  assert.deepEqual(h.results.at(-1)?.session.exercises.map((exercise) => exercise.exerciseSource), ['global', 'user'])
})

test('a late launch result opens a workout only on the initiating route', () => {
  assert.equal(shouldOpenLaunchResult('/templates', '/templates'), true)
  assert.equal(shouldOpenLaunchResult('/templates', '/dashboard'), false)
  assert.equal(shouldOpenLaunchResult('/dashboard', '/templates'), false)
  assert.equal(shouldOpenLaunchResult('/templates', '/history'), false)
})

for (const failure of ['active read', 'closure outcome']) test(`a failed ${failure} on Retry leaves visible feedback and can recover the same candidate`, async () => {
  const h = harness()
  const controller = h.controller()
  await controller.load()
  h.failClaim = 'before'
  await controller.launch({ kind: 'empty' }, () => true)
  const id = (await h.journal.load('owner'))?.candidate.sessionId
  assert.ok(id)
  if (failure === 'active read') h.readOffline = true
  else h.outcomeOffline = true
  await controller.retry(() => true)
  assert.equal(h.states.at(-1)?.status, 'retry')
  assert.equal((await h.journal.load('owner'))?.candidate.sessionId, id)
  h.readOffline = false
  h.outcomeOffline = false
  h.failClaim = 'none'
  await controller.retry(() => true)
  assert.equal(h.results.at(-1)?.session.sessionId, id)
  assert.equal(await h.journal.load('owner'), null)
})

test('lost acknowledgement survives restart and reconciles the same server session', async () => {
  const h = harness()
  const first = h.controller()
  await first.load()
  h.failClaim = 'after'
  await first.launch({ kind: 'empty' }, () => true)
  assert.equal(h.states.at(-1)?.status, 'retry')
  const id = (await h.journal.load('owner'))?.candidate.sessionId
  first.dispose()
  h.readOffline = false
  const restarted = h.controller()
  await restarted.load()
  assert.equal(h.results.at(-1)?.session.sessionId, id)
  assert.equal(h.claimCalls, 1)
  assert.equal(await h.journal.load('owner'), null)
})

test('a closed candidate is retired only after authoritative confirmation, then an intentional start gets a new ID', async () => {
  const h = harness()
  const controller = h.controller()
  await controller.load()
  h.failClaim = 'closed'
  h.outcomeOffline = true
  await controller.launch({ kind: 'empty' }, () => true)
  const id = (await h.journal.load('owner'))?.candidate.sessionId
  await controller.retry(() => true)
  assert.equal((await h.journal.load('owner'))?.candidate.sessionId, id)
  assert.equal(h.ids, 2)
  assert.equal(h.remote, null)
  h.outcomeOffline = false
  h.closed = true
  await controller.retry(() => false)
  assert.equal(await h.journal.load('owner'), null)
  h.failClaim = 'none'
  h.closed = false
  await controller.launch({ kind: 'empty' }, () => true)
  assert.notEqual(h.results.at(-1)?.session.sessionId, id)
  assert.equal(h.claimCalls, 2)
})

for (const outcome of ['finished', 'discarded']) test(`lost acknowledgement followed by external ${outcome} retires the saved attempt after restart`, async () => {
  const h = harness()
  const first = h.controller()
  await first.load()
  h.failClaim = 'after'
  await first.launch({ kind: 'empty' }, () => true)
  const id = (await h.journal.load('owner'))?.candidate.sessionId
  first.dispose()
  h.remote = null
  h.readOffline = false
  h.closed = true
  const restarted = h.controller()
  await restarted.load()
  assert.equal(await h.journal.load('owner'), null)
  assert.equal(h.results.length, 0)
  assert.equal(h.states.at(-1)?.status, 'ready')
  h.failClaim = 'none'
  h.closed = false
  await restarted.launch({ kind: 'empty' }, () => true)
  assert.notEqual(h.results.at(-1)?.session.sessionId, id)
})

test('a failed journal clear after success can recover when that session later closes', async () => {
  const storage = new MemoryStorage()
  const h = harness(storage)
  const controller = h.controller()
  await controller.load()
  storage.failClear = true
  await controller.launch({ kind: 'empty' }, () => true)
  assert.equal(h.results.length, 1)
  assert.ok(await h.journal.load('owner'))
  h.remote = null
  h.closed = true
  await controller.recover()
  assert.equal(await h.journal.load('owner'), null)
  assert.equal(h.states.at(-1)?.status, 'ready')
})

test('active observation confirms a lost acknowledgement while a create gate is closed', async () => {
  const h = harness()
  const controller = h.controller()
  await controller.load()
  h.failClaim = 'after'
  await controller.launch({ kind: 'empty' }, () => true)
  assert.ok(h.remote)
  await controller.observeActive(h.remote!)
  await controller.retry(() => false)
  assert.equal(h.results.length, 1)
  assert.equal(await h.journal.load('owner'), null)
})

test('an active snapshot received during a lost claim acknowledgement drains after the claim settles', async () => {
  const h = harness()
  const controller = h.controller()
  await controller.load()
  let rejectClaim!: (error: Error) => void
  h.port.claim = async (_uid, candidate) => {
    h.remote = candidate
    return new Promise((_, reject) => { rejectClaim = reject })
  }
  const running = controller.launch({ kind: 'empty' }, () => true)
  while (!rejectClaim) await new Promise((resolve) => setImmediate(resolve))
  await controller.observeActive(h.remote!)
  h.port.readActive = async () => { throw new Error('offline') }
  rejectClaim(new Error('ack lost'))
  await running
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(h.results.length, 1)
  assert.equal(await h.journal.load('owner'), null)
})

test('a disposed controller cannot clear a newer owner attempt after an awaited read', async () => {
  const h = harness()
  const first = h.controller()
  await first.load()
  h.failClaim = 'before'
  await first.launch({ kind: 'empty' }, () => true)
  const old = await h.journal.load('owner')
  let release!: (session: ActiveWorkout | null) => void
  h.port.readActive = () => new Promise((resolve) => { release = resolve })
  const pending = first.recover()
  first.dispose()
  const newer = { candidate: { ...old!.candidate, sessionId: 'new-owner-session' } }
  await h.journal.save('owner', newer)
  release(null)
  await pending
  assert.equal((await h.journal.load('owner'))?.candidate.sessionId, 'new-owner-session')
})

test('disposed owner cannot publish a late result into a different account', async () => {
  const h = harness()
  const controller = h.controller()
  await controller.load()
  let release!: (value: WorkoutTemplate | null) => void
  h.port.readTemplate = () => new Promise((resolve) => { release = resolve })
  const pending = controller.launch({ kind: 'template', selection: { templateId: 'plan-a', dayIndex: 1 }, snapshot: template() }, () => true)
  controller.dispose()
  release(template())
  await pending
  assert.equal(h.claimCalls, 0)
  assert.equal(h.results.length, 0)
})

test('recommended overrides validate identities/legal values, preserve canonical kg and never mutate the template', () => {
  const plan = template(), before = structuredClone(plan)
  const overrides = new Map([['global:same', { sets: 1, weight: 57.5, reps: 7 }], ['user:same', { sets: 2, weight: 27.5, reps: 11 }]])
  const session = buildTemplateSession(plan, 1, new Map(), 'recommended', 'r', 100, overrides)
  assert.deepEqual(session.exercises.map(e => e.sets.map(s => [s.weight,s.reps])), [[['57.5','7']], [['27.5','11'],['27.5','11']]])
  assert.deepEqual(plan,before)
  for (const bad of [{ sets: 0, weight: 10, reps: 1 }, { sets: 21, weight: 10, reps: 1 }, { sets: 1, weight: NaN, reps: 1 }, { sets: 1, weight: -1, reps: 1 }, { sets: 1, weight: 2001, reps: 1 }, { sets: 1, weight: 10, reps: 0.5 }, { sets: 1, weight: 10, reps: 1001 }]) assert.throws(() => buildTemplateSession(plan,1,new Map(),'s','r',100,new Map([...overrides, ['global:same',bad]])), /Invalid recommendation/)
  assert.throws(() => buildTemplateSession(plan,1,new Map(),'s','r',100,new Map([['other:same',{sets:1,weight:10,reps:1}]])), /Invalid recommendation/)
})
test('recommended candidate survives retry/restart unchanged without querying newer history', async () => {
  const h = harness(), plan = template(), before = structuredClone(plan)
  const overrides = new Map([['global:same', { sets: 1, weight: 57.5, reps: 7 }], ['user:same', { sets: 2, weight: 27.5, reps: 11 }]])
  h.port.readBest = async () => { throw Error('Recommended start must use the preview') }
  const first = h.controller(); await first.load(); h.failClaim = 'before'
  await first.launch({ kind: 'template', selection: { templateId: plan.id, dayIndex: 1 }, snapshot: plan, overrides }, () => true)
  const pending = await h.journal.load('owner'); assert.ok(pending)
  overrides.set('global:same',{sets:4,weight:100,reps:12}); first.dispose()
  const restored = h.controller(); await restored.load(); h.failClaim = 'none'
  await restored.retry(() => true)
  assert.deepEqual(h.results.at(-1)?.session,pending.candidate)
  assert.equal(h.results.at(-1)?.session.exercises[0]?.sets[0]?.weight,'57.5')
  assert.deepEqual(plan,before); assert.equal(h.ids,2)
})
test('recommended start preserves a concurrent winner including edited sets and candidate recovery', async () => {
  const h = harness(), plan = template(), controller = h.controller(); await controller.load()
  const winner = buildTemplateSession(plan,1,new Map(),'winner','r',100)
  winner.exercises[0]!.sets[0]!.weight = '99'
  h.port.claim = async () => ({ kind: 'existing', session: winner })
  await controller.launch({ kind:'template',selection:{templateId:plan.id,dayIndex:1},snapshot:plan,
    overrides:new Map([['global:same',{sets:1,weight:57.5,reps:7}],['user:same',{sets:1,weight:27.5,reps:11}]]) },()=>true)
  assert.strictEqual(h.results.at(-1)?.session,winner)
  assert.equal(winner.exercises[0]?.sets[0]?.weight,'99'); assert.equal(await h.journal.load('owner'),null)
})
test('edited plan on retry invalidates recommended candidate rather than applying its old overrides', async () => {
  const h = harness(), plan = template(), controller = h.controller(); await controller.load(); h.failClaim='before'
  await controller.launch({ kind:'template',selection:{templateId:plan.id,dayIndex:1},snapshot:plan,
    overrides:new Map([['global:same',{sets:1,weight:57.5,reps:7}],['user:same',{sets:1,weight:27.5,reps:11}]]) },()=>true)
  h.currentTemplate = {...plan, days: [...plan.days.slice(0,1),{...plan.days[1]!,exercises:[{...plan.days[1]!.exercises[0]!,exerciseId:'new'}]}]}
  h.failClaim='none'; await controller.retry(()=>true)
  assert.equal(h.states.at(-1)?.status,'unavailable'); assert.equal(h.claimCalls,1); assert.equal(await h.journal.load('owner'),null)
})

test('recommended values are copied on tap before asynchronous template validation', async () => {
  const h = harness(), plan = template(), controller = h.controller(); await controller.load()
  const overrides = new Map([['global:same',{sets:1,weight:57.5,reps:7}],['user:same',{sets:1,weight:27.5,reps:11}]])
  let release!: () => void
  h.port.readTemplate = async () => { await new Promise<void>(resolve => { release=resolve }); return plan }
  const launching = controller.launch({kind:'template',selection:{templateId:plan.id,dayIndex:1},snapshot:plan,overrides},()=>true)
  overrides.get('global:same')!.weight=100
  release(); while (h.claimCalls===0 && h.results.length===0) { await new Promise(resolve=>setImmediate(resolve)); if(release) release() }
  await launching
  assert.equal(h.results.at(-1)?.session.exercises[0]?.sets[0]?.weight,'57.5')
})
