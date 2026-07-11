import type { ActiveWorkout } from '../store/workoutStore'
import type { WorkoutClosureIntent } from './workoutClosureIntent'

export type RemoteSessionSyncDecision =
  | 'accept_remote'
  | 'clear_local'
  | 'keep_local'
  | 'retain_closure_snapshot'

export function shouldPersistActiveSession(
  session: ActiveWorkout,
  closureIntent: WorkoutClosureIntent | null,
): boolean {
  return closureIntent?.session.sessionId !== session.sessionId
}

export function decideRemoteSessionSync({
  localSession,
  remoteSession,
  closureIntent,
}: {
  localSession: ActiveWorkout | null
  remoteSession: ActiveWorkout | null
  closureIntent: WorkoutClosureIntent | null
}): RemoteSessionSyncDecision {
  if (remoteSession) {
    return remoteSession.sessionId === localSession?.sessionId ? 'keep_local' : 'accept_remote'
  }
  if (localSession && closureIntent?.session.sessionId === localSession.sessionId) {
    return 'retain_closure_snapshot'
  }
  return localSession ? 'clear_local' : 'keep_local'
}

export function classifyActiveSessionWriteError({
  code,
  attemptedSessionId,
  localSessionId,
}: {
  code: string | undefined
  attemptedSessionId: string
  localSessionId: string | undefined
}): 'remote_closure' | 'sync_error' {
  return code === 'permission-denied' && attemptedSessionId === localSessionId
    ? 'remote_closure'
    : 'sync_error'
}

export function canCreateStaleReplacement(
  result: { status: 'discarded' | 'closure_unconfirmed' },
): result is { status: 'discarded' } {
  return result.status === 'discarded'
}
