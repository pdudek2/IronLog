import { doc, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import { todayKey } from '../shared/readiness'

// One "Skip today" per day: the rules refuse a second write, which means it is already recorded.
export async function recordPlanSkip(uid: string, templateId: string, planDayId: string): Promise<void> {
  const date = todayKey()
  try {
    await setDoc(doc(db, 'planSkips', `${uid}_${date}`), { userId: uid, date, templateId, planDayId, createdAt: Date.now() })
  } catch (error) {
    if ((error as { code?: string }).code !== 'permission-denied') throw error
  }
}
