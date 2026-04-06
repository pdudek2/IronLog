import { create } from 'zustand'

export interface WorkoutSet {
  weight: string
  reps: string
  done: boolean
}

export interface WorkoutExercise {
  exerciseId: string
  name: string
  sets: WorkoutSet[]
}

export interface ActiveWorkout {
  startedAt: number
  exercises: WorkoutExercise[]
}

interface WorkoutState {
  active: ActiveWorkout | null
  startWorkout: () => void
  addExercise: (exerciseId: string, name: string) => void
  addSet: (exerciseIndex: number) => void
  removeSet: (exerciseIndex: number, setIndex: number) => void
  updateSet: (exerciseIndex: number, setIndex: number, field: 'weight' | 'reps', value: string) => void
  toggleSetDone: (exerciseIndex: number, setIndex: number) => void
  removeExercise: (exerciseIndex: number) => void
  clearWorkout: () => void
}

const emptySet = (): WorkoutSet => ({ weight: '', reps: '', done: false })

export const useWorkoutStore = create<WorkoutState>((set) => ({
  active: null,

  startWorkout: () =>
    set({ active: { startedAt: Date.now(), exercises: [] } }),

  addExercise: (exerciseId, name) =>
    set((s) => {
      if (!s.active) return s
      return {
        active: {
          ...s.active,
          exercises: [...s.active.exercises, { exerciseId, name, sets: [emptySet()] }],
        },
      }
    }),

  addSet: (exerciseIndex) =>
    set((s) => {
      if (!s.active) return s
      const exercises = s.active.exercises.map((ex, i) =>
        i === exerciseIndex ? { ...ex, sets: [...ex.sets, emptySet()] } : ex
      )
      return { active: { ...s.active, exercises } }
    }),

  removeSet: (exerciseIndex, setIndex) =>
    set((s) => {
      if (!s.active) return s
      const exercises = s.active.exercises.map((ex, i) =>
        i === exerciseIndex
          ? { ...ex, sets: ex.sets.filter((_, si) => si !== setIndex) }
          : ex
      )
      return { active: { ...s.active, exercises } }
    }),

  updateSet: (exerciseIndex, setIndex, field, value) =>
    set((s) => {
      if (!s.active) return s
      const exercises = s.active.exercises.map((ex, i) =>
        i === exerciseIndex
          ? {
              ...ex,
              sets: ex.sets.map((st, si) =>
                si === setIndex ? { ...st, [field]: value } : st
              ),
            }
          : ex
      )
      return { active: { ...s.active, exercises } }
    }),

  toggleSetDone: (exerciseIndex, setIndex) =>
    set((s) => {
      if (!s.active) return s
      const exercises = s.active.exercises.map((ex, i) =>
        i === exerciseIndex
          ? {
              ...ex,
              sets: ex.sets.map((st, si) =>
                si === setIndex ? { ...st, done: !st.done } : st
              ),
            }
          : ex
      )
      return { active: { ...s.active, exercises } }
    }),

  removeExercise: (exerciseIndex) =>
    set((s) => {
      if (!s.active) return s
      return {
        active: {
          ...s.active,
          exercises: s.active.exercises.filter((_, i) => i !== exerciseIndex),
        },
      }
    }),

  clearWorkout: () => set({ active: null }),
}))
