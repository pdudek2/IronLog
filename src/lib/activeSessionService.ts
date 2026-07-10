import { deleteDoc, doc, getDoc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore'
import { db } from './firebase'
import { stripWorkoutClientIds, type ActiveWorkout, type ExerciseSource } from '../store/workoutStore'

interface ActiveSessionSnapshot {
  session: ActiveWorkout | null
  fromCache: boolean
  hasPendingWrites: boolean
}

export function activeSessionRef(uid: string) {
  return doc(db, 'activeSessions', uid)
}

export function subscribeToActiveSession(
  uid: string,
  onChange: (snapshot: ActiveSessionSnapshot) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    activeSessionRef(uid),
    { includeMetadataChanges: true },
    (snap) => onChange({
      session: snap.exists() ? parseSessionDoc(snap.data()) : null,
      fromCache: snap.metadata.fromCache,
      hasPendingWrites: snap.metadata.hasPendingWrites,
    }),
    (error) => onError?.(error),
  )
}

export async function saveActiveSession(uid: string, workout: ActiveWorkout): Promise<void> {
  const persistableWorkout = stripWorkoutClientIds(workout)
  await setDoc(activeSessionRef(uid), {
    userId: uid,
    startedAt: persistableWorkout.startedAt,
    templateId: typeof persistableWorkout.templateId === 'string' ? persistableWorkout.templateId : null,
    label: persistableWorkout.label?.trim() || null,
    exercises: persistableWorkout.exercises,
    updatedAt: Date.now(),
  })
}

export async function deleteActiveSession(uid: string): Promise<void> {
  await deleteDoc(activeSessionRef(uid))
}

export function hasActiveSessionWork(
  session: ActiveWorkout | null | undefined,
): boolean {
  if (!session) return false
  return session.exercises.length > 0 || Boolean(session.label?.trim())
}

export async function fetchRemoteSessionHasWork(uid: string): Promise<boolean> {
  const snap = await getDoc(activeSessionRef(uid)).catch(() => null)
  if (!snap?.exists()) return false
  const data = snap.data()
  const exercises = Array.isArray(data?.exercises) ? data.exercises : []
  return exercises.length > 0 || (typeof data?.label === 'string' && data.label.trim().length > 0)
}

function parseSessionDoc(data: Record<string, unknown>): ActiveWorkout {
  return {
    startedAt: typeof data.startedAt === 'number' ? data.startedAt : Date.now(),
    templateId: typeof data.templateId === 'string' && data.templateId ? data.templateId : null,
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
