import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { exerciseClaimId, filterExercises, mutateExercise, parseExerciseRecord, parseExerciseSession, validateExerciseInput, type ExerciseInput, type ExerciseMutation, type ExerciseTransaction } from './exerciseCatalogue'
import { startExerciseMutation, waitForExerciseMutation } from './exerciseMutation'
import { startRead, readStateForKey, type ReadState } from './scopedRead'

const input: ExerciseInput = { name: 'Żółć 💪', category: 'back', equipment: 'cable', muscles: ['back', 'biceps'] }
const hash = async (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')
function transaction(seed: Record<string, Record<string, unknown>> = {}) {
  const documents = new Map(Object.entries(seed))
  const writes: string[] = []
  const tx: ExerciseTransaction = {
    read: async (name, id) => documents.get(`${name}/${id}`) ?? null,
    set: (name, id, value) => { documents.set(`${name}/${id}`, value); writes.push(`set:${name}/${id}`) },
    update: (id, value) => { const key = `userExercises/${id}`; documents.set(key, { ...documents.get(key), ...value }); writes.push(`update:${key}`) },
    remove: (name, id) => { documents.delete(`${name}/${id}`); writes.push(`delete:${name}/${id}`) },
  }
  return { tx, documents, writes }
}
test('UTF-8 SHA256 and trimmed case-sensitive names use the web claim identity', async () => {
  assert.equal(await exerciseClaimId('uid', ' abc ', hash), 'uid_ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  assert.equal(await exerciseClaimId('uid', ` ${input.name} `, hash), `uid_${await hash(input.name)}`)
  assert.notEqual(await exerciseClaimId('uid', 'ABC', hash), await exerciseClaimId('uid', 'abc', hash))
  assert.deepEqual(validateExerciseInput({ ...input, name: '  Name  ' }), { ...input, name: 'Name' })
  for (const name of ['', 'a', 'x'.repeat(121)]) assert.throws(() => validateExerciseInput({ ...input, name }))
  assert.throws(() => validateExerciseInput({ ...input, muscles: ['bad'] } as unknown as ExerciseInput))
})
test('source-qualified catalogue and detail do not collapse source collisions', () => {
  const list = [{ id: 'same', source: 'global', ...input }, { id: 'same', source: 'user', ...input }]
  assert.equal(filterExercises(list, 'ŻÓŁĆ', 'back', 'cable').length, 2)
  assert.deepEqual(filterExercises(list, '', 'chest'), [])
  assert.deepEqual(filterExercises(list, '', 'all', 'barbell'), [])
  const session = { userId: 'a', exerciseId: 'same', exerciseSource: 'user', workoutId: 'w', startedAt: 10, sets: [{ weight: 10, reps: 5 }], totalSets: 1, totalReps: 5, totalVolume: 50, bestSetWeight: 10, bestSetReps: 5 }
  assert.equal(parseExerciseSession('s', 'a', 'same', 'user', session).totalVolume, 50)
  assert.throws(() => parseExerciseSession('s', 'b', 'same', 'user', session))
  assert.throws(() => parseExerciseSession('s', 'a', 'same', 'global', session))
  const record = { ...session, exerciseName: input.name, maxWeight: 10, maxReps: 5, bestVolume: 50, totalSessions: 1, lastPerformedAt: 10 }
  assert.throws(() => parseExerciseRecord('a_user_same', 'a', 'same', 'global', record))
})
test('claim transactions reconcile creates, move owned claims, upgrade and delete legacy exercises', async () => {
  const claim = await exerciseClaimId('a', input.name, hash)
  const { tx, documents, writes } = transaction()
  const create: ExerciseMutation = { kind: 'create', source: 'user', id: 'same', input }
  await mutateExercise(tx, 'a', create, claim, () => {})
  const count = writes.length
  await mutateExercise(tx, 'a', create, claim, () => {})
  assert.equal(writes.length, count)
  await assert.rejects(mutateExercise(tx, 'a', { ...create, id: 'different' }, claim, () => {}), /already exists/)
  const renamed = { ...input, name: 'New name' }
  const next = await exerciseClaimId('a', renamed.name, hash)
  await mutateExercise(tx, 'a', { ...create, kind: 'update', input: renamed }, next, () => {})
  assert.equal(documents.has(`userExerciseNames/${claim}`), false)
  assert.equal(documents.get('userExercises/same')?.name, renamed.name)
  await mutateExercise(tx, 'a', { kind: 'delete', source: 'user', id: 'same' }, null, () => {})
  assert.equal(documents.size, 0)
  const legacy = transaction({ 'userExercises/legacy': { userId: 'a', ...input } })
  await mutateExercise(legacy.tx, 'a', { kind: 'update', source: 'user', id: 'legacy', input }, claim, () => {})
  assert.equal(legacy.documents.get('userExercises/legacy')?.nameClaimId, claim)
  const noClaim = transaction({ 'userExercises/legacy': { userId: 'a', ...input } })
  await mutateExercise(noClaim.tx, 'a', { kind: 'delete', source: 'user', id: 'legacy' }, null, () => {})
  assert.equal(noClaim.documents.size, 0)
})
test('global and stale-account mutations are rejected before any write', async () => {
  const { tx, writes } = transaction()
  await assert.rejects(mutateExercise(tx, 'a', { kind: 'create', source: 'global', id: 'same', input }, null, () => {}))
  let calls = 0
  await assert.rejects(mutateExercise(tx, 'a', { kind: 'create', source: 'user', id: 'same', input }, await exerciseClaimId('a', input.name, hash), () => { if (++calls > 1) throw new Error('Account changed') }))
  assert.deepEqual(writes, [])
})
test('timeout retains the single mutation and late completion; failed writes retain submitted values', async () => {
  let finish!: () => void
  let count = 0
  const operation: ExerciseMutation = { kind: 'create', source: 'user', id: 'same', input }
  const attempt = startExerciseMutation(operation, () => { count++; return new Promise(resolve => { finish = resolve }) })
  assert.equal(await waitForExerciseMutation(attempt, 5), 'pending')
  assert.equal(await waitForExerciseMutation(attempt, 5), 'pending')
  assert.equal(count, 1)
  finish(); assert.equal(await waitForExerciseMutation(attempt), 'saved')
  const failed = startExerciseMutation(operation, async () => { throw new Error('offline') })
  assert.equal(await waitForExerciseMutation(failed), 'failed')
  assert.deepEqual(failed.operation, operation)
})
test('failed reads stay distinct from empty and disposed account/route callbacks cannot publish', async () => {
  const states: ReadState<string[]>[] = []
  const flush = () => new Promise(resolve => setImmediate(resolve))
  startRead<string[]>(async () => { throw new Error('unavailable') }, state => states.push(state))
  await flush(); assert.deepEqual(states, [{ status: 'loading' }, { status: 'error' }])
  let resolve!: (value: { data: string[]; fromCache: boolean }) => void
  const stop = startRead<string[]>(() => new Promise<{ data: string[]; fromCache: boolean }>(done => { resolve = done }), state => states.push(state))
  await flush(); stop(); resolve({ data: ['private'], fromCache: false }); await flush()
  assert.equal(states.at(-1)?.status, 'loading')
  assert.equal(readStateForKey('other:user:same', { key: 'owner:global:same', state: { status: 'ready', data: ['private'], fromCache: false } }).status, 'loading')
})
