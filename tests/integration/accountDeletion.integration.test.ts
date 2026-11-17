import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { DELETED_BY_ID, DELETED_BY_USER_ID, deleteAccountForUser } from '../../api/_lib/accountDeletion'
import { materializeWorkoutForUser } from '../../api/_lib/workoutProjection'
import {
  clearReviewAdminDatabase,
  closeReviewAdminDatabase,
  getReviewAdminDatabase,
} from '../review/support/adminReviewDatabase'

const db = getReviewAdminDatabase()
// `abc_x` starts with `abc_`: an id-prefix filter for `abc` would hit it, a userId filter must not.
const TARGET = 'abc'
const NEIGHBOUR = 'abc_x'

function fakeAuth() {
  const deleted: string[] = []
  return {
    deleted,
    auth: { deleteUser: async (uid: string) => {
      if (deleted.includes(uid)) throw Object.assign(new Error('gone'), { code: 'auth/user-not-found' })
      deleted.push(uid)
    } } as never,
  }
}

async function seed(uid: string): Promise<void> {
  const batch = db.batch()
  for (const name of DELETED_BY_USER_ID) {
    const id = name === 'activeSessions' || name === 'dailyAiUsage' ? uid : `${uid}_${name}`
    batch.set(db.collection(name).doc(id), { userId: uid, marker: name })
    batch.set(db.collection(name).doc(`${uid}-plain-${name}`), { userId: uid, marker: name })
  }
  for (const name of DELETED_BY_ID) batch.set(db.collection(name).doc(uid), { displayName: uid, createdAt: 1 })
  await batch.commit()
}

async function snapshot(uid: string): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {}
  for (const name of DELETED_BY_USER_ID) out[name] = (await db.collection(name).where('userId', '==', uid).get()).docs.map((doc) => [doc.id, doc.data()]).sort()
  for (const name of DELETED_BY_ID) out[`${name}/id`] = [(await db.collection(name).doc(uid).get()).data() ?? null]
  return out
}

beforeEach(async () => {
  await clearReviewAdminDatabase()
  await seed(TARGET)
  await seed(NEIGHBOUR)
})

afterAll(async () => {
  await closeReviewAdminDatabase()
})

describe('account deletion', () => {
  it('removes every document of the user and the Auth account, and nothing of the neighbour', async () => {
    const neighbourBefore = await snapshot(NEIGHBOUR)
    await db.collection('dailyAiUsage').doc('total_2026-11-16').set({ date: '2026-11-16', used: 7 })
    const { auth, deleted } = fakeAuth()
    await deleteAccountForUser(TARGET, { db, auth })

    const left = await snapshot(TARGET)
    for (const [name, docs] of Object.entries(left)) expect([name, docs]).toEqual([name, name.endsWith('/id') ? [null] : []])
    expect(await snapshot(NEIGHBOUR)).toEqual(neighbourBefore)
    expect(deleted).toEqual([TARGET])
    expect((await db.collection('dailyAiUsage').doc('total_2026-11-16').get()).data()).toEqual({ date: '2026-11-16', used: 7 })
  })

  it('finishes after an interrupted run, and cleans leftovers when the Auth user is already gone', async () => {
    for (const name of DELETED_BY_USER_ID.slice(0, 4)) {
      for (const doc of (await db.collection(name).where('userId', '==', TARGET).get()).docs) await doc.ref.delete()
    }
    const { auth, deleted } = fakeAuth()
    await deleteAccountForUser(TARGET, { db, auth })
    await db.collection('readiness').doc(`${TARGET}_late`).set({ userId: TARGET })
    await deleteAccountForUser(TARGET, { db, auth })
    expect(deleted).toEqual([TARGET])
    expect((await db.collection('readiness').where('userId', '==', TARGET).get()).empty).toBe(true)
  })

  it('leaves nothing a late materialization could rebuild a workout from', async () => {
    const { auth } = fakeAuth()
    await deleteAccountForUser(TARGET, { db, auth })
    await materializeWorkoutForUser(TARGET, `${TARGET}_workouts`).catch(() => undefined)
    expect((await db.collection('workouts').where('userId', '==', TARGET).get()).empty).toBe(true)
    expect((await db.collection('exerciseSessions').where('userId', '==', TARGET).get()).empty).toBe(true)
    expect((await db.collection('records').where('userId', '==', TARGET).get()).empty).toBe(true)
  })
})
