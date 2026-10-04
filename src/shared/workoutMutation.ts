export interface WorkoutMutationGuard { operationId: string; baseline: string }
export interface EditableWorkoutExercise {
  exerciseId: string
  exerciseSource: 'global' | 'user'
  name: string
  sets: { weight: number; reps: number }[]
}
export interface WorkoutEditContent { label: string | null; exercises: EditableWorkoutExercise[] }
export interface EditableWorkout extends WorkoutEditContent {
  id: string
  startedAt: number
  finishedAt: number
  materialized: boolean
}
export interface WorkoutMutationState {
  status: 'available' | 'gone'
  workout: EditableWorkout | null
  baseline: string | null
  projection: 'ready' | 'pending' | 'deleted' | 'absent'
  operation: null | { action: 'update' | 'delete'; status: 'committed' | 'complete' | 'superseded'; revision: number }
}
