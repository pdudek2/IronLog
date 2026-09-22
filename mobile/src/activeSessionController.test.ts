import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ActiveSessionController,
  stateForAccount,
  type ActiveSessionState,
  type SessionSnapshot,
  type SubscribeToSession,
} from './activeSessionController'
import { TwoSlotSessionJournal, type JournalSlotStorage } from './sessionJournal'
import type { ActiveWorkout, Units } from './session'

interface Listener {
  uid: string
  next: (snapshot: SessionSnapshot) => void
  error: (error: unknown) => void
  unsubscribed: boolean
}

class MemorySlots implements JournalSlotStorage {
  values = new Map<string, string>()
  failWrite = false
  writeGate: Promise<void> | null = null
  async read(uid: string, slot: 0 | 1) { return this.values.get(`${uid}:${slot}`) ?? null }
  async write(uid: string, slot: 0 | 1, value: string) {
    if (this.failWrite) throw new Error('disk full')
    if (this.writeGate) {
      const gate = this.writeGate
      this.writeGate = null
      await gate
    }
    this.values.set(`${uid}:${slot}`, value)
  }
}

class ConflictError extends Error {}
const wait = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms))

function session(uid: string, revision: string | null = `revision-${uid}`, label = 'Push') {
  return {
    userId: uid,
    sessionId: `session-${uid}`,
    sessionRevision: revision,
    startedAt: 1_000,
    templateId: null,
    label,
    exercises: [{
      clientId: `exercise-${uid}`,
      exerciseId: 'bench-press',
      exerciseSource: 'global',
      name: 'Bench Press',
      sets: [{ clientId: `set-${uid}`, weight: '65', reps: '8', done: false }],
    }],
  }
}

function snapshot(uid: string, revision: string | null = `revision-${uid}`): SessionSnapshot {
  return { exists: true, data: session(uid, revision), fromCache: false, hasPendingWrites: false }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function harness(options: { units?: Units; slots?: MemorySlots; readUnits?: () => Promise<Units> } = {}) {
  const listeners: Listener[] = []
  const states: ActiveSessionState[] = []
  const saves: Array<{ uid: string; session: ActiveWorkout; expected: string | null; requested: string; result: ReturnType<typeof deferred<void>> }> = []
  const subscribe: SubscribeToSession = (uid, next, error) => {
    const listener = { uid, next, error, unsubscribed: false }
    listeners.push(listener)
    return () => { listener.unsubscribed = true }
  }
  const slots = options.slots ?? new MemorySlots()
  let revision = 0
  const controller = new ActiveSessionController({
    subscribe,
    readUnits: options.readUnits ?? (async () => options.units ?? 'kg'),
    journal: new TwoSlotSessionJournal(slots),
    createRevision: () => `request-${++revision}`,
    isConflictError: (error) => error instanceof ConflictError,
    isTransientError: (error) => typeof error === 'object' && error !== null && 'transient' in error,
    save: (uid, value, expected, requested) => {
      const result = deferred<void>()
      saves.push({ uid, session: value, expected, requested, result })
      return result.promise
    },
  }, (state) => states.push(state))
  return { controller, listeners, states, saves, slots }
}

function ready(states: ActiveSessionState[]) {
  const state = states.at(-1)
  assert.equal(state?.status, 'ready')
  return state as Extract<ActiveSessionState, { status: 'ready' }>
}

async function loadServer(h: ReturnType<typeof harness>, uid = 'user-a', revision: string | null = `revision-${uid}`) {
  h.controller.start(uid)
  await wait()
  h.listeners.at(-1)!.next(snapshot(uid, revision))
  await wait()
  return ready(h.states)
}

test('distinguishes cache absence and stale content from authoritative state', async () => {
  const h = harness({ units: 'lbs' })
  h.controller.start('user-a')
  await wait()
  h.listeners[0]!.next({ exists: false, data: null, fromCache: true, hasPendingWrites: false })
  await wait()
  assert.equal(h.states.at(-1)?.status, 'cache-miss')
  h.listeners[0]!.next({ ...snapshot('user-a'), fromCache: true })
  await wait()
  assert.equal(ready(h.states).stale, true)
  h.listeners[0]!.next(snapshot('user-a'))
  await wait()
  assert.equal(ready(h.states).syncStatus, 'saved')
  h.listeners[0]!.next({ exists: false, data: null, fromCache: false, hasPendingWrites: false })
  await wait()
  assert.equal(h.states.at(-1)?.status, 'empty')
})

test('persists before publishing an edit and rejects memory-only fallback', async () => {
  const h = harness()
  const initial = await loadServer(h)
  h.slots.failWrite = true
  h.controller.updateSet(initial.session.exercises[0]!.clientId, initial.session.exercises[0]!.sets[0]!.clientId, 'reps', '9')
  await wait()
  const failed = ready(h.states)
  assert.equal(failed.session.exercises[0]?.sets[0]?.reps, '8')
  assert.equal(failed.syncStatus, 'storage-error')
  assert.equal(h.saves.length, 0)
})

test('keeps edits made during a write and advances only after authoritative acknowledgement', async () => {
  const h = harness()
  const initial = await loadServer(h)
  const exercise = initial.session.exercises[0]!
  const set = exercise.sets[0]!
  h.controller.updateSet(exercise.clientId, set.clientId, 'reps', '9')
  await wait()
  h.controller.retrySave()
  await wait()
  assert.equal(h.saves.length, 1)
  h.listeners[0]!.next(snapshot('user-a', 'revision-user-a'))
  h.listeners[0]!.next(snapshot('user-a', 'revision-user-a'))
  await wait()
  assert.equal(h.saves.length, 1)
  assert.equal(h.saves[0]?.expected, 'revision-user-a')
  assert.equal(h.saves[0]?.session.exercises[0]?.sets[0]?.reps, '9')

  h.controller.updateSet(exercise.clientId, set.clientId, 'reps', '10')
  await wait()
  h.saves[0]!.result.resolve()
  h.listeners[0]!.next(snapshot('user-a', 'request-1'))
  await wait(30)
  assert.equal(h.saves.length, 2)
  assert.equal(h.saves[1]?.expected, 'request-1')
  assert.equal(h.saves[1]?.session.exercises[0]?.sets[0]?.reps, '10')
})

test('serializes a delayed journal edit before acknowledgement so newer input cannot be cleared', async () => {
  const h = harness()
  const initial = await loadServer(h)
  const exercise = initial.session.exercises[0]!
  const set = exercise.sets[0]!
  h.controller.updateSet(exercise.clientId, set.clientId, 'reps', '9')
  await wait()
  h.controller.retrySave()
  await wait()
  const disk = deferred<void>()
  h.slots.writeGate = disk.promise
  h.controller.updateSet(exercise.clientId, set.clientId, 'reps', '10')
  const acknowledged = session('user-a', 'request-1')
  acknowledged.exercises[0]!.sets[0]!.reps = '9'
  h.listeners[0]!.next({ exists: true, data: acknowledged, fromCache: false, hasPendingWrites: false })
  await wait()
  assert.equal(ready(h.states).session.exercises[0]?.sets[0]?.reps, '9')
  disk.resolve()
  await wait(40)
  assert.equal(ready(h.states).session.exercises[0]?.sets[0]?.reps, '10')
  assert.equal(h.saves.length, 2)
  assert.equal(h.saves[1]?.session.exercises[0]?.sets[0]?.reps, '10')
})

test('retains stable row IDs across cached and authoritative copies of one revision', async () => {
  const h = harness()
  h.controller.start('user-a')
  await wait()
  const withoutIds = session('user-a')
  delete (withoutIds.exercises[0] as Partial<typeof withoutIds.exercises[number]>).clientId
  delete (withoutIds.exercises[0]!.sets[0] as Partial<typeof withoutIds.exercises[number]['sets'][number]>).clientId
  h.listeners[0]!.next({ exists: true, data: withoutIds, fromCache: true, hasPendingWrites: false })
  await wait()
  const cachedIds = [ready(h.states).session.exercises[0]!.clientId, ready(h.states).session.exercises[0]!.sets[0]!.clientId]
  h.listeners[0]!.next({ exists: true, data: withoutIds, fromCache: false, hasPendingWrites: false })
  await wait()
  assert.deepEqual([ready(h.states).session.exercises[0]!.clientId, ready(h.states).session.exercises[0]!.sets[0]!.clientId], cachedIds)
})

test('allows cached offline editing but does not write before an authoritative revision check', async () => {
  const h = harness()
  h.controller.start('user-a')
  await wait()
  h.listeners[0]!.next({ ...snapshot('user-a'), fromCache: true })
  await wait()
  const cached = ready(h.states).session
  h.controller.updateSet(cached.exercises[0]!.clientId, cached.exercises[0]!.sets[0]!.clientId, 'reps', '9')
  await wait()
  assert.equal(ready(h.states).session.exercises[0]?.sets[0]?.reps, '9')
  assert.equal(h.saves.length, 0)
  h.listeners[0]!.next(snapshot('user-a'))
  await wait(30)
  assert.equal(h.saves.length, 1)
})

test('CAS-upgrades an authoritative legacy document with a null revision', async () => {
  const h = harness()
  const initial = await loadServer(h, 'user-a', null)
  h.controller.updateSet(initial.session.exercises[0]!.clientId, initial.session.exercises[0]!.sets[0]!.clientId, 'reps', '9')
  await wait()
  h.controller.retrySave()
  await wait()
  assert.equal(h.saves.length, 1)
  assert.equal(h.saves[0]?.expected, null)
})

test('recovers a lost acknowledgement after restart without replaying the mutation', async () => {
  const slots = new MemorySlots()
  const first = harness({ slots })
  const initial = await loadServer(first)
  first.controller.updateSet(initial.session.exercises[0]!.clientId, initial.session.exercises[0]!.sets[0]!.clientId, 'reps', '9')
  await wait()
  first.controller.retrySave()
  await wait()
  assert.equal(first.saves.length, 1)
  first.controller.dispose()

  const second = harness({ slots })
  second.controller.start('user-a')
  await wait()
  const acknowledged = session('user-a', 'request-1')
  acknowledged.exercises[0]!.sets[0]!.reps = '9'
  second.listeners[0]!.next({ exists: true, data: acknowledged, fromCache: false, hasPendingWrites: false })
  await wait(30)
  assert.equal(ready(second.states).syncStatus, 'saved')
  assert.equal(second.saves.length, 0)
  assert.deepEqual(await new TwoSlotSessionJournal(slots).load('user-a'), { status: 'empty' })
})

test('unknown revisions, replacement and deletion retain the draft until explicit discard', async () => {
  for (const scenario of ['changed', 'replaced', 'closed'] as const) {
    const h = harness()
    const initial = await loadServer(h)
    h.controller.updateSet(initial.session.exercises[0]!.clientId, initial.session.exercises[0]!.sets[0]!.clientId, 'reps', '9')
    await wait()
    if (scenario === 'changed') h.listeners[0]!.next(snapshot('user-a', 'web-revision'))
    if (scenario === 'replaced') h.listeners[0]!.next({ ...snapshot('user-a', 'replacement'), data: { ...session('user-a', 'replacement'), sessionId: 'other-session' } })
    if (scenario === 'closed') h.listeners[0]!.next({ exists: false, data: null, fromCache: false, hasPendingWrites: false })
    await wait()
    assert.equal(ready(h.states).conflict, scenario)
    assert.equal(ready(h.states).session.exercises[0]?.sets[0]?.reps, '9')
    h.controller.updateSet(initial.session.exercises[0]!.clientId, initial.session.exercises[0]!.sets[0]!.clientId, 'reps', '10')
    h.listeners[0]!.next({ ...snapshot('user-a'), fromCache: true })
    await wait()
    assert.equal(ready(h.states).syncStatus, 'conflict')
    h.controller.discardLocalChanges()
    await wait()
    assert.equal(scenario === 'closed' ? h.states.at(-1)?.status : ready(h.states).syncStatus, scenario === 'closed' ? 'empty' : 'saved')
  }
})

test('duplicate callbacks and late completion after account switch cannot advance the next account', async () => {
  const h = harness()
  const initial = await loadServer(h)
  h.controller.updateSet(initial.session.exercises[0]!.clientId, initial.session.exercises[0]!.sets[0]!.clientId, 'reps', '9')
  await wait()
  h.controller.retrySave()
  await wait()
  h.controller.start('user-b')
  await wait()
  h.saves[0]!.result.resolve()
  h.listeners[0]!.next(snapshot('user-a', 'request-1'))
  await wait()
  assert.equal(h.states.at(-1)?.status, 'loading')
  h.listeners[1]!.next(snapshot('user-b'))
  await wait()
  assert.equal(ready(h.states).session.sessionId, 'session-user-b')
  h.listeners[0]!.next(snapshot('user-a', 'request-1'))
  await wait()
  assert.equal(ready(h.states).session.sessionId, 'session-user-b')
})

test('permission failures hide remote content while offline errors retain an owner-scoped draft', async () => {
  const h = harness()
  await loadServer(h)
  h.listeners[0]!.error({ code: 'firestore/permission-denied' })
  await wait()
  assert.equal(h.states.at(-1)?.status, 'error')
  assert.equal(h.states.at(-1)?.session, null)

  const local = harness()
  const initial = await loadServer(local)
  local.controller.updateSet(initial.session.exercises[0]!.clientId, initial.session.exercises[0]!.sets[0]!.clientId, 'reps', '9')
  await wait()
  local.listeners[0]!.error(new Error('offline'))
  await wait()
  assert.equal(ready(local.states).session.exercises[0]?.sets[0]?.reps, '9')
  assert.equal(ready(local.states).stale, true)
  assert.equal(ready(local.states).syncStatus, 'failed')
  local.controller.updateSet(initial.session.exercises[0]!.clientId, initial.session.exercises[0]!.sets[0]!.clientId, 'reps', '10')
  await wait()
  assert.equal(ready(local.states).syncStatus, 'failed')
})

test('stateForAccount masks a previous account immediately', () => {
  const accountA: ActiveSessionState = {
    status: 'ready', session: { sessionId: 'session-a', sessionRevision: 'revision-a', startedAt: 1, templateId: null, exercises: [] },
    units: 'kg', stale: false, syncStatus: 'saved',
  }
  assert.equal(stateForAccount('b', 'a', accountA).status, 'loading')
  assert.equal(stateForAccount('b', 'b', accountA), accountA)
})

test('a transaction conflict stops retries and keeps the durable draft', async () => {
  const h = harness()
  const initial = await loadServer(h)
  h.controller.updateSet(initial.session.exercises[0]!.clientId, initial.session.exercises[0]!.sets[0]!.clientId, 'reps', '9')
  await wait()
  h.controller.retrySave()
  await wait()
  h.saves[0]!.result.reject(new ConflictError())
  await wait()
  assert.equal(ready(h.states).syncStatus, 'conflict')
  assert.equal(h.saves.length, 1)
  const acknowledged = session('user-a', 'request-1')
  acknowledged.exercises[0]!.sets[0]!.reps = '9'
  h.listeners[0]!.next({ exists: true, data: acknowledged, fromCache: false, hasPendingWrites: false })
  await wait(30)
  assert.equal(ready(h.states).syncStatus, 'saved')
  assert.equal(ready(h.states).conflict, undefined)
})

test('bounds transient retries per request and requires explicit Retry after exhaustion', async () => {
  const h = harness()
  const initial = await loadServer(h)
  h.controller.updateSet(initial.session.exercises[0]!.clientId, initial.session.exercises[0]!.sets[0]!.clientId, 'reps', '9')
  await wait()
  h.controller.retrySave()
  await wait()
  h.saves[0]!.result.reject({ transient: true })
  await wait(350)
  h.saves[1]!.result.reject({ transient: true })
  await wait(650)
  h.saves[2]!.result.reject({ transient: true })
  await wait()
  assert.equal(ready(h.states).syncStatus, 'failed')
  h.listeners[0]!.next(snapshot('user-a'))
  h.listeners[0]!.next(snapshot('user-a'))
  await wait(30)
  assert.equal(h.saves.length, 3)
  assert.equal(ready(h.states).syncStatus, 'failed')
  h.controller.updateSet(initial.session.exercises[0]!.clientId, initial.session.exercises[0]!.sets[0]!.clientId, 'reps', '10')
  await wait()
  assert.equal(ready(h.states).syncStatus, 'failed')
  h.controller.retrySave()
  await wait()
  assert.equal(h.saves.length, 4)
})

test('corrupt startup is absorbing and cannot be overwritten by a queued snapshot', async () => {
  const slots = new MemorySlots()
  slots.values.set('user-a:0', '{broken')
  const h = harness({ slots })
  h.controller.start('user-a')
  h.listeners[0]!.next(snapshot('user-a'))
  await wait(30)
  const failed = h.states.at(-1)
  assert.equal(failed?.status, 'error')
  if (failed?.status === 'error') assert.match(failed.message, /damaged/)
})

test('a recovered offline draft wins when units lookup fails before journal recovery', async () => {
  const slots = new MemorySlots()
  const journal = new TwoSlotSessionJournal(slots)
  await journal.load('user-a')
  const stored = session('user-a')
  await journal.writeDraft('user-a', { session: {
    sessionId: stored.sessionId, sessionRevision: stored.sessionRevision, startedAt: stored.startedAt,
    templateId: null, label: stored.label, exercises: stored.exercises as ActiveWorkout['exercises'],
  }, units: 'lbs', baseRevision: stored.sessionRevision, pending: null })
  const h = harness({ slots, readUnits: async () => { throw new Error('offline') } })
  h.controller.start('user-a')
  await wait(30)
  assert.equal(ready(h.states).units, 'lbs')
  assert.equal(ready(h.states).stale, true)
})

test('label-only and exercise add/remove edits are saved as draft changes', async () => {
  const h = harness()
  await loadServer(h)
  h.controller.setLabel('Pull')
  await wait()
  assert.equal(ready(h.states).session.label, 'Pull')
  h.controller.retrySave()
  await wait()
  assert.equal(h.saves.length, 1)
  assert.equal(h.saves[0]?.session.label, 'Pull')
  h.saves[0]!.result.resolve()
  h.listeners[0]!.next({ ...snapshot('user-a', 'request-1'), data: { ...session('user-a', 'request-1', 'Pull') } })
  await wait(30)
  assert.equal(ready(h.states).syncStatus, 'saved')

  const addedId = h.controller.addExercise('custom-1', 'Mine', 'user')
  await wait()
  const added = ready(h.states).session
  assert.equal(added.exercises.at(-1)?.clientId, addedId)
  assert.equal(added.exercises.at(-1)?.exerciseSource, 'user')
  h.controller.removeExercise(added.exercises[0]!.clientId)
  await wait()
  assert.deepEqual(ready(h.states).session.exercises.map(({ clientId }) => clientId), [addedId])
})
