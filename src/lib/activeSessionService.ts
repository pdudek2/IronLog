import { deleteDoc, doc, getDocFromServer, onSnapshot, runTransaction, setDoc, type Unsubscribe } from 'firebase/firestore'
import { db } from './firebase'
import { stripWorkoutClientIds, type ActiveWorkout, type ExerciseSource } from '../store/workoutStore'
import { normalizeSessionId } from './sessionIdentity'

interface ActiveSessionSnapshot {
  session: ActiveWorkout | null
  fromCache: boolean
  hasPendingWrites: boolean
}

export interface SavedActiveSession {
  sessionRevision: string
}

export class TemplateLaunchConflictError extends Error {
  constructor() {
    super('An active workout already contains work.')
    this.name = 'TemplateLaunchConflictError'
  }
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
      session: snap.exists() ? parseSessionDoc(uid, snap.data()) : null,
      fromCache: snap.metadata.fromCache,
      hasPendingWrites: snap.metadata.hasPendingWrites,
    }),
    (error) => onError?.(error),
  )
}

export async function saveActiveSession(
  uid: string,
  workout: ActiveWorkout,
): Promise<SavedActiveSession> {
  const sessionRevision = crypto.randomUUID()
  await setDoc(activeSessionRef(uid), activeSessionDocument(uid, workout, sessionRevision))
  return { sessionRevision }
}

export async function claimActiveSession(uid: string, candidate: ActiveWorkout): Promise<ActiveWorkout> {
  const ref = activeSessionRef(uid)
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (snapshot.exists()) return parseSessionDoc(uid, snapshot.data())
    transaction.set(ref, activeSessionDocument(uid, candidate))
    return candidate
  })
}

export async function loadActiveSessionFromServer(uid: string): Promise<ActiveWorkout | null> {
  const snapshot = await getDocFromServer(activeSessionRef(uid))
  return snapshot.exists() ? parseSessionDoc(uid, snapshot.data()) : null
}

export async function persistTemplateLaunchSession(
  uid: string,
  workout: ActiveWorkout,
  replaceExisting: boolean,
): Promise<void> {
  const ref = activeSessionRef(uid)

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!replaceExisting && snapshot.exists() && sessionDocumentHasWork(snapshot.data())) {
      throw new TemplateLaunchConflictError()
    }

    transaction.set(ref, activeSessionDocument(uid, workout))
  })
}

function activeSessionDocument(
  uid: string,
  workout: ActiveWorkout,
  sessionRevision = crypto.randomUUID(),
) {
  const persistableWorkout = stripWorkoutClientIds(workout)
  return {
    userId: uid,
    sessionId: persistableWorkout.sessionId,
    sessionRevision,
    startedAt: persistableWorkout.startedAt,
    templateId: typeof persistableWorkout.templateId === 'string' ? persistableWorkout.templateId : null,
    label: persistableWorkout.label?.trim() || null,
    exercises: persistableWorkout.exercises,
    updatedAt: Date.now(),
  }
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

function sessionDocumentHasWork(data: Record<string, unknown>): boolean {
  const exercises = Array.isArray(data?.exercises) ? data.exercises : []
  return exercises.length > 0 || (typeof data?.label === 'string' && data.label.trim().length > 0)
}

function parseSessionDoc(uid: string, data: Record<string, unknown>): ActiveWorkout {
  const startedAt = typeof data.startedAt === 'number' ? data.startedAt : Date.now()
  return {
    sessionId: normalizeSessionId(data.sessionId, uid, startedAt),
    startedAt,
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
