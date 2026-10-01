import assert from 'node:assert/strict'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { createUserWithEmailAndPassword, signOut, signInWithEmailAndPassword } from 'firebase/auth'
import { doc, getDocFromServer, runTransaction, terminate } from 'firebase/firestore'
import { getServices, readProfile, saveProfile } from '../src/firebase'
import { updateExistingProfile } from '../src/profile'

async function main() {
const run = `profile-${Date.now()}`
const password = 'Profile-demo-123!'
const { auth, firestore } = await getServices()
const admin = initializeApp({ projectId: 'demo-ironlog' }, run)
const db = getFirestore(admin); db.settings({ host: '127.0.0.1:8080', ssl: false })
const owner = (await createUserWithEmailAndPassword(auth, `${run}@ironlog.local`, password)).user
const original = { displayName: 'Adapter', weeklyGoal: 12, primaryGoal: 'strength' as const, units: 'kg' as const, createdAt: 12345 }
const reference = db.collection('users').doc(owner.uid)
let foreign: string | null = null
try {
  assert.equal((await readProfile(owner.uid, true)).data, null)
  await assert.rejects(saveProfile(owner.uid, original))
  assert.equal((await reference.get()).exists, false)
  await reference.set(original)
  await saveProfile(owner.uid, { ...original, displayName: '  Renamed  ', units: 'lbs' })
  assert.deepEqual((await reference.get()).data(), { ...original, displayName: 'Renamed', units: 'lbs' })
  const saved = await readProfile(owner.uid, true)
  assert.equal(saved.fromCache, false); assert.equal(saved.data?.weeklyGoal, 12)
  await assert.rejects(saveProfile(owner.uid, { ...original, weeklyGoal: 15 }))
  await assert.rejects(saveProfile(owner.uid, { ...original, displayName: 'x'.repeat(81) }))
  await signOut(auth)
  foreign = (await createUserWithEmailAndPassword(auth, `${run}-other@ironlog.local`, password)).user.uid
  await assert.rejects(readProfile(owner.uid, true), /account changed/)
  await assert.rejects(saveProfile(owner.uid, original), /account changed/)
  // Bypass the adapter's auth precheck to assert denial by the actual demo rules.
  const target = doc(firestore, 'users', owner.uid)
  await assert.rejects(getDocFromServer(target), error => String((error as { code?: string }).code).includes('permission-denied'))
  await assert.rejects(runTransaction(firestore, async transaction => updateExistingProfile({ read: async () => ({ exists: true, data: original }), update: fields => { transaction.update(target, fields) } }, owner.uid, original)), error => String((error as { code?: string }).code).includes('permission-denied'))
  await signInWithEmailAndPassword(auth, `${run}@ironlog.local`, password)
  await saveProfile(owner.uid, { ...original, weeklyGoal: 7 }); assert.equal((await reference.get()).data()?.weeklyGoal, 7)
  console.log('PASS: actual native adapter transport, missing/validation, update preserving createdAt, existing12, owner guards and foreign-UID rules denial')
} finally {
  await reference.delete(); if (foreign) await db.collection('users').doc(foreign).delete()
  await terminate(firestore); await deleteApp(admin)
}

}
void main().catch(error => { console.error(error); process.exitCode = 1 })
