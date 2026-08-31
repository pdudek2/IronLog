import { deleteDoc, doc, getDocFromServer, onSnapshot, runTransaction, type Unsubscribe } from 'firebase/firestore'
import { db } from './firebase'
import { stripWorkoutClientIds, type ActiveWorkout, type ExerciseSource } from '../store/workoutStore'
import { normalizeSessionId } from './sessionIdentity'

export interface ActiveSessionSnapshot {
  session: ActiveWorkout | null
  sessionRevision: string | null
  fromCache: boolean
  hasPendingWrites: boolean
}

export interface SavedActiveSession {
  sessionRevision: string
}

export interface LoadedActiveSession {
  session: ActiveWorkout | null
  sessionRevision: string | null
}

export interface ClaimedActiveSession {
  session: ActiveWorkout
  sessionRevision: string | null
}

export class ActiveSessionConflictError extends Error {
  constructor() {
    super('The active session changed on the server.')
    this.name = 'ActiveSessionConflictError'
  }
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
    (snap) => {
      const data = snap.exists() ? snap.data() : null
      onChange({
        session: data ? parseSessionDoc(uid, data) : null,
        sessionRevision: readSessionRevision(data),
        fromCache: snap.metadata.fromCache,
        hasPendingWrites: snap.metadata.hasPendingWrites,
      })
    },
    (error) => onError?.(error),
  )
}

export async function saveActiveSession(
  uid: string,
  workout: ActiveWorkout,
  expectedRevision: string | null,
): Promise<SavedActiveSession> {
  const ref = activeSessionRef(uid)
  const sessionRevision = crypto.randomUUID()
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref)
    const data = snapshot.exists() ? snapshot.data() : null
    const storedSessionId = data && typeof data.sessionId === 'string' ? data.sessionId : null
    if (
      (snapshot.exists() && storedSessionId !== workout.sessionId)
      || readSessionRevision(data) !== expectedRevision
    ) throw new ActiveSessionConflictError()

    transaction.set(ref, activeSessionDocument(uid, workout, sessionRevision))
  })
  return { sessionRevision }
}

export async function claimActiveSession(uid: string, candidate: ActiveWorkout): Promise<ClaimedActiveSession> {
  const ref = activeSessionRef(uid)
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (snapshot.exists()) {
      const data = snapshot.data()
      return {
        session: parseSessionDoc(uid, data),
        sessionRevision: readSessionRevision(data),
      }
    }
    const sessionRevision = crypto.randomUUID()
    transaction.set(ref, activeSessionDocument(uid, candidate, sessionRevision))
    return { session: candidate, sessionRevision }
  })
}

export async function loadActiveSessionFromServer(uid: string): Promise<LoadedActiveSession> {
  const snapshot = await getDocFromServer(activeSessionRef(uid))
  if (!snapshot.exists()) return { session: null, sessionRevision: null }
  const data = snapshot.data()
  return {
    session: parseSessionDoc(uid, data),
    sessionRevision: readSessionRevision(data),
  }
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

function readSessionRevision(data: Record<string, unknown> | null): string | null {
  return data && typeof data.sessionRevision === 'string' && data.sessionRevision
    ? data.sessionRevision
    : null
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
