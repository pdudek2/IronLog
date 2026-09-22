import type { ActiveWorkout, WorkoutExercise, WorkoutSet } from './session'
import { createLocalId } from './session'

export type SetField = 'weight' | 'reps'

function validCompletedSet(set: WorkoutSet): boolean {
  const weight = Number(set.weight)
  const reps = Number(set.reps)
  return Number.isFinite(weight) && weight >= 0 && weight <= 2_000
    && Number.isInteger(reps) && reps >= 1 && reps <= 1_000
}

function updateTarget(
  session: ActiveWorkout,
  exerciseId: string,
  setId: string,
  update: (set: WorkoutSet) => WorkoutSet,
): ActiveWorkout {
  return {
    ...session,
    exercises: session.exercises.map((exercise) => exercise.clientId === exerciseId
      ? { ...exercise, sets: exercise.sets.map((set) => set.clientId === setId ? update(set) : set) }
      : exercise),
  }
}

export function updateSetValue(
  session: ActiveWorkout,
  exerciseId: string,
  setId: string,
  field: SetField,
  value: string,
): ActiveWorkout {
  return updateTarget(session, exerciseId, setId, (set) => {
    const next = { ...set, [field]: value }
    return { ...next, done: next.done && validCompletedSet(next) }
  })
}

function adjustedValue(value: string, field: SetField, delta: number): string {
  const parsed = field === 'weight' ? Number.parseFloat(value) : Number.parseInt(value, 10)
  const adjusted = Math.max(0, (Number.isFinite(parsed) ? parsed : 0) + delta)
  const rounded = field === 'weight' ? Math.round(adjusted * 10_000) / 10_000 : Math.round(adjusted)
  return String(rounded)
}

export function adjustSetValue(
  session: ActiveWorkout,
  exerciseId: string,
  setId: string,
  field: SetField,
  delta: number,
): ActiveWorkout {
  return updateTarget(session, exerciseId, setId, (set) => {
    const next = { ...set, [field]: adjustedValue(set[field], field, delta) }
    return { ...next, done: next.done && validCompletedSet(next) }
  })
}

export function setSetDone(
  session: ActiveWorkout,
  exerciseId: string,
  setId: string,
  done: boolean,
): ActiveWorkout {
  const exercise = session.exercises.find((candidate) => candidate.clientId === exerciseId)
  const completed = exercise?.sets.filter((set) => set.done && set.clientId !== setId).length ?? 0
  return updateTarget(session, exerciseId, setId, (set) => ({
    ...set,
    done: done && completed < 20 && validCompletedSet(set),
  }))
}

export function addSet(session: ActiveWorkout, exerciseId: string): ActiveWorkout {
  return {
    ...session,
    exercises: session.exercises.map((exercise): WorkoutExercise => {
      if (exercise.clientId !== exerciseId) return exercise
      const last = exercise.sets.at(-1)
      return {
        ...exercise,
        sets: [...exercise.sets, {
          clientId: createLocalId('set'),
          weight: last && (last.weight || last.reps) ? last.weight : '',
          reps: last && (last.weight || last.reps) ? last.reps : '',
          done: false,
        }],
      }
    }),
  }
}

// Firestore rules reject active sessions with more than 20 exercises.
export const MAX_SESSION_EXERCISES = 20

export function addExercise(
  session: ActiveWorkout,
  exercise: Pick<WorkoutExercise, 'clientId' | 'exerciseId' | 'exerciseSource' | 'name'>,
): ActiveWorkout {
  if (session.exercises.length >= MAX_SESSION_EXERCISES) return session
  return {
    ...session,
    exercises: [...session.exercises, {
      ...exercise,
      sets: [{ clientId: createLocalId('set'), weight: '', reps: '', done: false }],
    }],
  }
}

export function removeExercise(session: ActiveWorkout, exerciseId: string): ActiveWorkout {
  return { ...session, exercises: session.exercises.filter((exercise) => exercise.clientId !== exerciseId) }
}

export function setLabel(session: ActiveWorkout, label: string): ActiveWorkout {
  const next: ActiveWorkout = { ...session, label: label.trim() }
  if (!next.label) delete next.label
  return next
}

export function exerciseHasEnteredSets(exercise: WorkoutExercise): boolean {
  return exercise.sets.some((set) => set.done || set.weight.trim() !== '' || set.reps.trim() !== '')
}

export function removeSet(session: ActiveWorkout, exerciseId: string, setId: string): ActiveWorkout {
  return {
    ...session,
    exercises: session.exercises.map((exercise) => exercise.clientId === exerciseId
      ? { ...exercise, sets: exercise.sets.filter((set) => set.clientId !== setId) }
      : exercise),
  }
}
