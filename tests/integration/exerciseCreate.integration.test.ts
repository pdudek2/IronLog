import { randomUUID } from 'node:crypto'
import { afterAll, expect, it } from 'vitest'
import { getReviewAdminDatabase, closeReviewAdminDatabase } from '../review/support/adminReviewDatabase'
import { createExerciseForUser, parseCreateExerciseRequest } from '../../api/_lib/exerciseCreateService'

const db = getReviewAdminDatabase()
const uid = `exercise-create-${randomUUID()}`
const body = (name = 'Original name') => parseCreateExerciseRequest({ id: randomUUID(), operationId: randomUUID(), source: 'user', input: { name, category: 'back', equipment: 'cable', muscles: ['back', 'biceps'] } })
const create = (request: ReturnType<typeof body>) => createExerciseForUser(uid, request, { db })
afterAll(async () => {
  for (const name of ['userExercises', 'userExerciseNames', 'exerciseCreateOperations']) {
    for (const document of (await db.collection(name).where('userId', '==', uid).get()).docs) await document.ref.delete()
  }
  await closeReviewAdminDatabase()
})

it('unchanged response-loss retry succeeds once; changed/deleted outcomes never replay', async () => {
  const request = body()
  const first = await create(request)
  expect(await create(request)).toEqual(first)
  const receipt = (await db.collection('exerciseCreateOperations').where('userId', '==', uid).get()).docs[0]!
  const receiptBefore = receipt.data()
  await db.collection('userExercises').doc(request.id).update({ name: 'Renamed elsewhere' })
  await expect(create(request)).rejects.toMatchObject({ status: 409, code: 'EXERCISE_CREATE_CHANGED' })
  expect((await db.collection('userExercises').doc(request.id).get()).data()?.name).toBe('Renamed elsewhere')
  await db.collection('userExercises').doc(request.id).delete()
  await db.collection('userExerciseNames').doc(first.nameClaimId).delete()
  await expect(create(request)).rejects.toMatchObject({ status: 409, code: 'EXERCISE_CREATE_DELETED' })
  expect((await db.collection('userExercises').doc(request.id).get()).exists).toBe(false)
  expect((await receipt.ref.get()).data()).toEqual(receiptBefore)
  await expect(create({ ...request, operationId: randomUUID() })).rejects.toMatchObject({ code: 'EXERCISE_ID_CONFLICT' })
})
it('rejects mismatched receipt payloads and existing owned/foreign IDs without writes', async () => {
  const request = body('Bound request')
  await create(request)
  await expect(create({ ...request, input: { ...request.input, name: 'Different payload' } })).rejects.toMatchObject({ code: 'EXERCISE_OPERATION_CONFLICT' })
  await expect(create({ ...request, id: randomUUID() })).rejects.toMatchObject({ code: 'EXERCISE_OPERATION_CONFLICT' })
  await expect(create({ ...request, operationId: randomUUID() })).rejects.toMatchObject({ code: 'EXERCISE_ID_CONFLICT' })
  await expect(createExerciseForUser('other-user', request, { db })).rejects.toMatchObject({ code: 'EXERCISE_ID_CONFLICT' })
})
it('concurrent same-operation requests commit one receipt; name collisions and legacy duplicates reject', async () => {
  const request = body('Concurrent name')
  const results = await Promise.all([create(request), create(request)])
  expect(results[0]).toEqual(results[1])
  const race = await Promise.allSettled([create(body('Same name')), create(body('Same name'))])
  expect(race.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  const legacy = body('Legacy name')
  await db.collection('userExercises').doc(legacy.id).set({ userId: uid, ...legacy.input })
  await expect(create(body('Legacy name'))).rejects.toMatchObject({ code: 'EXERCISE_NAME_CONFLICT' })
}, 30_000)
