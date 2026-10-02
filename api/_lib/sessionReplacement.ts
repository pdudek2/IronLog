import type { Firestore } from 'firebase-admin/firestore'
import { createHash } from 'node:crypto'
import { adminDb } from './firebaseAdmin.js'
import { ApiError } from './errors.js'
import { parseSaveTemplateRequest } from './templateService.js'
import { validateFirestoreDocumentId, validateExerciseId, validateExerciseSource, validateExerciseName } from './workoutValidation.js'

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'Invalid replacement.')
  return value as Record<string, unknown>
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new ApiError(400, 'Invalid replacement value.')
  return value
}
function numeric(value: unknown, max: number, integral = false): string {
  if (value === '') return ''
  if (typeof value !== 'string' || !/^(?:\d+)(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value)) || Number(value) > max || (integral && !Number.isInteger(Number(value)))) throw new ApiError(400, 'Invalid set value.')
  return value
}
export function parseReplacement(raw: unknown) {
  const data = object(raw), from = object(data.replaces), input = object(data.candidate), selected = object(data.selection)
  const replaces = { sessionId: validateFirestoreDocumentId(from.sessionId, 'sessionId'), sessionRevision: validateFirestoreDocumentId(from.sessionRevision, 'sessionRevision') }
  const templateId = validateFirestoreDocumentId(input.templateId, 'templateId')
  if (selected.templateId !== templateId || typeof selected.fingerprint !== 'string' || selected.fingerprint.length > 100_000) throw new ApiError(400, 'Invalid selected plan.')
  const selection = { templateId, dayIndex: integer(selected.dayIndex, 0, 13), fingerprint: selected.fingerprint }
  if (!Array.isArray(input.exercises) || !input.exercises.length || input.exercises.length > 50) throw new ApiError(400, 'Invalid exercises.')
  const ids = new Set<string>()
  const uniqueId = (value: unknown) => { const id = validateFirestoreDocumentId(value, 'clientId'); if (ids.has(id)) throw new ApiError(400, 'Duplicate client ID.'); ids.add(id); return id }
  const candidate = {
    sessionId: validateFirestoreDocumentId(input.sessionId, 'sessionId'), sessionRevision: validateFirestoreDocumentId(input.sessionRevision, 'sessionRevision'),
    startedAt: integer(input.startedAt, 1, Number.MAX_SAFE_INTEGER), templateId,
    label: typeof input.label === 'string' && input.label.length <= 120 ? input.label : '',
    exercises: input.exercises.map(rawExercise => {
      const exercise = object(rawExercise)
      if (!Array.isArray(exercise.sets) || !exercise.sets.length || exercise.sets.length > 20) throw new ApiError(400, 'Invalid sets.')
      return { clientId: uniqueId(exercise.clientId), exerciseId: validateExerciseId(exercise.exerciseId), exerciseSource: validateExerciseSource(exercise.exerciseSource), name: validateExerciseName(exercise.name),
        sets: exercise.sets.map(rawSet => { const set = object(rawSet); if (set.done !== false) throw new ApiError(400, 'New sets must be unfinished.'); return { clientId: uniqueId(set.clientId), weight: numeric(set.weight, 2000), reps: numeric(set.reps, 1000, true), done: false } }) }
    }),
  }
  if (candidate.sessionId === replaces.sessionId) throw new ApiError(400, 'Replacement requires a new session.')
  return { replaces, candidate, selection }
}
export async function replaceSessionForUser(uid: string, raw: unknown, options: { db?: Firestore; now?: () => number } = {}) {
  const request = parseReplacement(raw)
  const { replaces, candidate, selection } = request
  const db = options.db ?? adminDb
  const digest = createHash('sha256').update(JSON.stringify(request)).digest('hex')
  const activeRef = db.collection('activeSessions').doc(uid)
  const oldRef = db.collection('closedSessions').doc(replaces.sessionId)
  const conflict = () => new ApiError(409, 'The session or plan changed. Review it before replacing.', { code: 'replacement_changed' })
  await db.runTransaction(async transaction => {
    const [active, old, oldWorkout, closed, workout, template] = await transaction.getAll(activeRef, oldRef,
      db.collection('workouts').doc(replaces.sessionId), db.collection('closedSessions').doc(candidate.sessionId),
      db.collection('workouts').doc(candidate.sessionId), db.collection('templates').doc(selection.templateId))
    const current = active.data(), receipt = old.data()
    // A receipt confirms only this immutable request; it never replays a closed/replaced candidate.
    if (receipt?.userId === uid && receipt.replacementId === candidate.sessionId && receipt.replacementDigest === digest) return
    if (old.exists || oldWorkout.exists || closed.exists || workout.exists || !current || current.userId !== uid
      || current.sessionId !== replaces.sessionId || current.sessionRevision !== replaces.sessionRevision) throw conflict()
    const stored = template.data()
    if (!stored || stored.userId !== uid) throw conflict()
    const parsed = parseSaveTemplateRequest({ name: stored.name, days: stored.days })
    const day = parsed.days[selection.dayIndex]
    if (!day || JSON.stringify({ name: parsed.name, day }) !== selection.fingerprint
      || day.exercises.length !== candidate.exercises.length
      || day.exercises.some((exercise, i) => exercise.exerciseId !== candidate.exercises[i].exerciseId || exercise.exerciseSource !== candidate.exercises[i].exerciseSource)) throw conflict()
    const now = (options.now ?? Date.now)()
    transaction.create(oldRef, { userId: uid, sessionId: replaces.sessionId, outcome: 'discarded', workoutId: null, closedAt: now,
      replacementId: candidate.sessionId, replacementDigest: digest })
    transaction.set(activeRef, { ...candidate, userId: uid, updatedAt: now })
  })
  return { status: 'replaced' as const, sessionId: candidate.sessionId }
}
