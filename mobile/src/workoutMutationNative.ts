import type { WorkoutMutationState } from '../../src/shared/workoutMutation'
import type { WorkoutPendingOperation } from './workoutEditor'
import { apiBaseUrl, currentIdToken } from './firebase'
export class WorkoutRequestError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) { super(message) }
}
async function request(uid: string, path: string, body: unknown): Promise<unknown> {
  const token = await currentIdToken(uid)
  const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 15_000)
  try {
    const response = await fetch(`${apiBaseUrl}/api/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: abort.signal })
    const result = await response.json().catch(() => null)
    if (!response.ok) throw new WorkoutRequestError(response.status, result?.error ?? 'Could not confirm the workout change.', result?.code)
    await currentIdToken(uid)
    if (!result || typeof result !== 'object') throw new Error('Invalid workout response.')
    return result
  } finally { clearTimeout(timeout) }
}
export async function readWorkoutMutation(uid: string, workoutId: string, operationId?: string): Promise<WorkoutMutationState> {
  const result = await request(uid, 'workout-mutation-state', { workoutId, ...(operationId ? { operationId } : {}) }) as WorkoutMutationState
  if (!['available', 'gone'].includes(result.status) || !['ready', 'pending', 'deleted', 'absent'].includes(result.projection)
    || (result.status === 'available' && (!result.workout || result.workout.id !== workoutId || typeof result.baseline !== 'string' || !/^[a-f0-9]{64}$/.test(result.baseline)))) throw new Error('Invalid workout state.')
  return result
}
export async function sendWorkoutMutation(uid: string, operation: WorkoutPendingOperation): Promise<void> {
  const { workoutId, operationId, baseline } = operation
  const response = await request(uid, operation.action === 'update' ? 'update-workout' : 'delete-workout', {
    workoutId, operationId, baseline, ...(operation.action === 'update' ? operation.content : {}),
  }) as { status?: string }
  const allowed = operation.action === 'update' ? ['materialized', 'projection_pending'] : ['deleted', 'cleanup_pending']
  if (!response.status || !allowed.includes(response.status)) throw new Error('Invalid mutation acknowledgement.')
}
