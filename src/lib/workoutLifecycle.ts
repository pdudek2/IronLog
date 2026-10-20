import type { ActiveWorkout } from '../store/workoutStore'
import {
  clearWorkoutClosureIntent,
  writeWorkoutClosureIntent,
  type WorkoutClosureIntent,
} from './workoutClosureIntent'
import {
  discardWorkoutSession,
  WorkoutClosureError,
  type DiscardWorkoutResult,
  type FinalizeWorkoutResult,
} from './workoutClosureService'
import { canCreateStaleReplacement } from './activeSessionSyncPolicy'

export interface ClosureUnconfirmedResult {
  status: 'closure_unconfirmed'
  error: WorkoutClosureError
}

interface ClosureDependencies<T> {
  uid: string
  session: ActiveWorkout
  storage?: Storage
  now?: () => number
  request?: () => Promise<T>
  clearConfirmed(): void | Promise<void>
}

interface FinishWorkoutDependencies extends ClosureDependencies<FinalizeWorkoutResult> {
  sessionRevision: string
  request(): Promise<FinalizeWorkoutResult>
}
type DiscardWorkoutDependencies = ClosureDependencies<DiscardWorkoutResult>

interface DiscardStaleSessionDependencies extends DiscardWorkoutDependencies {
  startReplacement(): ActiveWorkout | null
  persistReplacement(workout: ActiveWorkout): Promise<void>
}

export async function finishWorkoutLifecycle(
  dependencies: FinishWorkoutDependencies,
): Promise<FinalizeWorkoutResult | ClosureUnconfirmedResult> {
  return runClosure('finish', dependencies, dependencies.request, dependencies.sessionRevision)
}

export async function discardWorkoutLifecycle(
  dependencies: DiscardWorkoutDependencies,
): Promise<DiscardWorkoutResult | ClosureUnconfirmedResult> {
  return runClosure(
    'discard',
    dependencies,
    dependencies.request ?? (() => discardWorkoutSession(dependencies.session.sessionId)),
  )
}

export async function discardStaleSessionLifecycle(
  dependencies: DiscardStaleSessionDependencies,
): Promise<(DiscardWorkoutResult & { replacement: ActiveWorkout | null }) | (ClosureUnconfirmedResult & { replacement: null })> {
  const result = await runClosure(
    'discard',
    dependencies,
    dependencies.request ?? (() => discardWorkoutSession(dependencies.session.sessionId)),
  )
  if (!canCreateStaleReplacement(result)) return { ...result, replacement: null }

  const replacement = dependencies.startReplacement()
  if (replacement) await dependencies.persistReplacement(replacement)
  return { ...result, replacement }
}

async function runClosure<T>(
  action: WorkoutClosureIntent['action'],
  dependencies: ClosureDependencies<T>,
  request: () => Promise<T>,
  sessionRevision?: string,
): Promise<T | ClosureUnconfirmedResult> {
  const intent: WorkoutClosureIntent = action === 'finish'
    ? {
        action,
        session: dependencies.session,
        createdAt: (dependencies.now ?? Date.now)(),
        sessionRevision,
      }
    : {
        action,
        session: dependencies.session,
        createdAt: (dependencies.now ?? Date.now)(),
      }
  writeWorkoutClosureIntent(dependencies.uid, intent, dependencies.storage)

  let result: T
  try {
    result = await request()
  } catch (error) {
    if (error instanceof WorkoutClosureError && error.kind === 'ambiguous') {
      return { status: 'closure_unconfirmed', error }
    }
    throw error
  }

  await dependencies.clearConfirmed()
  clearWorkoutClosureIntent(dependencies.uid, dependencies.storage)
  return result
}

