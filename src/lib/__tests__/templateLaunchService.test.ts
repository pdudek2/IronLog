import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../exerciseDetailService', () => ({ getExerciseSessions: vi.fn() }))
vi.mock('../activeSessionService', () => ({
  persistTemplateLaunchSession: vi.fn(),
  saveActiveSession: vi.fn(),
}))

import { persistTemplateLaunchSession, saveActiveSession } from '../activeSessionService'
import { getExerciseSessions } from '../exerciseDetailService'
import { createPersistedTemplateWorkout } from '../templateLaunchService'
import type { WorkoutTemplate } from '../templateService'

function templateWithDuplicateExercise(): WorkoutTemplate {
  const exercise = {
    exerciseId: 'incline-bench-press',
    exerciseSource: 'global' as const,
    name: 'Incline Bench Press',
    sets: 3,
    targetReps: 8,
    targetWeight: 30,
  }
  return {
    id: 'template-1',
    userId: 'user-1',
    name: 'Upper',
    createdAt: 1,
    updatedAt: 2,
    days: [{ name: 'Dzień 1', exercises: [exercise, { ...exercise }] }],
  }
}

function templateWithTargets(): WorkoutTemplate {
  return {
    id: 'template-2',
    userId: 'user-1',
    name: 'Lower',
    createdAt: 1,
    updatedAt: 2,
    days: [{
      name: 'Dzień 1',
      exercises: [{
        exerciseId: 'squat',
        exerciseSource: 'global',
        name: 'Squat',
        sets: 3,
        targetReps: 5,
        targetWeight: 100,
      }],
    }],
  }
}

describe('createPersistedTemplateWorkout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(saveActiveSession).mockResolvedValue()
    vi.mocked(persistTemplateLaunchSession).mockResolvedValue()
    vi.mocked(getExerciseSessions).mockResolvedValue([])
  })

  it('loads each unique exercise once and persists history-backed values', async () => {
    vi.mocked(getExerciseSessions).mockResolvedValue([{
      id: 'session-1',
      workoutId: 'workout-1',
      startedAt: 10,
      label: 'Upper',
      totalSets: 3,
      totalReps: 18,
      totalVolume: 765,
      bestSetWeight: 42.5,
      bestSetReps: 6,
      sets: [{ weight: 42.5, reps: 6 }],
    }])

    const workout = await createPersistedTemplateWorkout(
      'user-1',
      templateWithDuplicateExercise(),
      0,
      false,
    )

    expect(getExerciseSessions).toHaveBeenCalledTimes(1)
    expect(getExerciseSessions).toHaveBeenCalledWith('user-1', 'incline-bench-press', 'global', 1)
    expect(workout.exercises[0].sets[0]).toEqual({ weight: '42.5', reps: '6', done: false })
    expect(persistTemplateLaunchSession).toHaveBeenCalledWith('user-1', workout, false)
    expect(saveActiveSession).not.toHaveBeenCalled()
  })

  it('falls back to template targets and forwards replacement intent', async () => {
    vi.mocked(getExerciseSessions).mockRejectedValue(new Error('history unavailable'))

    const workout = await createPersistedTemplateWorkout('user-1', templateWithTargets(), 0, true)

    expect(workout.exercises[0].sets[0]).toEqual({ weight: '100', reps: '5', done: false })
    expect(persistTemplateLaunchSession).toHaveBeenCalledWith('user-1', workout, true)
  })

  it('rejects without returning a workout when persistence fails', async () => {
    vi.mocked(persistTemplateLaunchSession).mockRejectedValue(new Error('write failed'))

    await expect(
      createPersistedTemplateWorkout('user-1', templateWithTargets(), 0, false),
    ).rejects.toThrow('write failed')
  })
})
