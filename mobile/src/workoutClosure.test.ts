import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ClosureIntentJournal,
  ClosureRequestError,
  WorkoutClosureController,
  closureFailure,
  requestClosure,
  type ClosureIntent,
  type ClosureIntentStorage,
  type ClosureResult,
  type ClosureState,
} from './workoutClosure'
import type { ActiveWorkout } from './session'

const finish: ClosureIntent = { action: 'finish', sessionId: 'session-a', sessionRevision: 'revision-a', createdAt: 1 }
const discard: ClosureIntent = { action: 'discard', sessionId: 'session-b', sessionRevision: 'revision-b', createdAt: 2 }

class MemorySlots implements ClosureIntentStorage {
  values = new Map<string, string>()
  legacy = new Map<string, string>()
  failWrite = false
  tearWrite = false
  writeCount = 0
  readFailure: Error | null = null
  readGate: Promise<void> | null = null

  async read(uid: string, slot: 0 | 1) {
    if (this.readGate) await this.readGate
    if (this.readFailure) {
      const error = this.readFailure
      this.readFailure = null
      throw error
    }
    return this.values.get(`${uid}:${slot}`) ?? null
  }

  async write(uid: string, slot: 0 | 1, value: string) {
    this.writeCount += 1
    if (this.failWrite) {
      if (this.tearWrite) this.values.set(`${uid}:${slot}`, '{torn')
      throw new Error('disk full')
    }
    this.values.set(`${uid}:${slot}`, value)
  }

  async readLegacy(uid: string) { return this.legacy.get(uid) ?? null }
  async clearLegacy(uid: string) { this.legacy.delete(uid) }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function session(sessionId = 'session-a', sessionRevision: string | null = 'revision-a'): ActiveWorkout {
  return {
    sessionId,
    sessionRevision,
    startedAt: 1,
    templateId: null,
    exercises: [],
  }
}

function harness(uid = 'user-a', slots = new MemorySlots(), journal = new ClosureIntentJournal(slots)) {
  const calls: ClosureIntent[] = []
  const requests: ReturnType<typeof deferred<ClosureResult>>[] = []
  const states: Array<{ state: ClosureState; completed: ClosureResult | null }> = []
  const controller = new WorkoutClosureController(uid, journal, (intent) => {
    calls.push(intent)
    const request = deferred<ClosureResult>()
    requests.push(request)
    return request.promise
  }, (state, completed) => states.push({ state, completed }))
  return { controller, slots, journal, calls, requests, states }
}

function lastState(states: Array<{ state: ClosureState }>): ClosureState {
  return states.at(-1)!.state
}

const wait = () => new Promise((resolve) => setTimeout(resolve, 0))
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

function requestDependencies(respond: (url: string, body: unknown) => Response | Promise<Response>) {
  const calls: Array<{ url: string; body: unknown; auth: string | null }> = []
  return {
    calls,
    dependencies: {
      apiBaseUrl: 'http://api.test',
      getIdToken: async () => 'token-a',
      fetch: (async (url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body))
        calls.push({ url, body, auth: new Headers(init.headers).get('Authorization') })
        return respond(url, body)
      }) as typeof fetch,
    },
  }
}

test('finish posts the saved revision and validates the echoed workout id', async () => {
  const { calls, dependencies } = requestDependencies(() => json(200, { workoutId: 'session-a', status: 'materialized' }))
  assert.deepEqual(await requestClosure(finish, dependencies), { action: 'finish', workoutId: 'session-a', status: 'materialized' })
  assert.deepEqual(calls, [{ url: 'http://api.test/api/finalize-workout', body: { sessionId: 'session-a', sessionRevision: 'revision-a' }, auth: 'Bearer token-a' }])

  const wrongId = requestDependencies(() => json(200, { workoutId: 'other', status: 'materialized' }))
  await assert.rejects(requestClosure(finish, wrongId.dependencies), (error) => closureFailure(error) === 'closure_unconfirmed')
})

test('discard posts only the session id', async () => {
  const { calls, dependencies } = requestDependencies(() => json(200, { status: 'discarded' }))
  const result = await requestClosure({ action: 'discard', sessionId: 'session-a', sessionRevision: null, createdAt: 1 }, dependencies)
  assert.deepEqual(result, { action: 'discard', status: 'discarded' })
  assert.deepEqual(calls[0]?.body, { sessionId: 'session-a' })
})

test('structured 4xx is definitive; 5xx, network and garbage stay unconfirmed', async () => {
  const conflict = requestDependencies(() => json(409, { error: 'Changed', code: 'active_session_changed' }))
  await assert.rejects(requestClosure(finish, conflict.dependencies), (error) => closureFailure(error) === 'active_session_changed')
  const auth = requestDependencies(() => json(401, { error: 'Sign in' }))
  await assert.rejects(requestClosure(finish, auth.dependencies), (error) => closureFailure(error) === 'auth_required')
  for (const respond of [() => json(500, { error: 'boom' }), () => new Response('nope', { status: 200 }), () => { throw new TypeError('offline') }]) {
    await assert.rejects(requestClosure(finish, requestDependencies(respond).dependencies), (error) => closureFailure(error) === 'closure_unconfirmed')
  }
})

test('a torn newest slot recovers the prior complete intent', async () => {
  const slots = new MemorySlots()
  const journal = new ClosureIntentJournal(slots)
  assert.deepEqual(await journal.load('user-a'), { status: 'empty', generation: 0 })
  await journal.writeIntent('user-a', finish)
  slots.failWrite = true
  slots.tearWrite = true
  await assert.rejects(journal.writeIntent('user-a', discard), /disk full/)

  const recovered = await new ClosureIntentJournal(slots).load('user-a')
  assert.deepEqual(recovered, { status: 'intent', generation: 1, intent: finish })
})

test('an explicit empty record survives reload without reviving the older intent', async () => {
  const slots = new MemorySlots()
  const journal = new ClosureIntentJournal(slots)
  await journal.load('user-a')
  const generation = await journal.writeIntent('user-a', finish)
  assert.equal(await journal.clear('user-a', generation), true)
  assert.deepEqual(await new ClosureIntentJournal(slots).load('user-a'), { status: 'empty', generation: 2 })
})

test('a stale completion cannot clear a newer intent', async () => {
  const slots = new MemorySlots()
  const journal = new ClosureIntentJournal(slots)
  await journal.load('user-a')
  const oldGeneration = await journal.writeIntent('user-a', finish)
  await journal.writeIntent('user-a', discard)
  assert.equal(await journal.clear('user-a', oldGeneration), false)
  assert.deepEqual(await journal.load('user-a'), { status: 'intent', generation: 2, intent: discard })
})

test('migrates the installed legacy intent and preserves it if migration is interrupted', async () => {
  const slots = new MemorySlots()
  slots.legacy.set('user-a', JSON.stringify({ uid: 'user-a', ...finish }))
  slots.failWrite = true
  slots.tearWrite = true
  await assert.rejects(new ClosureIntentJournal(slots).load('user-a'), /disk full/)
  assert.equal(slots.legacy.has('user-a'), true)

  slots.failWrite = false
  const recovered = await new ClosureIntentJournal(slots).load('user-a')
  assert.deepEqual(recovered, { status: 'intent', generation: 1, intent: finish })
  assert.equal(slots.legacy.has('user-a'), false)
  assert.deepEqual(await new ClosureIntentJournal(slots).load('user-a'), recovered)
})

test('malformed legacy data and unreadable slots fail closed', async () => {
  const slots = new MemorySlots()
  slots.legacy.set('user-a', '{broken')
  assert.deepEqual(await new ClosureIntentJournal(slots).load('user-a'), { status: 'corrupt' })
  assert.equal(slots.legacy.get('user-a'), '{broken')

  const readFailure = new MemorySlots()
  readFailure.readFailure = new Error('disk read failed')
  await assert.rejects(new ClosureIntentJournal(readFailure).load('user-a'), /disk read failed/)
})

test('a delayed startup read blocks editing and closure until recovery completes', async () => {
  const slots = new MemorySlots()
  const gate = deferred<void>()
  slots.readGate = gate.promise
  const h = harness('user-a', slots)
  const loading = h.controller.start()
  assert.equal(lastState(h.states).status, 'loading')
  assert.equal(h.controller.canEdit(), false)
  await h.controller.startClosure('finish', session())
  assert.equal(slots.writeCount, 0)
  assert.equal(h.calls.length, 0)

  gate.resolve()
  await loading
  assert.equal(lastState(h.states).status, 'ready')
  assert.equal(h.controller.canEdit(), true)
})

test('read failure and corruption stay locked until a fresh read succeeds', async () => {
  const slots = new MemorySlots()
  slots.readFailure = new Error('temporary disk failure')
  const h = harness('user-a', slots)
  await h.controller.start()
  assert.equal(lastState(h.states).status, 'read_failed')
  assert.equal(h.controller.canEdit(), false)
  await h.controller.retry()
  assert.equal(lastState(h.states).status, 'ready')

  slots.values.set('user-a:0', '{broken')
  await h.controller.start()
  assert.equal(lastState(h.states).status, 'corrupt')
  assert.equal(h.controller.canEdit(), false)
  slots.values.delete('user-a:0')
  await h.controller.retry()
  assert.equal(lastState(h.states).status, 'ready')
})

test('an initial intent write failure makes no API call and offers a safe return to editing', async () => {
  const slots = new MemorySlots()
  const h = harness('user-a', slots)
  await h.controller.start()
  slots.failWrite = true
  await h.controller.startClosure('finish', session())
  assert.equal(lastState(h.states).status, 'intent_storage_failed')
  assert.equal(h.controller.canEdit(), true)
  assert.equal(h.calls.length, 0)
  h.controller.dismiss()
  assert.equal(lastState(h.states).status, 'ready')
})

test('a recovered ambiguous intent stays locked when retry persistence fails', async () => {
  const slots = new MemorySlots()
  const h = harness('user-a', slots)
  await h.controller.start()
  const sending = h.controller.startClosure('finish', session())
  await wait()
  h.requests[0]!.reject(new Error('API may have finished the workout'))
  await sending
  assert.equal(lastState(h.states).status, 'closure_unconfirmed')
  assert.equal(h.controller.canEdit(), false)

  slots.failWrite = true
  await h.controller.retry()
  assert.equal(lastState(h.states).status, 'retry_storage_failed')
  assert.equal(h.controller.canEdit(), false)
  assert.equal(h.calls.length, 1)
  const recovered = await new ClosureIntentJournal(slots).load('user-a')
  assert.deepEqual(recovered, { status: 'intent', generation: 1, intent: h.calls[0] })
})

test('resolved server rejection writes an empty generation before releasing the workout', async () => {
  const slots = new MemorySlots()
  const h = harness('user-a', slots)
  await h.controller.start()
  const sending = h.controller.startClosure('finish', session())
  await wait()
  h.requests[0]!.reject(new ClosureRequestError('definitive', 'Changed', 409, 'active_session_changed'))
  await sending
  assert.deepEqual(lastState(h.states), { status: 'active_session_changed', intent: h.calls[0], locked: true })
  h.controller.dismiss()
  assert.equal(lastState(h.states).status, 'ready')
  assert.deepEqual(await new ClosureIntentJournal(slots).load('user-a'), { status: 'empty', generation: 2 })
})

test('a failed resolved-state clear stays locked and can be retried without another API request', async () => {
  const slots = new MemorySlots()
  const h = harness('user-a', slots)
  await h.controller.start()
  const sending = h.controller.startClosure('discard', session('session-a', null))
  await wait()
  slots.failWrite = true
  h.requests[0]!.resolve({ action: 'discard', status: 'discarded' })
  await sending
  assert.equal(lastState(h.states).status, 'resolution_storage_failed')
  assert.equal(h.controller.canEdit(), false)

  slots.failWrite = false
  await h.controller.retry()
  assert.equal(lastState(h.states).status, 'ready')
  assert.deepEqual(h.states.at(-1)?.completed, { action: 'discard', status: 'discarded' })
  assert.equal(h.calls.length, 1)
})

test('a late result cannot publish or clear after its runtime is disposed', async () => {
  const slots = new MemorySlots()
  const h = harness('user-a', slots)
  await h.controller.start()
  const sending = h.controller.startClosure('finish', session())
  await wait()
  const eventCount = h.states.length
  h.controller.dispose()
  h.requests[0]!.resolve({ action: 'finish', workoutId: 'session-a', status: 'materialized' })
  await sending
  assert.equal(h.states.length, eventCount)
  assert.deepEqual(await new ClosureIntentJournal(slots).load('user-a'), { status: 'intent', generation: 1, intent: h.calls[0] })
})

test('a late old-owner request cannot publish into a newer signed-in owner', async () => {
  const slots = new MemorySlots()
  const oldOwner = harness('user-a', slots)
  await oldOwner.controller.start()
  const sending = oldOwner.controller.startClosure('finish', session())
  await wait()

  const newOwner = harness('user-b', slots)
  await newOwner.controller.start()
  const newOwnerEvents = newOwner.states.length
  oldOwner.controller.dispose()
  oldOwner.requests[0]!.resolve({ action: 'finish', workoutId: 'session-a', status: 'materialized' })
  await sending

  assert.equal(newOwner.states.length, newOwnerEvents)
  assert.equal(lastState(newOwner.states).status, 'ready')
  assert.deepEqual(await new ClosureIntentJournal(slots).load('user-a'), { status: 'intent', generation: 1, intent: oldOwner.calls[0] })
  assert.deepEqual(await new ClosureIntentJournal(slots).load('user-b'), { status: 'empty', generation: 0 })
})

test('an old completion cannot clear a newer owner intent', async () => {
  const slots = new MemorySlots()
  const journal = new ClosureIntentJournal(slots)
  const h = harness('user-a', slots, journal)
  await h.controller.start()
  const sending = h.controller.startClosure('finish', session())
  await wait()
  await journal.writeIntent('user-a', discard)
  h.requests[0]!.resolve({ action: 'finish', workoutId: 'session-a', status: 'materialized' })
  await sending

  assert.deepEqual(lastState(h.states), { status: 'closure_unconfirmed', intent: discard, locked: true })
  assert.deepEqual(await journal.load('user-a'), { status: 'intent', generation: 2, intent: discard })
})

test('a valid legacy intent remains locked when its migration write fails', async () => {
  const slots = new MemorySlots()
  slots.legacy.set('user-a', JSON.stringify({ uid: 'user-a', ...finish }))
  slots.failWrite = true
  const h = harness('user-a', slots)
  await h.controller.start()
  assert.equal(lastState(h.states).status, 'read_failed')
  assert.equal(h.controller.canEdit(), false)
  assert.equal(slots.legacy.has('user-a'), true)
  assert.equal(h.calls.length, 0)
})
