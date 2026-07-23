import { describe, expect, it } from 'vitest'

import {
  MAX_SETS_PER_EXERCISE,
  MAX_WORKOUT_EXERCISES,
  buildExerciseSessionDocumentId,
  normalizeWorkoutExercises,
  parseFinalizeWorkoutInput,
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

const validFinalizeBody = {
  sessionId: 'session-1',
  templateId: null,
  startedAt: 1_790_000_000_000,
  finishedAt: 1_790_003_600_000,
  label: ' Push ',
  exercises: [validExercise],
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

describe('parseFinalizeWorkoutInput', () => {
  it('normalizes a valid finalize body', () => {
    expect(parseFinalizeWorkoutInput(validFinalizeBody)).toEqual({
      sessionId: 'session-1',
      templateId: null,
      startedAt: 1_790_000_000_000,
      finishedAt: 1_790_003_600_000,
      label: 'Push',
      exercises: [{
        exerciseId: 'bench-press',
        exerciseSource: 'global',
        name: 'Bench Press',
        sets: [
          { weight: 80.5, reps: 5 },
          { weight: 75, reps: 8 },
        ],
      }],
    })
  })

  it.each([
    [{ ...validFinalizeBody, sessionId: undefined }, 'Brak pola sessionId.'],
    [{ ...validFinalizeBody, sessionId: 'unsafe/session' }, 'Niepoprawne pole sessionId.'],
    [{ ...validFinalizeBody, exercises: [{ ...validExercise, exerciseSource: 'shared' }] }, 'Niepoprawne źródło ćwiczenia.'],
    [{ ...validFinalizeBody, exercises: [{ ...validExercise, sets: [{ weight: -1, reps: 5 }] }] }, 'Niepoprawny ciężar w serii.'],
    [{ ...validFinalizeBody, label: 'x'.repeat(121) }, 'Nazwa treningu jest za długa.'],
    [{ ...validFinalizeBody, finishedAt: validFinalizeBody.startedAt - 1 }, 'Czas zakończenia nie może poprzedzać rozpoczęcia.'],
    [{ ...validFinalizeBody, finishedAt: validFinalizeBody.startedAt + 12 * 60 * 60 * 1000 + 1 }, 'Czas treningu przekracza dozwolony limit.'],
  ])('rejects invalid finalize input', (body, message) => {
    expect(() => parseFinalizeWorkoutInput(body)).toThrow(message)
  })

  it.each(['userId', 'materialized', 'closedAt'])('rejects request-supplied %s', (field) => {
    expect(() => parseFinalizeWorkoutInput({ ...validFinalizeBody, [field]: field === 'materialized' ? true : 'value' }))
      .toThrow(`Nieoczekiwane pole ${field}.`)
  })
})
