import assert from 'node:assert/strict'
import test from 'node:test'

import {
  closureFailure,
  readClosureIntent,
  requestClosure,
  writeClosureIntent,
  type ClosureIntent,
  type ClosureIntentStorage,
} from './workoutClosure'

const finish: ClosureIntent = { action: 'finish', sessionId: 'session-a', sessionRevision: 'revision-a', createdAt: 1 }

function deps(respond: (url: string, body: unknown) => Response | Promise<Response>) {
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

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

test('finish posts the saved revision and validates the echoed workout id', async () => {
  const { calls, dependencies } = deps(() => json(200, { workoutId: 'session-a', status: 'materialized' }))
  assert.deepEqual(await requestClosure(finish, dependencies), { action: 'finish', workoutId: 'session-a', status: 'materialized' })
  assert.deepEqual(calls, [{ url: 'http://api.test/api/finalize-workout', body: { sessionId: 'session-a', sessionRevision: 'revision-a' }, auth: 'Bearer token-a' }])

  const wrongId = deps(() => json(200, { workoutId: 'other', status: 'materialized' }))
  await assert.rejects(requestClosure(finish, wrongId.dependencies), (error) => closureFailure(error) === 'closure_unconfirmed')
})

test('discard posts only the session id', async () => {
  const { calls, dependencies } = deps(() => json(200, { status: 'discarded' }))
  const result = await requestClosure({ action: 'discard', sessionId: 'session-a', sessionRevision: null, createdAt: 1 }, dependencies)
  assert.deepEqual(result, { action: 'discard', status: 'discarded' })
  assert.deepEqual(calls[0]?.body, { sessionId: 'session-a' })
})

test('structured 4xx is definitive; 5xx, network and garbage stay unconfirmed', async () => {
  const conflict = deps(() => json(409, { error: 'Changed', code: 'active_session_changed' }))
  await assert.rejects(requestClosure(finish, conflict.dependencies), (error) => closureFailure(error) === 'active_session_changed')
  const auth = deps(() => json(401, { error: 'Sign in' }))
  await assert.rejects(requestClosure(finish, auth.dependencies), (error) => closureFailure(error) === 'auth_required')
  for (const respond of [() => json(500, { error: 'boom' }), () => new Response('nope', { status: 200 }), () => { throw new TypeError('offline') }]) {
    await assert.rejects(requestClosure(finish, deps(respond).dependencies), (error) => closureFailure(error) === 'closure_unconfirmed')
  }
})

test('intent storage is owner-scoped and rejects malformed records', async () => {
  const values = new Map<string, string>()
  const storage: ClosureIntentStorage = {
    read: async (uid) => values.get(uid) ?? null,
    write: async (uid, value) => { values.set(uid, value) },
    clear: async (uid) => { values.delete(uid) },
  }
  await writeClosureIntent(storage, 'user-a', finish)
  assert.deepEqual(await readClosureIntent(storage, 'user-a'), finish)
  values.set('user-b', values.get('user-a')!)
  assert.equal(await readClosureIntent(storage, 'user-b'), null)
  values.set('user-a', '{broken')
  assert.equal(await readClosureIntent(storage, 'user-a'), null)
})
