import assert from 'node:assert/strict'
import { test } from 'node:test'
import { newPlanDraft, normalizePlanDraft } from './planEditor'
import { PlanEditorJournal, type PlanDraftSlots } from './planEditorJournal'

const exercise = (source: 'global' | 'user') => ({ exerciseId: 'same', exerciseSource: source, name: source, sets: 4, targetReps: 8, targetWeight: 0 })

test('normalizes source identity and refuses malformed numeric input', () => {
  const draft = newPlanDraft('draft-1', 'lbs', null, () => 'row-1')
  draft.name = ' Day split '
  draft.days[0]!.exercises = [
    { ...exercise('global'), rowId: 'global', sets: '4', targetReps: '8', weight: '220.5' },
    { ...exercise('user'), rowId: 'user', sets: '3', targetReps: '0', weight: '0' },
  ]
  const request = normalizePlanDraft(draft, 'operation-1')
  assert.equal(request.days[0]!.exercises.length, 2)
  assert.equal(request.days[0]!.exercises[0]!.targetWeight, 100.0171)
  assert.equal(request.name, 'Day split')
  draft.days[0]!.exercises[0]!.weight = '220lbs'
  assert.throws(() => normalizePlanDraft(draft, 'operation-1'), /weight/)
  draft.days[0]!.exercises[0]!.weight = '0'
  draft.days[0]!.exercises[0]!.sets = '2.5'
  assert.throws(() => normalizePlanDraft(draft, 'operation-1'), /sets/)
  draft.days[0]!.exercises[0]!.sets = '4'
  draft.days[0]!.exercises.push({ ...draft.days[0]!.exercises[0]!, rowId: 'duplicate' })
  assert.throws(() => normalizePlanDraft(draft, 'operation-1'), /already/)
})

test('restores owner-scoped pending save and cannot clear a newer revision', async () => {
  const slots = new Map<string, string>()
  const storage: PlanDraftSlots = {
    read: async (key, slot) => slots.get(`${key}:${slot}`) ?? null,
    write: async (key, slot, value) => { slots.set(`${key}:${slot}`, value) },
  }
  const journal = new PlanEditorJournal(storage)
  const draft = newPlanDraft('draft-a', 'kg', null, () => 'row-a')
  draft.name = 'Stable plan'; draft.revision = 1
  draft.pending = { operationId: 'operation-a', name: 'Stable plan', days: [{ name: 'Day 1', exercises: [exercise('global')] }] }
  await journal.save('alice', draft)
  assert.deepEqual(await new PlanEditorJournal(storage).load('alice', null), draft)
  assert.equal(await journal.load('bob', null), null)
  const newer = { ...draft, revision: 2, name: 'Newer plan' }
  await journal.save('alice', newer)
  assert.equal(await journal.clearIfMatches('alice', null, draft.draftId, 1), false)
  assert.equal((await journal.load('alice', null))?.name, 'Newer plan')
  assert.equal(await journal.clearIfMatches('alice', null, draft.draftId, 2), true)
  assert.equal(await journal.load('alice', null), null)
})

test('failed clear preserves the unresolved operation', async () => {
  const slots = new Map<string, string>()
  let fail = false
  const journal = new PlanEditorJournal({
    read: async (key, slot) => slots.get(`${key}:${slot}`) ?? null,
    write: async (key, slot, value) => { if (fail) throw new Error('disk'); slots.set(`${key}:${slot}`, value) },
  })
  const draft = newPlanDraft('draft-b', 'kg', null, () => 'row-b')
  draft.pending = { operationId: 'operation-b', name: 'Plan', days: [] }
  await journal.save('alice', draft)
  fail = true
  await assert.rejects(journal.clearIfMatches('alice', null, draft.draftId, 0), /disk/)
  assert.equal((await journal.load('alice', null))?.pending?.operationId, 'operation-b')
})
