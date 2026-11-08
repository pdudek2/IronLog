import type { Firestore } from 'firebase-admin/firestore'
import { createHash } from 'node:crypto'
import { adminDb } from './firebaseAdmin.js'
import { ApiError } from './errors.js'
import { parseSaveTemplateRequest } from './templateService.js'
import { validateFirestoreDocumentId, validateExerciseId, validateExerciseSource, validateExerciseName } from './workoutValidation.js'
import { GROUP_PATTERN, parseCompressionRecord, parseProposals } from '../../src/shared/compressionRecord.js'

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
    ...optional('compression', input.compression, parseCompressionRecord),
    ...optional('proposals', input.proposals, parseProposals),
    exercises: input.exercises.map(rawExercise => {
      const exercise = object(rawExercise)
      if (!Array.isArray(exercise.sets) || !exercise.sets.length || exercise.sets.length > 20) throw new ApiError(400, 'Invalid sets.')
      if (exercise.group !== undefined && (typeof exercise.group !== 'string' || !GROUP_PATTERN.test(exercise.group))) throw new ApiError(400, 'Invalid exercise group.')
      return { clientId: uniqueId(exercise.clientId), exerciseId: validateExerciseId(exercise.exerciseId), exerciseSource: validateExerciseSource(exercise.exerciseSource), name: validateExerciseName(exercise.name),
        ...(exercise.group === undefined ? {} : { group: exercise.group }),
        sets: exercise.sets.map(rawSet => { const set = object(rawSet); if (set.done !== false) throw new ApiError(400, 'New sets must be unfinished.'); return { clientId: uniqueId(set.clientId), weight: numeric(set.weight, 2000), reps: numeric(set.reps, 1000, true), done: false } }) }
    }),
  }
  if (candidate.sessionId === replaces.sessionId) throw new ApiError(400, 'Replacement requires a new session.')
  return { replaces, candidate, selection }
}
function optional<K extends string, T>(key: K, raw: unknown, parse: (raw: unknown) => T | null): { [P in K]?: T } {
  if (raw === undefined) return {}
  const value = parse(raw)
  if (value === null) throw new ApiError(400, `Invalid ${key}.`)
  return { [key]: value } as { [P in K]?: T }
}
// A compressed day launches a reordered subset of the plan day; the same exercise may appear twice in both.
function isSubsetOfDay(day: { exerciseId: string; exerciseSource: string }[], candidate: { exerciseId: string; exerciseSource: string }[]): boolean {
  const left = new Map<string, number>()
  for (const exercise of day) left.set(`${exercise.exerciseSource}:${exercise.exerciseId}`, (left.get(`${exercise.exerciseSource}:${exercise.exerciseId}`) ?? 0) + 1)
  return candidate.every((exercise) => {
    const key = `${exercise.exerciseSource}:${exercise.exerciseId}`
    const count = left.get(key) ?? 0
    left.set(key, count - 1)
    return count > 0
  })
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
    const { id: planDayId, ...day } = parsed.days[selection.dayIndex] ?? { id: null }
    // The fingerprint leaves the day id out, so clients that predate day ids still match.
    if (!planDayId || !('exercises' in day) || JSON.stringify({ name: parsed.name, day }) !== selection.fingerprint
      || !isSubsetOfDay(day.exercises, candidate.exercises)) throw conflict()
    const now = (options.now ?? Date.now)()
    transaction.create(oldRef, { userId: uid, sessionId: replaces.sessionId, outcome: 'discarded', workoutId: null, closedAt: now,
      replacementId: candidate.sessionId, replacementDigest: digest })
    transaction.set(activeRef, { ...candidate, planDayId, userId: uid, updatedAt: now })
  })
  return { status: 'replaced' as const, sessionId: candidate.sessionId }
}
