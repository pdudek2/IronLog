import assert from 'node:assert/strict'
import { test } from 'node:test'
import { newPlanDraft, normalizePlanDraft } from './planEditor'
import { PlanEditorJournal, type PlanDraftSlots } from './planEditorJournal'
import { finishAcknowledgedPlanSave, releaseRejectedPlanSave, requestPlanEditorExit } from './planEditorFlow'
import type { WorkoutTemplate } from './workoutLaunch'

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
  await journal.open('alice', null, 'editor-a')
  assert.equal(await journal.saveIfOwned('alice', draft, 'editor-a', null), true)
  assert.deepEqual(await new PlanEditorJournal(storage).load('alice', null), draft)
  assert.equal(await journal.load('bob', null), null)
  const newer = { ...draft, revision: 2, name: 'Newer plan' }
  assert.equal(await journal.saveIfOwned('alice', newer, 'editor-a', { draftId: draft.draftId, revision: 1 }), true)
  assert.equal(await journal.clearIfOwned('alice', null, 'editor-a', draft.draftId, 1), false)
  assert.equal((await journal.load('alice', null))?.name, 'Newer plan')
  assert.equal(await journal.clearIfOwned('alice', null, 'editor-a', draft.draftId, 2), true)
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
  await journal.open('alice', null, 'editor-b')
  assert.equal(await journal.saveIfOwned('alice', draft, 'editor-b', null), true)
  fail = true
  await assert.rejects(journal.clearIfOwned('alice', null, 'editor-b', draft.draftId, 0), /disk/)
  assert.equal((await journal.load('alice', null))?.pending?.operationId, 'operation-b')
})

test('an owned retry can save a newer revision after a storage write fails', async () => {
  const slots = new Map<string, string>()
  let fail = false
  const journal = new PlanEditorJournal({
    read: async (key, slot) => slots.get(`${key}:${slot}`) ?? null,
    write: async (key, slot, value) => { if (fail) throw new Error('disk'); slots.set(`${key}:${slot}`, value) },
  })
  await journal.open('alice', null, 'editor')
  const initial = newPlanDraft('draft', 'kg', null, () => 'row')
  assert.equal(await journal.saveIfOwned('alice', initial, 'editor', null), true)
  fail = true
  await assert.rejects(journal.saveIfOwned('alice', { ...initial, revision: 1, name: 'First edit' }, 'editor',
    { draftId: initial.draftId, revision: 0 }), /disk/)
  fail = false
  const retry = { ...initial, revision: 2, name: 'Latest edit' }
  assert.equal(await journal.saveIfOwned('alice', retry, 'editor', { draftId: initial.draftId, revision: 1 }), true)
  assert.deepEqual(await journal.load('alice', null), retry)
})

test('a delayed acknowledgement cannot overwrite a replacement or a reopened revision', async () => {
  for (const replacementId of [true, false]) {
    const slots = new Map<string, string>()
    const journal = new PlanEditorJournal({
      read: async (key, slot) => slots.get(`${key}:${slot}`) ?? null,
      write: async (key, slot, value) => { slots.set(`${key}:${slot}`, value) },
    })
    const initial = newPlanDraft('old-draft', 'kg', null, () => 'row')
    initial.pending = { operationId: 'operation-old', name: 'Original', days: [{ name: 'Day 1', exercises: [exercise('global')] }] }
    await journal.open('alice', null, 'old-editor')
    assert.equal(await journal.saveIfOwned('alice', initial, 'old-editor', null), true)
    let old = initial
    let resolveRead!: (plan: WorkoutTemplate | null) => void
    const read = new Promise<WorkoutTemplate | null>((resolve) => { resolveRead = resolve })
    let enteredRead!: () => void
    const readStarted = new Promise<void>((resolve) => { enteredRead = resolve })
    const persistOld = async (next: typeof initial) => {
      const previous = old
      old = { ...next, revision: previous.revision + 1 }
      if (!await journal.saveIfOwned('alice', old, 'old-editor', { draftId: previous.draftId, revision: previous.revision })) throw new Error('owner changed')
    }
    const acknowledged: WorkoutTemplate = { id: 'created-id', userId: 'alice', name: 'Original', days: initial.pending.days, updatedAt: 1 }
    const finishing = finishAcknowledgedPlanSave({ draft: () => old, acknowledged, read: () => { enteredRead(); return read },
      persist: persistOld, clear: (draft) => journal.clearIfOwned('alice', null, 'old-editor', draft.draftId, draft.revision),
      shouldNavigate: () => false, navigate: () => {} })
    await readStarted
    const reopened = await journal.open('alice', null, 'new-editor')
    assert.equal(reopened?.pending?.operationId, 'operation-old')
    const newer = { ...reopened!, draftId: replacementId ? 'new-draft' : reopened!.draftId,
      revision: reopened!.revision + 1, name: 'Newer work' }
    assert.equal(await journal.saveIfOwned('alice', newer, 'new-editor', { draftId: reopened!.draftId, revision: reopened!.revision }), true)
    resolveRead(null)
    await assert.rejects(finishing, /owner changed/)
    assert.deepEqual(await journal.load('alice', null), newer)
    assert.equal((await journal.load('alice', null))?.pending?.operationId, 'operation-old')
  }
})

test('a previous owner cannot persist a late receipt, rejection, or first draft', async () => {
  const slots = new Map<string, string>()
  const journal = new PlanEditorJournal({
    read: async (key, slot) => slots.get(`${key}:${slot}`) ?? null,
    write: async (key, slot, value) => { slots.set(`${key}:${slot}`, value) },
  })
  assert.equal(await journal.open('alice', null, 'old-editor'), null)
  const initial = newPlanDraft('old-draft', 'kg', null, () => 'row')
  initial.pending = { operationId: 'operation-old', name: 'Original', days: [{ name: 'Day 1', exercises: [exercise('global')] }] }
  await journal.open('alice', null, 'new-editor')
  const current = { ...initial, draftId: 'new-draft', name: 'Newer work' }
  assert.equal(await journal.saveIfOwned('alice', current, 'new-editor', null), true)
  assert.equal(await journal.saveIfOwned('alice', initial, 'old-editor', null), false)
  const persistOld = async (next: typeof initial) => {
    if (!await journal.saveIfOwned('alice', { ...next, revision: next.revision + 1 }, 'old-editor',
      { draftId: initial.draftId, revision: initial.revision })) throw new Error('owner changed')
  }
  const acknowledged: WorkoutTemplate = { id: 'created-id', userId: 'alice', name: 'Original', days: initial.pending.days, updatedAt: 1 }
  await assert.rejects(finishAcknowledgedPlanSave({ draft: () => initial, acknowledged, read: async () => acknowledged,
    persist: persistOld, clear: async () => true, shouldNavigate: () => false, navigate: () => {} }), /owner changed/)
  await assert.rejects(releaseRejectedPlanSave(400, initial, persistOld), /owner changed/)
  assert.deepEqual(await journal.load('alice', null), current)
})

test('exit waits for a durable write and warns before leaving when storage fails', async () => {
  const draft = newPlanDraft('draft-exit', 'kg', null, () => 'row-exit')
  draft.dirty = true
  let rejectWrite!: (error: Error) => void
  const writing = new Promise<void>((_, reject) => { rejectWrite = reject })
  let prompt: { title: string; copy: string; proceed: () => void } | null = null
  let exits = 0
  const exiting = requestPlanEditorExit({ flush: () => writing, draft: () => draft, storageFailed: () => false,
    isCurrent: () => true, confirm: (title, copy, proceed) => { prompt = { title, copy, proceed } }, proceed: () => { exits++ } })
  assert.equal(prompt, null)
  rejectWrite(new Error('disk full'))
  await exiting
  assert.equal(prompt!.title, 'Draft not stored')
  assert.match(prompt!.copy, /may lose/)
  assert.equal(exits, 0)
  prompt!.proceed()
  assert.equal(exits, 1)
})

test('lost create acknowledgement followed by a changed or deleted plan cannot create again', async () => {
  for (const serverState of ['changed', 'deleted'] as const) {
    let draft = newPlanDraft(`draft-${serverState}`, 'kg', null, () => 'row')
    draft.name = 'Original'; draft.dirty = true
    draft.days[0]!.exercises = [{ ...exercise('global'), rowId: 'exercise', sets: '4', targetReps: '8', weight: '0' }]
    draft.pending = normalizePlanDraft(draft, `operation-${serverState}`)
    const acknowledged: WorkoutTemplate = { id: `created-${serverState}`, userId: 'alice', name: 'Original', days: draft.pending.days, updatedAt: 1 }
    let cleared = 0
    const outcome = await finishAcknowledgedPlanSave({ draft: () => draft, acknowledged,
      read: async () => serverState === 'changed' ? { ...acknowledged, name: 'External edit' } : null,
      persist: async (next) => { draft = { ...next, revision: next.revision + 1 } },
      clear: async () => { cleared++; return true }, shouldNavigate: () => true, navigate: () => { throw new Error('should not navigate') } })
    assert.equal(outcome, serverState)
    assert.equal(draft.resolvedId, acknowledged.id)
    assert.equal(draft.pending, null)
    assert.equal(cleared, 0)
    assert.throws(() => normalizePlanDraft(draft, `new-operation-${serverState}`), /already created/)
  }
})

test('acknowledged save clears the journal but cannot navigate a blurred editor', async () => {
  let draft = newPlanDraft('draft-blurred', 'kg', null, () => 'row')
  draft.pending = { operationId: 'operation-blurred', name: 'Plan', days: [{ name: 'Day 1', exercises: [exercise('global')] }] }
  const acknowledged: WorkoutTemplate = { id: 'created-blurred', userId: 'alice', name: 'Plan', days: draft.pending.days, updatedAt: 1 }
  let navigations = 0
  const result = await finishAcknowledgedPlanSave({ draft: () => draft, acknowledged, read: async () => acknowledged,
    persist: async (next) => { draft = { ...next, revision: next.revision + 1 } }, clear: async () => true,
    shouldNavigate: () => false, navigate: () => { navigations++ } })
  assert.equal(result, 'saved')
  assert.equal(navigations, 0)
})

test('definitive 400 unlocks correction while an unknown 5xx keeps the same operation', async () => {
  let draft = newPlanDraft('draft-reject', 'kg', null, () => 'row')
  draft.name = 'Plan'; draft.dirty = true
  draft.days[0]!.exercises = [{ ...exercise('global'), rowId: 'exercise', sets: '4', targetReps: '8', weight: '0' }]
  draft.pending = normalizePlanDraft(draft, 'operation-invalid')
  const persist = async (next: typeof draft) => { draft = next }
  for (const status of [401, 405, 408, 413, 429, 500]) {
    assert.equal(await releaseRejectedPlanSave(status, draft, persist), 'unknown')
    assert.equal(draft.pending?.operationId, 'operation-invalid')
  }
  assert.equal(draft.pending?.operationId, 'operation-invalid')
  assert.equal(await releaseRejectedPlanSave(400, draft, persist), 'correctable')
  assert.equal(draft.pending, null)
  draft.days[0]!.exercises[0]!.weight = '20'
  assert.equal(normalizePlanDraft(draft, 'operation-corrected').days[0]!.exercises[0]!.targetWeight, 20)
})


test('accepts decimal comma weights in kg and lbs without relaxing integer or separator validation', () => {
  for (const units of ['kg', 'lbs'] as const) {
    const draft = newPlanDraft('comma', units, null, () => 'row')
    draft.name = 'Comma plan'
    const row = { ...exercise('global'), rowId: 'exercise', sets: '4', targetReps: '8', weight: '12.5' }
    draft.days[0]!.exercises = [row]
    const expected = normalizePlanDraft(draft, 'save').days[0]!.exercises[0]!.targetWeight
    row.weight = '12,5'
    assert.equal(normalizePlanDraft(draft, 'save').days[0]!.exercises[0]!.targetWeight, expected)
    for (const invalid of ['12,5.0', '12.5,0', '1,2,3']) {
      row.weight = invalid
      assert.throws(() => normalizePlanDraft(draft, 'save'), /weight/)
    }
    row.weight = '12,5'; row.sets = '4,0'
    assert.throws(() => normalizePlanDraft(draft, 'save'), /sets/)
  }
})
