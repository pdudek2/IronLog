import { describe, expect, it } from 'vitest'
import { exercises as catalogue } from '../../../data/exercises'
import { calibration, compressDay, exerciseRoles, groupRestSec, type CompressionResult, type DayExercise } from '../compression'
import { isShortened } from '../compressionRecord'

const day = (...items: [string, number][]): DayExercise[] => items.map(([id, sets]) => {
  const entry = catalogue.find((exercise) => exercise.id === id)
  if (!entry) throw new Error(id)
  return { exerciseId: id, exerciseSource: 'global', sets, muscles: entry.muscles, equipment: entry.equipment, category: entry.category }
})
const upper = () => day(['bench-press', 4], ['lat-pulldown', 3], ['seated-cable-row', 3], ['db-lateral-raise', 3], ['db-curl', 3], ['tricep-pushdown', 3])
const lower = () => day(['squat', 4], ['romanian-dl', 3], ['leg-press', 3], ['leg-curl', 3], ['leg-extension', 3], ['calf-raise', 3])
const min = (result: CompressionResult) => Math.round(result.estimateSec / 6) / 10
const ids = (result: CompressionResult, exercises: DayExercise[]) =>
  result.blocks.map((block) => block.items.filter((item) => item.sets > 0).map((item) => `${exercises[item.index]!.exerciseId}×${item.sets}`).join(' + ')).filter(Boolean)
const total = (result: CompressionResult) => result.sets.reduce((sum, sets) => sum + sets, 0)

function invariants(result: CompressionResult, exercises: DayExercise[], budgetMin: number) {
  expect(result.fits ? result.estimateSec <= budgetMin * 60 : result.estimateSec > budgetMin * 60).toBe(true)
  const roles = exerciseRoles(exercises)
  const main = roles.indexOf('main')
  if (main >= 0) expect(result.sets[main]).toBeGreaterThanOrEqual(Math.min(2, exercises[main]!.sets))
  for (const block of result.blocks) {
    const live = block.items.filter((item) => item.sets > 0)
    for (const a of live) for (const b of live) {
      if (a.index < b.index) expect(exercises[a.index]!.muscles.some((m) => exercises[b.index]!.muscles.includes(m))).toBe(false)
    }
    if (live.length > 1 && live.some((item) => item.index === main)) {
      // Partner work + transition + group rest between two main-lift sets.
      expect(40 + 20 + groupRestSec(live.map((item) => roles[item.index]!), result.shortRest, false)).toBeGreaterThanOrEqual(180)
    }
  }
}

describe('compressDay on the Upper day', () => {
  it('estimates the full day and leaves it alone when it fits', () => {
    const result = compressDay({ exercises: upper(), budgetMin: null })
    expect(result).toMatchObject({ mode: 'full', fits: true, shortRest: false })
    expect(min(result)).toBe(47.7)
    expect(min(compressDay({ exercises: upper(), budgetMin: 50 }))).toBe(47.7)
  })

  it('keeps all 19 sets at 45 min with the isolation circuit', () => {
    const exercises = upper()
    const result = compressDay({ exercises, budgetMin: 45 })
    expect(result).toMatchObject({ mode: 'compressed', fits: true, shortRest: false })
    expect(ids(result, exercises)).toEqual(['bench-press×4', 'lat-pulldown×3', 'seated-cable-row×3', 'db-lateral-raise×3 + db-curl×3 + tricep-pushdown×3'])
    expect(total(result)).toBe(19)
    expect(min(result)).toBe(41.7)
    invariants(result, exercises, 45)
  })

  it('drops one pull and a circuit round at 30 min, and the other pull the next time', () => {
    const exercises = upper()
    const first = compressDay({ exercises, budgetMin: 30 })
    expect(ids(first, exercises)).toEqual(['bench-press×4', 'lat-pulldown×3', 'db-lateral-raise×2 + db-curl×2 + tricep-pushdown×2'])
    expect(min(first)).toBe(30)
    const next = compressDay({ exercises, budgetMin: 30, protectedKeys: new Set(['global:seated-cable-row']) })
    expect(ids(next, exercises)).toEqual(['bench-press×4', 'seated-cable-row×3', 'db-lateral-raise×2 + db-curl×2 + tricep-pushdown×2'])
    invariants(first, exercises, 30)
  })

  it('cuts the main lift to 2 only at 20 min, keeping a pull and two circuit rounds', () => {
    const exercises = upper()
    const result = compressDay({ exercises, budgetMin: 20 })
    expect(ids(result, exercises)).toEqual(['bench-press×2', 'lat-pulldown×2', 'db-lateral-raise×2 + db-curl×2 + tricep-pushdown×2'])
    expect(min(result)).toBe(20)
    invariants(result, exercises, 20)
  })

  it('falls back to the maintenance pair, and says when even that does not fit', () => {
    const exercises = upper()
    const twelve = compressDay({ exercises, budgetMin: 12 })
    expect(twelve).toMatchObject({ mode: 'maintenance', fits: true })
    expect(ids(twelve, exercises)).toEqual(['bench-press×2 + lat-pulldown×2'])
    expect(min(twelve)).toBe(9.3)
    expect(ids(compressDay({ exercises, budgetMin: 13 }), exercises)).toEqual(['bench-press×2 + lat-pulldown×2', 'db-lateral-raise×1 + db-curl×1 + tricep-pushdown×1'])
    const eight = compressDay({ exercises, budgetMin: 8 })
    expect(eight).toMatchObject({ mode: 'maintenance', fits: false })
    expect(min(eight)).toBe(9.3)
    invariants(twelve, exercises, 12)
    invariants(eight, exercises, 8)
  })

  it('without supersets keeps every set at 45 min through shorter rests and cuts more at 30', () => {
    const exercises = upper()
    const at45 = compressDay({ exercises, budgetMin: 45, straight: true })
    expect(at45).toMatchObject({ mode: 'straight', shortRest: true })
    expect([total(at45), min(at45)]).toEqual([19, 44.7])
    const at30 = compressDay({ exercises, budgetMin: 30, straight: true })
    expect(ids(at30, exercises)).toEqual(['bench-press×4', 'lat-pulldown×2', 'db-lateral-raise×2', 'db-curl×2', 'tricep-pushdown×2'])
    expect(total(at30)).toBe(12)
    expect(total(compressDay({ exercises, budgetMin: 30 }))).toBe(13)
    expect(ids(compressDay({ exercises, budgetMin: 12, straight: true }), exercises)).toEqual(['bench-press×2', 'lat-pulldown×2'])
  })

  it('keeps 90 s rests on a low-readiness day and the main lift at 2 sets or more', () => {
    const exercises = upper().map((exercise, index) => ({ ...exercise, sets: index === 0 ? 3 : 2 }))
    expect(compressDay({ exercises, budgetMin: 45, lowReadiness: true })).toMatchObject({ mode: 'full', fits: true })
    expect(min(compressDay({ exercises, budgetMin: null, lowReadiness: true }))).toBe(32.2)
    const at20 = compressDay({ exercises, budgetMin: 20, lowReadiness: true })
    expect(at20.shortRest).toBe(false)
    invariants(at20, exercises, 20)
  })

  it('scales the estimate by the calibration factor', () => {
    expect(min(compressDay({ exercises: upper(), budgetMin: null, factor: 1.36 }))).toBe(64.8)
    expect(compressDay({ exercises: upper(), budgetMin: 45, factor: 1.36 }).sets.reduce((a, b) => a + b, 0)).toBeLessThan(19)
  })
})

describe('compressDay on other days', () => {
  it('Lower has no overlapping accessories, so 30 min trims accessories to 2, then the main lift', () => {
    const exercises = lower()
    const result = compressDay({ exercises, budgetMin: 30 })
    expect(ids(result, exercises)).toEqual(['squat×3', 'romanian-dl×2', 'leg-press×2', 'leg-curl×2 + leg-extension×2 + calf-raise×2'])
    expect(min(result)).toBe(28)
    invariants(result, exercises, 30)
  })

  it('pairs non-competing compounds on a full-body day and keeps the main lift straight', () => {
    const exercises = day(['squat', 3], ['bench-press', 3], ['barbell-row', 3], ['ohp', 3], ['db-curl', 3])
    const result = compressDay({ exercises, budgetMin: 30 })
    expect(ids(result, exercises).slice(0, 3)).toEqual(['squat×3', 'bench-press×3 + barbell-row×3', 'ohp×3 + db-curl×3'])
    invariants(result, exercises, 30)
  })

  it('handles machines only, two exercises and very short budgets', () => {
    const machines = day(['leg-press', 4], ['leg-curl', 3], ['leg-extension', 3], ['calf-raise', 3])
    expect(exerciseRoles(machines)[0]).toBe('main')
    for (const budget of [30, 20, 10, 5]) invariants(compressDay({ exercises: machines, budgetMin: budget }), machines, budget)
    const two = day(['bench-press', 4], ['lat-pulldown', 3])
    for (const budget of [20, 12, 8, 3]) invariants(compressDay({ exercises: two, budgetMin: budget }), two, budget)
  })

  it('leaves cardio as planned and never pairs or drops an exercise without muscles', () => {
    const exercises = [...upper(), ...day(['treadmill', 1])]
    exercises.splice(1, 0, { exerciseId: 'my-move', exerciseSource: 'user', sets: 3, muscles: [] })
    const result = compressDay({ exercises, budgetMin: 30 })
    expect(result.sets.at(-1)).toBe(1)
    expect(result.sets[1]).toBeGreaterThan(0)
    expect(result.blocks.find((block) => block.items.some((item) => item.index === 1))!.group).toBeNull()
    expect(exerciseRoles(day(['treadmill', 1], ['bench-press', 3]))).toEqual(['cardio', 'main'])
  })

  it('picks a barbell compound as the main lift, not a barbell curl', () => {
    expect(exerciseRoles(day(['barbell-curl', 3], ['leg-press', 3], ['squat', 3]))).toEqual(['isolation', 'compound', 'main'])
    expect(exerciseRoles(day(['barbell-curl', 3], ['leg-press', 3]))).toEqual(['isolation', 'main'])
  })

  it('handles the same exercise twice in a day', () => {
    const exercises = day(['bench-press', 3], ['lat-pulldown', 3], ['bench-press', 2])
    for (const budget of [20, 10]) invariants(compressDay({ exercises, budgetMin: budget }), exercises, budget)
  })
})

describe('calibration', () => {
  it('takes the clamped median of up to five plan-day workouts and needs two', () => {
    expect(calibration([{ realSec: 3900, estimateSec: 2860 }])).toEqual({ factor: 1, samples: 1 })
    expect(calibration([3900, 3600, 4200].map((realSec) => ({ realSec, estimateSec: 2860 }))).factor).toBeCloseTo(1.364, 3)
    expect(calibration([{ realSec: 9000, estimateSec: 2860 }, { realSec: 8000, estimateSec: 2860 }])).toEqual({ factor: 1.6, samples: 2 })
    expect(calibration([{ realSec: 12_000, estimateSec: 2860 }, { realSec: 3000, estimateSec: 2860 }]).samples).toBe(1)
  })
})

describe('isShortened', () => {
  const record = { exercises: [
    { dayExerciseIndex: 0, exerciseId: 'bench-press', exerciseSource: 'global' as const, plannedSets: 4, sets: 3 },
    { dayExerciseIndex: 1, exerciseId: 'lat-pulldown', exerciseSource: 'global' as const, plannedSets: 3, sets: 3 },
  ] }
  const sets = (...pairs: [number, number][]) => pairs.map(([weight, reps]) => ({ weight, reps }))

  it('flags a cut exercise only while fewer working sets than planned were done, ignoring warm-ups', () => {
    expect(isShortened(record, 'bench-press', 'global', sets([40, 5], [60, 3], [80, 8], [80, 8], [80, 8]))).toBe(true)
    expect(isShortened(record, 'bench-press', 'global', sets([80, 8], [80, 8], [80, 8], [80, 8]))).toBe(false)
    expect(isShortened(record, 'lat-pulldown', 'global', sets([50, 10]))).toBe(false)
    expect(isShortened(null, 'bench-press', 'global', sets([80, 8]))).toBe(false)
  })

  it('sums occurrences of one exercise', () => {
    const twice = { exercises: [
      { dayExerciseIndex: 0, exerciseId: 'bench-press', exerciseSource: 'global' as const, plannedSets: 3, sets: 2 },
      { dayExerciseIndex: 2, exerciseId: 'bench-press', exerciseSource: 'global' as const, plannedSets: 3, sets: 3 },
    ] }
    expect(isShortened(twice, 'bench-press', 'global', sets([80, 8], [80, 8], [80, 8], [80, 8], [80, 8]))).toBe(true)
    expect(isShortened(twice, 'bench-press', 'global', sets(...Array.from({ length: 6 }, (): [number, number] => [80, 8])))).toBe(false)
  })
})
