import { beforeEach, describe, expect, it } from 'vitest'
import { useWorkoutStore } from './workoutStore'

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
})
