import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ActiveSessionController,
  type ActiveSessionState,
  type SessionSnapshot,
  type SubscribeToSession,
} from './activeSessionController'
import type { Units } from './session'

interface Listener {
  uid: string
  next: (snapshot: SessionSnapshot) => void
  error: (error: unknown) => void
  unsubscribed: boolean
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

function session(uid: string, label = 'Push') {
  return {
    userId: uid,
    sessionId: `session-${uid}`,
    sessionRevision: `revision-${uid}`,
    startedAt: 1_000,
    templateId: null,
    label,
    exercises: [{
      exerciseId: 'bench-press',
      exerciseSource: 'global',
      name: 'Bench Press',
      sets: [{ weight: '65', reps: '8', done: true }],
    }],
  }
}

function harness(units: Units = 'kg') {
  const listeners: Listener[] = []
  const states: ActiveSessionState[] = []
  const subscribe: SubscribeToSession = (uid, next, error) => {
    const listener = { uid, next, error, unsubscribed: false }
    listeners.push(listener)
    return () => { listener.unsubscribed = true }
  }
  const controller = new ActiveSessionController(subscribe, async () => units, (state) => states.push(state))
  return { controller, listeners, states }
}

test('distinguishes cache-only absence from authoritative server absence', async () => {
  const { controller, listeners, states } = harness()
  controller.start('user-a')
  await flush()

  listeners[0]!.next({ exists: false, data: null, fromCache: true, hasPendingWrites: false })
  assert.equal(states.at(-1)?.status, 'cache-miss')

  listeners[0]!.next({ exists: false, data: null, fromCache: false, hasPendingWrites: false })
  assert.equal(states.at(-1)?.status, 'empty')
})

test('shows cached data as stale, then accepts an authoritative update and deletion', async () => {
  const { controller, listeners, states } = harness('lbs')
  controller.start('user-a')
  await flush()

  listeners[0]!.next({ exists: true, data: session('user-a'), fromCache: true, hasPendingWrites: false })
  assert.deepEqual(states.at(-1), {
    status: 'ready',
    session: states.at(-1)?.session,
    units: 'lbs',
    stale: true,
  })

  listeners[0]!.next({ exists: true, data: session('user-a', 'Pull'), fromCache: false, hasPendingWrites: false })
  const serverState = states.at(-1)
  assert.equal(serverState?.status, 'ready')
  if (serverState?.status === 'ready') {
    assert.equal(serverState.stale, false)
    assert.equal(serverState.session.label, 'Pull')
  }

  listeners[0]!.next({ exists: false, data: null, fromCache: false, hasPendingWrites: false })
  assert.equal(states.at(-1)?.status, 'empty')
})

test('malformed and permission failures clear protected session content', async () => {
  const { controller, listeners, states } = harness()
  controller.start('user-a')
  await flush()

  listeners[0]!.next({ exists: true, data: session('user-a'), fromCache: false, hasPendingWrites: false })
  assert.equal(states.at(-1)?.status, 'ready')
  listeners[0]!.next({ exists: true, data: { userId: 'user-a', exercises: [] }, fromCache: false, hasPendingWrites: false })
  assert.equal(states.at(-1)?.status, 'error')
  assert.equal(states.at(-1)?.session, null)
  assert.equal(listeners[0]?.unsubscribed, true)

  controller.retry()
  await flush()
  listeners[1]!.error({ code: 'firestore/permission-denied' })
  const deniedState = states.at(-1)
  assert.equal(deniedState?.status, 'error')
  if (deniedState?.status === 'error') assert.match(deniedState.message, /permission/)
  assert.equal(deniedState?.session, null)
})

test('retry replaces the failed listener', async () => {
  const { controller, listeners, states } = harness()
  controller.start('user-a')
  await flush()
  listeners[0]!.error(new Error('offline'))

  controller.retry()
  await flush()
  assert.equal(listeners.length, 2)
  assert.equal(listeners[0]?.unsubscribed, true)
  listeners[1]!.next({ exists: false, data: null, fromCache: false, hasPendingWrites: false })
  assert.equal(states.at(-1)?.status, 'empty')
})

test('keeps listening after malformed cache so server recovery can replace it', async () => {
  const { controller, listeners, states } = harness()
  controller.start('user-a')
  await flush()

  listeners[0]!.next({
    exists: true,
    data: { userId: 'user-a', exercises: [] },
    fromCache: true,
    hasPendingWrites: false,
  })
  assert.equal(states.at(-1)?.status, 'error')
  assert.equal(states.at(-1)?.session, null)
  assert.equal(listeners[0]?.unsubscribed, false)

  listeners[0]!.next({ exists: true, data: session('user-a', 'Recovered'), fromCache: false, hasPendingWrites: false })
  const recovered = states.at(-1)
  assert.equal(recovered?.status, 'ready')
  if (recovered?.status === 'ready') assert.equal(recovered.session.label, 'Recovered')
})

test('account switches clear immediately and ignore late callbacks from the previous account', async () => {
  const { controller, listeners, states } = harness()
  controller.start('user-a')
  await flush()
  listeners[0]!.next({ exists: true, data: session('user-a'), fromCache: true, hasPendingWrites: false })
  assert.equal(states.at(-1)?.status, 'ready')

  controller.start('user-b')
  assert.equal(states.at(-1)?.status, 'loading')
  assert.equal(states.at(-1)?.session, null)
  assert.equal(listeners[0]?.unsubscribed, true)
  await flush()

  listeners[0]!.next({ exists: true, data: session('user-a'), fromCache: false, hasPendingWrites: false })
  assert.equal(states.at(-1)?.status, 'loading')
  listeners[1]!.next({ exists: false, data: null, fromCache: false, hasPendingWrites: false })
  assert.equal(states.at(-1)?.status, 'empty')
})
