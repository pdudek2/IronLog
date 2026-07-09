import { beforeEach, describe, expect, it } from 'vitest'
import { stripWorkoutClientIds, useWorkoutStore } from './workoutStore'

describe('workoutStore set steppers', () => {
  beforeEach(() => {
    useWorkoutStore.setState({ active: null })
  })

  it('accumulates rapid weight adjustments from the latest store value', () => {
    const store = useWorkoutStore.getState()
    store.hydrateFromDoc({
      startedAt: 1,
      exercises: [
        {
          exerciseId: 'bench-press',
          exerciseSource: 'global',
          name: 'Bench Press',
          sets: [{ weight: '80', reps: '5', done: false }],
        },
      ],
    })

    const { adjustSet } = useWorkoutStore.getState()
    adjustSet(0, 0, 'weight', 2.5)
    adjustSet(0, 0, 'weight', 2.5)
    adjustSet(0, 0, 'weight', 2.5)

    expect(useWorkoutStore.getState().active?.exercises[0]?.sets[0]?.weight).toBe('87.5')
  })

  it('accumulates rapid rep adjustments and clamps at zero', () => {
    const store = useWorkoutStore.getState()
    store.hydrateFromDoc({
      startedAt: 1,
      exercises: [
        {
          exerciseId: 'bench-press',
          exerciseSource: 'global',
          name: 'Bench Press',
          sets: [{ weight: '80', reps: '1', done: false }],
        },
      ],
    })

    const { adjustSet } = useWorkoutStore.getState()
    adjustSet(0, 0, 'reps', 1)
    adjustSet(0, 0, 'reps', 1)
    adjustSet(0, 0, 'reps', -5)

    expect(useWorkoutStore.getState().active?.exercises[0]?.sets[0]?.reps).toBe('0')
  })

  it('replaces only the touched exercise object when updating a set', () => {
    useWorkoutStore.getState().hydrateFromDoc({
      startedAt: 1,
      exercises: [
        {
          exerciseId: 'bench-press',
          exerciseSource: 'global',
          name: 'Bench Press',
          sets: [{ weight: '80', reps: '5', done: false }],
        },
        {
          exerciseId: 'squat',
          exerciseSource: 'global',
          name: 'Squat',
          sets: [{ weight: '120', reps: '5', done: false }],
        },
      ],
    })

    const before = useWorkoutStore.getState().active

    useWorkoutStore.getState().updateSet(0, 0, 'weight', '82.5')

    const after = useWorkoutStore.getState().active

    expect(after?.exercises[0]).not.toBe(before?.exercises[0])
    expect(after?.exercises[1]).toBe(before?.exercises[1])
  })

  it('replaces only the touched exercise object when adjusting a set', () => {
    useWorkoutStore.getState().hydrateFromDoc({
      startedAt: 1,
      exercises: [
        {
          exerciseId: 'bench-press',
          exerciseSource: 'global',
          name: 'Bench Press',
          sets: [{ weight: '80', reps: '5', done: false }],
        },
        {
          exerciseId: 'squat',
          exerciseSource: 'global',
          name: 'Squat',
          sets: [{ weight: '120', reps: '5', done: false }],
        },
      ],
    })

    const before = useWorkoutStore.getState().active

    useWorkoutStore.getState().adjustSet(1, 0, 'reps', 1)

    const after = useWorkoutStore.getState().active

    expect(after?.exercises[1]).not.toBe(before?.exercises[1])
    expect(after?.exercises[0]).toBe(before?.exercises[0])
  })
})

describe('workoutStore completed set validation', () => {
  beforeEach(() => {
    useWorkoutStore.setState({ active: null })
  })

  it('does not complete a set without repetitions', () => {
    useWorkoutStore.getState().hydrateFromDoc({
      startedAt: 1,
      exercises: [
        {
          exerciseId: 'bench-press',
          exerciseSource: 'global',
          name: 'Bench Press',
          sets: [{ weight: '80', reps: '', done: false }],
        },
      ],
    })

    useWorkoutStore.getState().toggleSetDone(0, 0)

    expect(useWorkoutStore.getState().active?.exercises[0]?.sets[0]?.done).toBe(false)
  })

  it('allows a bodyweight set with repetitions and no weight', () => {
    useWorkoutStore.getState().hydrateFromDoc({
      startedAt: 1,
      exercises: [
        {
          exerciseId: 'pull-up',
          exerciseSource: 'global',
          name: 'Pull-up',
          sets: [{ weight: '', reps: '8', done: false }],
        },
      ],
    })

    useWorkoutStore.getState().toggleSetDone(0, 0)

    expect(useWorkoutStore.getState().active?.exercises[0]?.sets[0]?.done).toBe(true)
  })

  it('clears the completed state when repetitions are removed', () => {
    useWorkoutStore.getState().hydrateFromDoc({
      startedAt: 1,
      exercises: [
        {
          exerciseId: 'bench-press',
          exerciseSource: 'global',
          name: 'Bench Press',
          sets: [{ weight: '80', reps: '5', done: true }],
        },
      ],
    })

    useWorkoutStore.getState().updateSet(0, 0, 'reps', '')

    expect(useWorkoutStore.getState().active?.exercises[0]?.sets[0]?.done).toBe(false)
  })

  it('normalizes invalid completed sets when restoring a session', () => {
    useWorkoutStore.getState().hydrateFromDoc({
      startedAt: 1,
      exercises: [
        {
          exerciseId: 'bench-press',
          exerciseSource: 'global',
          name: 'Bench Press',
          sets: [{ weight: '80', reps: '0', done: true }],
        },
      ],
    })

    expect(useWorkoutStore.getState().active?.exercises[0]?.sets[0]?.done).toBe(false)
  })
})

describe('workoutStore client IDs', () => {
  beforeEach(() => {
    useWorkoutStore.setState({ active: null })
  })

  it('creates client IDs for new exercises and sets', () => {
    const store = useWorkoutStore.getState()
    store.startWorkout()
    useWorkoutStore.getState().addExercise('bench-press', 'Bench Press', 'global')

    const exercise = useWorkoutStore.getState().active?.exercises[0]

    expect(exercise?.clientId).toMatch(/^exercise-/)
    expect(exercise?.sets[0]?.clientId).toMatch(/^set-/)
  })

  it('adds missing client IDs when hydrating an active session', () => {
    useWorkoutStore.getState().hydrateFromDoc({
      startedAt: 1,
      exercises: [
        {
          exerciseId: 'bench-press',
          exerciseSource: 'global',
          name: 'Bench Press',
          sets: [{ weight: '80', reps: '5', done: false }],
        },
      ],
    })

    const exercise = useWorkoutStore.getState().active?.exercises[0]

    expect(exercise?.clientId).toMatch(/^exercise-/)
    expect(exercise?.sets[0]?.clientId).toMatch(/^set-/)
  })

  it('keeps remaining set client IDs stable when removing a set', () => {
    const store = useWorkoutStore.getState()
    store.startWorkout()
    useWorkoutStore.getState().addExercise('bench-press', 'Bench Press', 'global')
    useWorkoutStore.getState().addSet(0)

    const secondSetId = useWorkoutStore.getState().active?.exercises[0]?.sets[1]?.clientId

    useWorkoutStore.getState().removeSet(0, 0)

    expect(useWorkoutStore.getState().active?.exercises[0]?.sets[0]?.clientId).toBe(secondSetId)
  })

  it('strips client IDs before persistence', () => {
    const clean = stripWorkoutClientIds({
      startedAt: 1,
      exercises: [
        {
          clientId: 'exercise-local',
          exerciseId: 'bench-press',
          exerciseSource: 'global',
          name: 'Bench Press',
          sets: [{ clientId: 'set-local', weight: '80', reps: '5', done: true }],
        },
      ],
    })

    expect(clean.exercises[0]).not.toHaveProperty('clientId')
    expect(clean.exercises[0]?.sets[0]).not.toHaveProperty('clientId')
  })
})
