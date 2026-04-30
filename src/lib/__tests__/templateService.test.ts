import { describe, expect, it, vi } from 'vitest'

vi.mock('../firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
}))

import {
  buildActiveWorkoutFromTemplate,
  templateExerciseKey,
  type WorkoutTemplate,
} from '../templateService'

function template(overrides: Partial<WorkoutTemplate> = {}): WorkoutTemplate {
  return {
    id: 'template-1',
    userId: 'user-1',
    name: 'Upper',
    createdAt: 1,
    updatedAt: 2,
    days: [{
      name: 'Dzień 1',
      exercises: [{
        exerciseId: 'incline-bench-press',
        exerciseSource: 'global',
        name: 'Incline Bench Press',
        sets: 3,
        targetReps: 8,
        targetWeight: 0,
      }],
    }],
    ...overrides,
  }
}

describe('buildActiveWorkoutFromTemplate', () => {
  it('uses recent exercise history before template targets', () => {
    const workout = buildActiveWorkoutFromTemplate(
      template(),
      0,
      new Map([
        [templateExerciseKey('incline-bench-press', 'global'), {
          bestSetWeight: 42.5,
          bestSetReps: 6,
        }],
      ]),
    )

    expect(workout.exercises[0].sets).toEqual([
      { weight: '42.5', reps: '6', done: false },
      { weight: '42.5', reps: '6', done: false },
      { weight: '42.5', reps: '6', done: false },
    ])
  })

  it('falls back to template targets when there is no recent history', () => {
    const workout = buildActiveWorkoutFromTemplate(template({
      days: [{
        name: 'Dzień 1',
        exercises: [{
          exerciseId: 'squat',
          exerciseSource: 'global',
          name: 'Squat',
          sets: 2,
          targetReps: 5,
          targetWeight: 100,
        }],
      }],
    }))

    expect(workout.exercises[0].sets).toEqual([
      { weight: '100', reps: '5', done: false },
      { weight: '100', reps: '5', done: false },
    ])
  })
})
