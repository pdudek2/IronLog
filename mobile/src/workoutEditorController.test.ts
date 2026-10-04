import test from 'node:test'
import assert from 'node:assert/strict'
import { WorkoutEditorController } from './workoutEditorController'
import { WorkoutEditorJournal } from './workoutEditorJournal'
import type { WorkoutMutationState } from '../../src/shared/workoutMutation'
import type { WorkoutPendingOperation } from './workoutEditor'
const baseline = 'a'.repeat(64)
const snapshot: WorkoutMutationState = { status: 'available', baseline, projection: 'ready', operation: null, workout: { id: 'w', startedAt: 1, finishedAt: 2, label: 'Before', materialized: true, exercises: [{ exerciseId: 'row', exerciseSource: 'global', name: 'Row', sets: [{ weight: 20, reps: 8 }] }] } }
function setup() {
  const data = new Map<string, string>(); let fail = false; let count = 0; let operation: WorkoutPendingOperation | null = null
  const journal = new WorkoutEditorJournal({ read: async (k,s) => data.get(`${k}:${s}`) ?? null, write: async (k,s,v) => { if (fail) throw new Error('disk full'); data.set(`${k}:${s}`,v) } })
  const deps = { uid: 'u', workoutId: 'w', owner: 'owner', units: 'kg' as const, newId: () => `identity-${++count}`, journal,
    read: async () => structuredClone(operation ? { ...snapshot, operation: { action: operation.action, status: 'complete', revision: 2 } } : snapshot) as WorkoutMutationState,
    send: async (op: WorkoutPendingOperation) => { operation = op; throw new Error('lost acknowledgement') } }
  return { deps, journal, fail: () => { fail = true }, operation: () => operation }
}
test('no HTTP before a durable intent; no-op is not sent', async () => {
  const s = setup(), c = new WorkoutEditorController(s.deps)
  await c.open(); await c.submit('update'); assert.equal(s.operation(), null); assert.equal(c.state.phase, 'complete')
  const second = new WorkoutEditorController({ ...s.deps, owner: 'two' }); await second.open()
  await second.change(d => ({ ...d, label: 'After' })); s.fail(); await second.submit('update')
  assert.equal(s.operation(), null); assert.match(second.state.error!, /disk full/)
})
test('lost acknowledgement survives remount and reconciliation sends no duplicate change', async () => {
  const s = setup(), c = new WorkoutEditorController(s.deps)
  await c.open(); await c.change(d => ({ ...d, label: 'After' })); await c.submit('update')
  const op = s.operation(); assert.ok(op); assert.equal(c.state.phase, 'unknown')
  c.dispose()
  const restored = new WorkoutEditorController({ ...s.deps, owner: 'new', send: async () => { throw new Error('must not resend completed operation') } })
  await restored.open(); assert.deepEqual(restored.state.draft?.pending, op)
  await restored.submit('update'); assert.equal(restored.state.phase, 'complete'); assert.deepEqual(await s.journal.list('u'), [])
})
test('late acknowledgement cannot clear a newer owner or navigate a disposed editor', async () => {
  const s = setup(); let release!: () => void
  const gate = new Promise<void>(r => { release = r })
  const c = new WorkoutEditorController({ ...s.deps, send: async () => { await gate } })
  await c.open(); await c.change(d => ({ ...d, label: 'After' }))
  const pending = c.submit('update');
  while (!c.state.draft?.pending) await new Promise(r => setImmediate(r))
  const newer = new WorkoutEditorController({ ...s.deps, owner: 'new' }); await newer.open(); c.dispose(); release(); await pending
  assert.equal(c.state.phase === 'complete', false); assert.equal((await s.journal.list('u')).length, 1)
})
test('conflicts retain the draft and deletion recovery remains discoverable without workout', async () => {
  const s = setup(), c = new WorkoutEditorController(s.deps)
  await c.open(); await c.change(d => ({ ...d, label: 'After' }))
  s.deps.read = async () => ({ ...snapshot, baseline: 'b'.repeat(64) })
  await c.submit('update'); assert.equal(c.state.phase, 'conflict'); assert.equal(s.operation(), null)
  assert.equal(c.state.draft?.label, 'After')
  await c.discard(); assert.deepEqual(await s.journal.list('u'), [])
})
test('pending deletion stays discoverable after document loss and Retry resumes only that operation', async () => {
  const s = setup(); let pending: WorkoutPendingOperation | null = null; let complete = false; let calls = 0
  const c = new WorkoutEditorController({ ...s.deps, read: async () => pending ? { status: 'gone', workout: null, baseline: null, projection: 'deleted', operation: { action: 'delete', status: complete ? 'complete' : 'committed', revision: 2 } } : snapshot,
    send: async op => { pending = op; calls++ } })
  await c.open(); await c.submit('delete')
  assert.equal(c.state.phase, 'pending'); assert.equal(c.state.draft?.pending?.committed, true); assert.equal((await s.journal.list('u'))[0]?.pending?.action, 'delete')
  complete = true; await c.submit('update')
  assert.equal(c.state.phase, 'gone'); assert.equal(calls, 1); assert.deepEqual(await s.journal.list('u'), [])
})
test('returning to an existing screen reloads the latest durable draft and claims a new owner', async () => {
  const s = setup(), first = new WorkoutEditorController(s.deps)
  await first.open(); await first.change(d => ({ ...d, label: 'First' }))
  const second = new WorkoutEditorController({ ...s.deps, owner: 'second' }); await second.open(); await second.change(d => ({ ...d, label: 'Newer' }))
  await first.open(); assert.equal(first.state.draft?.label, 'Newer')
  await first.change(d => ({ ...d, label: 'Resumed' }))
  assert.equal((await s.journal.list('u'))[0]?.label, 'Resumed')
})

test('an already queued field edit survives disposal before its storage turn', async () => {
  const s = setup(), c = new WorkoutEditorController(s.deps)
  await c.open()
  const changed = c.change(d => ({ ...d, label: 'Kept on account exit' }))
  c.dispose(); await changed
  assert.equal((await s.journal.list('u'))[0]?.label, 'Kept on account exit')
  assert.deepEqual(await s.journal.list('another-account'), [])
})
