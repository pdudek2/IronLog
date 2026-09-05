import { describe, expect, it } from 'vitest'
import {
  AVAILABLE_AI_CONTEXT_SOURCES,
  buildAiUserContext,
  buildChatContextSections,
  type AiContextSourceStatuses,
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

  it('preserves recent sessions but suppresses totals and weak-week inference for a dense truncated month', () => {
    const context = buildAiUserContext({
      now: NOW,
      workoutReadLimit: 31,
      profile: { weeklyGoal: 14 },
      readinessEntries: [readiness(0, 2, 2, 5), readiness(1, 2, 2, 5)],
      workouts: Array.from({ length: 42 }, (_, index) => workout(index / 2, `Session ${index}`, 500)).slice(0, 31),
      records: [],
    })
    const sections = buildChatContextSections(context)

    expect(context.sources.workouts).toBe('limited')
    expect(context.recentWorkouts).toHaveLength(4)
    expect(sections.workoutsLine).toContain('Session 0')
    expect(sections.workoutsLine).toContain('500 kg')
    expect(sections.monthlyLine).toContain('Analiza 30 dni jest niepełna')
    expect(sections.monthlyLine).toContain('2 dni z rzędu')
    expect(sections.monthlyLine).not.toContain('15500')
    expect(sections.monthlyLine).not.toContain('31 treningów /')
    expect(sections.monthlyLine).not.toContain('Średnio')
    expect(sections.monthlyLine).not.toContain('Wykryto słabszy tydzień')
    expect(context.monthlyInsights.signals.join(' ')).not.toContain('Najczęściej')
  })

  it.each([
    { ageDays: 30, expected: 'limited', count: 0 },
    { ageDays: 30 + 1 / DAY_MS, expected: 'available', count: 30 },
  ])('treats oldest age $ageDays days conservatively at the query limit', ({ ageDays, expected, count }) => {
    const context = buildAiUserContext({
      now: NOW,
      workoutReadLimit: 31,
      profile: null,
      readinessEntries: [],
      workouts: [
        ...Array.from({ length: 30 }, (_, index) => workout(index / 2, `Session ${index}`, 500)),
        workout(ageDays, 'Boundary', 500),
      ],
      records: [],
    })

    expect(context.sources.workouts).toBe(expected)
    expect(context.monthlyInsights.workoutCount).toBe(count)
    if (expected === 'available') {
      expect(buildChatContextSections(context).monthlyLine).toContain('30 treningów / 15000 kg')
    }
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

  it('distinguishes available empty data from an unavailable source', () => {
    const sources: AiContextSourceStatuses = {
      ...AVAILABLE_AI_CONTEXT_SOURCES,
      records: 'unavailable',
    }
    const context = buildAiUserContext({
      now: NOW,
      sources,
      profile: null,
      readinessEntries: [],
      workouts: [],
      records: [],
    })

    const sections = buildChatContextSections(context)

    expect(sections.profileLine).toBe('Profil: brak danych.')
    expect(sections.workoutsLine).toBe('Brak ostatnich treningów.')
    expect(sections.recordsLine).toBe('Rekordy: dane chwilowo niedostępne.')
    expect(sections.monthlyLine).toContain('Brak treningów w ostatnich 30 dniach.')
  })

  it('keeps a low-readiness streak when workout analysis is unavailable', () => {
    const context = buildAiUserContext({
      now: NOW,
      sources: { ...AVAILABLE_AI_CONTEXT_SOURCES, workouts: 'unavailable' },
      profile: { weeklyGoal: 3 },
      readinessEntries: [readiness(0, 2, 2, 5), readiness(1, 2, 2, 5)],
      workouts: [],
      records: [],
    })

    const sections = buildChatContextSections(context)
    expect(sections.workoutsLine).toBe('Historia treningów: dane chwilowo niedostępne.')
    expect(sections.monthlyLine).toContain('Analiza treningów: dane chwilowo niedostępne.')
    expect(sections.monthlyLine).toContain('2 dni z rzędu')
    expect(sections.monthlyLine).toContain('80-90%')
    expect(sections.monthlyLine).not.toContain('0 treningów')
    expect(sections.monthlyLine).not.toContain('Brak treningów')
    expect(sections.monthlyLine).not.toContain('Średnio')
  })

  it('keeps readiness-derived monthly signals silent when readiness is unavailable', () => {
    const context = buildAiUserContext({
      now: NOW,
      sources: {
        ...AVAILABLE_AI_CONTEXT_SOURCES,
        readiness: 'unavailable',
        workouts: 'unavailable',
      },
      profile: { weeklyGoal: 3 },
      readinessEntries: [readiness(0, 2, 2, 5), readiness(1, 2, 2, 5)],
      workouts: [],
      records: [],
    })

    const sections = buildChatContextSections(context)
    expect(sections.monthlyLine).toBe('Analiza treningów: dane chwilowo niedostępne.')
    expect(sections.monthlyLine).not.toContain('readiness')
  })

  it('does not call non-consecutive low readiness entries days in a row', () => {
    const context = buildAiUserContext({
      now: NOW,
      profile: { weeklyGoal: 3 },
      readinessEntries: [
        readiness(0, 2, 2, 5),
        readiness(2, 2, 2, 5),
      ],
      workouts: [workout(1, 'Upper', 1200)],
      records: [],
    })

    expect(context.monthlyInsights.signals.join('\n')).not.toContain('dni z rzędu')
  })

  it('detects consecutive low readiness across a calendar boundary', () => {
    const first = readiness(0, 2, 2, 5)
    const second = readiness(0, 2, 2, 5)
    first.date = '2025-12-31'
    first.createdAt = Date.UTC(2025, 11, 31, 12)
    second.date = '2026-01-01'
    second.createdAt = Date.UTC(2026, 0, 1, 12)

    const context = buildAiUserContext({
      now: Date.UTC(2026, 0, 2, 12),
      profile: { weeklyGoal: 3 },
      readinessEntries: [first, second],
      workouts: [workout(1, 'Upper', 1200)],
      records: [],
    })

    expect(context.monthlyInsights.signals.join('\n')).toContain('2 dni z rzędu')
  })

  it.each([
    {
      name: 'a high score',
      middle: readiness(1, 5, 5, 1),
    },
    {
      name: 'an invalid calendar date',
      middle: { ...readiness(1, 2, 2, 5), date: '2026-02-31' },
    },
  ])('treats $name as a streak break', ({ middle }) => {
    const context = buildAiUserContext({
      now: NOW,
      profile: { weeklyGoal: 3 },
      readinessEntries: [
        readiness(2, 2, 2, 5),
        middle,
        readiness(0, 2, 2, 5),
      ],
      workouts: [workout(1, 'Upper', 1200)],
      records: [],
    })

    expect(context.monthlyInsights.signals.join('\n')).not.toContain('dni z rzędu')
  })
})
