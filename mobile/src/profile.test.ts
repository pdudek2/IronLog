import assert from 'node:assert/strict'
import test from 'node:test'
import { parseProfile, ProfileController, ProfileDataError, updateExistingProfile, validateProfile, type NativeProfile, type ProfileState } from './profile'
const profile: NativeProfile = { displayName: 'Alex', primaryGoal: 'strength', weeklyGoal: 3, units: 'kg', createdAt: 123 }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function setup() {
  let server: NativeProfile | null = { ...profile }
  let error: unknown = null
  let writes = 0
  let cache = false
  const gate = deferred<void>()
  const states: ProfileState[] = []
  const units: string[] = []
  const controller = new ProfileController('owner', {
    read: async () => { if (error) throw error; return { data: server, fromCache: cache } },
    write: async (_, fields) => { writes++; await gate.promise; server = { ...profile, ...fields } },
    applyUnits: async (uid, unit) => { assert.equal(uid, 'owner'); units.push(unit) },
  }, state => states.push(state), 5)
  return { controller, gate, states, units, writes: () => writes, server: (value: NativeProfile | null) => { server = value }, fail: (value: unknown) => { error = value }, cache: () => { cache = true } }
}

test('validates names, all preferences, integer bounds and preserves existing 8–14 goal', () => {
  assert.equal(validateProfile({ ...profile, displayName: '  Alex  ', weeklyGoal: 14 }).displayName, 'Alex')
  for (const weeklyGoal of [0, 15, 2.5, NaN]) assert.throws(() => validateProfile({ ...profile, weeklyGoal }), ProfileDataError)
  for (const displayName of ['', '  ', 'x'.repeat(81)]) assert.throws(() => validateProfile({ ...profile, displayName }), ProfileDataError)
  assert.equal(validateProfile({ ...profile, displayName: 'x'.repeat(80) }).displayName.length, 80)
  assert.throws(() => parseProfile('owner', { ...profile, userId: 'other' }))
  assert.throws(() => parseProfile('owner', { ...profile, primaryGoal: 'unsupported' }))
  assert.throws(() => parseProfile('owner', { ...profile, units: 'stones' }))
  assert.throws(() => parseProfile('owner', { ...profile, createdAt: Infinity }))
})

test('patch update retains createdAt/unrelated fields and never creates a missing profile', async () => {
  let stored = { ...profile, weeklyGoal: 12, serverField: 'kept' }
  await updateExistingProfile({ read: async () => ({ exists: true, data: stored }), update: fields => { stored = { ...stored, ...fields }; assert.equal('createdAt' in fields, false) } }, 'owner', { ...stored, displayName: 'Renamed' })
  assert.equal(stored.createdAt, 123); assert.equal(stored.serverField, 'kept'); assert.equal(stored.weeklyGoal, 12)
  await assert.rejects(updateExistingProfile({ read: async () => ({ exists: false, data: null }), update: () => assert.fail() }, 'owner', profile))
})

test('dirty refresh retains input; missing, cache and read failure cannot write', async () => {
  const h = setup(); await h.controller.load(); h.controller.change({ displayName: 'Typed' }); h.server({ ...profile, displayName: 'Remote' }); await h.controller.load(true)
  assert.equal(h.controller.state.input?.displayName, 'Typed')
  for (const status of ['cached', 'missing', 'error'] as const) {
    const h = setup(); if (status === 'cached') h.cache(); if (status === 'missing') h.server(null); if (status === 'error') h.fail(new Error())
    await h.controller.load(); assert.equal(h.controller.state.status, status); await h.controller.save(); assert.equal(h.writes(), 0)
  }
})

test('stale/disposed load cannot publish, and a newer request wins', async () => {
  const old = deferred<{ data: NativeProfile; fromCache: boolean }>(); let reads = 0; const states: ProfileState[] = []
  const h = new ProfileController('owner', { read: async () => ++reads === 1 ? old.promise : { data: { ...profile, displayName: 'New' }, fromCache: false }, write: async () => assert.fail(), applyUnits: async () => {} }, state => states.push(state), 100)
  const first = h.load(); await h.load(true); old.resolve({ data: profile, fromCache: false }); await first; assert.equal(h.state.input?.displayName, 'New')
  h.dispose(); const count = states.length; await h.load(); assert.equal(states.length, count)
})

test('unknown save retains submitted values, blocks duplicate/edit/exit identity until settled', async () => {
  const h = setup(); await h.controller.load(); h.controller.change({ displayName: 'Saved', units: 'lbs' })
  const saving = h.controller.save(); await h.controller.save(); await saving
  assert.equal(h.writes(), 1); assert.equal(h.controller.state.pending, true); assert.equal(h.controller.state.busy, false)
  h.controller.change({ displayName: 'Overwrite' }); assert.equal(h.controller.state.input?.displayName, 'Saved')
  await h.controller.save(); assert.equal(h.writes(), 1); h.controller.discard(); assert.equal(h.controller.state.pending, true)
  h.gate.resolve(); await new Promise(resolve => setTimeout(resolve, 0)); await h.controller.reconcile()
  assert.equal(h.controller.state.message, 'Profile saved'); assert.equal(h.controller.state.pending, false); assert.equal(h.controller.dirty, false); assert.deepEqual(h.units, ['lbs'])
})

test('failed save retains fields, definite rejection unlocks; unknown rejection reconciles before retry', async () => {
  for (const code of ['firestore/permission-denied', 'firestore/unavailable']) {
    const h = setup(); await h.controller.load(); h.controller.change({ displayName: 'Keep me' }); h.gate.reject({ code }); await h.controller.save()
    assert.equal(h.controller.state.input?.displayName, 'Keep me'); assert.equal(h.controller.state.pending, false); assert.equal(h.controller.dirty, true); assert.equal(h.units.length, 0)
    h.controller.change({ displayName: 'Corrected' }); assert.equal(h.controller.state.input?.displayName, 'Corrected')
  }
})

test('an in-flight operation cannot unlock even if an early server read matches', async () => {
  const h = setup(); await h.controller.load(); h.controller.change({ displayName: 'Same' }); h.server({ ...profile, displayName: 'Same' })
  await h.controller.save(); assert.equal(h.controller.state.pending, true); assert.equal(h.units.length, 0)
  const count = h.states.length; h.controller.dispose(); h.gate.resolve(); await h.controller.reconcile(); assert.equal(h.states.length, count)
})

test('a failed local units refresh holds confirmed fields until retry and does not submit twice', async () => {
  let calls = 0, writes = 0
  const h = new ProfileController('owner', { read: async () => ({ data: { ...profile, units: 'lbs' }, fromCache: false }), write: async () => { writes++ }, applyUnits: async () => { if (++calls === 1) throw new Error('storage full') } }, () => {})
  await h.load(); await h.save(); assert.equal(h.state.pending, true); assert.equal(h.state.message, 'storage full')
  await h.save(); assert.equal(writes, 1); assert.equal(h.state.pending, false); assert.equal(h.state.message, 'Profile saved')
})
