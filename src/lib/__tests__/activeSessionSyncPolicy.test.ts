import { describe, expect, it } from 'vitest'
import type { ActiveWorkout } from '../../store/workoutStore'
import type { WorkoutClosureIntent } from '../workoutClosureIntent'
import {
  canCreateStaleReplacement,
  classifyActiveSessionWriteError,
  decideRemoteSessionSync,
  shouldPersistActiveSession,
} from '../activeSessionSyncPolicy'

const session = (sessionId: string): ActiveWorkout => ({
  sessionId,
  startedAt: 100,
  exercises: [],
})

const intent = (sessionId: string): WorkoutClosureIntent => ({
  action: 'discard',
  session: session(sessionId),
  createdAt: 200,
})

describe('active session sync policy', () => {
  it('blocks persistence for the session captured by a pending closure intent', () => {
    expect(shouldPersistActiveSession(session('session-1'), intent('session-1'))).toBe(false)
    expect(shouldPersistActiveSession(session('session-2'), intent('session-1'))).toBe(true)
  })

  it('retains the recovery snapshot when the remote active document disappears during closure', () => {
    expect(decideRemoteSessionSync({
      localSession: session('session-1'),
      remoteSession: null,
      closureIntent: intent('session-1'),
    })).toBe('retain_closure_snapshot')
  })

  it('accepts remote deletion when there is no pending closure intent', () => {
    expect(decideRemoteSessionSync({
      localSession: session('session-1'),
      remoteSession: null,
      closureIntent: null,
    })).toBe('clear_local')
  })

  it('classifies permission denial as remote closure only for the same session', () => {
    expect(classifyActiveSessionWriteError({
      code: 'permission-denied',
      attemptedSessionId: 'session-1',
      localSessionId: 'session-1',
    })).toBe('remote_closure')
    expect(classifyActiveSessionWriteError({
      code: 'permission-denied',
      attemptedSessionId: 'session-1',
      localSessionId: 'session-2',
    })).toBe('sync_error')
  })

  it('accepts a different remote session over a stale local session and intent', () => {
    expect(decideRemoteSessionSync({
      localSession: session('session-1'),
      remoteSession: session('session-2'),
      closureIntent: intent('session-1'),
    })).toBe('accept_remote')
  })

  it('permits stale replacement only after confirmed discard', () => {
    expect(canCreateStaleReplacement({ status: 'discarded' })).toBe(true)
    expect(canCreateStaleReplacement({ status: 'closure_unconfirmed' })).toBe(false)
  })
})
