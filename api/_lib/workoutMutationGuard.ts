import { createHash } from 'node:crypto'
import { ApiError } from './errors.js'
import type { WorkoutEditContent, WorkoutMutationGuard } from '../../src/shared/workoutMutation.js'

export function validateMutationOperationId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(value)) throw new ApiError(400, 'Invalid operation ID.')
  return value
}
export function parseWorkoutMutationGuard(input: unknown): WorkoutMutationGuard | null {
  const raw = input as Record<string, unknown> | null
  if (!raw || (raw.operationId === undefined && raw.baseline === undefined)) return null
  const operationId = validateMutationOperationId(raw.operationId)
  if (typeof raw.baseline !== 'string' || !/^[a-f0-9]{64}$/.test(raw.baseline)) throw new ApiError(400, 'Invalid workout baseline.')
  return { operationId, baseline: raw.baseline }
}
export function workoutContentBaseline(id: string, workout: WorkoutEditContent & { userId: string; startedAt: number; finishedAt: number }): string {
  return hash({ id, userId: workout.userId, startedAt: workout.startedAt, finishedAt: workout.finishedAt, label: workout.label, exercises: workout.exercises })
}
export function mutationRequestHash(userId: string, workoutId: string, action: 'update' | 'delete', guard: WorkoutMutationGuard, content?: WorkoutEditContent): string {
  return hash({ userId, workoutId, action, baseline: guard.baseline, content: content ?? null })
}
function hash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }
export function requireMatchingReceipt(receipt: Record<string, unknown>, userId: string, workoutId: string, requestHash: string): number {
  if (receipt.userId !== userId || receipt.workoutId !== workoutId || receipt.requestHash !== requestHash
    || !Number.isSafeInteger(receipt.projectionRevision) || Number(receipt.projectionRevision) < 1) {
    throw new ApiError(409, 'This operation ID was already used for a different change.', { code: 'operation_mismatch' })
  }
  return Number(receipt.projectionRevision)
}
export function workoutConflict(): ApiError { return new ApiError(409, 'Workout changed. Review the latest version before saving or deleting.', { code: 'workout_conflict' }) }
export function operationSuperseded(): ApiError { return new ApiError(409, 'A newer change replaced this operation. Reload the workout.', { code: 'operation_superseded' }) }
