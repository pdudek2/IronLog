import assert from 'node:assert/strict'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDocFromServer, setDoc, terminate } from 'firebase/firestore'
import { getServices, readReadiness, saveReadiness } from '../src/firebase'
import { todayKey } from '../../src/shared/readiness'

async function main() {
  const run = `readiness-adapter-${Date.now()}`
  const { auth, firestore } = await getServices()
  const admin = initializeApp({ projectId: 'demo-ironlog' }, run)
  const db = getFirestore(admin); db.settings({ host: '127.0.0.1:8080', ssl: false })
  const owner = (await createUserWithEmailAndPassword(auth, `${run}@ironlog.local`, 'Readiness-demo-123!')).user
  const date = todayKey(), entry = { userId: owner.uid, date, sleep: 5, mood: 4, soreness: 1, createdAt: Date.now() }
  const ref = db.collection('readiness').doc(`${owner.uid}_${date}`)
  try {
    assert.deepEqual(await readReadiness(owner.uid,date,true), { data:null, fromCache:false })
    await saveReadiness(entry)
    assert.deepEqual((await ref.get()).data(),entry)
    assert.deepEqual(await readReadiness(owner.uid,date,true), { data:entry, fromCache:false })
    const mid = {...entry,sleep:3,mood:3,soreness:3}; await saveReadiness(mid)
    assert.deepEqual((await ref.get()).data(),mid)
    await assert.rejects(saveReadiness({...entry,sleep:0}))
    await assert.rejects(saveReadiness({...entry,date:'2026-02-30'}))
    await ref.set({...entry,sleep:'3'}); await assert.rejects(readReadiness(owner.uid,date,true),/invalid/)
    await ref.set(entry)
    await signOut(auth)
    await createUserWithEmailAndPassword(auth,`${run}-other@ironlog.local`,'Readiness-demo-123!')
    await assert.rejects(readReadiness(owner.uid,date,true),/account changed/)
    await assert.rejects(saveReadiness(entry),/account changed/)
    const target = doc(firestore,'readiness',`${owner.uid}_${date}`)
    await assert.rejects(getDocFromServer(target),error => String((error as {code?:string}).code).includes('permission-denied'))
    await assert.rejects(setDoc(target,entry),error => String((error as {code?:string}).code).includes('permission-denied'))
    assert.deepEqual((await ref.get()).data(),entry)
    console.log('PASS: actual native adapter transport, absence, own transaction create/update, strict invalid rejection, UID guards, actual foreign-UID rules read/write denial')
  } finally { await ref.delete(); await terminate(firestore); await deleteApp(admin) }
}
void main().catch(error => {console.error(error);process.exitCode=1})
