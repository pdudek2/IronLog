import assert from 'node:assert/strict'
import test from 'node:test'

import { TwoSlotSessionJournal, type JournalSlotStorage, type SessionDraft } from './sessionJournal'

class MemorySlots implements JournalSlotStorage {
  values = new Map<string, string>()
  failWrite = false
  async read(uid: string, slot: 0 | 1) { return this.values.get(`${uid}:${slot}`) ?? null }
  async write(uid: string, slot: 0 | 1, value: string) {
    if (this.failWrite) throw new Error('disk full')
    this.values.set(`${uid}:${slot}`, value)
  }
}

function draft(reps = '5'): SessionDraft {
  return {
    units: 'kg', baseRevision: 'revision-a', pending: null,
    session: {
      sessionId: 'session-a', sessionRevision: 'revision-a', startedAt: 1, templateId: null,
      exercises: [{ clientId: 'exercise-a', exerciseId: 'squat', exerciseSource: 'global', name: 'Squat',
        sets: [{ clientId: 'set-a', weight: '100', reps, done: false, nested: { keep: true } }] }],
    },
  }
}

test('reconstructs the newest valid draft and falls back from a torn newest slot', async () => {
  const slots = new MemorySlots()
  const journal = new TwoSlotSessionJournal(slots)
  await journal.load('user-a')
  await journal.writeDraft('user-a', draft('5'))
  await journal.writeDraft('user-a', draft('6'))
  assert.equal((await new TwoSlotSessionJournal(slots).load('user-a')).status, 'draft')
  slots.values.set('user-a:0', '{torn')
  const recovered = await new TwoSlotSessionJournal(slots).load('user-a')
  assert.equal(recovered.status, 'draft')
  if (recovered.status === 'draft') assert.equal(recovered.draft.session.exercises[0]?.sets[0]?.reps, '5')
})

test('rejects malformed and wrong-owner records without exposing their contents', async () => {
  const slots = new MemorySlots()
  slots.values.set('user-a:0', '{bad')
  slots.values.set('user-a:1', JSON.stringify({ formatVersion: 1, uid: 'user-b', generation: 2, kind: 'empty' }))
  assert.deepEqual(await new TwoSlotSessionJournal(slots).load('user-a'), { status: 'corrupt' })
})

test('rejects a pending record whose revisions do not form one CAS lineage', async () => {
  const slots = new MemorySlots()
  slots.values.set('user-a:0', JSON.stringify({
    formatVersion: 1, uid: 'user-a', generation: 1, kind: 'draft', ...draft(),
    pending: { expectedRevision: 'other-base', requestRevision: 'request-a', snapshot: draft().session },
  }))
  assert.deepEqual(await new TwoSlotSessionJournal(slots).load('user-a'), { status: 'corrupt' })
})

test('a newer explicit empty record prevents an older draft from returning', async () => {
  const slots = new MemorySlots()
  const journal = new TwoSlotSessionJournal(slots)
  await journal.load('user-a')
  await journal.writeDraft('user-a', draft())
  await journal.clear('user-a')
  assert.deepEqual(await new TwoSlotSessionJournal(slots).load('user-a'), { status: 'empty' })
})

test('failed writes reject and keep the previous complete generation readable', async () => {
  const slots = new MemorySlots()
  const journal = new TwoSlotSessionJournal(slots)
  await journal.load('user-a')
  await journal.writeDraft('user-a', draft('5'))
  slots.failWrite = true
  await assert.rejects(journal.writeDraft('user-a', draft('9')), /disk full/)
  const recovered = await new TwoSlotSessionJournal(slots).load('user-a')
  assert.equal(recovered.status, 'draft')
  if (recovered.status === 'draft') assert.equal(recovered.draft.session.exercises[0]?.sets[0]?.reps, '5')
})
