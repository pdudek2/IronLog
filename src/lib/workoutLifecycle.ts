import type { ActiveWorkout } from '../store/workoutStore'
import type { SaveWorkoutResult } from './workoutService'

export type SessionCleanupState = 'confirmed' | 'unconfirmed'

interface CleanupOutcome {
  sessionCleanup: SessionCleanupState
  cleanupError?: unknown
}

interface FinishWorkoutDependencies {
  saveWorkout(): Promise<SaveWorkoutResult>
  clearWorkout(): void
  clearSession(): Promise<void>
}

interface DiscardWorkoutDependencies {
  clearWorkout(): void
  clearSession(): Promise<void>
}

interface DiscardStaleSessionDependencies {
  clearLocal(): void
  deleteRemote(): Promise<void>
  startReplacement(): ActiveWorkout | null
  persistReplacement(workout: ActiveWorkout): Promise<void>
}

async function confirmCleanup(action: () => Promise<void>): Promise<CleanupOutcome> {
  try {
    await action()
    return { sessionCleanup: 'confirmed' }
  } catch (cleanupError) {
    return { sessionCleanup: 'unconfirmed', cleanupError }
  }
}

export async function finishWorkoutLifecycle(
  dependencies: FinishWorkoutDependencies,
): Promise<CleanupOutcome & { workout: SaveWorkoutResult }> {
  const workout = await dependencies.saveWorkout()
  dependencies.clearWorkout()
  return { workout, ...await confirmCleanup(dependencies.clearSession) }
}

export async function discardWorkoutLifecycle(
  dependencies: DiscardWorkoutDependencies,
): Promise<CleanupOutcome> {
  dependencies.clearWorkout()
  return confirmCleanup(dependencies.clearSession)
}

export async function discardStaleSessionLifecycle(
  dependencies: DiscardStaleSessionDependencies,
): Promise<CleanupOutcome & { replacement: ActiveWorkout | null }> {
  dependencies.clearLocal()
  const cleanup = await confirmCleanup(dependencies.deleteRemote)
  const replacement = dependencies.startReplacement()
  if (replacement) await dependencies.persistReplacement(replacement)
  return { ...cleanup, replacement }
}
