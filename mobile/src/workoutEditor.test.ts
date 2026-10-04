import test from 'node:test'
import assert from 'node:assert/strict'
import { newWorkoutDraft, normalizeWorkoutDraft, isWorkoutDraft } from './workoutEditor'
import { WorkoutEditorJournal } from './workoutEditorJournal'
const snapshot = { id: 'workout', label: 'Pull', startedAt: 1, finishedAt: 2, materialized: true, exercises: [
  { exerciseId: 'same', exerciseSource: 'global' as const, name: 'Row', sets: [{ weight: 42.375, reps: 8 }] },
  { exerciseId: 'same', exerciseSource: 'user' as const, name: 'My Row', sets: [{ weight: 0, reps: 12 }] },
] }
let n = 0
const newId = () => `identity-${++n}`
const draft = () => newWorkoutDraft(snapshot, 'a'.repeat(64), 'lbs', newId)
function storage() { const data = new Map<string, string>(); return { data, read: async (k: string, s: 0 | 1) => data.get(`${k}:${s}`) ?? null, write: async (k: string, s: 0 | 1, v: string) => { data.set(`${k}:${s}`, v) } } }
test('preserves exact untouched kg, source identities, repeated rows and local row IDs', () => {
  const d = draft(); d.exercises.push({ ...d.exercises[0]!, rowId: newId() })
  const request = normalizeWorkoutDraft(d)
  assert.equal(request.exercises[0]!.sets[0]!.weight, 42.375)
  assert.deepEqual(request.exercises.map(e => e.exerciseSource), ['global', 'user', 'global'])
  assert.equal(new Set(d.exercises.map(e => e.rowId)).size, 3)
})
test('invalid rows are rejected rather than omitted and label/row limits hold', () => {
  const d = draft(); d.exercises[0]!.sets[0]!.reps = '1.5'
  assert.throws(() => normalizeWorkoutDraft(d), /reps/i)
  d.exercises[0]!.sets = []; assert.throws(() => normalizeWorkoutDraft(d), /set/i)
  d.exercises = []; assert.throws(() => normalizeWorkoutDraft(d), /exercise/i)
})
test('journal retains frozen operations after restart, isolates accounts and fences old owners', async () => {
  const s = storage(), j = new WorkoutEditorJournal(s), d = draft()
  await j.open('alice', d.workoutId, 'owner-a'); assert.equal(await j.save('alice', 'owner-a', d, null), true)
  const frozen = { ...d, revision: 1, pending: { action: 'update' as const, workoutId: d.workoutId, operationId: newId(), baseline: d.baseline, content: normalizeWorkoutDraft(d) } }
  assert.equal(await j.save('alice', 'owner-a', frozen, d.revision), true)
  const restored = await new WorkoutEditorJournal(s).open('alice', d.workoutId, 'owner-b')
  assert.deepEqual(restored?.pending, frozen.pending)
  assert.equal(await j.clear('alice', d.workoutId, 'owner-a', frozen), false)
  assert.equal(await j.save('alice', 'owner-a', { ...frozen, revision: 2 }, 1), false)
  assert.deepEqual(await j.list('bob'), [])
  assert.equal((await j.list('alice')).length, 1)
})
test('corrupt latest slot cannot roll back a pending operation and write failure leaves no intent', async () => {
  const s = storage(), j = new WorkoutEditorJournal(s), d = draft()
  await j.open('alice', d.workoutId, 'a'); await j.save('alice', 'a', d, null)
  s.data.set('alice:1', '{broken')
  await assert.rejects(j.open('alice', d.workoutId, 'b'), /damaged/)
  const failed = new WorkoutEditorJournal({ ...storage(), write: async () => { throw new Error('disk full') } })
  await assert.rejects(failed.open('alice', d.workoutId, 'a'), /disk full/)
})

test('valid JSON with corrupted original content is not accepted as a recoverable editor snapshot', () => {
  const d = draft()
  assert.equal(isWorkoutDraft(d, d.workoutId), true)
  assert.equal(isWorkoutDraft({ ...d, original: { label: {}, exercises: d.original.exercises } }, d.workoutId), false)
  assert.equal(isWorkoutDraft({ ...d, original: { ...d.original, exercises: [null] } }, d.workoutId), false)
})
