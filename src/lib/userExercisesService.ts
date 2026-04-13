import { addDoc, collection, deleteDoc, doc, getDocs, limit, query, updateDoc, where } from 'firebase/firestore'
import { db } from './firebase'
import type { Category, Equipment, Exercise, MuscleGroup } from '../data/exercises'

export interface UserExerciseInput {
  name: string
  category: Category
  equipment: Equipment
  muscles: MuscleGroup[]
}

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

export async function createUserExercise(uid: string, input: UserExerciseInput): Promise<Exercise> {
  const duplicate = await getDocs(
    query(
      collection(db, 'userExercises'),
      where('userId', '==', uid),
      where('name', '==', input.name.trim()),
      limit(1),
    )
  )
  if (!duplicate.empty) {
    throw new Error(`Ćwiczenie o nazwie "${input.name.trim()}" już istnieje.`)
  }

  const docRef = await addDoc(collection(db, 'userExercises'), {
    userId: uid,
    name: input.name.trim(),
    category: input.category,
    equipment: input.equipment,
    muscles: input.muscles,
  })
  return { id: docRef.id, ...input, name: input.name.trim() }
}

export async function updateUserExercise(
  id: string,
  input: UserExerciseInput,
): Promise<void> {
  await updateDoc(doc(db, 'userExercises', id), {
    name: input.name,
    category: input.category,
    equipment: input.equipment,
    muscles: input.muscles,
  })
}

export async function deleteUserExercise(id: string): Promise<void> {
  await deleteDoc(doc(db, 'userExercises', id))
}
