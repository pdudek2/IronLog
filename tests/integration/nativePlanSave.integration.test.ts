import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { getReviewAdminDatabase, closeReviewAdminDatabase } from '../review/support/adminReviewDatabase'
import { parseSaveTemplateRequest, saveTemplateForUser } from '../../api/_lib/templateService'
import { templateFingerprint } from '../../src/shared/templateFingerprint'

const db = getReviewAdminDatabase()
const uid = `native-plan-${randomUUID()}`
const createdIds: string[] = []
const operationIds: string[] = []
const body = (name: string) => ({ name, days: [
  { name: 'Upper', exercises: [{ exerciseId: 'same', exerciseSource: 'global', name: 'Bench', sets: 4, targetReps: 8, targetWeight: 75 }] },
  { name: 'Lower', exercises: [{ exerciseId: 'same', exerciseSource: 'user', name: 'Custom', sets: 3, targetReps: 5, targetWeight: 0 }] },
  { name: 'Rest', exercises: [] },
] })
const operationId = () => { const id = randomUUID(); operationIds.push(id); return id }

afterAll(async () => {
  await Promise.all(createdIds.map((id) => db.collection('templates').doc(id).delete()))
  await Promise.all(operationIds.map((id) => db.collection('templateSaveOperations').doc(`${uid}_${id}`).delete()))
  await closeReviewAdminDatabase()
})

describe('native plan save receipt', () => {
  it('replays a lost create acknowledgement after deletion without recreating the plan', async () => {
    const op = operationId()
    const request = parseSaveTemplateRequest({ ...body('First plan'), operationId: op })
    const first = await saveTemplateForUser(uid, request, { db, now: () => 100 })
    createdIds.push(first.id)
    await db.collection('templates').doc(first.id).delete()
    const replay = await saveTemplateForUser(uid, request, { db, now: () => 200 })
    expect(replay).toEqual(first)
    expect((await db.collection('templates').doc(first.id).get()).exists).toBe(false)
    await expect(saveTemplateForUser(uid, parseSaveTemplateRequest({ ...body('Altered plan'), operationId: op }), { db }))
      .rejects.toMatchObject({ status: 409 })
  })

  it('updates once, rejects stale edits, missing targets and foreign owners', async () => {
    const createOp = operationId()
    const created = await saveTemplateForUser(uid, parseSaveTemplateRequest({ ...body('Version one'), operationId: createOp }), { db, now: () => 300 })
    createdIds.push(created.id)
    const baseline = templateFingerprint(created)
    const editOp = operationId()
    const edit = parseSaveTemplateRequest({ id: created.id, ...body('Version two'), operationId: editOp, baseline })
    const saved = await saveTemplateForUser(uid, edit, { db, now: () => 400 })
    expect(saved.name).toBe('Version two')
    expect((await saveTemplateForUser(uid, edit, { db, now: () => 500 })).updatedAt).toBe(400)
    expect((await db.collection('templates').doc(created.id).get()).data()?.updatedAt).toBe(400)
    await expect(saveTemplateForUser(uid, parseSaveTemplateRequest({ id: created.id, ...body('Stale'), operationId: operationId(), baseline }), { db }))
      .rejects.toMatchObject({ status: 409 })
    await expect(saveTemplateForUser('other-user', parseSaveTemplateRequest({ id: created.id, ...body('Stolen'), operationId: randomUUID(), baseline }), { db }))
      .rejects.toMatchObject({ status: 403 })
    await db.collection('templates').doc(created.id).delete()
    await expect(saveTemplateForUser(uid, parseSaveTemplateRequest({ id: created.id, ...body('Missing'), operationId: operationId(), baseline: templateFingerprint(saved) }), { db }))
      .rejects.toMatchObject({ status: 404 })
  })
})
