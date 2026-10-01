import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebase'

import { todayKey, type ReadinessEntry } from '../shared/readiness'
export { todayKey, computeReadinessScore, type ReadinessEntry, type ReadinessScore } from '../shared/readiness'

function buildDocId(uid: string, date: string): string {
  return `${uid}_${date}`
}

export async function getReadiness(
  uid: string,
  date: string,
): Promise<ReadinessEntry | null> {
  const snap = await getDoc(doc(db, 'readiness', buildDocId(uid, date)))
  if (!snap.exists()) return null
  const data = snap.data()
  return {
    userId: String(data.userId ?? ''),
    date: String(data.date ?? ''),
    sleep: Number(data.sleep ?? 3),
    mood: Number(data.mood ?? 3),
    soreness: Number(data.soreness ?? 3),
    createdAt: Number(data.createdAt ?? 0),
  }
}

export function getTodayReadiness(uid: string): Promise<ReadinessEntry | null> {
  return getReadiness(uid, todayKey())
}

export async function saveReadiness(
  uid: string,
  values: Pick<ReadinessEntry, 'sleep' | 'mood' | 'soreness'>,
): Promise<ReadinessEntry> {
  const date = todayKey()
  const entry: ReadinessEntry = {
    userId: uid,
    date,
    sleep: values.sleep,
    mood: values.mood,
    soreness: values.soreness,
    createdAt: Date.now(),
  }
  await setDoc(doc(db, 'readiness', buildDocId(uid, date)), entry)
  return entry
}
