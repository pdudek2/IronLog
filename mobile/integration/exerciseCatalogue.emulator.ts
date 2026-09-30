import assert from 'node:assert/strict'
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app'
import { getFirestore as adminFirestore } from 'firebase-admin/firestore'
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth'
import { disableNetwork, enableNetwork, collection, getDocs, query, terminate, where } from 'firebase/firestore'
import { getServices, readExerciseMetadata } from '../src/firebase'
import { confirmExerciseMutation, readExerciseDetail, writeCustomExercise } from '../src/nativeExercises'
import { exerciseClaimId, type ExerciseInput } from '../src/exerciseCatalogue'
import { digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto'

const run = `catalogue-${Date.now()}`
const password = 'Exercise-demo-123!'
const input: ExerciseInput = { name: 'Żółć 💪', category: 'back', equipment: 'cable', muscles: ['back', 'biceps'] }
async function main() {
  const { auth, firestore } = await getServices()
  const ownerEmail = `${run}-owner@ironlog.local`
  const owner = (await createUserWithEmailAndPassword(auth, ownerEmail, password)).user
  const uid = owner.uid
  const admin = initializeAdminApp({ projectId: 'demo-ironlog' }, run)
  const db = adminFirestore(admin); db.settings({ host: '127.0.0.1:8080', ssl: false })
  const refs: Array<[string, string]> = []
  const seed = async (name: string, id: string, data: object) => { refs.push([name, id]); await db.collection(name).doc(id).set(data) }
  const ids = (suffix: string) => `${run}-${suffix}`
  const mutation = (kind: 'create' | 'update', id: string, value = input) => writeCustomExercise(uid, { kind, id, source: 'user', input: value })
  try {
    console.log('stage: race')
    await seed('users', uid, { displayName: 'Catalogue adapter', units: 'lbs', weeklyGoal: 3, primaryGoal: 'strength', createdAt: Date.now() })
    const race = await Promise.allSettled([mutation('create', ids('one')), mutation('create', ids('two'))])
    assert.equal(race.filter(result => result.status === 'fulfilled').length, 1)
    const created = (await getDocs(query(collection(firestore, 'userExercises'), where('userId', '==', uid)))).docs[0]!
    const id = created.id
    const claimId = await exerciseClaimId(uid, input.name, value => digestStringAsync(CryptoDigestAlgorithm.SHA256, value))
    assert.equal(created.data().nameClaimId, claimId)
    assert.equal((await db.collection('userExerciseNames').doc(claimId).get()).data()?.exerciseId, id)
    // Same identity reconciles an uncertain create and never makes another document.
    console.log('stage: retry')
    await mutation('create', id)
    assert.equal(await confirmExerciseMutation(uid, { kind: 'create', source: 'user', id, input }), true)
    assert.equal((await readExerciseMetadata(uid)).data.length, 1)
    await mutation('create', ids('case'), { ...input, name: 'żółć 💪' })
    await assert.rejects(mutation('update', ids('case')), /already exists/)
    console.log('stage: legacy')
    await seed('userExercises', ids('legacy'), { userId: uid, ...input, name: 'Legacy exercise' })
    await seed('userExercises', ids('legacy-delete'), { userId: uid, ...input, name: 'Legacy delete' })
    await assert.rejects(mutation('create', ids('legacy-duplicate'), { ...input, name: 'Legacy exercise' }), /already exists/)
    await mutation('update', ids('legacy'), { ...input, name: 'Legacy exercise' })
    assert.ok((await db.collection('userExercises').doc(ids('legacy')).get()).data()?.nameClaimId)
    await writeCustomExercise(uid, { kind: 'delete', source: 'user', id: ids('legacy-delete') })
    await writeCustomExercise(uid, { kind: 'delete', source: 'user', id: ids('legacy-delete') })
    console.log('stage: references')
    const reference = { exerciseId: id, exerciseSource: 'user', name: input.name, sets: [{ weight: 50, reps: 8 }] }
    await seed('templates', ids('plan'), { userId: uid, name: 'Reference', days: [{ name: 'Day', exercises: [reference] }] })
    await seed('workouts', ids('workout'), { userId: uid, exercises: [reference], startedAt: 1, finishedAt: 2 })
    await seed('activeSessions', uid, { userId: uid, sessionId: ids('active'), exercises: [reference], startedAt: 1 })
    const session = { userId: uid, exerciseId: id, exerciseSource: 'user', exerciseName: input.name, workoutId: ids('workout'), startedAt: 1, finishedAt: 2, label: 'Reference', totalSets: 1, totalReps: 8, totalVolume: 400, bestSetWeight: 50, bestSetReps: 8, sets: reference.sets }
    await seed('exerciseSessions', ids('history'), session)
    await seed('exerciseSessions', ids('global-collision'), { ...session, exerciseSource: 'global', totalVolume: 999 })
    const recordId = `${uid}_user_${id}`
    await seed('records', recordId, { ...session, maxWeight: 50, maxReps: 8, totalSessions: 1, bestVolume: 400, lastPerformedAt: 2 })
    const protectedRefs = refs.filter(([name]) => ['templates', 'workouts', 'activeSessions', 'exerciseSessions', 'records'].includes(name))
    const before = await Promise.all(protectedRefs.map(async ([name, key]) => (await db.collection(name).doc(key).get()).data()))
    await mutation('update', id, { ...input, name: 'Renamed custom' })
    assert.equal((await db.collection('userExerciseNames').doc(claimId).get()).exists, false)
    await writeCustomExercise(uid, { kind: 'delete', source: 'user', id })
    assert.deepEqual(await Promise.all(protectedRefs.map(async ([name, key]) => (await db.collection(name).doc(key).get()).data())), before)
    const detail = await readExerciseDetail(uid, id, 'user')
    assert.equal(detail.data.sessions.length, 1); assert.equal(detail.data.sessions[0]?.totalVolume, 400)
    assert.equal(detail.data.record?.exerciseName, input.name); assert.equal(detail.data.units, 'lbs')
    console.log('stage: unauthorized')
    const other = (await createUserWithEmailAndPassword(auth, `${run}-other@ironlog.local`, password)).user
    await assert.rejects(mutation('create', ids('cross')), /account changed/)
    await assert.rejects(writeCustomExercise(other.uid, { kind: 'update', source: 'user', id: ids('legacy'), input }))
    await assert.rejects(writeCustomExercise(other.uid, { kind: 'delete', source: 'global', id: 'squat' }), /Shared exercises/)
    await signInWithEmailAndPassword(auth, ownerEmail, password)
    console.log('stage: offline')
    await disableNetwork(firestore)
    const unchanged = JSON.stringify(input)
    await assert.rejects(mutation('create', ids('offline')))
    assert.equal(JSON.stringify(input), unchanged)
    await enableNetwork(firestore)
    assert.equal(await confirmExerciseMutation(uid, { kind: 'create', source: 'user', id: ids('offline'), input }), false)
    console.log('PASS actual native adapter with modular emulator transport: concurrent uniqueness, UTF-8 claims, case sensitivity, retry, rename collision, legacy upgrade/delete/duplicate, owner/global guard, offline save, source collisions, untouched plan/active/workout/history/record references')
  } finally {
    const custom = await db.collection('userExercises').where('userId', '==', uid).get()
    for (const document of custom.docs) { const data = document.data(); if (data.nameClaimId) await db.collection('userExerciseNames').doc(data.nameClaimId).delete(); await document.ref.delete() }
    for (const [name, key] of refs) await db.collection(name).doc(key).delete()
    await terminate(firestore); await deleteAdminApp(admin)
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
