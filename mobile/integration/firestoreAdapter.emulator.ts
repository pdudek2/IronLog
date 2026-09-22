import assert from 'node:assert/strict'

import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth'
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  runTransaction,
  setDoc,
  type Firestore,
} from 'firebase/firestore'

import { NativeActiveSessionConflictError, updateExistingActiveSession } from '../src/activeSessionTransaction'
import type { ActiveWorkout } from '../src/session'

const projectId = 'demo-ironlog'
const runId = `native-adapter-${Date.now()}`
const password = 'Adapter-test-123!'

async function client(name: string) {
  const app = initializeApp({ apiKey: 'demo-ironlog', projectId, appId: `${runId}-${name}` }, `${runId}-${name}`)
  const auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  const user = (await createUserWithEmailAndPassword(auth, `${runId}-${name}@ironlog.local`, password)).user
  const firestore = getFirestore(app)
  connectFirestoreEmulator(firestore, '127.0.0.1', 8080)
  return { app, firestore, uid: user.uid }
}

function active(uid: string, sessionId: string, revision: string): ActiveWorkout {
  return {
    sessionId, sessionRevision: revision, startedAt: Date.now() - 60_000, templateId: null, label: 'Adapter',
    exercises: [{ clientId: 'exercise-a', exerciseId: 'squat', exerciseSource: 'global', name: 'Squat', custom: 'kept',
      sets: [{ clientId: 'set-a', weight: '100', reps: '5', done: false, cue: 'kept' }] }],
  }
}

async function save(firestore: Firestore, uid: string, workout: ActiveWorkout, expected: string | null, requested: string) {
  const reference = doc(firestore, 'activeSessions', uid)
  await runTransaction(firestore, async (transaction) => updateExistingActiveSession({
    read: async () => {
      const snapshot = await transaction.get(reference)
      return { exists: snapshot.exists(), data: snapshot.exists() ? snapshot.data() : null }
    },
    update: (fields) => transaction.update(reference, fields),
  }, uid, workout, expected, requested, Date.now()))
}

async function main() {
  const owner = await client('owner')
  const other = await client('other')
  const admin = initializeAdminApp({ projectId }, runId)
  const adminDb = getAdminFirestore(admin)
  adminDb.settings({ host: '127.0.0.1:8080', ssl: false })
  const sessionId = `${runId}-session`
  const initialRevision = `${runId}-revision-1`
  const workout = active(owner.uid, sessionId, initialRevision)
  const reference = doc(owner.firestore, 'activeSessions', owner.uid)

  try {
  await setDoc(reference, {
    userId: owner.uid, sessionId, sessionRevision: initialRevision, startedAt: workout.startedAt,
    templateId: null, label: 'Adapter', exercises: workout.exercises, updatedAt: Date.now(),
  })

  workout.exercises[0]!.sets[0]!.done = true
  await save(owner.firestore, owner.uid, workout, initialRevision, `${runId}-revision-2`)
  const saved = (await getDoc(reference)).data()!
  assert.equal(saved.sessionRevision, `${runId}-revision-2`)
  assert.equal(saved.label, 'Adapter')
  assert.equal(saved.exercises[0].custom, 'kept')
  assert.equal(saved.exercises[0].sets[0].cue, 'kept')
  assert.equal(saved.exercises[0].sets[0].done, true)

  await assert.rejects(save(other.firestore, owner.uid, workout, `${runId}-revision-2`, `${runId}-other`))
  await assert.rejects(save(owner.firestore, owner.uid, workout, initialRevision, `${runId}-stale`), NativeActiveSessionConflictError)

  await adminDb.collection('activeSessions').doc(owner.uid).set({
    ...saved, sessionId: `${runId}-replacement`, sessionRevision: `${runId}-replacement-revision`, updatedAt: Date.now(),
  })
  await assert.rejects(save(owner.firestore, owner.uid, workout, `${runId}-replacement-revision`, `${runId}-replace-attempt`), NativeActiveSessionConflictError)

  await adminDb.collection('activeSessions').doc(owner.uid).delete()
  await assert.rejects(save(owner.firestore, owner.uid, workout, `${runId}-revision-2`, `${runId}-missing`), NativeActiveSessionConflictError)

  const legacy = { ...workout, sessionRevision: null }
  await adminDb.collection('activeSessions').doc(owner.uid).set({
    userId: owner.uid, sessionId, startedAt: workout.startedAt, templateId: null,
    label: 'Adapter', exercises: workout.exercises, updatedAt: Date.now(),
  })
  await save(owner.firestore, owner.uid, legacy, null, `${runId}-legacy-upgrade`)
  assert.equal((await getDoc(reference)).data()?.sessionRevision, `${runId}-legacy-upgrade`)

  await adminDb.collection('activeSessions').doc(owner.uid).set({
    userId: owner.uid, sessionId, sessionRevision: `${runId}-revision-3`, startedAt: workout.startedAt,
    templateId: null, label: 'Adapter', exercises: workout.exercises, updatedAt: Date.now(),
  })
  await adminDb.collection('closedSessions').doc(sessionId).set({ userId: owner.uid, sessionId, closedAt: Date.now() })
  await assert.rejects(save(owner.firestore, owner.uid, workout, `${runId}-revision-3`, `${runId}-tombstoned`))

  await adminDb.collection('closedSessions').doc(sessionId).delete()
  await save(owner.firestore, owner.uid, workout, `${runId}-revision-3`, `${runId}-revision-4`)
  await save(owner.firestore, owner.uid, workout, `${runId}-revision-3`, `${runId}-revision-4`)
  assert.equal((await getDoc(reference)).data()?.exercises[0].sets[0].done, true)

  let callbackCount = 0
  await runTransaction(owner.firestore, async (transaction) => updateExistingActiveSession({
    read: async () => {
      const snapshot = await transaction.get(reference)
      callbackCount += 1
      if (callbackCount === 1) await adminDb.collection('activeSessions').doc(owner.uid).update({ updatedAt: Date.now() + 1 })
      return { exists: snapshot.exists(), data: snapshot.exists() ? snapshot.data() : null }
    },
    update: (fields) => transaction.update(reference, fields),
  }, owner.uid, { ...workout, label: ' Native label ', sessionRevision: `${runId}-revision-4` }, `${runId}-revision-4`, `${runId}-revision-5`, Date.now()))
  const retried = (await getDoc(reference)).data()!
  assert.ok(callbackCount > 1)
  assert.equal(retried.sessionRevision, `${runId}-revision-5`)
  assert.equal(retried.label, 'Native label')
  assert.equal(retried.exercises[0].sets[0].done, true)
  console.log('native active-session adapter emulator checks passed')
  } finally {
    await adminDb.collection('activeSessions').doc(owner.uid).delete().catch(() => undefined)
    await adminDb.collection('closedSessions').doc(sessionId).delete().catch(() => undefined)
    await Promise.all([deleteApp(owner.app), deleteApp(other.app), deleteAdminApp(admin)])
  }
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
