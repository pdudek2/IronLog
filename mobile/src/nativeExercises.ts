import { collection, doc, getDocsFromServer, limit, orderBy, query, runTransaction, where } from '@react-native-firebase/firestore'
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto'
import { currentIdToken, getServices, readUnits } from './firebase'
import { exerciseClaimId, mutateExercise, parseExerciseRecord, parseExerciseSession, sameExerciseInput, validateExerciseInput, type ExerciseMutation } from './exerciseCatalogue'
import type { ExerciseSource } from './session'

export class ExerciseNotSubmittedError extends Error {}

export async function writeCustomExercise(uid: string, operation: ExerciseMutation): Promise<void> {
  if (operation.source !== 'user') throw new Error('Shared exercises cannot be changed.')
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(operation.id)) throw new Error('Invalid exercise ID.')
  const { auth, firestore } = await getServices()
  await currentIdToken(uid)
  const assertCurrent = () => { if (auth.currentUser?.uid !== uid) throw new Error('The signed-in account changed.') }
  const input = operation.kind === 'delete' ? null : validateExerciseInput(operation.input)
  const claimId = input ? await exerciseClaimId(uid, input.name, value => digestStringAsync(CryptoDigestAlgorithm.SHA256, value)) : null
  try {
  if (input) {
    const duplicate = await getDocsFromServer(query(collection(firestore, 'userExercises'), where('userId', '==', uid), where('name', '==', input.name), limit(2)))
    if (duplicate.docs.some(document => document.id !== operation.id)) throw new Error(`An exercise named "${input.name}" already exists.`)
  } else {
    const existing = await getDocsFromServer(query(collection(firestore, 'userExercises'), where('userId', '==', uid)))
    assertCurrent()
    if (!existing.docs.some(document => document.id === operation.id)) return
  }
  assertCurrent()
  } catch (error) { throw new ExerciseNotSubmittedError(error instanceof Error ? error.message : 'Could not save. Check your connection and try again.') }
  await runTransaction(firestore, transaction => mutateExercise({
    read: async (name, id) => { const snapshot = await transaction.get(doc(firestore, name, id)); return snapshot.exists() ? snapshot.data()! : null },
    set: (name, id, data) => { transaction.set(doc(firestore, name, id), data) },
    update: (id, data) => { transaction.update(doc(firestore, 'userExercises', id), data) },
    remove: (name, id) => { transaction.delete(doc(firestore, name, id)) },
  }, uid, operation, claimId, assertCurrent), { maxAttempts: 3 })
}

export async function confirmExerciseMutation(uid: string, operation: ExerciseMutation): Promise<boolean> {
  await currentIdToken(uid)
  const { firestore } = await getServices()
  // Owner-only rules cannot read a missing document. The catalogue query also confirms absence.
  const snapshot = await getDocsFromServer(query(collection(firestore, 'userExercises'), where('userId', '==', uid)))
  const exercise = snapshot.docs.find(document => document.id === operation.id)
  return operation.kind === 'delete' ? !exercise : !!exercise && sameExerciseInput(exercise.data(), validateExerciseInput(operation.input))
}

export async function readExerciseDetail(uid: string, id: string, source: ExerciseSource) {
  const { firestore } = await getServices()
  const filters = [where('userId', '==', uid), where('exerciseId', '==', id), where('exerciseSource', '==', source)]
  const [sessions, records, units] = await Promise.all([
    getDocsFromServer(query(collection(firestore, 'exerciseSessions'), ...filters, orderBy('startedAt', 'desc'), limit(10))),
    getDocsFromServer(query(collection(firestore, 'records'), ...filters, limit(1))), readUnits(uid),
  ])
  return { data: { sessions: sessions.docs.map(document => parseExerciseSession(document.id, uid, id, source, document.data())),
    record: records.empty ? null : parseExerciseRecord(records.docs[0]!.id, uid, id, source, records.docs[0]!.data()), units }, fromCache: false }
}
