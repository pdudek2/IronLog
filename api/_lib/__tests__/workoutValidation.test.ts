import { describe, expect, it } from 'vitest'

import {
  MAX_SETS_PER_EXERCISE,
  MAX_WORKOUT_EXERCISES,
  buildExerciseSessionDocumentId,
  buildFinishedWorkoutFromActiveSession,
  normalizeWorkoutExercises,
  parseFinalizeWorkoutRequest,
  validateFirestoreDocumentId,
  validateWorkoutLabel,
} from '../workoutValidation.js'

const validExercise = {
  exerciseId: 'bench-press',
  exerciseSource: 'global',
  name: ' Bench Press ',
  sets: [
    { weight: '80.5', reps: '5' },
    { weightKg: 75, reps: 8 },
  ],
}

const activeDraft = {
  userId: 'user-1',
  sessionId: 'session-1',
  sessionRevision: '00000000-0000-4000-8000-000000000001',
  startedAt: 1_790_000_000_000,
  templateId: null,
  label: ' Push ',
  exercises: [{
    exerciseId: 'bench-press',
    exerciseSource: 'global',
    name: 'Bench Press',
    sets: [
      { weight: '80.5', reps: '5', done: true },
      { weight: '90', reps: '3', done: false },
    ],
  }],
}

describe('normalizeWorkoutExercises', () => {
  it('normalizes valid workout exercises without silently dropping data', () => {
    expect(normalizeWorkoutExercises([validExercise])).toEqual([
      {
        exerciseId: 'bench-press',
        exerciseSource: 'global',
        name: 'Bench Press',
        sets: [
          { weight: 80.5, reps: 5 },
          { weight: 75, reps: 8 },
        ],
      },
    ])
  })

  it('rejects payloads with too many exercises', () => {
    const exercises = Array.from({ length: MAX_WORKOUT_EXERCISES + 1 }, () => validExercise)

    expect(() => normalizeWorkoutExercises(exercises)).toThrow('Too many exercises in the workout.')
  })

  it('rejects exercises with too many sets', () => {
    const exercise = {
      ...validExercise,
      sets: Array.from({ length: MAX_SETS_PER_EXERCISE + 1 }, () => ({ weight: 20, reps: 10 })),
    }

    expect(() => normalizeWorkoutExercises([exercise])).toThrow('Too many sets in the exercise.')
  })

  it('rejects invalid exercise sources instead of coercing them to global', () => {
    expect(() => normalizeWorkoutExercises([{ ...validExercise, exerciseSource: 'shared' }]))
      .toThrow('Invalid exercise source.')
  })

  it('rejects unsafe exercise IDs', () => {
    expect(() => normalizeWorkoutExercises([{ ...validExercise, exerciseId: 'global/bench-press' }]))
      .toThrow('Invalid exercise ID.')
  })

  it('rejects out-of-range set values', () => {
    expect(() => normalizeWorkoutExercises([{ ...validExercise, sets: [{ weight: -1, reps: 5 }] }]))
      .toThrow('Invalid set weight.')

    expect(() => normalizeWorkoutExercises([{ ...validExercise, sets: [{ weight: 80, reps: 0 }] }]))
      .toThrow('Invalid set reps.')
  })
})

describe('validateWorkoutLabel', () => {
  it('normalizes blank labels to null', () => {
    expect(validateWorkoutLabel('   ')).toBeNull()
    expect(validateWorkoutLabel(null)).toBeNull()
  })

  it('rejects labels above the storage limit', () => {
    expect(() => validateWorkoutLabel('x'.repeat(121))).toThrow('Workout name is too long.')
  })
})

describe('validateFirestoreDocumentId', () => {
  it('rejects path-like document IDs before they reach Firestore', () => {
    expect(() => validateFirestoreDocumentId('workouts/abc', 'workoutId'))
      .toThrow('Invalid field workoutId.')
  })
})

describe('buildExerciseSessionDocumentId', () => {
  it('does not embed the raw exercise ID in Firestore document IDs', () => {
    const id = buildExerciseSessionDocumentId('workout-1', 'global', 'bench-press', 0)

    expect(id).toMatch(/^workout-1_global_0_[a-f0-9]{24}$/)
    expect(id).not.toContain('bench-press')
  })
})

describe('parseFinalizeWorkoutRequest', () => {
  it('returns the closure identity and requires the revision the client saw', () => {
    expect(parseFinalizeWorkoutRequest({ sessionId: 'session-1', sessionRevision: '00000000-0000-4000-8000-000000000001' })).toEqual({
      sessionId: 'session-1',
      sessionRevision: '00000000-0000-4000-8000-000000000001',
    })
    expect(() => parseFinalizeWorkoutRequest({ sessionId: 'session-1' })).toThrow('Missing sessionRevision field.')
  })

  it.each(['exercises', 'label', 'userId', 'materialized', 'closedAt'])('rejects request-supplied %s', (field) => {
    const body = { sessionId: 'session-1', sessionRevision: 'revision-1', [field]: field === 'materialized' ? true : 'value' }
    expect(() => parseFinalizeWorkoutRequest(body)).toThrow(`Unexpected field ${field}.`)
  })
})

describe('buildFinishedWorkoutFromActiveSession', () => {
  it('builds history only from completed active-session sets', () => {
    expect(buildFinishedWorkoutFromActiveSession(activeDraft, 1_790_003_600_000)).toEqual({
      sessionId: 'session-1',
      templateId: null,
      planDayId: null,
      startedAt: 1_790_000_000_000,
      finishedAt: 1_790_003_600_000,
      label: 'Push',
      exercises: [{
        exerciseId: 'bench-press',
        exerciseSource: 'global',
        name: 'Bench Press',
        sets: [{ weight: 80.5, reps: 5 }],
      }],
    })
  })

  it('keeps the plan day and set times from the device clock, dropping a time a wrong clock puts out of range', () => {
    const start = activeDraft.startedAt
    const draft = {
      ...activeDraft,
      planDayId: 'upper-a',
      exercises: [{
        ...activeDraft.exercises[0],
        sets: [
          { weight: '80', reps: '5', done: true, completedAt: start + 60_000 },
          { weight: '80', reps: '5', done: true, completedAt: start - 10 * 60_000 },
          { weight: '80', reps: '5', done: true, completedAt: start + 13 * 60 * 60_000 },
          { weight: '80', reps: '5', done: true, completedAt: 'soon' },
          { weight: '80', reps: '5', done: false, completedAt: start + 120_000 },
        ],
      }],
    }
    const finished = buildFinishedWorkoutFromActiveSession(draft, start + 60 * 60_000)
    expect(finished.planDayId).toBe('upper-a')
    expect(finished.exercises[0]!.sets).toEqual([
      { weight: 80, reps: 5, completedAt: start + 60_000 },
      { weight: 80, reps: 5 },
      { weight: 80, reps: 5 },
      { weight: 80, reps: 5 },
    ])
    expect(buildFinishedWorkoutFromActiveSession({ ...activeDraft, planDayId: 'not/an id' }, start + 1).planDayId).toBeNull()
  })

  it('carries the compression record, proposals and groups, and nulls a malformed record', () => {
    const start = activeDraft.startedAt
    const compression = { v: 1, budgetMin: 45, mode: 'compressed', shortRest: false, estimateMin: 43.9, fullEstimateMin: 60.7, factor: 1.2, samples: 0, calibration: 'none', readiness: null,
      exercises: [{ dayExerciseIndex: 0, exerciseId: 'bench-press', exerciseSource: 'global', plannedSets: 4, sets: 3 }] }
    const proposals = [{ budgetMin: 45, mode: 'compressed' }]
    const draft = { ...activeDraft, compression, proposals, exercises: [{ ...activeDraft.exercises[0], group: 'g1' }] }
    const finished = buildFinishedWorkoutFromActiveSession(draft, start + 1)
    expect(finished).toMatchObject({ compression, proposals })
    expect(finished.exercises[0]!.group).toBe('g1')
    expect(buildFinishedWorkoutFromActiveSession(activeDraft, start + 1)).not.toHaveProperty('compression')
    const bad = buildFinishedWorkoutFromActiveSession({ ...draft, compression: { ...compression, v: 2 }, proposals: 'x', exercises: [{ ...activeDraft.exercises[0], group: 'not a group!' }] }, start + 1)
    expect(bad).toMatchObject({ compression: null, proposals: null })
    expect(bad.exercises[0]).not.toHaveProperty('group')
  })

  it('rejects a draft without any completed set', () => {
    const empty = {
      ...activeDraft,
      exercises: activeDraft.exercises.map((exercise) => ({
        ...exercise,
        sets: exercise.sets.map((set) => ({ ...set, done: false })),
      })),
    }

    expect(() => buildFinishedWorkoutFromActiveSession(empty, 1_790_003_600_000))
      .toThrow('A workout must contain at least one exercise.')
  })

  it('rejects a malformed completed set in the canonical active draft', () => {
    const malformed = {
      ...activeDraft,
      exercises: [{
        ...activeDraft.exercises[0],
        sets: [{ weight: 'not-a-weight', reps: '5', done: true }],
      }],
    }

    expect(() => buildFinishedWorkoutFromActiveSession(malformed, 1_790_003_600_000))
      .toThrow('Invalid set weight.')
  })
})
