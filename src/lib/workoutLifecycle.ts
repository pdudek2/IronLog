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
import type { SaveWorkoutResult } from './workoutService'
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

interface LegacyFinishWorkoutDependencies {
  saveWorkout(): Promise<SaveWorkoutResult>
  clearWorkout(): void
  clearSession(): Promise<void>
}

interface LegacyDiscardWorkoutDependencies {
  clearWorkout(): void
  clearSession(): Promise<void>
}

interface LegacyDiscardStaleSessionDependencies {
  clearLocal(): void
  deleteRemote(): Promise<void>
  startReplacement(): ActiveWorkout | null
  persistReplacement(workout: ActiveWorkout): Promise<void>
}

interface LegacyCleanupOutcome {
  sessionCleanup: 'confirmed' | 'unconfirmed'
  cleanupError?: unknown
}

export function finishWorkoutLifecycle(
  dependencies: FinishWorkoutDependencies,
): Promise<FinalizeWorkoutResult | ClosureUnconfirmedResult>
export function finishWorkoutLifecycle(
  dependencies: LegacyFinishWorkoutDependencies,
): Promise<LegacyCleanupOutcome & { workout: SaveWorkoutResult }>
export async function finishWorkoutLifecycle(
  dependencies: FinishWorkoutDependencies | LegacyFinishWorkoutDependencies,
): Promise<FinalizeWorkoutResult | ClosureUnconfirmedResult | (LegacyCleanupOutcome & { workout: SaveWorkoutResult })> {
  if (!('uid' in dependencies)) {
    const workout = await dependencies.saveWorkout()
    dependencies.clearWorkout()
    return { workout, ...await confirmLegacyCleanup(dependencies.clearSession) }
  }

  return runClosure('finish', dependencies, dependencies.request, dependencies.sessionRevision)
}

export function discardWorkoutLifecycle(
  dependencies: DiscardWorkoutDependencies,
): Promise<DiscardWorkoutResult | ClosureUnconfirmedResult>
export function discardWorkoutLifecycle(
  dependencies: LegacyDiscardWorkoutDependencies,
): Promise<LegacyCleanupOutcome>
export async function discardWorkoutLifecycle(
  dependencies: DiscardWorkoutDependencies | LegacyDiscardWorkoutDependencies,
): Promise<DiscardWorkoutResult | ClosureUnconfirmedResult | LegacyCleanupOutcome> {
  if (!('uid' in dependencies)) {
    dependencies.clearWorkout()
    return confirmLegacyCleanup(dependencies.clearSession)
  }

  return runClosure(
    'discard',
    dependencies,
    dependencies.request ?? (() => discardWorkoutSession(dependencies.session.sessionId)),
  )
}

export function discardStaleSessionLifecycle(
  dependencies: DiscardStaleSessionDependencies,
): Promise<(DiscardWorkoutResult & { replacement: ActiveWorkout | null }) | (ClosureUnconfirmedResult & { replacement: null })>
export function discardStaleSessionLifecycle(
  dependencies: LegacyDiscardStaleSessionDependencies,
): Promise<LegacyCleanupOutcome & { replacement: ActiveWorkout | null }>
export async function discardStaleSessionLifecycle(
  dependencies: DiscardStaleSessionDependencies | LegacyDiscardStaleSessionDependencies,
): Promise<
  | (DiscardWorkoutResult & { replacement: ActiveWorkout | null })
  | (ClosureUnconfirmedResult & { replacement: null })
  | (LegacyCleanupOutcome & { replacement: ActiveWorkout | null })
> {
  if (!('uid' in dependencies)) {
    dependencies.clearLocal()
    const cleanup = await confirmLegacyCleanup(dependencies.deleteRemote)
    const replacement = dependencies.startReplacement()
    if (replacement) await dependencies.persistReplacement(replacement)
    return { ...cleanup, replacement }
  }

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

async function confirmLegacyCleanup(action: () => Promise<void>): Promise<LegacyCleanupOutcome> {
  try {
    await action()
    return { sessionCleanup: 'confirmed' }
  } catch (cleanupError) {
    return { sessionCleanup: 'unconfirmed', cleanupError }
  }
}
