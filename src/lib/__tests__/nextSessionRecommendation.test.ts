import { describe, expect, it } from 'vitest'
import type { ReadinessEntry } from '../readinessService'
import type { WorkoutTemplate } from '../templateService'
import type { WorkoutSummary } from '../workoutService'
import { buildNextSessionRecommendation } from '../nextSessionRecommendation'

const NOW = Date.UTC(2026, 7, 10, 12)

const template: WorkoutTemplate = {
  id: 'upper-a',
  userId: 'user-1',
  name: 'Upper',
  createdAt: 1,
  updatedAt: 2,
  days: [{
    name: 'Upper A',
    exercises: [
      { exerciseId: 'bench', exerciseSource: 'global', name: 'Bench Press', sets: 4, targetReps: 8, targetWeight: 70 },
      { exerciseId: 'row', exerciseSource: 'global', name: 'Barbell Row', sets: 4, targetReps: 8, targetWeight: 60 },
      { exerciseId: 'ohp', exerciseSource: 'global', name: 'Overhead Press', sets: 3, targetReps: 10, targetWeight: 40 },
      { exerciseId: 'pulldown', exerciseSource: 'global', name: 'Lat Pulldown', sets: 3, targetReps: 12, targetWeight: 50 },
      { exerciseId: 'raise', exerciseSource: 'global', name: 'Lateral Raise', sets: 3, targetReps: 15, targetWeight: 10 },
    ],
  }],
}

const readiness = (values: Pick<ReadinessEntry, 'sleep' | 'mood' | 'soreness'>): ReadinessEntry => ({
  userId: 'user-1',
  date: '2026-08-10',
  createdAt: NOW,
  ...values,
})

function workout(
  id: string,
  finishedAt: number,
  exercises: WorkoutSummary['exercises'],
): WorkoutSummary {
  return {
    id,
    templateId: template.id,
    label: 'Upper A',
    startedAt: finishedAt - 3_600_000,
    finishedAt,
    materialized: true,
    exercises,
  }
}

const recentWorkouts: WorkoutSummary[] = [
  workout('latest', NOW - 86_400_000, [
    {
      exerciseId: 'bench',
      exerciseSource: 'global',
      name: 'Bench Press',
      sets: [
        { weight: 72.5, reps: 6 },
        { weight: 70, reps: 10 },
      ],
    },
    { exerciseId: 'row', exerciseSource: 'global', name: 'Barbell Row', sets: [{ weight: 67.5, reps: 8 }] },
  ]),
  workout('row-2', NOW - 3 * 86_400_000, [
    { exerciseId: 'row', exerciseSource: 'global', name: 'Barbell Row', sets: [{ weight: 67.5, reps: 8 }] },
  ]),
  workout('row-3', NOW - 6 * 86_400_000, [
    { exerciseId: 'row', exerciseSource: 'global', name: 'Barbell Row', sets: [{ weight: 65, reps: 8 }] },
  ]),
]

describe('buildNextSessionRecommendation', () => {
  it('applies progression and trims the final two exercises for mid readiness', () => {
    const recommendation = buildNextSessionRecommendation(
      template,
      0,
      readiness({ sleep: 3, mood: 3, soreness: 3 }),
      recentWorkouts,
      NOW,
    )

    expect(recommendation.dayName).toBe('Upper A')
    expect(recommendation.score).toBe(50)
    expect(recommendation.exercises.map(({ sets, weight, weightDelta, setsDelta }) => ({
      sets,
      weight,
      weightDelta,
      setsDelta,
    }))).toEqual([
      { sets: 4, weight: 72.5, weightDelta: 0, setsDelta: 0 },
      { sets: 4, weight: 70, weightDelta: 2.5, setsDelta: 0 },
      { sets: 3, weight: 40, weightDelta: 0, setsDelta: 0 },
      { sets: 2, weight: 50, weightDelta: 0, setsDelta: -1 },
      { sets: 2, weight: 10, weightDelta: 0, setsDelta: -1 },
    ])
    expect([...recommendation.overrides]).toEqual([
      ['global:bench', { sets: 4, weight: 72.5, reps: 6 }],
      ['global:row', { sets: 4, weight: 70, reps: 8 }],
      ['global:ohp', { sets: 3, weight: 40, reps: 10 }],
      ['global:pulldown', { sets: 2, weight: 50, reps: 12 }],
      ['global:raise', { sets: 2, weight: 10, reps: 15 }],
    ])
  })

  it('keeps the latest weight and trims every exercise for low readiness', () => {
    const recommendation = buildNextSessionRecommendation(
      template,
      0,
      readiness({ sleep: 1, mood: 2, soreness: 4 }),
      recentWorkouts,
      NOW,
    )

    expect(recommendation.tone).toBe('low')
    expect(recommendation.exercises[1]).toMatchObject({
      sets: 3,
      weight: 67.5,
      weightDelta: 0,
      setsDelta: -1,
    })
    expect(recommendation.overrides.get('global:row')).toEqual({
      sets: 3,
      weight: 67.5,
      reps: 8,
    })
    expect([...recommendation.overrides.values()]).toHaveLength(5)
  })
})
