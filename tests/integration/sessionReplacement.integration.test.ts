import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { replaceSessionForUser, parseReplacement } from '../../api/_lib/sessionReplacement'
import { buildTemplateSession, parseTemplate, selectionFingerprint } from '../../mobile/src/workoutLaunch'
import { getReviewAdminDatabase, closeReviewAdminDatabase } from '../review/support/adminReviewDatabase'

const db = getReviewAdminDatabase()
let uid: string, oldId: string, nextId: string, planId: string
let request: ReturnType<typeof parseReplacement>
const active = () => db.collection('activeSessions').doc(uid)
const tombstone = (id: string) => db.collection('closedSessions').doc(id)
beforeEach(async () => {
  const suffix = randomUUID(); uid = `replacement-${suffix}`; oldId = `old-${suffix}`; nextId = `next-${suffix}`; planId = `plan-${suffix}`
  const raw = { userId: uid, name: 'Replacement plan', days: [{ name: 'Pull', exercises: [
    { exerciseId: 'row', exerciseSource: 'global', name: 'Row', sets: 2, targetReps: 8, targetWeight: 40 },
    { exerciseId: 'row', exerciseSource: 'user', name: 'Custom row', sets: 1, targetReps: 10, targetWeight: 20 },
  ] }] }
  const plan = parseTemplate(planId, uid, raw)
  request = parseReplacement({ replaces: { sessionId: oldId, sessionRevision: 'original-revision' },
    candidate: buildTemplateSession(plan, 0, new Map(), nextId, 'new-revision', 100),
    selection: { templateId: planId, dayIndex: 0, fingerprint: selectionFingerprint(plan, 0) } })
  await db.collection('templates').doc(planId).set(raw)
  await active().set({ ...request.candidate, sessionId: oldId, sessionRevision: 'original-revision', userId: uid })
})
afterEach(async () => {
  const refs = [active(), db.collection('templates').doc(planId), tombstone(oldId), tombstone(nextId), db.collection('workouts').doc(oldId), db.collection('workouts').doc(nextId)]
  await Promise.all(refs.map(ref => ref.delete()))
})
afterAll(closeReviewAdminDatabase)
const replace = () => replaceSessionForUser(uid, request, { db, now: () => 200 })
describe('atomic active-session replacement', () => {
  it('closes the exact old revision and creates the source-aware candidate atomically', async () => {
    await expect(replace()).resolves.toEqual({ status: 'replaced', sessionId: nextId })
    expect((await active().get()).data()).toEqual({ ...request.candidate, planDayId: 'd0', userId: uid, updatedAt: 200 })
    expect((await tombstone(oldId).get()).data()).toMatchObject({ userId: uid, outcome: 'discarded', replacementId: nextId })
    expect((await db.collection('workouts').doc(oldId).get()).exists).toBe(false)
  })
  it('retries a lost response without overwriting later edits', async () => {
    await replace(); await active().update({ label: 'Edited later', sessionRevision: 'later' })
    await replace()
    expect((await active().get()).data()).toMatchObject({ label: 'Edited later', sessionRevision: 'later' })
  })
  it('never resurrects a candidate closed after the first commit', async () => {
    await replace(); await active().delete(); await tombstone(nextId).set({ userId: uid, outcome: 'discarded' })
    await replace(); expect((await active().get()).exists).toBe(false)
  })
  it.each(['revision', 'competing session', 'plan', 'closed candidate', 'foreign owner'])('preserves current data on %s conflict', async kind => {
    if (kind === 'revision') await active().update({ sessionRevision: 'changed' })
    if (kind === 'competing session') await active().update({ sessionId: 'winner' })
    if (kind === 'plan') await db.collection('templates').doc(planId).update({ name: 'Changed plan' })
    if (kind === 'closed candidate') await tombstone(nextId).set({ userId: uid, outcome: 'discarded' })
    if (kind === 'foreign owner') await active().update({ userId: 'another-user' })
    const before = (await active().get()).data()
    await expect(replace()).rejects.toMatchObject({ status: 409 })
    expect((await active().get()).data()).toEqual(before)
    expect((await tombstone(oldId).get()).exists).toBe(false)
  })
  it('rejects reuse of a receipt with a changed payload', async () => {
    await replace(); request.candidate.label = 'Changed request'
    await expect(replace()).rejects.toMatchObject({ status: 409 })
    expect((await active().get()).data()?.label).toBe('Pull')
  })
  it('serializes concurrent replacement requests to one winner', async () => {
    const other = structuredClone(request); other.candidate.sessionId = `other-${nextId}`
    const results = await Promise.allSettled([replace(), replaceSessionForUser(uid, other, { db })])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect([nextId, other.candidate.sessionId]).toContain((await active().get()).data()?.sessionId)
  })
  it('accepts a compressed candidate and keeps its record, proposals and groups', async () => {
    const compression = { v: 1, budgetMin: 20, mode: 'compressed', shortRest: true, estimateMin: 12, fullEstimateMin: 15, factor: 1.2, samples: 0, calibration: 'none', readiness: null,
      exercises: [{ dayExerciseIndex: 0, exerciseId: 'row', exerciseSource: 'global', plannedSets: 2, sets: 0 }, { dayExerciseIndex: 1, exerciseId: 'row', exerciseSource: 'user', plannedSets: 1, sets: 1 }] }
    const [globalRow, userRow] = request.candidate.exercises
    request = parseReplacement({ replaces: request.replaces, selection: request.selection,
      candidate: { ...request.candidate, compression, proposals: [{ budgetMin: 20, mode: 'compressed' }], exercises: [{ ...userRow, group: 'g1' }] } })
    await expect(replace()).resolves.toEqual({ status: 'replaced', sessionId: nextId })
    expect((await active().get()).data()).toMatchObject({ compression, proposals: [{ budgetMin: 20, mode: 'compressed' }], exercises: [{ exerciseSource: 'user', group: 'g1' }] })
    const twice = parseReplacement({ replaces: request.replaces, selection: request.selection,
      candidate: { ...request.candidate, sessionId: `twice-${nextId}`, exercises: [globalRow, { ...globalRow, clientId: 'another', sets: globalRow!.sets.map((set) => ({ ...set, clientId: `${set.clientId}-2` })) }] } })
    expect(() => parseReplacement({ ...request, candidate: { ...request.candidate, compression: { v: 2 } } })).toThrow()
    await active().set({ ...request.candidate, sessionId: oldId, sessionRevision: 'original-revision', userId: uid })
    await tombstone(oldId).delete()
    await expect(replaceSessionForUser(uid, twice, { db })).rejects.toMatchObject({ status: 409 })
  })
  it('rejects malformed candidates before writes', async () => {
    request.candidate.exercises[0].sets[0].weight = '-5'
    await expect(replace()).rejects.toMatchObject({ status: 400 })
    expect((await active().get()).data()?.sessionId).toBe(oldId)
  })
})
