import { createHash } from 'node:crypto'
import type { Firestore } from 'firebase-admin/firestore'
import { adminDb } from './firebaseAdmin.js'
import { ApiError } from './errors.js'
import { validateExerciseInput, sameExerciseInput, type ExerciseInput } from '../../src/shared/exerciseInput.js'

export interface CreateExerciseRequest { id: string; operationId: string; source: 'user'; input: ExerciseInput }
export interface CreatedExercise extends ExerciseInput { id: string; userId: string; nameClaimId: string }
const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')
const conflict = (code: string, message: string) => new ApiError(409, message, { code })

export function parseCreateExerciseRequest(raw: unknown): CreateExerciseRequest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ApiError(400, 'Invalid exercise payload.')
  const body = raw as Record<string, unknown>
  if (Object.keys(body).some(key => !['id', 'operationId', 'source', 'input'].includes(key))
    || typeof body.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(body.id)
    || typeof body.operationId !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(body.operationId)
    || body.source !== 'user') throw new ApiError(400, 'Invalid exercise identity.')
  if (!body.input || typeof body.input !== 'object' || Array.isArray(body.input)
    || Object.keys(body.input).some(key => !['name', 'category', 'equipment', 'muscles'].includes(key))) throw new ApiError(400, 'Invalid exercise fields.')
  try {
    return { id: body.id, operationId: body.operationId, source: 'user', input: validateExerciseInput(body.input as ExerciseInput) }
  } catch (error) { throw new ApiError(400, error instanceof Error ? error.message : 'Invalid exercise fields.') }
}

export async function createExerciseForUser(userId: string, request: CreateExerciseRequest, options: { db?: Firestore } = {}): Promise<CreatedExercise> {
  const db = options.db ?? adminDb
  const exerciseRef = db.collection('userExercises').doc(request.id)
  const nameClaimId = `${userId}_${digest(request.input.name)}`
  const claimRef = db.collection('userExerciseNames').doc(nameClaimId)
  // Hash the operation suffix so UID/operation underscores cannot alias another account's receipt.
  const receiptRef = db.collection('exerciseCreateOperations').doc(`${userId}_${digest(request.operationId)}`)
  const requestHash = digest(JSON.stringify(request))
  const exercise = { userId, ...request.input, nameClaimId }
  return db.runTransaction(async transaction => {
    const receipt = await transaction.get(receiptRef)
    const snapshot = await transaction.get(exerciseRef)
    const claim = await transaction.get(claimRef)
    if (receipt.exists) {
      const data = receipt.data()
      if (data?.userId !== userId || data.operationId !== request.operationId || data.exerciseId !== request.id || data.requestHash !== requestHash) {
        throw conflict('EXERCISE_OPERATION_CONFLICT', 'This create request changed. Close and reload the library.')
      }
      if (!snapshot.exists) throw conflict('EXERCISE_CREATE_DELETED', 'This exercise was deleted. Close and reload the library.')
      const stored = snapshot.data()!
      const name = claim.data()
      if (stored.userId !== userId || stored.nameClaimId !== nameClaimId || !sameExerciseInput(stored, request.input)
        || name?.userId !== userId || name.exerciseId !== request.id || name.name !== request.input.name) {
        throw conflict('EXERCISE_CREATE_CHANGED', 'This exercise changed. Close and reload the library.')
      }
      return { id: request.id, ...exercise }
    }
    if (snapshot.exists) throw conflict('EXERCISE_ID_CONFLICT', 'This exercise ID is already in use. Close and reload the library.')
    const previousCreates = await transaction.get(db.collection('exerciseCreateOperations').where('exerciseId', '==', request.id).limit(1))
    if (!previousCreates.empty) throw conflict('EXERCISE_ID_CONFLICT', 'This exercise ID was already created. Close and reload the library.')
    const duplicates = await transaction.get(db.collection('userExercises').where('userId', '==', userId).where('name', '==', request.input.name).limit(1))
    if (claim.exists || !duplicates.empty) throw conflict('EXERCISE_NAME_CONFLICT', `An exercise named "${request.input.name}" already exists.`)
    transaction.create(exerciseRef, exercise)
    transaction.create(claimRef, { userId, exerciseId: request.id, name: request.input.name })
    transaction.create(receiptRef, { userId, operationId: request.operationId, exerciseId: request.id, requestHash })
    return { id: request.id, ...exercise }
  })
}
