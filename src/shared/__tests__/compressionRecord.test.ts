import { describe, expect, it } from 'vitest'
import { isValidLaunchList, parseCompressionRecord, parseGroup, parseProposals, type CompressionRecord } from '../compressionRecord'

const record: CompressionRecord = {
  v: 1, budgetMin: 45, mode: 'compressed', shortRest: true, estimateMin: 43.9, fullEstimateMin: 60.7, factor: 1.2, samples: 0, calibration: 'none', readiness: null,
  exercises: [{ dayExerciseIndex: 0, exerciseId: 'bench-press', exerciseSource: 'global', plannedSets: 4, sets: 4 }, { dayExerciseIndex: 2, exerciseId: 'seated-cable-row', exerciseSource: 'global', plannedSets: 3, sets: 0 }],
}

describe('parseCompressionRecord', () => {
  it('keeps a valid record and drops unknown fields', () => {
    expect(parseCompressionRecord({ ...record, extra: 1 })).toEqual(record)
  })

  it('turns any malformed record into null', () => {
    for (const bad of [null, [], { ...record, v: 2 }, { ...record, mode: 'usual' }, { ...record, calibration: 'x' }, { ...record, budgetMin: 0 },
      { ...record, exercises: Array.from({ length: 21 }, () => record.exercises[0]) },
      { ...record, exercises: [{ ...record.exercises[0], sets: 21 }] }, { ...record, exercises: [{ ...record.exercises[0], exerciseSource: 'x' }] }]) {
      expect(parseCompressionRecord(bad)).toBeNull()
    }
  })
})

describe('parseProposals and parseGroup', () => {
  it('accepts up to 12 taps including the usual day', () => {
    expect(parseProposals([{ budgetMin: 30, mode: 'compressed' }, { budgetMin: null, mode: 'usual' }])).toHaveLength(2)
    expect(parseProposals(Array.from({ length: 13 }, () => ({ budgetMin: null, mode: 'usual' })))).toBeNull()
    expect(parseProposals([{ budgetMin: 30, mode: 'other' }])).toBeNull()
    expect(parseProposals([])).toBeNull()
  })

  it('accepts short group names only', () => {
    expect(parseGroup('g1')).toBe('g1')
    expect(parseGroup('a'.repeat(17))).toBeNull()
    expect(parseGroup('g 1')).toBeNull()
  })
})

describe('isValidLaunchList', () => {
  const day = [{ sets: 4 }, { sets: 3 }, { sets: 3 }]
  it('allows a reordered subset with fewer sets and groups', () => {
    expect(isValidLaunchList(day, [{ dayExerciseIndex: 0, sets: 2, weight: 80, reps: 8 }, { dayExerciseIndex: 2, sets: 3, weight: 50, reps: 10, group: 'g1' }, { dayExerciseIndex: 1, sets: 1, weight: 0, reps: 0, group: 'g1' }])).toBe(true)
  })
  it('rejects an empty list, an index outside the day, a repeated index and more sets than planned', () => {
    expect(isValidLaunchList(day, [])).toBe(false)
    expect(isValidLaunchList(day, [{ dayExerciseIndex: 3, sets: 1, weight: 0, reps: 0 }])).toBe(false)
    expect(isValidLaunchList(day, [{ dayExerciseIndex: 1, sets: 1, weight: 0, reps: 0 }, { dayExerciseIndex: 1, sets: 1, weight: 0, reps: 0 }])).toBe(false)
    expect(isValidLaunchList(day, [{ dayExerciseIndex: 0, sets: 5, weight: 0, reps: 0 }])).toBe(false)
  })
})
