import assert from 'node:assert/strict'
import test from 'node:test'

import { displayWeightDeltaToKg, displayWeightStringToKg, kgStringToDisplayWeight } from '../../src/shared/weightUnits'
import { addSet, adjustSetValue, removeSet, setSetDone, updateSetValue } from './setMutations'
import type { ActiveWorkout } from './session'

function workout(): ActiveWorkout {
  return {
    sessionId: 'session-a', sessionRevision: 'revision-a', startedAt: 1, templateId: null,
    exercises: [{
      clientId: 'exercise-a', exerciseId: 'squat', exerciseSource: 'global', name: 'Squat', custom: { keep: true },
      sets: [
        { clientId: 'set-a', weight: '100', reps: '5', done: false, note: 'keep me' },
        { clientId: 'set-b', weight: '', reps: '', done: false },
      ],
    }],
  }
}

test('mutations use stable row identity and preserve unknown metadata', () => {
  const removed = removeSet(workout(), 'exercise-a', 'set-a')
  const edited = updateSetValue(removed, 'exercise-a', 'set-b', 'reps', '8')
  assert.deepEqual(edited.exercises[0]?.custom, { keep: true })
  assert.equal(edited.exercises[0]?.sets[0]?.clientId, 'set-b')
  assert.equal(edited.exercises[0]?.sets[0]?.reps, '8')

  const original = updateSetValue(workout(), 'exercise-a', 'set-a', 'weight', '105')
  assert.equal(original.exercises[0]?.sets[0]?.note, 'keep me')
})

test('completion enforces finalizer bounds and invalid reps unmark a set', () => {
  assert.equal(setSetDone(workout(), 'exercise-a', 'set-a', true).exercises[0]?.sets[0]?.done, true)
  const tooHeavy = updateSetValue(workout(), 'exercise-a', 'set-a', 'weight', '2000.1')
  assert.equal(setSetDone(tooHeavy, 'exercise-a', 'set-a', true).exercises[0]?.sets[0]?.done, false)
  const tooManyReps = updateSetValue(workout(), 'exercise-a', 'set-a', 'reps', '1001')
  assert.equal(setSetDone(tooManyReps, 'exercise-a', 'set-a', true).exercises[0]?.sets[0]?.done, false)
  const done = setSetDone(workout(), 'exercise-a', 'set-a', true)
  assert.equal(updateSetValue(done, 'exercise-a', 'set-a', 'reps', '').exercises[0]?.sets[0]?.done, false)
  assert.equal(updateSetValue(done, 'exercise-a', 'set-a', 'weight', '2001').exercises[0]?.sets[0]?.done, false)

  const full = workout()
  full.exercises[0]!.sets = Array.from({ length: 21 }, (_, index) => ({
    clientId: `set-${index}`, weight: '10', reps: '1', done: index < 20,
  }))
  assert.equal(setSetDone(full, 'exercise-a', 'set-20', true).exercises[0]?.sets[20]?.done, false)
})

test('append copies the last nonblank values, remove may leave zero sets, and adjustments clamp at zero', () => {
  const appended = addSet(workout(), 'exercise-a')
  assert.deepEqual(appended.exercises[0]?.sets.at(-1), {
    clientId: appended.exercises[0]?.sets.at(-1)?.clientId,
    weight: '', reps: '', done: false,
  })
  const one = removeSet(removeSet(workout(), 'exercise-a', 'set-b'), 'exercise-a', 'set-a')
  assert.equal(one.exercises[0]?.sets.length, 0)
  assert.equal(adjustSetValue(workout(), 'exercise-a', 'set-a', 'weight', -102.5).exercises[0]?.sets[0]?.weight, '0')
  assert.equal(adjustSetValue(workout(), 'exercise-a', 'set-a', 'reps', 1).exercises[0]?.sets[0]?.reps, '6')
})

test('lbs input and quick adjustments round-trip through canonical kg', () => {
  const kg = displayWeightStringToKg('143.3', 'lbs')
  assert.equal(kgStringToDisplayWeight(kg, 'lbs'), '143.3')
  const changed = adjustSetValue(workout(), 'exercise-a', 'set-a', 'weight', displayWeightDeltaToKg(2.5, 'lbs'))
  assert.equal(kgStringToDisplayWeight(changed.exercises[0]!.sets[0]!.weight, 'lbs'), '223')
})
