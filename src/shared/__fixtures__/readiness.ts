import type { RecommendationTemplate, RecommendationWorkout } from '../nextSessionRecommendation'
import type { ReadinessEntry } from '../readiness'
export const NOW = new Date(2026, 9, 1, 12).getTime()
export const plan: RecommendationTemplate = { name: 'Readiness plan', days: [{ name: 'Upper A', exercises: [
  { exerciseId: 'same', exerciseSource: 'global', name: 'Bench Press', sets: 4, targetReps: 8, targetWeight: 70 },
  { exerciseId: 'same', exerciseSource: 'user', name: 'Custom press', sets: 3, targetReps: 10, targetWeight: 25 },
  { exerciseId: 'row', exerciseSource: 'global', name: 'Barbell Row', sets: 3, targetReps: 8, targetWeight: 60 },
  { exerciseId: 'raise', exerciseSource: 'global', name: 'Lateral Raise', sets: 1, targetReps: 12, targetWeight: 10 },
] }] }
export const workouts: RecommendationWorkout[] = [1, 3, 6].map(days => ({ finishedAt: NOW - days * 86_400_000, exercises: [
  { exerciseId: 'same', exerciseSource: 'global', sets: [{ weight: 72.5, reps: 6 }, { weight: 70, reps: 10 }] },
  { exerciseId: 'same', exerciseSource: 'user', sets: [{ weight: 30, reps: 9 }] },
] }))
export const fixtures = [
  { tone: 'low', score: 0, values: { sleep: 1, mood: 1, soreness: 5 }, expected: [[3,72.5,6], [2,30,9], [2,60,8], [1,10,12]] },
  { tone: 'mid', score: 50, values: { sleep: 3, mood: 3, soreness: 3 }, expected: [[4,75,6], [3,32.5,9], [2,60,8], [1,10,12]] },
  { tone: 'high', score: 100, values: { sleep: 5, mood: 5, soreness: 1 }, expected: [[4,75,6], [3,32.5,9], [3,60,8], [1,10,12]] },
] as const
export const readiness = (values: Pick<ReadinessEntry, 'sleep' | 'mood' | 'soreness'>): ReadinessEntry => ({ ...values, userId: 'owner', date: '2026-10-01', createdAt: NOW })
