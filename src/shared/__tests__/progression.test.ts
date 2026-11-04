import { describe, expect, it } from 'vitest'
import { buildProgression, planTarget, progressionHintLabel, sessionHint, trialWeight, type ProgressionInput, type ProgressionSession } from '../progression'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 10, 4, 12)
const session = (daysAgo: number, sets: [number, number][]): ProgressionSession => ({
  finishedAt: NOW - daysAgo * DAY,
  sets: sets.map(([weight, reps]) => ({ weight, reps })),
})
const run = (sessions: ProgressionSession[], extra: Partial<ProgressionInput> = {}) => buildProgression({
  sessions, target: { reps: 8, sets: 3 }, equipment: 'barbell', units: 'kg', now: NOW, ...extra,
})

describe('buildProgression', () => {
  it('raises the weight by one step once every working set reaches the top of the range', () => {
    expect(run([session(3, [[40, 5], [60, 10], [60, 10], [60, 10]])])).toMatchObject({ weight: 62.5, reps: 8, change: 'weight', delta: 2.5 })
  })

  it('keeps the weight and asks the weakest set for one more rep', () => {
    expect(run([session(3, [[60, 10], [60, 8], [60, 8]])])).toMatchObject({ weight: 60, reps: 9, change: 'reps' })
  })

  it('neither raises nor lowers after fewer sets than the plan allows', () => {
    expect(run([session(3, [[60, 10]])])).toMatchObject({ weight: 60, change: 'none' })
    expect(run([session(3, [[60, 10], [60, 10]])])?.change).toBe('weight')
  })

  it('gives nothing for a top set with back-offs, nothing without history and nothing for cardio', () => {
    expect(run([session(3, [[100, 3], [85, 8], [85, 8]])])).toBeNull()
    expect(run([])).toBeNull()
    expect(run([session(3, [[0, 10]])], { category: 'cardio' })).toBeNull()
  })

  it('takes the heaviest recent session as the base, so a deload does not set the reference', () => {
    expect(run([session(3, [[50, 10], [50, 10], [50, 10]]), session(10, [[70, 10], [70, 10], [70, 10]])])).toMatchObject({ weight: 72.5 })
  })

  it('uses the smallest weight step from history before the equipment default', () => {
    expect(run([session(3, [[61.25, 10], [61.25, 10], [61.25, 10]]), session(7, [[60, 8], [60, 8], [60, 8]])])).toMatchObject({ weight: 62.5, delta: 1.25 })
    expect(run([session(3, [[20, 10], [20, 10], [20, 10]])], { equipment: 'dumbbell' })).toMatchObject({ weight: 22, delta: 2 })
    expect(run([session(3, [[30, 10], [30, 10], [30, 10]])], { equipment: undefined })).toMatchObject({ weight: 32.5 })
  })

  it('widens the range by two reps before a step over 10% of the weight', () => {
    const light = [session(3, [[6, 10], [6, 10], [6, 10]])]
    expect(run(light, { equipment: 'dumbbell' })).toMatchObject({ weight: 6, reps: 11, change: 'reps' })
    expect(run([session(3, [[6, 12], [6, 12], [6, 12]])], { equipment: 'dumbbell' })).toMatchObject({ weight: 8, reps: 8 })
  })

  it('progresses singles to triples by weight only and bodyweight by reps only', () => {
    expect(run([session(3, [[140, 3], [140, 3]])], { target: { reps: 3, sets: 2 } })).toMatchObject({ weight: 142.5, reps: 3 })
    expect(run([session(3, [[140, 3], [140, 2]])], { target: { reps: 3, sets: 2 } })).toMatchObject({ weight: 140, reps: 3, change: 'reps' })
    expect(run([session(3, [[0, 12], [0, 10]])], { equipment: 'bodyweight' })).toMatchObject({ weight: 0, reps: 11, change: 'reps' })
  })

  it('steps in 5 lb for pound users', () => {
    const result = run([session(3, [[60, 10], [60, 10], [60, 10]])], { units: 'lbs' })
    expect(result?.delta).toBeCloseTo(2.27, 2)
    expect(progressionHintLabel(result!, 'lbs')).toBe('Suggested +5 lbs')
  })

  it('follows the break rules at their boundaries', () => {
    const at = (days: number) => run([session(days, [[100, 10], [100, 10], [100, 10]])])
    expect(at(14)).toMatchObject({ weight: 102.5, trial: null })
    expect(at(15)).toMatchObject({ weight: 100, change: 'none', trial: { maxWeight: 100 } })
    expect(at(28)).toMatchObject({ weight: 100, trial: { maxWeight: 100 } })
    expect(at(29)).toMatchObject({ weight: 95, delta: -5, change: 'weight' })
    expect(at(40)).toMatchObject({ weight: 95 })
    expect(at(60)).toMatchObject({ weight: 85 })
    expect(at(84)).toMatchObject({ weight: 80 })
    expect(at(85)).toMatchObject({ weight: null, trial: { maxWeight: 100 } })
  })

  it('blocks a raise on low readiness', () => {
    expect(run([session(3, [[60, 10], [60, 10], [60, 10]])], { lowReadiness: true })).toMatchObject({ weight: 60, change: 'none' })
  })

  it('abstains on an ambiguous plan day and reads the target from the last session without a plan', () => {
    expect(run([session(3, [[60, 10], [60, 10], [60, 10]])], { target: 'ambiguous' })).toBeNull()
    expect(run([session(3, [[60, 6], [60, 5], [60, 5]])], { target: null })).toMatchObject({ weight: 60, reps: 6, floor: 5 })
  })

  it('skips malformed sets instead of throwing', () => {
    expect(run([session(3, [[Number.NaN, 8], [60, -1], [60, 10], [60, 10], [60, 10]])])).toMatchObject({ weight: 62.5 })
  })
})

describe('trialWeight', () => {
  const trial = run([session(40, [[62.5, 10], [62.5, 10], [62.5, 10]])])!

  it('turns the first set into the weight for the rest, never above the pre-break weight', () => {
    expect(trial).toMatchObject({ weight: 60, trial: { maxWeight: 62.5 } })
    expect(trialWeight(trial, { weight: 60, reps: 8 })).toBe(60)
    expect(trialWeight(trial, { weight: 60, reps: 5 })).toBe(55)
    expect(trialWeight(trial, { weight: 60, reps: 10 })).toBe(62.5)
  })

  it('waits when the first set is a warm-up, and skips low-rep targets', () => {
    expect(trialWeight(trial, { weight: 40, reps: 10 })).toBeNull()
    const triple = run([session(40, [[140, 3], [140, 3]])], { target: { reps: 3, sets: 2 } })!
    expect(trialWeight(triple, { weight: 130, reps: 5 })).toBeNull()
  })

  it('reads the first set when a very long break left the weight to the user', () => {
    const old = run([session(120, [[100, 8], [100, 8], [100, 8]])])!
    expect(old.weight).toBeNull()
    expect(trialWeight(old, { weight: 80, reps: 8 })).toBe(80)
  })
})

describe('sessionHint', () => {
  const sets = (...values: [string, string, boolean][]) => values.map(([weight, reps, done]) => ({ weight, reps, done }))
  const raise = run([session(3, [[60, 10], [60, 10], [60, 10]])])
  const moreReps = run([session(3, [[60, 10], [60, 8], [60, 8]])])
  const trial = run([session(40, [[62.5, 10], [62.5, 10], [62.5, 10]])])

  it('shows a change only while an open set differs from it', () => {
    expect(sessionHint(raise, sets(['60', '8', false], ['60', '8', false]), 'kg')).toEqual({ label: 'Suggested +2.5 kg', weight: 62.5, reps: 8 })
    expect(sessionHint(raise, sets(['62.5', '8', false]), 'kg')).toBeNull()
    expect(sessionHint(moreReps, sets(['60', '8', false]), 'kg')).toEqual({ label: 'Aim for 9 reps', reps: 9 })
    expect(sessionHint(moreReps, sets(['60', '9', true]), 'kg')).toBeNull()
    expect(sessionHint(raise, sets(['20', '8', false]), 'kg', 'dumbbell')?.label).toBe('Suggested +2.5 kg per dumbbell')
  })

  it('announces a trial, waits through warm-ups and then proposes the weight from the first set', () => {
    expect(sessionHint(trial, sets(['62.5', '8', false]), 'kg')).toEqual({ label: 'Long break: first set is a test at −2.5 kg', weight: 60 })
    expect(sessionHint(trial, sets(['40', '10', true], ['60', '8', false]), 'kg')?.label).toBe('Long break: first set is a test at −2.5 kg')
    expect(sessionHint(trial, sets(['60', '5', true], ['60', '8', false]), 'kg')).toEqual({ label: 'From your first set: 55 kg', weight: 55 })
    expect(sessionHint(trial, sets(['60', '8', true], ['60', '8', false]), 'kg')).toBeNull()
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
