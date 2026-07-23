import { collection, deleteDoc, doc, getDoc, getDocs, limit, query, runTransaction, updateDoc, where } from 'firebase/firestore'
import { db } from './firebase'
import type { Category, Equipment, Exercise, MuscleGroup } from '../data/exercises'

export interface UserExerciseInput {
  name: string
  category: Category
  equipment: Equipment
  muscles: MuscleGroup[]
}

async function buildNameClaimId(uid: string, name: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(name))
  const hash = Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('')
  return `${uid}_${hash}`
}

function duplicateNameError(name: string): Error {
  return new Error(`Ćwiczenie o nazwie "${name}" już istnieje.`)
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
  const name = input.name.trim()
  const duplicate = await getDocs(
    query(
      collection(db, 'userExercises'),
      where('userId', '==', uid),
      where('name', '==', name),
      limit(1),
    )
  )
  if (!duplicate.empty) throw duplicateNameError(name)

  const nameClaimId = await buildNameClaimId(uid, name)
  const exerciseRef = doc(collection(db, 'userExercises'))
  const claimRef = doc(db, 'userExerciseNames', nameClaimId)

  await runTransaction(db, async (transaction) => {
    const claim = await transaction.get(claimRef)
    if (claim.exists()) throw duplicateNameError(name)

    transaction.set(exerciseRef, {
      userId: uid,
      name,
      category: input.category,
      equipment: input.equipment,
      muscles: input.muscles,
      nameClaimId,
    })
    transaction.set(claimRef, {
      userId: uid,
      exerciseId: exerciseRef.id,
      name,
    })
  })

  return { id: exerciseRef.id, ...input, name }
}

export async function updateUserExercise(
  id: string,
  input: UserExerciseInput,
): Promise<void> {
  const ref = doc(db, 'userExercises', id)
  const current = await getDoc(ref)

  if (!current.exists()) {
    throw new Error('Nie znaleziono ćwiczenia do aktualizacji.')
  }

  const currentData = current.data()
  const userId = typeof currentData.userId === 'string' ? currentData.userId : ''
  const trimmedName = input.name.trim()

  if (userId) {
    const duplicate = await getDocs(
      query(
        collection(db, 'userExercises'),
        where('userId', '==', userId),
        where('name', '==', trimmedName),
        limit(2),
      ),
    )

    const hasOtherExerciseWithSameName = duplicate.docs.some((docSnap) => docSnap.id !== id)
    if (hasOtherExerciseWithSameName) {
      throw new Error(`Ćwiczenie o nazwie "${trimmedName}" już istnieje.`)
    }
  }

  await updateDoc(ref, {
    name: trimmedName,
    category: input.category,
    equipment: input.equipment,
    muscles: input.muscles,
  })
}

export async function deleteUserExercise(id: string): Promise<void> {
  await deleteDoc(doc(db, 'userExercises', id))
}
