import { describe, expect, it } from 'vitest'
import { exercises as catalogue } from '../../../data/exercises'
import { exerciseRoles, sessionPace } from '../compression'
import { isShortened, parseCompressionRecord, type CompressionRecord } from '../compressionRecord'
import { applyCut, cutRest, finishByClock, planCut, type CutChoice, type CutPlan } from '../sessionCut'
import { buildNextSessionRecommendation } from '../nextSessionRecommendation'

const T0 = 1_800_000_000_000
type Set = { weight: string; reps: string; done: boolean; completedAt?: number }
type Exercise = { exerciseId: string; exerciseSource: 'global' | 'user'; name: string; group?: string; sets: Set[] }
type Session = { startedAt: number; exercises: Exercise[]; compression?: CompressionRecord | null }

// [id, sets, logged, group?]; logged sets carry no time unless `times` gives the minute of each.
const session = (items: [string, number, number, string?][], compression: CompressionRecord | null = null): Session => ({
  startedAt: T0,
  compression,
  exercises: items.map(([id, sets, logged, group]) => {
    if (!catalogue.some((entry) => entry.id === id)) throw new Error(id)
    return {
      exerciseId: id, exerciseSource: 'global', name: id, ...(group ? { group } : {}),
      sets: Array.from({ length: sets }, (_, index) => ({ weight: '50', reps: '8', done: index < logged })),
    }
  }),
})
const timed = (value: Session, minutesBySet: number[][]): Session => ({
  ...value,
  exercises: value.exercises.map((exercise, e) => ({
    ...exercise,
    sets: exercise.sets.map((set, s) => (set.done && minutesBySet[e]?.[s] !== undefined ? { ...set, completedAt: T0 + minutesBySet[e]![s]! * 60_000 } : set)),
  })),
})
const upper = (logged: number[], compression: CompressionRecord | null = null) => session([
  ['bench-press', 4, logged[0] ?? 0], ['lat-pulldown', 3, logged[1] ?? 0], ['seated-cable-row', 3, logged[2] ?? 0],
  ['db-lateral-raise', 3, logged[3] ?? 0], ['db-curl', 3, logged[4] ?? 0], ['tricep-pushdown', 3, logged[5] ?? 0],
], compression)
const choice = (leftMin: number | null, straight = false): CutChoice => ({ leftMin, clock: false, straight })
const min = (sec: number) => Math.round(sec / 6) / 10
const shape = (value: Session) => value.exercises.map((exercise) => `${exercise.exerciseId}×${exercise.sets.length}${exercise.group ? `@${exercise.group}` : ''}`)

function invariants(before: Session, plan: CutPlan, leftMin: number, now = T0 + 40 * 60_000) {
  const { result } = plan
  expect(result.fits ? result.estimateSec <= leftMin * 60 : result.estimateSec > leftMin * 60).toBe(true)
  const roles = exerciseRoles(before.exercises.map((exercise) => {
    const entry = catalogue.find((item) => item.id === exercise.exerciseId)!
    return { muscles: entry.muscles, equipment: entry.equipment, category: entry.category }
  }))
  plan.after.forEach((sets, index) => {
    expect(sets).toBeGreaterThanOrEqual(plan.done[index]!)
    if (roles[index] === 'cardio') expect(sets).toBe(plan.before[index])
    if (roles[index] === 'main') expect(sets).toBeGreaterThanOrEqual(Math.min(2, plan.before[index]!))
    const group = plan.groups[index]
    if (group && group !== before.exercises[index]!.group) expect(plan.done[index]).toBe(0)
  })
  const after = applyCut(before, plan, choice(leftMin), now)
  // Every logged set survives untouched.
  const logged = (value: Session) => value.exercises.flatMap((exercise) => exercise.sets.filter((set) => set.done).map((set) => `${exercise.exerciseId}:${JSON.stringify(set)}`))
  expect(logged(after)).toEqual(logged(before))
  if (plan.changed) {
    for (const entry of after.compression!.exercises) {
      const matches = after.exercises.filter((exercise) => exercise.exerciseId === entry.exerciseId)
      if (entry.sets > 0 && matches.length === 1) expect(entry.sets).toBe(matches[0]!.sets.length)
    }
    expect(parseCompressionRecord(after.compression)).toEqual(after.compression)
  }
  // The same cut again changes nothing.
  const again = planCut(after, choice(leftMin), now)
  expect(again.changed).toBe(false)
  expect(applyCut(after, again, choice(leftMin), now)).toBe(after)
  return after
}

describe('planCut on the Upper day after Bench and Pulldown (cold pace, the rest already over)', () => {
  it('drops the row, keeps the circuit in 3 rounds with short rests: 13.2 min at 15', () => {
    const before = upper([4, 3])
    const plan = planCut(before, choice(15), T0 + 30 * 60_000)
    expect(min(plan.result.fullEstimateSec)).toBe(30)
    expect(min(plan.result.estimateSec)).toBe(13.2)
    expect(plan).toMatchObject({ changed: true, openBefore: 12, openAfter: 9, pace: 1.2, paceSource: 'cold' })
    expect(plan.result.shortRest).toBe(true)
    const after = invariants(before, plan, 15, T0 + 30 * 60_000)
    expect(shape(after)).toEqual(['bench-press×4', 'lat-pulldown×3', 'db-lateral-raise×3@g1', 'db-curl×3@g1', 'tricep-pushdown×3@g1'])
    expect(after.compression).toMatchObject({ budgetMin: null, calibration: 'none', cut: { atMin: 30, leftMin: 15, estimateMin: 13.2, count: 1, only: true, pace: 'cold' } })
    expect(isShortened(after.compression, 'seated-cable-row', 'global', [])).toBe(true)
    expect(isShortened(after.compression, 'db-curl', 'global', [{ weight: 10, reps: 10 }, { weight: 10, reps: 10 }, { weight: 10, reps: 10 }])).toBe(false)
  })

  it('leaves the rest alone when it fits: You have time', () => {
    const before = upper([4, 3])
    const plan = planCut(before, choice(30), T0)
    expect(plan.changed).toBe(false)
    expect(applyCut(before, plan, choice(30), T0)).toBe(before)
  })

  it.each([10, 5])('cuts harder at %i min', (leftMin) => {
    const before = upper([4, 3])
    invariants(before, planCut(before, choice(leftMin), T0), leftMin, T0)
  })

  it('keeps the exercises straight without supersets', () => {
    const before = upper([4, 3])
    const plan = planCut(before, choice(15, true), T0)
    expect(plan.result.mode).toBe('straight')
    const after = invariants(before, plan, 15, T0)
    expect(after.exercises.every((exercise) => !exercise.group)).toBe(true)
  })

  it('keeps one partner with open sets as the shortest finish, and reports nothing more fits without one', () => {
    const shortest = planCut(upper([4, 3]), choice(1), T0)
    expect(shortest).toMatchObject({ openAfter: 2, after: [4, 3, 2, 0, 0, 0] })
    expect(shortest.result.fits).toBe(false)
    const nothing = planCut(session([['bench-press', 4, 4], ['lat-pulldown', 3, 3]]), choice(1), T0)
    expect(nothing).toMatchObject({ openAfter: 0 })
  })
})

describe('planCut mid-exercise', () => {
  it('counts the rest still due after the latest set and keeps the main lift at its logged sets or 2', () => {
    const before = timed(upper([2]), [[3, 6]])
    const now = T0 + 6 * 60_000 + 30_000
    const plan = planCut(before, choice(15), now)
    invariants(before, plan, 15, now)
    expect(plan.after[0]).toBe(2)
    // In the middle of a 180 s rest 150 s are still due; right after the set all 180.
    const fresh = planCut(before, choice(null), T0 + 6 * 60_000)
    const later = planCut(before, choice(null), now)
    expect(Math.round((fresh.result.fullEstimateSec - later.result.fullEstimateSec) / fresh.pace)).toBe(30)
  })

  it('keeps a weight typed into the next open set', () => {
    const before = upper([1, 0, 0, 0, 0, 0])
    before.exercises[1]!.sets[0] = { weight: '62.5', reps: '9', done: false }
    const after = applyCut(before, planCut(before, choice(10), T0), choice(10), T0)
    const pulldown = after.exercises.find((exercise) => exercise.exerciseId === 'lat-pulldown')
    if (pulldown) expect(pulldown.sets[0]).toEqual({ weight: '62.5', reps: '9', done: false })
  })

  it('cuts a start circuit by open sets only: a member with all sets logged keeps them', () => {
    const before = session([['bench-press', 4, 4], ['lat-pulldown', 3, 3], ['db-lateral-raise', 3, 3, 'g1'], ['db-curl', 3, 1, 'g1'], ['tricep-pushdown', 3, 1, 'g1']])
    const plan = planCut(before, choice(4), T0)
    const after = invariants(before, plan, 4, T0)
    expect(after.exercises[2]!.sets).toHaveLength(3)
    expect(after.exercises.slice(2).every((exercise) => exercise.group === 'g1')).toBe(true)
  })
})

describe('planCut and the record', () => {
  const start: CompressionRecord = {
    v: 1, budgetMin: 45, mode: 'compressed', shortRest: false, estimateMin: 43.9, fullEstimateMin: 60.7, factor: 1.1, samples: 3, calibration: 'day', readiness: 'low',
    exercises: [
      { dayExerciseIndex: 0, exerciseId: 'bench-press', exerciseSource: 'global', plannedSets: 4, sets: 4 },
      { dayExerciseIndex: 1, exerciseId: 'lat-pulldown', exerciseSource: 'global', plannedSets: 3, sets: 3 },
      { dayExerciseIndex: 2, exerciseId: 'seated-cable-row', exerciseSource: 'global', plannedSets: 3, sets: 0 },
      { dayExerciseIndex: 3, exerciseId: 'db-lateral-raise', exerciseSource: 'global', plannedSets: 3, sets: 3 },
      { dayExerciseIndex: 4, exerciseId: 'db-curl', exerciseSource: 'global', plannedSets: 3, sets: 3 },
      { dayExerciseIndex: 5, exerciseId: 'tricep-pushdown', exerciseSource: 'global', plannedSets: 3, sets: 3 },
    ],
  }
  const started = () => session([['bench-press', 4, 4], ['lat-pulldown', 3, 1], ['db-lateral-raise', 3, 0], ['db-curl', 3, 0], ['tricep-pushdown', 3, 0], ['hammer-curl', 3, 0]], start)

  it('keeps the start fields, takes low readiness and the pace prior from them, and adds an entry for a hand-added exercise', () => {
    const before = started()
    const plan = planCut(before, choice(8), T0 + 20 * 60_000)
    expect(plan).toMatchObject({ pace: 1.1, paceSource: 'record' })
    expect(plan.result.shortRest).toBe(false)
    const after = invariants(before, plan, 8, T0 + 20 * 60_000)
    const { cut, exercises, ...fields } = after.compression!
    const { exercises: startExercises, ...startFields } = start
    expect(fields).toEqual(startFields)
    expect(cut).toMatchObject({ only: false, pace: 'record', count: 1 })
    expect(exercises.slice(0, 6).map((entry) => entry.plannedSets)).toEqual(startExercises.map((entry) => entry.plannedSets))
    expect(exercises.find((entry) => entry.exerciseId === 'seated-cable-row')!.sets).toBe(0)
    if (plan.after[5]! < 3) {
      expect(exercises.find((entry) => entry.exerciseId === 'hammer-curl')).toMatchObject({ plannedSets: 3, dayExerciseIndex: 5 })
      expect(isShortened(after.compression, 'hammer-curl', 'global', [])).toBe(true)
    }
  })

  it('counts a second cut and keeps one occurrence per entry for an exercise done twice', () => {
    const twice = session([['bench-press', 3, 3], ['db-curl', 3, 1], ['tricep-pushdown', 3, 0], ['db-curl', 3, 0]])
    const first = applyCut(twice, planCut(twice, choice(10), T0), choice(10), T0)
    invariants(twice, planCut(twice, choice(10), T0), 10, T0)
    const second = applyCut(first, planCut(first, choice(3), T0), choice(3), T0)
    expect(second.compression!.cut).toMatchObject({ count: 2, only: true })
    expect(second.compression!.exercises.filter((entry) => entry.exerciseId === 'db-curl')).toHaveLength(2)
  })

  it('never cuts cardio', () => {
    const before = session([['bench-press', 4, 2], ['treadmill', 2, 0], ['db-curl', 3, 0]])
    invariants(before, planCut(before, choice(6), T0), 6, T0)
  })

  it('writes a record the parser accepts for a 5-hour session and an exercise with 25 sets', () => {
    const before = session([['bench-press', 25, 10], ['db-curl', 3, 0], ['tricep-pushdown', 3, 0], ['db-lateral-raise', 3, 0]])
    const now = T0 + 300 * 60_000
    const after = applyCut(before, planCut(before, choice(5), now), choice(5), now)
    expect(parseCompressionRecord(after.compression)).toEqual(after.compression)
    expect(after.compression!.exercises[0]!.plannedSets).toBe(20)
  })

  it('drops only a malformed cut, not the record', () => {
    const parsed = parseCompressionRecord({ ...start, cut: { atMin: -1, leftMin: 15, estimateMin: 13, clock: false, count: 1, only: false, pace: 'session' } })
    expect(parsed).toEqual(start)
    const valid = { atMin: 30, leftMin: 15, estimateMin: 13.2, clock: true, count: 1, only: false, pace: 'session' }
    expect(parseCompressionRecord({ ...start, cut: valid })).toEqual({ ...start, cut: valid })
  })
})

describe('sessionPace', () => {
  const roles = exerciseRoles([{ muscles: ['chest', 'triceps'], equipment: 'barbell' }, { muscles: ['biceps'] }])
  // Bench 4 sets and curls 3 sets, one set every `gap` minutes.
  const sets = (count: number, gap: number) => {
    let n = 0
    return [4, 3].map((total) => ({ sets: Array.from({ length: total }, () => {
      const done = n < count
      return { done, ...(done ? { completedAt: T0 + gap * 60_000 * n++ } : {}) }
    }) }))
  }

  it('uses the prior before two timed sets', () => {
    expect(sessionPace(sets(0, 3), roles, false, false, 1.1)).toEqual({ factor: 1.1, sets: 0 })
    expect(sessionPace(sets(1, 3), roles, false, false, 1.1)).toEqual({ factor: 1.1, sets: 1 })
  })

  it('blends the session with the prior by count and clamps', () => {
    // Bench sets 3.67 min apart = the model (40 + 180 s); the pace is the prior's pull toward 1.
    expect(sessionPace(sets(4, 220 / 60), roles, false, false, 1.2).factor).toBeCloseTo((4 * 1 + 5 * 1.2) / 9, 3)
    expect(sessionPace(sets(7, 30), roles, false, false, 1.2).factor).toBe(1.6)
  })
})

describe('review fixes', () => {
  it('never drops an exercise that got a logged set after the preview, and cutRest plans on the live session', () => {
    const before = upper([4, 3])
    const plan = planCut(before, choice(15), T0)
    expect(plan.after[2]).toBe(0)
    const live = { ...before, exercises: before.exercises.map((exercise, index) => (index === 2 ? { ...exercise, sets: exercise.sets.map((set, s) => (s === 0 ? { ...set, done: true } : set)) } : exercise)) }
    expect(applyCut(live, plan, choice(15), T0).exercises.map((exercise) => exercise.exerciseId)).toContain('seated-cable-row')
    const cut = cutRest(live, choice(15), T0)
    expect(cut.exercises.find((exercise) => exercise.exerciseId === 'seated-cable-row')!.sets.filter((set) => set.done)).toHaveLength(1)
  })

  it('gives the shortest finish to the exercise in progress, not to one already done', () => {
    const before = session([['bench-press', 4, 4], ['lat-pulldown', 3, 3], ['db-curl', 3, 1], ['tricep-pushdown', 3, 0]])
    const plan = planCut(before, choice(1), T0)
    expect(plan.after).toEqual([4, 3, 2, 0])
    expect(plan.openAfter).toBe(1)
  })

  it('leaves workouts cut mid-session out of the pace calibration', () => {
    const template = { name: 'Upper', days: [{ name: 'Upper', exercises: [{ exerciseId: 'bench-press', exerciseSource: 'global' as const, name: 'Bench', sets: 3, targetReps: 8, targetWeight: 80 }] }] }
    const workout = (at: number, cut: boolean) => ({
      finishedAt: at + 1_800_000, startedAt: at,
      ...(cut ? { compression: { ...parseCompressionRecord({ v: 1, budgetMin: null, mode: 'compressed', shortRest: false, estimateMin: 20, fullEstimateMin: 20, factor: 1.2, samples: 0, calibration: 'none', readiness: null, exercises: [] })!, cut: { atMin: 10, leftMin: 10, estimateMin: 8, clock: false, count: 1, only: true, pace: 'cold' as const } } } : {}),
      exercises: [{ exerciseId: 'bench-press', exerciseSource: 'global' as const, sets: [1, 2, 3].map((n) => ({ weight: 80, reps: 8, completedAt: at + n * 300_000 })) }],
    })
    const day = 86_400_000
    const history = [workout(T0 - day, false), workout(T0 - 2 * day, true), workout(T0 - 3 * day, false)]
    expect(buildNextSessionRecommendation(template, 0, null, history, T0).calibration).toMatchObject({ samples: 2, source: 'user' })
  })
})

describe('finishByClock', () => {
  const now = Date.UTC(2026, 10, 17, 18, 2)
  it('follows the picked minutes instead of the full workout, on the 5-minute grid', () => {
    expect(finishByClock(null, now, 53 * 60)).toBe(Date.UTC(2026, 10, 17, 18, 55))
    expect(finishByClock({ kind: 'left', min: 15 }, now, 53 * 60)).toBe(Date.UTC(2026, 10, 17, 18, 15))
    expect(finishByClock({ kind: 'clock', at: Date.UTC(2026, 10, 17, 18, 40) }, now, 53 * 60)).toBe(Date.UTC(2026, 10, 17, 18, 40))
  })
})
