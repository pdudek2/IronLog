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
