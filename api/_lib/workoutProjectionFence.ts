import { ApiError } from './errors.js'
import type {
  ExerciseSource,
  ValidatedWorkoutExercise,
} from './workoutValidation.js'

export type ProjectionState = 'pending' | 'ready' | 'deleted'

export interface ProjectionExerciseKey {
  exerciseSource: ExerciseSource
  exerciseId: string
}

export interface ProjectionFence {
  projectionState: ProjectionState
  projectionRevision: number
  projectionExerciseKeys: ProjectionExerciseKey[]
  deletedAt?: number
}

export const INITIAL_PROJECTION_REVISION = 1

export function projectionExerciseKeysFromWorkout(
  exercises: Array<Pick<ValidatedWorkoutExercise, 'exerciseSource' | 'exerciseId'>>,
): ProjectionExerciseKey[] {
  return normalizeProjectionExerciseKeys(exercises)
}

export function normalizeProjectionExerciseKeys(
  ...groups: ProjectionExerciseKey[][]
): ProjectionExerciseKey[] {
  const keys = new Map<string, ProjectionExerciseKey>()

  for (const group of groups) {
    for (const key of group) {
      if (!isProjectionExerciseKey(key)) continue
      keys.set(`${key.exerciseSource}:${key.exerciseId}`, {
        exerciseSource: key.exerciseSource,
        exerciseId: key.exerciseId,
      })
    }
  }

  return [...keys.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([, key]) => key)
}

export function parseProjectionFence(raw: unknown): ProjectionFence | null {
  if (!isRecord(raw)) throw projectionStateConflict()

  const fields = ['projectionState', 'projectionRevision', 'projectionExerciseKeys', 'deletedAt']
  if (!fields.some((field) => Object.hasOwn(raw, field))) return null

  const { projectionState, projectionRevision, projectionExerciseKeys } = raw
  if (
    !isProjectionState(projectionState)
    || !Number.isInteger(projectionRevision)
    || projectionRevision <= 0
    || !Array.isArray(projectionExerciseKeys)
  ) {
    throw projectionStateConflict()
  }

  const fence: ProjectionFence = {
    projectionState,
    projectionRevision,
    projectionExerciseKeys: normalizeProjectionExerciseKeys(projectionExerciseKeys),
  }
  if (typeof raw.deletedAt === 'number' && Number.isFinite(raw.deletedAt) && raw.deletedAt >= 0) {
    fence.deletedAt = raw.deletedAt
  }
  return fence
}

export function projectionSuperseded(): ApiError {
  return new ApiError(409, 'Operacja dotyczy starszej wersji treningu.', {
    code: 'projection_superseded',
  })
}

export function workoutDeleted(): ApiError {
  return new ApiError(409, 'Trening został już usunięty.', {
    code: 'workout_deleted',
  })
}

export function projectionStateConflict(): ApiError {
  return new ApiError(409, 'Stan projekcji treningu jest niespójny.', {
    code: 'projection_state_conflict',
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isProjectionState(value: unknown): value is ProjectionState {
  return value === 'pending' || value === 'ready' || value === 'deleted'
}

function isProjectionExerciseKey(value: unknown): value is ProjectionExerciseKey {
  return isRecord(value)
    && (value.exerciseSource === 'global' || value.exerciseSource === 'user')
    && typeof value.exerciseId === 'string'
    && value.exerciseId.trim().length > 0
}
