import { describe, expect, it } from 'vitest'
import { focusExerciseIndex, restAfterSet, upNextQueue } from '../workoutDisplay'
import type { Role } from '../compression'

const exercise = (done: number, total: number, group?: string) => ({ ...(group ? { group } : {}), sets: Array.from({ length: total }, (_, index) => ({ done: index < done })) })
// Walks a session set by set from focus to focus.
function walk(exercises: ReturnType<typeof exercise>[]): number[] {
  const order: number[] = []
  for (let guard = 0; guard < 50 && exercises.some((entry) => entry.sets.some((set) => !set.done)); guard++) {
    const index = focusExerciseIndex(exercises)
    order.push(index)
    exercises[index]!.sets.find((set) => !set.done)!.done = true
  }
  return order
}

describe('session flow', () => {
  it('runs a session without groups exercise by exercise, as before', () => {
    expect(walk([exercise(0, 2), exercise(0, 1)])).toEqual([0, 0, 1])
    expect(upNextQueue([exercise(0, 2), exercise(0, 1), exercise(0, 1), exercise(0, 1)], 2)).toEqual([3, 0, 1])
  })

  it('runs a pair and a 3/3/2 circuit in rounds and skips a member without a set', () => {
    expect(walk([exercise(0, 2), exercise(0, 2, 'g1'), exercise(0, 2, 'g1')])).toEqual([0, 0, 1, 2, 1, 2])
    expect(walk([exercise(0, 3, 'g1'), exercise(0, 3, 'g1'), exercise(0, 2, 'g1')])).toEqual([0, 1, 2, 0, 1, 2, 0, 1])
    expect(upNextQueue([exercise(1, 3, 'g1'), exercise(0, 3, 'g1'), exercise(0, 2, 'g1')], 1)).toEqual([2, 0])
  })

  it('rests by role, not after a set that leaves its round open, and by the group after a round', () => {
    const roles: Role[] = ['main', 'compound', 'isolation', 'isolation']
    const straight = [exercise(1, 4), exercise(1, 3), exercise(1, 3), exercise(0, 3)]
    expect([0, 1, 2].map((index) => restAfterSet(straight, index, roles, false))).toEqual([180, 120, 90])
    expect(restAfterSet(straight, 2, roles, true)).toBe(60)
    const pair = [exercise(0, 4), exercise(0, 3), exercise(1, 3, 'g1'), exercise(0, 3, 'g1')]
    expect(restAfterSet(pair, 2, roles, false)).toBe(0)
    pair[3] = exercise(1, 3, 'g1')
    expect([restAfterSet(pair, 3, roles, false), restAfterSet(pair, 3, roles, true)]).toEqual([90, 60])
    const withMain = [exercise(1, 2, 'g1'), exercise(1, 2, 'g1')]
    expect(restAfterSet(withMain, 1, ['main', 'compound'], true)).toBe(120)
    // The partner has no third set, so the third set rests like a straight set.
    expect(restAfterSet([exercise(3, 3, 'g1'), exercise(2, 2, 'g1')], 0, ['isolation', 'isolation'], false)).toBe(90)
  })
})
