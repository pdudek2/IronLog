import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import type { ActiveWorkout, ExerciseSource } from '../store/workoutStore'

export function activeSessionRef(uid: string) {
  return doc(db, 'activeSessions', uid)
}

export async function loadActiveSession(uid: string): Promise<ActiveWorkout | null> {
  const snap = await getDoc(activeSessionRef(uid))
  if (!snap.exists()) return null
  return parseSessionDoc(snap.data())
}

export async function saveActiveSession(uid: string, workout: ActiveWorkout): Promise<void> {
  await setDoc(activeSessionRef(uid), {
    userId: uid,
    startedAt: workout.startedAt,
    label: workout.label?.trim() || null,
    exercises: workout.exercises,
    updatedAt: Date.now(),
  })
}

export async function deleteActiveSession(uid: string): Promise<void> {
  await deleteDoc(activeSessionRef(uid))
}

function parseSessionDoc(data: Record<string, unknown>): ActiveWorkout {
  return {
    startedAt: typeof data.startedAt === 'number' ? data.startedAt : Date.now(),
    label: typeof data.label === 'string' && data.label ? data.label : undefined,
    exercises: Array.isArray(data.exercises)
      ? data.exercises.map((ex) => {
          const record = ex as Record<string, unknown>
          return {
            exerciseId: String(record.exerciseId ?? ''),
            exerciseSource: (record.exerciseSource === 'user' ? 'user' : 'global') as ExerciseSource,
            name: String(record.name ?? ''),
            sets: Array.isArray(record.sets)
              ? record.sets.map((s) => {
                  const set = s as Record<string, unknown>
                  return {
                    weight: String(set.weight ?? ''),
                    reps: String(set.reps ?? ''),
                    done: set.done === true,
                  }
                })
              : [],
          }
        })
      : [],
  }
}
