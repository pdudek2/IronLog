import { describe, expect, it } from 'vitest'
import {
  buildAiUserContext,
  buildChatContextSections,
  type AiContextRecordInput,
  type AiContextWorkoutInput,
  type AiReadinessInput,
} from '../aiContext'

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 6, 2, 12)

function workout(daysAgo: number, label: string, totalWeight: number): AiContextWorkoutInput {
  return {
    label,
    startedAt: NOW - daysAgo * DAY_MS,
    exercises: [
      {
        name: label.includes('Lower') ? 'Squat' : 'Bench Press',
        sets: [
          { weight: totalWeight / 10, reps: 5 },
          { weight: totalWeight / 10, reps: 5 },
        ],
      },
    ],
  }
}

function readiness(daysAgo: number, sleep: number, mood: number, soreness: number): AiReadinessInput {
  return {
    date: new Date(NOW - daysAgo * DAY_MS).toISOString().slice(0, 10),
    createdAt: NOW - daysAgo * DAY_MS,
    sleep,
    mood,
    soreness,
  }
}

const records: AiContextRecordInput[] = [
  { exerciseName: 'Bench Press', maxWeight: 100, maxReps: 3, bestVolume: 2400, lastPerformedAt: NOW - DAY_MS },
  { exerciseName: 'Squat', maxWeight: 140, maxReps: 2, bestVolume: 3200, lastPerformedAt: NOW - 5 * DAY_MS },
]

describe('buildAiUserContext', () => {
  it('keeps four recent detailed workouts and exposes prompt headings', () => {
    const context = buildAiUserContext({
      now: NOW,
      profile: { displayName: 'Patryk', primaryGoal: 'strength', weeklyGoal: 3, units: 'kg' },
      readinessEntries: [readiness(0, 4, 4, 2)],
      workouts: [
        workout(1, 'Upper A', 1200),
        workout(3, 'Lower A', 1800),
        workout(5, 'Upper B', 1300),
        workout(8, 'Lower B', 1700),
        workout(12, 'Old Extra', 900),
      ],
      records,
    })

    expect(context.recentWorkouts).toHaveLength(4)
    expect(context.recentWorkouts.map((item) => item.label)).toEqual(['Upper A', 'Lower A', 'Upper B', 'Lower B'])

    const sections = buildChatContextSections(context)
    expect(sections.workoutsHeading).toBe('OSTATNIE 4 TRENINGI')
    expect(sections.monthlyHeading).toBe('SYGNAŁY Z OSTATNICH 30 DNI')
    expect(sections.workoutsLine).toContain('Bench Press')
  })

  it('detects weaker weeks and recommends a gentler return instead of catching up at once', () => {
    const context = buildAiUserContext({
      now: NOW,
      profile: { displayName: null, primaryGoal: 'hypertrophy', weeklyGoal: 3, units: 'kg' },
      readinessEntries: [
        readiness(10, 2, 2, 5),
        readiness(11, 2, 2, 4),
        readiness(12, 3, 2, 4),
      ],
      workouts: [
        workout(2, 'Return Upper', 2500),
        workout(9, 'Weak Week Only Session', 600),
        workout(17, 'Normal A', 1800),
        workout(19, 'Normal B', 1700),
        workout(21, 'Normal C', 1600),
      ],
      records,
    })

    expect(context.monthlyInsights.signals.join('\n')).toContain('słabszy tydzień')
    expect(context.monthlyInsights.signals.join('\n')).toContain('readiness')
    expect(context.monthlyInsights.recommendations.join('\n')).toContain('80-90%')
  })
})
