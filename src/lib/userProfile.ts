import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebase'

export type PrimaryGoal = 'strength' | 'hypertrophy' | 'endurance' | 'weight_loss'
export type Units = 'kg' | 'lbs'

export interface UserProfile {
  displayName: string
  weeklyGoal: number
  primaryGoal: PrimaryGoal
  units: Units
  createdAt: number
}

export async function getProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? (snap.data() as UserProfile) : null
}

export async function saveProfile(uid: string, profile: UserProfile): Promise<void> {
  await setDoc(doc(db, 'users', uid), profile)
}
