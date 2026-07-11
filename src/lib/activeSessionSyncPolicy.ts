import type { ActiveWorkout } from '../store/workoutStore'
import type { WorkoutClosureIntent } from './workoutClosureIntent'

export type RemoteSessionSyncDecision =
  | 'accept_remote'
  | 'clear_local'
  | 'keep_local'
  | 'review_stale_remote'
  | 'retain_closure_snapshot'

export type ClosureFailureState =
  | 'auth_required'
  | 'closure_conflict'
  | 'closure_failed'
  | 'closure_unconfirmed'
  | 'session_mismatch'

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
  remoteSessionIsStale = false,
}: {
  localSession: ActiveWorkout | null
  remoteSession: ActiveWorkout | null
  closureIntent: WorkoutClosureIntent | null
  remoteSessionIsStale?: boolean
}): RemoteSessionSyncDecision {
  if (remoteSession) {
    if (
      remoteSessionIsStale
      && remoteSession.sessionId !== localSession?.sessionId
      && !closureIntent
    ) {
      return 'review_stale_remote'
    }
    return remoteSession.sessionId === localSession?.sessionId ? 'keep_local' : 'accept_remote'
  }
  if (closureIntent) return 'retain_closure_snapshot'
  return localSession ? 'clear_local' : 'keep_local'
}

export function decideConfirmedClosure({
  confirmedSessionId,
  currentSessionId,
  remoteSessionId,
}: {
  confirmedSessionId: string
  currentSessionId: string | undefined
  remoteSessionId: string | undefined
}): 'clear_confirmed' | 'preserve_authoritative' {
  return [currentSessionId, remoteSessionId].some(
    (sessionId) => sessionId !== undefined && sessionId !== confirmedSessionId,
  ) ? 'preserve_authoritative' : 'clear_confirmed'
}

export function classifyClosureFailure({
  kind,
  code,
  status,
}: {
  kind: 'ambiguous' | 'definitive'
  code?: string
  status?: number
}): ClosureFailureState {
  if (kind === 'ambiguous') return 'closure_unconfirmed'
  if (code === 'session_mismatch') return 'session_mismatch'
  if (code === 'closure_conflict' || code === 'session_not_active') return 'closure_conflict'
  if (
    code === 'unauthenticated'
    || code === 'permission-denied'
    || code === 'permission_denied'
    || code === 'resource_owner_mismatch'
    || status === 401
    || status === 403
  ) return 'auth_required'
  return 'closure_failed'
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
  sessionState?: {
    confirmedSessionId: string
    currentSessionId: string | undefined
    remoteSessionId: string | undefined
  },
): result is { status: 'discarded' } {
  return result.status === 'discarded'
    && (!sessionState || decideConfirmedClosure(sessionState) === 'clear_confirmed')
}
