import { describe, expect, it } from 'vitest'
import { mutationRequestHash, parseWorkoutMutationGuard, workoutContentBaseline } from '../workoutMutationGuard'
const guard = { operationId: 'operation-one', baseline: 'a'.repeat(64) }
const ex = { exerciseId: 'same', exerciseSource: 'global' as const, name: 'Row', sets: [{ weight: 42.375, reps: 8 }] }
const workout = { userId: 'u', startedAt: 1, finishedAt: 2, label: null, exercises: [ex] }
describe('workout operation identity', () => {
  it.each([{ operationId: 'operation-one' }, { baseline: guard.baseline }, { ...guard, baseline: 'not-a-hash' }, { ...guard, operationId: '../bad' }])('rejects malformed or partial guards %j', raw => {
    expect(() => parseWorkoutMutationGuard(raw)).toThrow()
  })
  it('retains unguarded compatibility and validates the paired guard', () => {
    expect(parseWorkoutMutationGuard({})).toBe(null)
    expect(parseWorkoutMutationGuard(guard)).toEqual(guard)
  })
  it('binds baseline to exact source, ordered sets, labels, timestamps and identity', () => {
    const baseline = workoutContentBaseline('w', workout)
    for (const changed of [{ ...workout, userId: 'other' }, { ...workout, startedAt: 2 }, { ...workout, label: 'New' },
      { ...workout, exercises: [{ ...ex, exerciseSource: 'user' as const }] },
      { ...workout, exercises: [ex, ex] }]) expect(workoutContentBaseline('w', changed)).not.toBe(baseline)
    expect(workoutContentBaseline('other', workout)).not.toBe(baseline)
    expect(mutationRequestHash('u', 'w', 'delete', guard)).not.toBe(mutationRequestHash('u', 'w', 'update', guard, workout))
  })
})
