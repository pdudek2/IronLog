import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { getReviewAdminDatabase, closeReviewAdminDatabase } from '../review/support/adminReviewDatabase'
vi.mock('../../api/_lib/firebaseAdmin.js', async () => ({ adminDb: (await import('../review/support/adminReviewDatabase')).getReviewAdminDatabase() }))
import { readWorkoutMutationState, updateFinishedWorkoutForUser, deleteFinishedWorkoutForUser } from '../../api/_lib/workoutProjection'
const db = getReviewAdminDatabase()
const uid = `mutation-${randomUUID()}`
const ids: string[] = []
const exercises = [{ exerciseId: 'bench-press', exerciseSource: 'global', name: 'Bench Press', sets: [{ weight: 42.375, reps: 8 }] }]
async function seed() {
  const id = randomUUID(); ids.push(id)
  await db.collection('workouts').doc(id).set({ userId: uid, startedAt: 100, finishedAt: 200, label: 'Original', materialized: false, exercises })
  const state = await readWorkoutMutationState(uid, id, undefined, { db })
  if (state.status !== 'available') throw new Error('Missing snapshot')
  return { id, baseline: state.baseline }
}
const failProjection = async () => { throw new Error('injected unavailable projection') }
afterAll(async () => {
  for (const collection of ['workouts', 'closedSessions', 'workoutMutationOperations', 'exerciseSessions', 'records']) {
    const docs = await db.collection(collection).where('userId', '==', uid).get()
    for (const doc of docs.docs) await doc.ref.delete()
  }
  await closeReviewAdminDatabase()
})
describe('guarded workout mutations on real Firestore transactions', () => {
  it('deduplicates lost acknowledgements, resumes projection and fences stale edit/delete', async () => {
    const { id, baseline } = await seed()
    const input = { label: 'Corrected', exercises, baseline, operationId: randomUUID() }
    expect(await updateFinishedWorkoutForUser(uid, id, input, { db, materialize: failProjection })).toEqual({ status: 'projection_pending' })
    expect(await updateFinishedWorkoutForUser(uid, id, input, { db, materialize: failProjection })).toEqual({ status: 'projection_pending' })
    expect((await db.collection('closedSessions').doc(id).get()).data()?.projectionRevision).toBe(2)
    await expect(updateFinishedWorkoutForUser(uid, id, { ...input, operationId: randomUUID() }, { db })).rejects.toMatchObject({ status: 409, code: 'workout_conflict' })
    await expect(deleteFinishedWorkoutForUser(uid, id, { db, guard: { baseline, operationId: randomUUID() } })).rejects.toMatchObject({ status: 409, code: 'workout_conflict' })
    await expect(updateFinishedWorkoutForUser(uid, id, { ...input, label: 'Different payload' }, { db })).rejects.toMatchObject({ status: 409, code: 'operation_mismatch' })
    expect(await updateFinishedWorkoutForUser(uid, id, input, { db })).toEqual({ status: 'materialized' })
    const result = await readWorkoutMutationState(uid, id, input.operationId, { db })
    expect(result.operation?.status).toBe('complete')
    expect(result.workout?.exercises[0]?.sets[0]?.weight).toBe(42.375)
  })
  it('only allows one of concurrent edits and never replays a superseded receipt', async () => {
    const { id, baseline } = await seed()
    const a = { label: 'A', exercises, baseline, operationId: randomUUID() }
    const b = { label: 'B', exercises, baseline, operationId: randomUUID() }
    const results = await Promise.allSettled([a, b].map((input) => updateFinishedWorkoutForUser(uid, id, input, { db, materialize: failProjection })))
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const winner = results[0].status === 'fulfilled' ? a : b
    const current = await readWorkoutMutationState(uid, id, undefined, { db })
    await updateFinishedWorkoutForUser(uid, id, { ...a, label: 'Latest', baseline: current.baseline, operationId: randomUUID() }, { db, materialize: failProjection })
    await expect(updateFinishedWorkoutForUser(uid, id, winner, { db })).rejects.toMatchObject({ status: 409, code: 'operation_superseded' })
    expect((await readWorkoutMutationState(uid, id, winner.operationId, { db })).operation?.status).toBe('superseded')
    expect((await db.collection('workouts').doc(id).get()).data()?.label).toBe('Latest')
  })
  it('recovers cleanup after deletion and does not resurrect on old update retry', async () => {
    const { id, baseline } = await seed()
    const edit = { label: 'Edited', exercises, baseline, operationId: randomUUID() }
    await updateFinishedWorkoutForUser(uid, id, edit, { db })
    const current = await readWorkoutMutationState(uid, id, undefined, { db })
    const guard = { baseline: current.baseline!, operationId: randomUUID() }
    expect(await deleteFinishedWorkoutForUser(uid, id, { db, guard, checkpoints: { afterDeleteClaim: failProjection } })).toEqual({ status: 'cleanup_pending' })
    expect((await readWorkoutMutationState(uid, id, guard.operationId, { db })).operation?.status).toBe('committed')
    await expect(updateFinishedWorkoutForUser(uid, id, edit, { db })).rejects.toMatchObject({ status: 409, code: 'workout_deleted' })
    expect(await deleteFinishedWorkoutForUser(uid, id, { db, guard })).toEqual({ status: 'deleted' })
    const state = await readWorkoutMutationState(uid, id, guard.operationId, { db })
    expect(state.status).toBe('gone'); expect(state.operation?.status).toBe('complete')
    expect((await db.collection('closedSessions').doc(id).get()).data()?.projectionRevision).toBe(3)
    expect((await db.collection('exerciseSessions').where('workoutId', '==', id).get()).empty).toBe(true)
  })
  it('rejects partial guards, hides foreign snapshots and refuses lossy legacy editing', async () => {
    const { id, baseline } = await seed()
    await expect(updateFinishedWorkoutForUser(uid, id, { label: 'Bad', exercises, baseline }, { db })).rejects.toMatchObject({ status: 400 })
    await expect(readWorkoutMutationState('foreign', id, undefined, { db })).rejects.toMatchObject({ status: 404 })
    await db.collection('workouts').doc(id).update({ exercises: [...exercises, { name: 'broken', sets: [] }] })
    await expect(readWorkoutMutationState(uid, id, undefined, { db })).rejects.toMatchObject({ status: 422, code: 'workout_repair_needed' })
  })
  it('keeps repeated rows and same-ID source records separate, then removes only obsolete projections', async () => {
    const { id, baseline } = await seed()
    const mixed = [
      { ...exercises[0], sets: [{ weight: 50, reps: 5 }] },
      { ...exercises[0], exerciseSource: 'user', name: 'Custom Bench', sets: [{ weight: 70, reps: 3 }] },
      { ...exercises[0], sets: [{ weight: 55, reps: 4 }] },
    ]
    await updateFinishedWorkoutForUser(uid, id, { label: 'Mixed', exercises: mixed, baseline, operationId: randomUUID() }, { db })
    const current = await readWorkoutMutationState(uid, id, undefined, { db })
    expect(current.workout?.exercises).toEqual(mixed)
    const globalRef = db.collection('records').doc(`${uid}_global_bench-press`)
    const userRef = db.collection('records').doc(`${uid}_user_bench-press`)
    expect((await globalRef.get()).data()?.maxWeight).toBe(55)
    expect((await userRef.get()).data()?.maxWeight).toBe(70)
    await updateFinishedWorkoutForUser(uid, id, { label: 'User only', exercises: [mixed[1]], baseline: current.baseline, operationId: randomUUID() }, { db })
    const projections = await db.collection('exerciseSessions').where('workoutId', '==', id).get()
    expect(projections.docs.map(doc => doc.data().exerciseSource)).toEqual(['user'])
    expect((await globalRef.get()).data()?.maxWeight).not.toBe(55)
    expect((await userRef.get()).data()?.maxWeight).toBe(70)
    const latest = await readWorkoutMutationState(uid, id, undefined, { db })
    await deleteFinishedWorkoutForUser(uid, id, { db, guard: { baseline: latest.baseline!, operationId: randomUUID() } })
    expect((await userRef.get()).exists).toBe(false)
  })
  it('excludes derived materialization state from the baseline', async () => {
    const { id, baseline } = await seed()
    await db.collection('workouts').doc(id).update({ materialized: true })
    expect((await readWorkoutMutationState(uid, id, undefined, { db })).baseline).toBe(baseline)
  })
})
