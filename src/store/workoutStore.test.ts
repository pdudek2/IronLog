import { beforeEach, describe, expect, it } from 'vitest'
import { stripWorkoutClientIds, useWorkoutStore } from './workoutStore'

describe('workoutStore set steppers', () => {
  beforeEach(() => {
    useWorkoutStore.setState({ active: null })
  })

  it('keeps a running rest deadline for the same session and clears it when session authority changes', () => {
    const first = {
      sessionId: 'session-1',
      startedAt: 100,
      exercises: [],
    }
    useWorkoutStore.getState().hydrateFromDoc(first)
    useWorkoutStore.getState().startRestTimer(90, 500)

    useWorkoutStore.getState().hydrateFromDoc({ ...first, label: 'Push' })
    expect(useWorkoutStore.getState().restTimer).toEqual({ startedAt: 500, totalSec: 90 })

    useWorkoutStore.getState().hydrateFromDoc({ ...first, sessionId: 'session-2' })
    expect(useWorkoutStore.getState().restTimer).toBeNull()
  })

  it('accumulates rapid weight adjustments from the latest store value', () => {
    const store = useWorkoutStore.getState()
    store.hydrateFromDoc({
      sessionId: 'session-1',
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

  it('keeps lbs steps exact in kg, so +2.5 and -2.5 lbs return to the start', () => {
    const lbsStepKg = 2.5 / 2.2046226218
    useWorkoutStore.getState().hydrateFromDoc({
      sessionId: 'session-1',
      startedAt: 1,
      exercises: [{ exerciseId: 'bench-press', exerciseSource: 'global', name: 'Bench Press', sets: [{ weight: '61.235', reps: '5', done: false }] }],
    })

    const { adjustSet } = useWorkoutStore.getState()
    adjustSet(0, 0, 'weight', lbsStepKg)
    expect(useWorkoutStore.getState().active?.exercises[0]?.sets[0]?.weight).toBe('62.369')
    adjustSet(0, 0, 'weight', -lbsStepKg)
    expect(useWorkoutStore.getState().active?.exercises[0]?.sets[0]?.weight).toBe('61.235')
  })

  it('accumulates rapid rep adjustments and clamps at zero', () => {
    const store = useWorkoutStore.getState()
    store.hydrateFromDoc({
      sessionId: 'session-1',
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
      sessionId: 'session-1',
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
      sessionId: 'session-1',
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
      sessionId: 'session-1',
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
      sessionId: 'session-1',
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
      sessionId: 'session-1',
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

  it('completes only sets the finish endpoint accepts', () => {
    const sets = [['80', '8.5'], ['-20', '8'], ['2500', '5'], ['20', '1500'], ['20', '8']]
      .map(([weight, reps]) => ({ weight, reps, done: false }))
    useWorkoutStore.getState().hydrateFromDoc({
      sessionId: 'session-1',
      startedAt: 1,
      exercises: [{ exerciseId: 'bench-press', exerciseSource: 'global', name: 'Bench Press', sets }],
    })

    sets.forEach((_, index) => useWorkoutStore.getState().toggleSetDone(0, index))

    expect(useWorkoutStore.getState().active?.exercises[0]?.sets.map((set) => set.done))
      .toEqual([false, false, false, false, true])
  })

  it('caps completed sets per exercise and exercises per session', () => {
    useWorkoutStore.getState().hydrateFromDoc({
      sessionId: 'session-1',
      startedAt: 1,
      exercises: Array.from({ length: 20 }, (_, index) => ({
        exerciseId: `exercise-${index}`,
        exerciseSource: 'global' as const,
        name: `Exercise ${index}`,
        sets: Array.from({ length: 21 }, () => ({ weight: '20', reps: '8', done: false })),
      })),
    })

    for (let index = 0; index < 21; index += 1) useWorkoutStore.getState().toggleSetDone(0, index)
    useWorkoutStore.getState().addExercise('one-more', 'One more', 'global')

    expect(useWorkoutStore.getState().active?.exercises[0]?.sets.filter((set) => set.done)).toHaveLength(20)
    expect(useWorkoutStore.getState().active?.exercises).toHaveLength(20)
  })

  it('normalizes invalid completed sets when restoring a session', () => {
    useWorkoutStore.getState().hydrateFromDoc({
      sessionId: 'session-1',
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

  it('keeps row ids when the same session is refreshed from the server, so inputs keep focus', () => {
    const doc = (reps: string, sessionId = 'session-1') => ({
      sessionId,
      startedAt: 1,
      exercises: [{ exerciseId: 'bench-press', exerciseSource: 'global' as const, name: 'Bench Press', sets: [{ weight: '80', reps, done: false }] }],
    })
    useWorkoutStore.getState().hydrateFromDoc(doc('5'))
    const first = useWorkoutStore.getState().active!.exercises[0]
    useWorkoutStore.getState().hydrateFromDoc(doc('6'))
    const refreshed = useWorkoutStore.getState().active!.exercises[0]
    expect(refreshed.clientId).toBe(first.clientId)
    expect(refreshed.sets[0].clientId).toBe(first.sets[0].clientId)
    expect(refreshed.sets[0].reps).toBe('6')

    useWorkoutStore.getState().hydrateFromDoc(doc('6', 'session-2'))
    expect(useWorkoutStore.getState().active!.exercises[0].clientId).not.toBe(first.clientId)
  })

  it('creates client IDs for new exercises and sets', () => {
    const store = useWorkoutStore.getState()
    store.startWorkout()
    useWorkoutStore.getState().addExercise('bench-press', 'Bench Press', 'global')

    const exercise = useWorkoutStore.getState().active?.exercises[0]

    expect(exercise?.clientId).toMatch(/^exercise-/)
    expect(exercise?.sets[0]?.clientId).toMatch(/^set-/)
  })

  it('assigns one stable session ID when starting and editing a workout', () => {
    const store = useWorkoutStore.getState()
    store.startWorkout()
    const sessionId = useWorkoutStore.getState().active?.sessionId

    expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/)

    useWorkoutStore.getState().setLabel('Push')
    useWorkoutStore.getState().addExercise('bench-press', 'Bench Press', 'global')
    useWorkoutStore.getState().updateSet(0, 0, 'weight', '80')

    expect(useWorkoutStore.getState().active?.sessionId).toBe(sessionId)
  })

  it('adds missing client IDs when hydrating an active session', () => {
    useWorkoutStore.getState().hydrateFromDoc({
      sessionId: 'session-1',
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
      sessionId: 'session-1',
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
