import { describe, expect, it } from 'vitest'
import { buildProgression, planTarget, progressionHintLabel, sessionHint, trialWeight, type ProgressionInput, type ProgressionSession } from '../progression'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 10, 4, 12)
const session = (daysAgo: number, sets: [number, number][]): ProgressionSession => ({
  finishedAt: NOW - daysAgo * DAY,
  sets: sets.map(([weight, reps]) => ({ weight, reps })),
})
const sets3 = (weight: number, reps: number): [number, number][] => [[weight, reps], [weight, reps], [weight, reps]]
const run = (sessions: ProgressionSession[], extra: Partial<ProgressionInput> = {}) => buildProgression({
  sessions, target: { reps: 8, sets: 3 }, equipment: 'barbell', units: 'kg', now: NOW, ...extra,
})

describe('buildProgression', () => {
  it('treats the plan number as the top of the range: 4 × 8 at 70 kg climbs 6 → 8, then adds a step', () => {
    const plan = { target: { reps: 8, sets: 4 } }
    expect(run([session(3, [[40, 5], [70, 8], [70, 8], [70, 8], [70, 8]])], plan)).toMatchObject({ weight: 72.5, reps: 6, change: 'weight', delta: 2.5 })
    expect(run([session(3, [[72.5, 7], [72.5, 7], [72.5, 6], [72.5, 6]])], plan)).toMatchObject({ weight: 72.5, reps: 7, change: 'reps' })
    expect(run([session(3, [[72.5, 8], [72.5, 8], [72.5, 7], [72.5, 7]])], plan)).toMatchObject({ weight: 72.5, reps: 8, change: 'reps' })
    expect(run([session(3, [[70, 8], [70, 8], [70, 8], [70, 5]])], plan)).toMatchObject({ weight: 70, reps: 6, change: 'reps' })
  })

  it('keeps 1–5 rep plans fixed and gives 6 a range of 5–6', () => {
    expect(run([session(3, sets3(100, 5))], { target: { reps: 5, sets: 3 } })).toMatchObject({ weight: 102.5, reps: 5 })
    expect(run([session(3, [[100, 5], [100, 5], [100, 4]])], { target: { reps: 5, sets: 3 } })).toMatchObject({ weight: 100, reps: 5, change: 'reps' })
    expect(run([session(3, sets3(80, 6))], { target: { reps: 6, sets: 3 } })).toMatchObject({ weight: 82.5, reps: 5 })
    expect(run([session(3, sets3(6, 3))], { target: { reps: 3, sets: 3 }, equipment: 'dumbbell' })).toMatchObject({ weight: 8, reps: 3 })
  })

  it('neither raises nor lowers after fewer sets than the plan allows', () => {
    expect(run([session(3, [[60, 8]])])).toMatchObject({ weight: 60, change: 'none' })
    expect(run([session(3, [[60, 8], [60, 8]])])?.change).toBe('weight')
  })

  it('gives nothing for a top set with back-offs, nothing without history and nothing for cardio', () => {
    expect(run([session(3, [[100, 3], [85, 8], [85, 8]])])).toBeNull()
    expect(run([])).toBeNull()
    expect(run([session(3, [[0, 10]])], { category: 'cardio' })).toBeNull()
  })

  it('returns to the pre-deload weight only after a real deload, and respects a small correction', () => {
    expect(run([session(3, sets3(50, 8)), session(10, sets3(70, 8))])).toMatchObject({ weight: 72.5, change: 'weight', delta: 22.5 })
    expect(run([session(3, sets3(65, 8)), session(10, [[70, 6], [70, 6], [70, 5]])])).toMatchObject({ weight: 67.5, reps: 6 })
  })

  it('never brings back a heavier weight on low readiness', () => {
    expect(run([session(3, sets3(60, 8))], { lowReadiness: true })).toMatchObject({ weight: 60, change: 'none' })
    expect(run([session(3, sets3(50, 8)), session(10, sets3(70, 8))], { lowReadiness: true })).toMatchObject({ weight: 50, change: 'none' })
  })

  it('takes the step from the last three sessions within a fortnight of each other', () => {
    expect(run([session(3, sets3(61.25, 8)), session(7, sets3(60, 6))])).toMatchObject({ weight: 62.5, delta: 1.25 })
    expect(run([session(2, sets3(61.25, 8)), session(4, sets3(60, 8)), session(6, sets3(57.5, 8))])?.step).toBe(1.25)
    expect(run([session(2, sets3(60, 8)), session(4, sets3(60, 8)), session(6, sets3(60, 8)), session(8, sets3(58.75, 8))])?.weight).toBe(62.5)
    expect(run([session(3, sets3(95, 8)), session(40, sets3(100, 8))])?.step).toBe(2.5)
    expect(run([session(3, sets3(20, 8))], { equipment: 'dumbbell' })).toMatchObject({ weight: 22, delta: 2 })
    expect(run([session(3, sets3(30, 8))], { equipment: undefined })).toMatchObject({ weight: 32.5 })
  })

  it('asks for two reps over the plan before a step over 10% of the weight', () => {
    expect(run([session(3, sets3(6, 10))], { target: { reps: 10, sets: 3 }, equipment: 'dumbbell' })).toMatchObject({ weight: 6, reps: 11, change: 'reps' })
    expect(run([session(3, sets3(6, 12))], { target: { reps: 10, sets: 3 }, equipment: 'dumbbell' })).toMatchObject({ weight: 8, reps: 8 })
  })

  it('progresses bodyweight by reps, only after enough sets', () => {
    expect(run([session(3, [[0, 12], [0, 10]])], { equipment: 'bodyweight' })).toMatchObject({ weight: 0, reps: 11, change: 'reps' })
    expect(run([session(3, [[0, 10]])], { target: { reps: 8, sets: 4 }, equipment: 'bodyweight' })?.change).toBe('none')
  })

  it('snaps pound users to the 5 lb grid', () => {
    const fromKg = run([session(3, sets3(60, 8))], { units: 'lbs' })!
    expect(fromKg.weight! / 0.45359237).toBeCloseTo(135, 1)
    const fromLb = run([session(3, sets3(135 * 0.45359237, 8))], { units: 'lbs' })!
    expect(progressionHintLabel(fromLb, 'lbs')).toBe('Suggested +5 lbs')
    expect(run([session(3, sets3(60, 8)), session(7, sets3(58.75, 8))], { units: 'lbs' })?.step).toBeCloseTo(5 * 0.45359237, 6)
  })

  it('counts whole days at the break boundaries and keeps cuts within 20%', () => {
    const at = (days: number) => run([session(days, sets3(100, 8))])
    expect(at(14.9)).toMatchObject({ weight: 102.5, trial: null })
    expect(at(15)).toMatchObject({ weight: 100, change: 'none', trial: { maxWeight: 100 } })
    expect(at(28.9)).toMatchObject({ weight: 100 })
    expect(at(29)).toMatchObject({ weight: 95, delta: -5, change: 'weight' })
    expect(at(60)).toMatchObject({ weight: 85 })
    expect(at(84)).toMatchObject({ weight: 80 })
    expect(at(85)).toMatchObject({ weight: null, trial: { maxWeight: 100 } })
    expect(run([session(75, sets3(6, 10))], { target: { reps: 10, sets: 3 }, equipment: 'dumbbell' })?.weight).toBe(6)
  })

  it('reads a missing rep target as no plan, abstains on an ambiguous day and skips bad data', () => {
    expect(run([session(3, sets3(60, 2))], { target: { reps: 0, sets: 3 } })).toMatchObject({ weight: 62.5, reps: 2 })
    expect(run([session(3, sets3(60, 8))], { target: 'ambiguous' })).toBeNull()
    expect(run([session(3, [[60, 8], [60, 7], [60, 7]])], { target: null })).toMatchObject({ weight: 62.5, reps: 5, floor: 5, ceiling: 7 })
    expect(run([session(3, [[Number.NaN, 8], [60, -1], ...sets3(60, 8)])])).toMatchObject({ weight: 62.5 })
    expect(run([{ finishedAt: 0, sets: [{ weight: 60, reps: 8 }] }])).toBeNull()
  })
})

describe('trialWeight', () => {
  const trial = run([session(40, sets3(62.5, 8))])!

  it('turns the test set into the weight for the rest, never above the pre-break weight unless the set was', () => {
    expect(trial).toMatchObject({ weight: 60, trial: { maxWeight: 62.5 } })
    expect(trialWeight(trial, { weight: 60, reps: 8 })).toBe(60)
    expect(trialWeight(trial, { weight: 60, reps: 5 })).toBe(55)
    expect(trialWeight(trial, { weight: 60, reps: 10 })).toBe(62.5)
    expect(trialWeight(trial, { weight: 65, reps: 10 })).toBe(65)
  })

  it('skips low-rep plans', () => {
    const triple = run([session(40, sets3(140, 3))], { target: { reps: 3, sets: 3 } })!
    expect(trialWeight(triple, { weight: 130, reps: 5 })).toBeNull()
  })
})

describe('sessionHint', () => {
  const sets = (...values: [string, string, boolean][]) => values.map(([weight, reps, done]) => ({ weight, reps, done }))
  const raise = run([session(3, sets3(60, 8))])
  const moreReps = run([session(3, [[60, 8], [60, 6], [60, 6]])])
  const trial = run([session(40, sets3(62.5, 8))])

  it('shows a change only while an open set differs from it', () => {
    expect(sessionHint(raise, sets(['60', '8', false], ['60', '8', false]), 'kg')).toEqual({ label: 'Suggested +2.5 kg', weight: 62.5, reps: 6 })
    expect(sessionHint(raise, sets(['62.5', '6', false]), 'kg')).toBeNull()
    expect(sessionHint(moreReps, sets(['60', '6', false]), 'kg')).toEqual({ label: 'Aim for 7 reps', reps: 7 })
    expect(sessionHint(moreReps, sets(['60', '7', true]), 'kg')).toBeNull()
    expect(sessionHint(raise, sets(['20', '8', false]), 'kg', 'dumbbell')?.label).toBe('Suggested +2.5 kg per dumbbell')
  })

  it('brings the weight with a rep target when the open sets carry another weight', () => {
    expect(sessionHint(moreReps, sets(['55', '8', false]), 'kg')).toEqual({ label: '60 kg, aim for 7 reps', weight: 60, reps: 7 })
  })

  it('treats a typed pound value as equal to the suggestion', () => {
    const lb = run([session(3, sets3(130 * 0.45359237, 8))], { units: 'lbs' })!
    expect(sessionHint(lb, sets([String(Math.round(135 * 0.45359237 * 10_000) / 10_000), '6', false]), 'lbs')).toBeNull()
  })

  it('announces a trial, waits through warm-ups and then proposes the weight from the test set', () => {
    expect(sessionHint(trial, sets(['62.5', '8', false]), 'kg')).toEqual({ label: 'Long break: first set is a test at −2.5 kg', weight: 60 })
    expect(sessionHint(trial, sets(['40', '10', true], ['60', '8', false]), 'kg')?.label).toBe('Long break: first set is a test at −2.5 kg')
    expect(sessionHint(trial, sets(['60', '5', true], ['60', '8', false]), 'kg')).toEqual({ label: 'From your first set: 55 kg', weight: 55 })
    expect(sessionHint(trial, sets(['60', '8', true], ['60', '8', false]), 'kg')).toBeNull()
  })

  it('after a very long break takes the heaviest logged set as the scale, so a warm-up is not the test', () => {
    const old = run([session(120, sets3(100, 8))])!
    expect(old.weight).toBeNull()
    expect(sessionHint(old, sets(['20', '10', true], ['80', '8', true], ['80', '8', false]), 'kg')).toBeNull()
    expect(sessionHint(old, sets(['20', '10', true], ['80', '5', true], ['80', '8', false]), 'kg')).toEqual({ label: 'From your first set: 72.5 kg', weight: 72.5 })
  })
})

describe('planTarget', () => {
  const day = (reps: number) => ({ exercises: [{ exerciseId: 'squat', exerciseSource: 'global', targetReps: reps, sets: 3 }] })
  it('reads the plan, abstains when days disagree and has no target outside the plan', () => {
    expect(planTarget({ days: [day(5), day(5)] }, 'squat', 'global')).toEqual({ reps: 5, sets: 3 })
    expect(planTarget({ days: [day(5), day(10)] }, 'squat', 'global')).toBe('ambiguous')
    expect(planTarget({ days: [day(5)] }, 'squat', 'user')).toBeNull()
    expect(planTarget(null, 'squat', 'global')).toBeNull()
  })
})
