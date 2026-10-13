import assert from 'node:assert/strict'
import test from 'node:test'
import { updateExistingActiveSession, NativeActiveSessionConflictError } from './activeSessionTransaction'
import { parseSessionDocument } from './session'

test('upgrades a real pre-identity session and retains CAS, owner and replacement guards', async () => {
  const legacy = { userId: 'alice', startedAt: 1000, exercises: [] }
  const session = parseSessionDocument('alice', legacy)
  let stored: Record<string, unknown> | null = legacy
  let writes = 0
  const port = {
    read: async () => ({ exists: stored !== null, data: stored }),
    update: (fields: Record<string, unknown>) => { stored = { ...stored, ...fields }; writes++ },
  }
  await updateExistingActiveSession(port, 'alice', { ...session, label: ' Updated ' }, null, 'revision-1', 2000)
  assert.deepEqual(stored, { ...legacy, sessionId: session.sessionId, sessionRevision: 'revision-1', templateId: null, label: 'Updated', updatedAt: 2000 })
  await updateExistingActiveSession(port, 'alice', session, null, 'revision-1', 2001)
  assert.equal(writes, 1)
  await assert.rejects(updateExistingActiveSession(port, 'alice', session, null, 'stale', 2001), NativeActiveSessionConflictError)
  stored = { ...legacy, startedAt: 1001 }
  await assert.rejects(updateExistingActiveSession(port, 'alice', session, null, 'replacement', 2001), NativeActiveSessionConflictError)
  stored = { ...legacy, userId: 'bob' }
  await assert.rejects(updateExistingActiveSession(port, 'alice', session, null, 'other-owner', 2001), NativeActiveSessionConflictError)
  stored = null
  await assert.rejects(updateExistingActiveSession(port, 'alice', session, null, 'missing', 2001), NativeActiveSessionConflictError)
  assert.equal(writes, 1)
})

test('writes a refreshed start time only under the matching revision and keeps the session identity', async () => {
  let stored: Record<string, unknown> = { userId: 'alice', sessionId: 'session-1', sessionRevision: 'revision-1', startedAt: 1000, exercises: [] }
  const session = parseSessionDocument('alice', stored)
  const port = {
    read: async () => ({ exists: true, data: stored }),
    update: (fields: Record<string, unknown>) => { stored = { ...stored, ...fields } },
  }
  await updateExistingActiveSession(port, 'alice', { ...session, startedAt: 5000 }, 'revision-1', 'revision-2', 2000)
  assert.equal(stored.startedAt, 5000)
  assert.equal(stored.sessionId, 'session-1')
  await assert.rejects(updateExistingActiveSession(port, 'alice', { ...session, startedAt: 9000 }, 'revision-1', 'revision-3', 2001), NativeActiveSessionConflictError)
  assert.equal(stored.startedAt, 5000)
})
