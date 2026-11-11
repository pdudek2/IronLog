import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { importWorkoutsForUser, parseImportWorkoutsRequest } from '../../api/_lib/historyImport'
import { finalizeWorkoutForUser } from '../../api/_lib/workoutClosure'
import { deleteFinishedWorkoutForUser } from '../../api/_lib/workoutProjection'
import { clearReviewAdminDatabase, closeReviewAdminDatabase, getReviewAdminDatabase } from '../review/support/adminReviewDatabase'

const db = getReviewAdminDatabase()
const NOW = Date.UTC(2026, 10, 11, 12)
const USER = 'import-user'
const OTHER = 'finish-user'
const squat = (sets: [number, number][]) => ({ exerciseId: 'squat', exerciseSource: 'global', name: 'Squat', sets: sets.map(([weight, reps]) => ({ weight, reps })) })
const bench = (sets: [number, number][]) => ({ exerciseId: 'bench-press', exerciseSource: 'global', name: 'Bench Press', sets: sets.map(([weight, reps]) => ({ weight, reps })) })
const body = (importId: string) => ({
  importId,
  workouts: [
    { key: '2026-04-06|127', startedAt: Date.UTC(2026, 3, 6, 10), label: 'Upper', exercises: [bench([[60, 8], [62.5, 6]])] },
    { key: '2026-04-07|128', startedAt: Date.UTC(2026, 3, 7, 10), label: 'Lower', exercises: [squat([[70, 8], [75, 8]])] },
  ],
})
const run = (importId = 'run-1', options = {}) => importWorkoutsForUser(USER, parseImportWorkoutsRequest(body(importId), NOW), { db, now: () => NOW, ...options })
const count = async (collection: string, userId = USER) => (await db.collection(collection).where('userId', '==', userId).get()).size
const records = async (userId: string) => (await db.collection('records').where('userId', '==', userId).get()).docs
  .map((doc) => {
    // Owner, ids and times differ between the two accounts; the record values must not.
    const rest = { ...doc.data() }
    for (const field of ['userId', 'updatedAt', 'lastWorkoutId', 'lastPerformedAt']) delete rest[field]
    return [doc.id.slice(userId.length), rest] as const
  })
  .sort(([a], [b]) => a.localeCompare(b))

beforeEach(clearReviewAdminDatabase)
afterEach(clearReviewAdminDatabase)
afterAll(closeReviewAdminDatabase)

describe('importWorkoutsForUser', () => {
  it('stores each workout as a finished one: workout, closure tombstone, exercise sessions and records', async () => {
    const { results } = await run()
    expect(results.map((result) => result.status)).toEqual(['created', 'created'])
    const stored = (await db.collection('workouts').doc(results[1]!.workoutId).get()).data()!
    expect(stored).toMatchObject({ userId: USER, startedAt: Date.UTC(2026, 3, 7, 10), finishedAt: Date.UTC(2026, 3, 7, 10), label: 'Lower', materialized: true, planDayId: null, templateId: null, imported: { source: 'csv', importId: 'run-1', at: NOW } })
    expect((await db.collection('closedSessions').doc(results[1]!.workoutId).get()).data()).toMatchObject({ userId: USER, outcome: 'finished', projectionState: 'ready' })
    expect(await count('exerciseSessions')).toBe(2)

    // The same workouts finished through the active session give the same records.
    for (const workout of body('x').workouts) {
      const sessionId = `finish-${workout.key.replace(/\W/g, '')}`
      await db.collection('activeSessions').doc(OTHER).set({ userId: OTHER, sessionId, sessionRevision: 'r1', startedAt: workout.startedAt, templateId: null, label: workout.label, updatedAt: workout.startedAt,
        exercises: workout.exercises.map((exercise) => ({ ...exercise, sets: exercise.sets.map((set) => ({ weight: String(set.weight), reps: String(set.reps), done: true })) })) })
      await finalizeWorkoutForUser(OTHER, { sessionId, sessionRevision: 'r1' }, { db, now: () => workout.startedAt + 3_600_000 })
    }
    expect(await records(USER)).toEqual(await records(OTHER))
    // A file has no end time, so the workout ends when it starts.
    expect((await db.collection('records').doc(`${USER}_global_squat`).get()).data()).toMatchObject({ lastPerformedAt: Date.UTC(2026, 3, 7, 10) })
  })

  it('adds nothing when the same run is sent again, and finishes a projection an interrupted run left pending', async () => {
    const failing = await run('run-1', { materialize: async () => { throw new Error('network') } })
    expect(failing.results.map((result) => result.status)).toEqual(['projection_pending', 'projection_pending'])
    expect(await count('exerciseSessions')).toBe(0)
    const retry = await run('run-1')
    expect(retry.results.map((result) => result.status)).toEqual(['exists', 'exists'])
    expect(retry.results.map((result) => result.workoutId)).toEqual(failing.results.map((result) => result.workoutId))
    expect([await count('workouts'), await count('exerciseSessions'), await count('records')]).toEqual([2, 2, 2])
    expect((await run('run-1')).results.map((result) => result.status)).toEqual(['exists', 'exists'])
  })

  it('can be undone through workout deletion, after which a new run imports the file again', async () => {
    const { results } = await run('run-1')
    for (const result of results) expect(await deleteFinishedWorkoutForUser(USER, result.workoutId, { db })).toEqual({ status: 'deleted' })
    expect([await count('workouts'), await count('exerciseSessions'), await count('records')]).toEqual([0, 0, 0])
    expect((await db.collection('closedSessions').doc(results[0]!.workoutId).get()).data()).toMatchObject({ projectionState: 'deleted' })
    expect((await run('run-1')).results.map((result) => result.status)).toEqual(['exists', 'exists'])
    expect(await count('workouts')).toBe(0)
    expect((await run('run-2')).results.map((result) => result.status)).toEqual(['created', 'created'])
    expect([await count('workouts'), await count('records')]).toEqual([2, 2])
  })
})
