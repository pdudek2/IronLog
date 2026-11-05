import assert from 'node:assert/strict'
import test from 'node:test'

import { displayWeightDeltaToKg, displayWeightStringToKg, kgStringToDisplayWeight } from '../../src/shared/weightUnits'
import {
  addExercise, addSet, adjustSetValue, applyOverload, exerciseHasEnteredSets, MAX_SESSION_EXERCISES, prefillFirstSet,
  removeExercise, removeSet, setDoneError, setLabel, setSetDone, updateSetValue,
} from './setMutations'
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

test('a set carries its completion time only while it is done', () => {
  const done = setSetDone(workout(), 'exercise-a', 'set-a', true)
  const stamped = done.exercises[0]?.sets[0]?.completedAt
  assert.equal(typeof stamped, 'number')
  assert.equal(setSetDone(done, 'exercise-a', 'set-a', true).exercises[0]?.sets[0]?.completedAt, stamped)
  assert.equal(adjustSetValue(done, 'exercise-a', 'set-a', 'weight', 2.5).exercises[0]?.sets[0]?.completedAt, stamped)
  assert.equal('completedAt' in setSetDone(done, 'exercise-a', 'set-a', false).exercises[0]!.sets[0]!, false)
  assert.equal('completedAt' in updateSetValue(done, 'exercise-a', 'set-a', 'reps', '').exercises[0]!.sets[0]!, false)
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

  assert.equal(setDoneError(workout(), 'exercise-a', 'set-a'), null)
  const noReps = updateSetValue(workout(), 'exercise-a', 'set-a', 'reps', '')
  assert.match(setDoneError(noReps, 'exercise-a', 'set-a') ?? '', /^Enter whole reps/)
  assert.match(setDoneError(tooHeavy, 'exercise-a', 'set-a') ?? '', /^Weight cannot/)
  assert.match(setDoneError(full, 'exercise-a', 'set-20') ?? '', /up to 20 completed sets/)
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

test('exercise add appends one blank set, stops at the rules limit, and removal is by client id', () => {
  const added = addExercise(workout(), { clientId: 'exercise-b', exerciseId: 'custom-1', exerciseSource: 'user', name: 'Mine' })
  const exercise = added.exercises[1]!
  assert.equal(exercise.exerciseSource, 'user')
  assert.deepEqual(exercise.sets.map(({ weight, reps, done }) => ({ weight, reps, done })), [{ weight: '', reps: '', done: false }])
  assert.equal(exerciseHasEnteredSets(exercise), false)
  assert.equal(exerciseHasEnteredSets(workout().exercises[0]!), true)

  const removed = removeExercise(added, 'exercise-a')
  assert.deepEqual(removed.exercises.map(({ clientId }) => clientId), ['exercise-b'])

  const full = workout()
  full.exercises = Array.from({ length: MAX_SESSION_EXERCISES }, (_, index) => ({ ...workout().exercises[0]!, clientId: `e-${index}` }))
  assert.equal(addExercise(full, { clientId: 'x', exerciseId: 'squat', exerciseSource: 'global', name: 'Squat' }), full)
})

test('label is trimmed and a blank label clears the field', () => {
  const labelled = setLabel(workout(), ' Push ')
  assert.equal(labelled.label, 'Push')
  assert.equal('label' in setLabel(labelled, ''), false)
})

test('an applied suggestion changes every open set and leaves finished sets as logged', () => {
  const session = {
    exercises: [{ clientId: 'bench', sets: [
      { clientId: 'a', weight: '85', reps: '6', done: true },
      { clientId: 'b', weight: '85', reps: '6', done: false },
      { clientId: 'c', weight: '', reps: '', done: false },
    ] }, { clientId: 'row', sets: [{ clientId: 'd', weight: '60', reps: '8', done: false }] }],
  } as unknown as ActiveWorkout
  const next = applyOverload(session, 'bench', { weight: 87.5, reps: 7 })
  assert.deepEqual(next.exercises[0]!.sets.map((set) => [set.weight, set.reps]), [['85', '6'], ['87.5', '7'], ['87.5', '7']])
  assert.equal(next.exercises[1]!.sets[0]!.weight, '60')
})

test('prefill fills only an untouched first set of the added exercise', () => {
  const session = {
    exercises: [
      { clientId: 'new', sets: [{ clientId: 'a', weight: '', reps: '', done: false }] },
      { clientId: 'typed', sets: [{ clientId: 'b', weight: '', reps: '8', done: false }] },
    ],
  } as unknown as ActiveWorkout
  const next = prefillFirstSet(session, 'new', 82.5, 6)
  assert.deepEqual(next.exercises[0]!.sets[0], { clientId: 'a', weight: '82.5', reps: '6', done: false })
  assert.equal(next.exercises[1]!.sets[0]!.weight, '')
  assert.equal(prefillFirstSet(session, 'typed', 82.5, 6).exercises[1]!.sets[0]!.weight, '')
  assert.equal(prefillFirstSet(session, 'new', 82.5, 0).exercises[0]!.sets[0]!.reps, '')
})
