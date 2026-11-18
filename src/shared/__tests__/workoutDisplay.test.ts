import { describe, expect, it } from 'vitest'
import { focusExerciseIndex, nextGroupMember, reconcileRest, restAfterSet, restoredRest, trainingSinceLabel, upNextQueue } from '../workoutDisplay'
import type { Role } from '../compression'

it('dates training from the first workout when imported history is older than the account', () => {
  const account = new Date(2026, 3, 9).getTime()
  expect(trainingSinceLabel(account, new Date(2025, 10, 4).getTime())).toBe('Training since November 2025')
  expect(trainingSinceLabel(account, new Date(2026, 4, 1).getTime())).toBe('Training since April 2026')
  expect(trainingSinceLabel(account, null)).toBe('Training since April 2026')
})

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

  it('keeps a pair together when an earlier exercise still has open sets', () => {
    // After a cut the pair was reached out of order: Squat still has two open sets.
    const afterA1 = [exercise(2, 4), exercise(1, 2, 'g1'), exercise(0, 2, 'g1')]
    expect(focusExerciseIndex(afterA1)).toBe(0)
    expect(nextGroupMember(afterA1, 1)).toBe(2)
    expect(nextGroupMember([exercise(2, 4), exercise(1, 2, 'g1'), exercise(1, 2, 'g1')], 2)).toBe(1)
    expect(nextGroupMember([exercise(0, 1), exercise(2, 2, 'g1'), exercise(2, 2, 'g1')], 1)).toBeNull()
    expect(nextGroupMember([exercise(0, 2), exercise(0, 2)], 0)).toBeNull()
  })

  it('brings back the rest after the latest logged set when the app was killed', () => {
    const roles: Role[] = ['main', 'isolation']
    const at = 1_000_000
    const logged = [{ sets: [{ done: true, completedAt: at - 60_000 }, { done: true, completedAt: at }, { done: false }] }, { sets: [{ done: false }] }]
    expect(restoredRest(logged, roles, false, at + 30_000)).toEqual({ startedAt: at, totalSec: 180 })
    expect(restoredRest(logged, roles, false, at + 181_000)).toBeNull()
    expect(restoredRest([{ sets: [{ done: true }] }], roles, false, at)).toBeNull()
    // Inside an open round there is no rest to bring back.
    expect(restoredRest([{ group: 'g1', sets: [{ done: true, completedAt: at }, { done: false }] }, { group: 'g1', sets: [{ done: false }, { done: false }] }], ['isolation', 'isolation'], false, at + 1000)).toBeNull()
  })

  it('brings back a rest from a newer snapshot after a cached one, but keeps a rest this device started', () => {
    const roles: Role[] = ['main', 'isolation']
    const at = 1_000_000
    const snapshot = (...times: number[]) => ({ sessionId: 's1', exercises: [{ sets: times.map((completedAt) => ({ done: true, completedAt })).concat({ done: false } as never) }, { sets: [{ done: false }] }] })
    // The cache still has the set logged five minutes ago; the server copy has one logged ten seconds ago.
    const cached = reconcileRest(null, null, snapshot(at - 300_000), roles, false, at)
    expect(cached.rest).toBeNull()
    const fresh = reconcileRest(cached.rest, cached.checked, snapshot(at - 300_000, at - 10_000), roles, false, at)
    expect(fresh.rest).toEqual({ sessionId: 's1', startedAt: at - 10_000, totalSec: 180 })
    // Logged here with +30 s: the same snapshot again changes nothing, and a later Skip is not undone.
    const added = { sessionId: 's1', startedAt: at - 10_000, totalSec: 210 }
    expect(reconcileRest(added, fresh.checked, snapshot(at - 300_000, at - 10_000), roles, false, at).rest).toBe(added)
    expect(reconcileRest(null, fresh.checked, snapshot(at - 300_000, at - 10_000), roles, false, at).rest).toBeNull()
    const local = { sessionId: 's1', startedAt: at + 5_000, totalSec: 180 }
    const logged = reconcileRest(local, fresh.checked, snapshot(at - 300_000, at - 10_000, at + 5_003), roles, false, at + 6_000)
    expect(logged.rest).toBe(local)
    // Undo of that set after a Skip: the earlier set's rest stays skipped.
    expect(reconcileRest(null, logged.checked, snapshot(at - 300_000, at - 10_000), roles, false, at + 7_000).rest).toBeNull()
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
