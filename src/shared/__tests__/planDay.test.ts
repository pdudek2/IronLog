import { describe, expect, it } from 'vitest'

import { newPlanDayId, planDayId, PLAN_DAY_ID_PATTERN } from '../planDay'
import { nextPlanWorkout } from '../week'

const day = (id?: string, exercises = 1) => ({ ...(id ? { id } : {}), exercises: Array.from({ length: exercises }, () => ({})) })
const plan = { id: 'ul', days: [day('upper-a'), day('lower-a'), day('rest', 0), day('upper-b')] }
const done = (planDayId: string | null, finishedAt: number, templateId: string | null = 'ul') => ({ templateId, planDayId, finishedAt })

describe('planDayId', () => {
  it('reads a stored id and gives a legacy day its index', () => {
    expect(planDayId({ id: 'upper-a' }, 0)).toBe('upper-a')
    expect(planDayId({}, 2)).toBe('d2')
    expect(planDayId({ id: 'bad id!' }, 1)).toBe('d1')
    expect(newPlanDayId()).toMatch(PLAN_DAY_ID_PATTERN)
    expect(newPlanDayId()).not.toMatch(/^d\d+$/)
  })
})

describe('nextPlanWorkout', () => {
  it('proposes the day after the last finished one, skips empty days and wraps', () => {
    expect(nextPlanWorkout([plan], [done('upper-a', 1)])).toEqual({ templateId: 'ul', dayIndex: 1 })
    expect(nextPlanWorkout([plan], [done('lower-a', 1)])).toEqual({ templateId: 'ul', dayIndex: 3 })
    expect(nextPlanWorkout([plan], [done('upper-b', 1)])).toEqual({ templateId: 'ul', dayIndex: 0 })
  })

  it('follows the most recently finished plan workout, out of order or in another plan', () => {
    const other = { id: 'ppl', days: [day('push'), day('pull')] }
    expect(nextPlanWorkout([plan, other], [done('lower-a', 5), done('upper-b', 9)])).toEqual({ templateId: 'ul', dayIndex: 0 })
    expect(nextPlanWorkout([plan, other], [done('upper-a', 5), done('push', 9, 'ppl'), done(null, 12, null)])).toEqual({ templateId: 'ppl', dayIndex: 1 })
  })

  it('starts the plan from its first day when the day is unknown or deleted', () => {
    expect(nextPlanWorkout([plan], [done(null, 1)])).toEqual({ templateId: 'ul', dayIndex: 0 })
    expect(nextPlanWorkout([plan], [done('deleted', 1)])).toEqual({ templateId: 'ul', dayIndex: 0 })
    expect(nextPlanWorkout([{ id: 'legacy', days: [day(), day()] }], [done('d0', 1, 'legacy')])).toEqual({ templateId: 'legacy', dayIndex: 1 })
  })

  it('falls back to the first launchable day without plan workouts or with a deleted plan', () => {
    expect(nextPlanWorkout([plan], [])).toEqual({ templateId: 'ul', dayIndex: 0 })
    expect(nextPlanWorkout([plan], [done('upper-a', 1, 'gone')])).toEqual({ templateId: 'ul', dayIndex: 0 })
    expect(nextPlanWorkout([], [done('upper-a', 1)])).toBeNull()
  })
})
