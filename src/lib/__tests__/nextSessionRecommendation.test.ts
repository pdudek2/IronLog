import { describe, expect, it } from 'vitest'
import type { ReadinessEntry } from '../readinessService'
import type { WorkoutTemplate } from '../templateService'
import type { WorkoutSummary } from '../workoutService'
import { buildNextSessionRecommendation } from '../nextSessionRecommendation'
import { buildProgression } from '../../shared/progression'

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
    { exerciseId: 'row', exerciseSource: 'global', name: 'Barbell Row', sets: [67.5, 67.5, 67.5, 67.5].map((weight) => ({ weight, reps: 10 })) },
  ]),
  workout('row-2', NOW - 3 * 86_400_000, [
    { exerciseId: 'row', exerciseSource: 'global', name: 'Barbell Row', sets: [{ weight: 67.5, reps: 8 }] },
  ]),
  workout('row-3', NOW - 6 * 86_400_000, [
    { exerciseId: 'row', exerciseSource: 'global', name: 'Barbell Row', sets: [{ weight: 65, reps: 8 }] },
  ]),
]

describe('buildNextSessionRecommendation', () => {
  it('raises a lift that reached the top of its range, holds an ambiguous one and cuts no sets for mid readiness', () => {
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
      { sets: 3, weight: 50, weightDelta: 0, setsDelta: 0 },
      { sets: 3, weight: 10, weightDelta: 0, setsDelta: 0 },
    ])
    expect(recommendation.launch).toEqual([
      { dayExerciseIndex: 0, sets: 4, weight: 72.5, reps: 8 },
      { dayExerciseIndex: 1, sets: 4, weight: 70, reps: 6 },
      { dayExerciseIndex: 2, sets: 3, weight: 40, reps: 10 },
      { dayExerciseIndex: 3, sets: 3, weight: 50, reps: 12 },
      { dayExerciseIndex: 4, sets: 3, weight: 10, reps: 15 },
    ])
  })

  it('holds the weight at the top of the range and trims every exercise for low readiness', () => {
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
    expect(recommendation.launch[1]).toEqual({ dayExerciseIndex: 1, sets: 3, weight: 67.5, reps: 8 })
    expect(recommendation.launch).toHaveLength(5)
  })

  it('never takes the main lift below 2 sets on low readiness', () => {
    const exercise = (exerciseId: string, sets: number) => ({ exerciseId, exerciseSource: 'global' as const, name: exerciseId, sets, targetReps: 8, targetWeight: 50 })
    const plan = { ...template, days: [{ name: 'Upper', exercises: [exercise('db-lateral-raise', 3), exercise('bench-press', 2), exercise('lat-pulldown', 3)] }] }
    const recommendation = buildNextSessionRecommendation(plan, 0, readiness({ sleep: 1, mood: 2, soreness: 4 }), [], NOW)
    expect(recommendation.exercises.map((entry) => entry.sets)).toEqual([2, 2, 2])
  })
})

describe("today's launch on the Upper day", () => {
  const exercise = (exerciseId: string, sets: number, targetReps: number) => ({ exerciseId, exerciseSource: 'global' as const, name: exerciseId, sets, targetReps, targetWeight: 20 })
  const upper = { ...template, days: [{ id: 'upper', name: 'Upper', exercises: [
    exercise('bench-press', 4, 8), exercise('lat-pulldown', 3, 10), exercise('seated-cable-row', 3, 10),
    exercise('db-lateral-raise', 3, 12), exercise('db-curl', 3, 10), exercise('tricep-pushdown', 3, 12),
  ] }] }
  const day = { templateId: upper.id, planDayId: 'upper' }
  const done = (startedAt: number, plan: [string, number][], compression: WorkoutSummary['compression'] = null, groups: Record<string, string> = {}): WorkoutSummary => ({
    id: `w-${startedAt}`, templateId: upper.id, planDayId: 'upper', label: 'Upper', startedAt, finishedAt: startedAt + 7_200_000, materialized: true, compression,
    exercises: plan.map(([exerciseId, sets], index) => ({ exerciseId, exerciseSource: 'global', name: exerciseId, ...(groups[exerciseId] ? { group: groups[exerciseId] } : {}),
      sets: Array.from({ length: sets }, (_, set) => ({ weight: 20, reps: 8, completedAt: startedAt + (index * 4 + set + 1) * 150_000 })) })),
  })

  it('keeps the usual day without a record and without readiness', () => {
    const usual = buildNextSessionRecommendation(upper, 0, null, [], NOW, 'kg', day)
    expect(usual).toMatchObject({ tone: null, record: null, calibration: { source: 'none', factor: 1.2 } })
    expect(usual.launch.map((item) => [item.dayExerciseIndex, item.sets, item.group ?? null])).toEqual([[0, 4, null], [1, 3, null], [2, 3, null], [3, 3, null], [4, 3, null], [5, 3, null]])
  })

  it('launches the 45 min version with the circuit, and records it', () => {
    const at45 = buildNextSessionRecommendation(upper, 0, null, [], NOW, 'kg', { ...day, budgetMin: 45 })
    expect(at45.launch.map((item) => [item.dayExerciseIndex, item.sets, item.group ?? null])).toEqual([[0, 4, null], [1, 3, null], [3, 3, 'g1'], [4, 3, 'g1'], [5, 3, 'g1']])
    expect(at45.record).toMatchObject({ v: 1, budgetMin: 45, mode: 'compressed', shortRest: true, estimateMin: 43.9, fullEstimateMin: 60.7, calibration: 'none', readiness: null })
    expect(at45.record!.exercises.map((entry) => entry.sets)).toEqual([4, 3, 0, 3, 3, 3])
  })

  it('records a low-readiness start as readiness, and a chosen time that already fits too', () => {
    const low = buildNextSessionRecommendation(upper, 0, readiness({ sleep: 1, mood: 1, soreness: 5 }), [], NOW, 'kg', day)
    expect(low.record).toMatchObject({ budgetMin: null, mode: 'readiness', readiness: 'low' })
    expect(buildNextSessionRecommendation(upper, 0, null, [], NOW, 'kg', { ...day, budgetMin: 90 }).record).toMatchObject({ budgetMin: 90, mode: 'readiness' })
  })

  it('protects what the last workout of this day dropped, and learns the pace from this day first', () => {
    const lastRecord = buildNextSessionRecommendation(upper, 0, null, [], NOW, 'kg', { ...day, budgetMin: 45 }).record
    const history = [
      done(NOW - 2 * 86_400_000, [['bench-press', 4], ['lat-pulldown', 3], ['db-lateral-raise', 3], ['db-curl', 3], ['tricep-pushdown', 3]], lastRecord, { 'db-lateral-raise': 'g1', 'db-curl': 'g1', 'tricep-pushdown': 'g1' }),
      done(NOW - 5 * 86_400_000, [['bench-press', 4], ['lat-pulldown', 3], ['seated-cable-row', 3], ['db-lateral-raise', 3], ['db-curl', 3], ['tricep-pushdown', 3]]),
    ]
    const next = buildNextSessionRecommendation(upper, 0, null, history, NOW, 'kg', { ...day, budgetMin: 45 })
    expect(next.calibration).toMatchObject({ source: 'day', samples: 2 })
    expect(next.record!.exercises.find((entry) => entry.exerciseId === 'seated-cable-row')!.sets).toBeGreaterThan(0)
    expect(next.record!.exercises.find((entry) => entry.exerciseId === 'lat-pulldown')!.sets).toBe(0)
    const otherDay = buildNextSessionRecommendation(upper, 0, null, history, NOW, 'kg', { templateId: upper.id, planDayId: 'lower', budgetMin: 45 })
    expect(otherDay.calibration).toMatchObject({ source: 'user', samples: 2 })
  })

  it('holds the weight of an exercise the last start cut, like the session hint from exerciseSessions', () => {
    const cut = buildNextSessionRecommendation(upper, 0, null, [], NOW, 'kg', { ...day, budgetMin: 20 }).record
    const history = [done(NOW - 86_400_000, [['bench-press', 3], ['lat-pulldown', 1]], cut)]
    history[0]!.exercises[0]!.sets = history[0]!.exercises[0]!.sets.map((set) => ({ ...set, reps: 12 }))
    const train = buildNextSessionRecommendation(upper, 0, null, history, NOW, 'kg', day).exercises[0]!
    const session = buildProgression({ sessions: [{ finishedAt: history[0]!.finishedAt, sets: history[0]!.exercises[0]!.sets, shortened: true }], target: { reps: 8, sets: 4 }, equipment: 'barbell', units: 'kg', now: NOW })!
    expect(train).toMatchObject({ weight: 20, weightDelta: 0 })
    expect(session.weight).toBe(train.weight)
    expect(buildNextSessionRecommendation(upper, 0, null, [{ ...history[0]!, compression: null }], NOW, 'kg', day).exercises[0]!.weightDelta).toBeGreaterThan(0)
  })
})
