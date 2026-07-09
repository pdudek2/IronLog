import { create } from 'zustand'

export type ExerciseSource = 'global' | 'user'

export interface WorkoutSet {
  clientId?: string
  weight: string
  reps: string
  done: boolean
}

export interface WorkoutExercise {
  clientId?: string
  exerciseId: string
  exerciseSource: ExerciseSource
  name: string
  sets: WorkoutSet[]
}

export interface ActiveWorkout {
  startedAt: number
  templateId?: string | null
  label?: string
  exercises: WorkoutExercise[]
}

interface WorkoutState {
  active: ActiveWorkout | null
  startWorkout: () => void
  hydrateFromDoc: (workout: ActiveWorkout) => void
  setLabel: (label: string) => void
  addExercise: (exerciseId: string, name: string, source: ExerciseSource) => void
  addSet: (exerciseIndex: number) => void
  removeSet: (exerciseIndex: number, setIndex: number) => void
  updateSet: (exerciseIndex: number, setIndex: number, field: 'weight' | 'reps', value: string) => void
  adjustSet: (exerciseIndex: number, setIndex: number, field: 'weight' | 'reps', delta: number) => void
  toggleSetDone: (exerciseIndex: number, setIndex: number) => void
  removeExercise: (exerciseIndex: number) => void
  clearWorkout: () => void
}

let clientIdCounter = 0

function createClientId(prefix: 'exercise' | 'set'): string {
  clientIdCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${clientIdCounter.toString(36)}`
}

const emptySet = (): WorkoutSet => ({ clientId: createClientId('set'), weight: '', reps: '', done: false })

function hasValidReps(value: string): boolean {
  const reps = Number.parseInt(value, 10)
  return Number.isFinite(reps) && reps > 0
}

function withClientIds(workout: ActiveWorkout): ActiveWorkout {
  return {
    ...workout,
    exercises: workout.exercises.map((exercise) => ({
      ...exercise,
      clientId: exercise.clientId ?? createClientId('exercise'),
      sets: exercise.sets.map((set) => ({
        ...set,
        clientId: set.clientId ?? createClientId('set'),
        done: set.done && hasValidReps(set.reps),
      })),
    })),
  }
}

export function stripWorkoutClientIds(workout: ActiveWorkout): ActiveWorkout {
  return {
    ...workout,
    exercises: workout.exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      exerciseSource: exercise.exerciseSource,
      name: exercise.name,
      sets: exercise.sets.map((set) => ({
        weight: set.weight,
        reps: set.reps,
        done: set.done,
      })),
    })),
  }
}

function parseSetNumber(value: string, field: 'weight' | 'reps'): number {
  const parsed = field === 'weight'
    ? Number.parseFloat(value)
    : Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatAdjustedSetValue(value: number, field: 'weight' | 'reps'): string {
  const rounded = field === 'weight'
    ? Math.round(value * 10) / 10
    : Math.round(value)
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

export const useWorkoutStore = create<WorkoutState>()((set) => ({
  active: null,

  startWorkout: () =>
    set({ active: { startedAt: Date.now(), templateId: null, exercises: [] } }),

  hydrateFromDoc: (workout) =>
    set({ active: withClientIds(workout) }),

  setLabel: (label) =>
    set((s) => s.active ? { active: { ...s.active, label } } : s),

  addExercise: (exerciseId, name, source) =>
    set((s) => {
      if (!s.active) return s
      return {
        active: {
          ...s.active,
          exercises: [...s.active.exercises, { clientId: createClientId('exercise'), exerciseId, exerciseSource: source, name, sets: [emptySet()] }],
        },
      }
    }),

  addSet: (exerciseIndex) =>
    set((s) => {
      if (!s.active) return s
      const exercises = s.active.exercises.map((ex, i) => {
        if (i !== exerciseIndex) return ex
        const lastSet = ex.sets.length > 0 ? ex.sets[ex.sets.length - 1] : null
        const newSet: WorkoutSet = lastSet && (lastSet.weight || lastSet.reps)
          ? { clientId: createClientId('set'), weight: lastSet.weight, reps: lastSet.reps, done: false }
          : emptySet()
        return { ...ex, sets: [...ex.sets, newSet] }
      })
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
              sets: ex.sets.map((st, si) => {
                if (si !== setIndex) return st
                return {
                  ...st,
                  [field]: value,
                  done: field === 'reps' && !hasValidReps(value) ? false : st.done,
                }
              }),
            }
          : ex
      )
      return { active: { ...s.active, exercises } }
    }),

  adjustSet: (exerciseIndex, setIndex, field, delta) =>
    set((s) => {
      if (!s.active) return s
      const exercises = s.active.exercises.map((ex, i) =>
        i === exerciseIndex
          ? {
              ...ex,
              sets: ex.sets.map((st, si) => {
                if (si !== setIndex) return st
                const current = parseSetNumber(st[field], field)
                const next = Math.max(0, current + delta)
                return { ...st, [field]: formatAdjustedSetValue(next, field) }
              }),
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
              sets: ex.sets.map((st, si) => {
                if (si !== setIndex) return st
                if (st.done) return { ...st, done: false }
                return hasValidReps(st.reps) ? { ...st, done: true } : st
              }),
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
