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

const legacyFinalizeBody = {
  sessionId: 'session-1',
  sessionRevision: '00000000-0000-4000-8000-000000000001',
  templateId: 'attacker-template',
  startedAt: 1,
  finishedAt: 2,
  label: 'Client value must be ignored',
  exercises: [validExercise],
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

    expect(() => normalizeWorkoutExercises(exercises)).toThrow('Za dużo ćwiczeń w treningu.')
  })

  it('rejects exercises with too many sets', () => {
    const exercise = {
      ...validExercise,
      sets: Array.from({ length: MAX_SETS_PER_EXERCISE + 1 }, () => ({ weight: 20, reps: 10 })),
    }

    expect(() => normalizeWorkoutExercises([exercise])).toThrow('Za dużo serii w ćwiczeniu.')
  })

  it('rejects invalid exercise sources instead of coercing them to global', () => {
    expect(() => normalizeWorkoutExercises([{ ...validExercise, exerciseSource: 'shared' }]))
      .toThrow('Niepoprawne źródło ćwiczenia.')
  })

  it('rejects unsafe exercise IDs', () => {
    expect(() => normalizeWorkoutExercises([{ ...validExercise, exerciseId: 'global/bench-press' }]))
      .toThrow('Niepoprawny identyfikator ćwiczenia.')
  })

  it('rejects out-of-range set values', () => {
    expect(() => normalizeWorkoutExercises([{ ...validExercise, sets: [{ weight: -1, reps: 5 }] }]))
      .toThrow('Niepoprawny ciężar w serii.')

    expect(() => normalizeWorkoutExercises([{ ...validExercise, sets: [{ weight: 80, reps: 0 }] }]))
      .toThrow('Niepoprawna liczba powtórzeń w serii.')
  })
})

describe('validateWorkoutLabel', () => {
  it('normalizes blank labels to null', () => {
    expect(validateWorkoutLabel('   ')).toBeNull()
    expect(validateWorkoutLabel(null)).toBeNull()
  })

  it('rejects labels above the storage limit', () => {
    expect(() => validateWorkoutLabel('x'.repeat(121))).toThrow('Nazwa treningu jest za długa.')
  })
})

describe('validateFirestoreDocumentId', () => {
  it('rejects path-like document IDs before they reach Firestore', () => {
    expect(() => validateFirestoreDocumentId('workouts/abc', 'workoutId'))
      .toThrow('Niepoprawne pole workoutId.')
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
  it('returns only the closure identity from a compatibility request', () => {
    expect(parseFinalizeWorkoutRequest(legacyFinalizeBody)).toEqual({
      sessionId: 'session-1',
      sessionRevision: '00000000-0000-4000-8000-000000000001',
    })
  })

  it('accepts an unfenced legacy request only in compatibility mode', () => {
    expect(parseFinalizeWorkoutRequest({ ...legacyFinalizeBody, sessionRevision: undefined }))
      .toEqual({ sessionId: 'session-1' })
    expect(() => parseFinalizeWorkoutRequest({ sessionId: 'session-1' }, { requireRevision: true }))
      .toThrow('Brak pola sessionRevision.')
  })

  it.each(['userId', 'materialized', 'closedAt'])('rejects request-supplied %s', (field) => {
    expect(() => parseFinalizeWorkoutRequest({ ...legacyFinalizeBody, [field]: field === 'materialized' ? true : 'value' }))
      .toThrow(`Nieoczekiwane pole ${field}.`)
  })
})

describe('buildFinishedWorkoutFromActiveSession', () => {
  it('builds history only from completed active-session sets', () => {
    expect(buildFinishedWorkoutFromActiveSession(activeDraft, 1_790_003_600_000)).toEqual({
      sessionId: 'session-1',
      templateId: null,
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

  it('rejects a draft without any completed set', () => {
    const empty = {
      ...activeDraft,
      exercises: activeDraft.exercises.map((exercise) => ({
        ...exercise,
        sets: exercise.sets.map((set) => ({ ...set, done: false })),
      })),
    }

    expect(() => buildFinishedWorkoutFromActiveSession(empty, 1_790_003_600_000))
      .toThrow('Trening musi zawierać co najmniej jedno ćwiczenie.')
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
      .toThrow('Niepoprawny ciężar w serii.')
  })
})
