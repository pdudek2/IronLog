import { describe, expect, it } from 'vitest'

import { latestRecord, recordLine, stepsNote, topSet, workoutSteps } from '../../shared/workoutMoments'

const HOUR = 3_600_000
const NOW = new Date(2026, 10, 2, 18).getTime()
const kg = (value: number) => `${value} kg`

function workout(id: string, hoursAgo: number, weight: number, reps = 5, exerciseId = 'bench-press') {
  const startedAt = NOW - hoursAgo * HOUR
  return {
    id,
    startedAt,
    finishedAt: startedAt + HOUR,
    exercises: [{ exerciseId, exerciseSource: 'global' as const, name: 'Bench Press', sets: [{ weight, reps }] }],
  }
}

describe('topSet', () => {
  it('prefers the heavier set, then more reps', () => {
    expect(topSet({ name: 'x', sets: [{ weight: 80, reps: 8 }, { weight: 90, reps: 2 }, { weight: 90, reps: 3 }] }))
      .toEqual({ weight: 90, reps: 3 })
  })
})

describe('latestRecord', () => {
  it('finds a heavier top set in the last day', () => {
    expect(latestRecord([workout('new', 20, 90), workout('old', 72, 85)], NOW))
      .toMatchObject({ exerciseName: 'Bench Press', weight: 90, reps: 5 })
  })

  it('ignores a first session, an equal weight and anything older than a day', () => {
    expect(latestRecord([workout('new', 20, 90)], NOW)).toBeNull()
    expect(latestRecord([workout('new', 20, 85, 8), workout('old', 72, 85)], NOW)).toBeNull()
    expect(latestRecord([workout('new', 30, 90), workout('old', 72, 85)], NOW)).toBeNull()
  })

  it('does not compare different exercises', () => {
    expect(latestRecord([workout('new', 20, 90), workout('old', 72, 85, 5, 'squat')], NOW)).toBeNull()
  })

  it('names the day of the record', () => {
    const record = latestRecord([workout('new', 20, 90), workout('old', 72, 85)], NOW)!
    expect(recordLine(record, new Date(NOW), kg)).toBe('New record yesterday: Bench Press 90 kg × 5')
    expect(recordLine({ ...record, finishedAt: NOW - HOUR }, new Date(NOW), kg)).toBe('New record today: Bench Press 90 kg × 5')
  })
})

describe('workoutSteps', () => {
  const session = (workoutId: string, hoursAgo: number, bestSetWeight: number) => (
    { workoutId, startedAt: NOW - hoursAgo * HOUR, bestSetWeight }
  )

  it('needs an earlier session', () => {
    expect(workoutSteps(workout('w', 1, 90), [session('w', 1, 90)])).toBeNull()
  })

  it('ends on this workout and flags a new best against every earlier session', () => {
    const steps = workoutSteps(workout('w', 1, 90), [session('w', 1, 90), session('b', 48, 80), session('a', 96, 85)])!

    expect(steps.bars.map((bar) => bar.weight)).toEqual([85, 80, 90])
    expect(steps.bars.at(-1)).toMatchObject({ current: true, height: 1 })
    expect(steps).toMatchObject({ best: true, delta: 5 })
    expect(stepsNote(steps, kg)).toBe('New best, 5 kg above your previous best')
  })

  it('compares with the last session when it is no best, and ignores later sessions', () => {
    const steps = workoutSteps(workout('w', 100, 80), [session('later', 1, 200), session('a', 200, 85)])!

    expect(steps).toMatchObject({ best: false, delta: -5 })
    expect(stepsNote(steps, kg)).toBe('5 kg below last time')
    expect(stepsNote({ best: false, delta: 0 }, kg)).toBe('Same weight as last time')
  })

  it('caps the bars and still judges the best on all sessions', () => {
    const sessions = Array.from({ length: 20 }, (_, index) => session(`s${index}`, 200 - index, index === 0 ? 120 : 80))
    const steps = workoutSteps(workout('w', 1, 100), sessions)!

    expect(steps.bars).toHaveLength(12)
    expect(steps.best).toBe(false)
  })
})
