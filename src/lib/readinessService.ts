import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebase'

export interface ReadinessEntry {
  userId: string
  date: string    // YYYY-MM-DD local
  sleep: number   // 1..5
  mood: number    // 1..5
  soreness: number // 1..5 (5 = bardzo obolały)
  createdAt: number
}

export interface ReadinessScore {
  score: number  // 0..100
  tone: 'low' | 'mid' | 'high'
  color: string
  label: string
}

// Local date, nie UTC — żeby nie przeskakiwało o północy UTC
export function todayKey(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

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

// sleep×0.4 + mood×0.3 + (6−soreness)×0.3, raw ∈ [1,5] → 0..100
export function computeReadinessScore(entry: Pick<ReadinessEntry, 'sleep' | 'mood' | 'soreness'>): ReadinessScore {
  const raw = entry.sleep * 0.4 + entry.mood * 0.3 + (6 - entry.soreness) * 0.3
  const score = Math.round(((raw - 1) / 4) * 100)

  if (score >= 70) return { score, tone: 'high', color: 'var(--accent)', label: 'Gotowy' }
  if (score >= 40) return { score, tone: 'mid', color: '#f5a623', label: 'Umiarkowany' }
  return { score, tone: 'low', color: 'var(--danger)', label: 'Odpoczynek' }
}
