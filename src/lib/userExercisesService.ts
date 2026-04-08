import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from './firebase'
import type { Exercise } from '../data/exercises'

export async function getUserExercises(uid: string): Promise<Exercise[]> {
  const snap = await getDocs(
    query(collection(db, 'userExercises'), where('userId', '==', uid))
  )
  return snap.docs.map((docSnap) => {
    const d = docSnap.data()
    return {
      id: docSnap.id,
      name: String(d.name ?? ''),
      category: d.category ?? 'core',
      equipment: d.equipment ?? 'bodyweight',
      muscles: Array.isArray(d.muscles) ? d.muscles : [],
    } as Exercise
  })
}
