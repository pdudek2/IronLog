import assert from 'node:assert/strict'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { createUserWithEmailAndPassword, signOut, signInWithEmailAndPassword } from 'firebase/auth'
import { doc, getDocFromServer, runTransaction, terminate } from 'firebase/firestore'
import { createProfile, getServices, readHome, readProfile, register, saveProfile, sendPasswordReset } from '../src/firebase'
import { ProfileMissingError } from '../src/profile'
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
let fresh: string | null = null
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
  // Onboarding: an account made in the app creates its profile once; a second save keeps the first one.
  await signOut(auth)
  await register(`  ${run}-new@ironlog.local `, password)
  fresh = auth.currentUser!.uid
  // Train sends an account the server confirms has no profile to onboarding.
  await assert.rejects(readHome(fresh), ProfileMissingError)
  assert.equal(await createProfile(fresh, { displayName: ' New ', primaryGoal: 'hypertrophy', weeklyGoal: 3, units: 'lbs' }), 'lbs')
  const created = (await db.collection('users').doc(fresh).get()).data()!
  assert.equal(created.displayName, 'New')
  assert.equal(await createProfile(fresh, { displayName: 'Again', primaryGoal: 'strength', weeklyGoal: 5, units: 'kg' }), 'lbs')
  assert.deepEqual((await db.collection('users').doc(fresh).get()).data(), created)
  // Reset: a known email leaves a code in the Auth emulator; an unknown one answers the same way, without an error.
  await sendPasswordReset(` ${run}@ironlog.local `)
  const codes = await (await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-ironlog/oobCodes')).json() as { oobCodes: { email: string; requestType: string }[] }
  assert.ok(codes.oobCodes.some((code) => code.email === `${run}@ironlog.local` && code.requestType === 'PASSWORD_RESET'))
  await sendPasswordReset(`${run}-nobody@ironlog.local`)
  console.log('PASS: register, create-only profile and password reset through the native adapter')
  console.log('PASS: actual native adapter transport, missing/validation, update preserving createdAt, existing12, owner guards and foreign-UID rules denial')
} finally {
  await reference.delete(); if (foreign) await db.collection('users').doc(foreign).delete(); if (fresh) await db.collection('users').doc(fresh).delete()
  await terminate(firestore); await deleteApp(admin)
}

}
void main().catch(error => { console.error(error); process.exitCode = 1 })
