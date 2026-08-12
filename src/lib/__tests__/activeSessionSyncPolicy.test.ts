import { describe, expect, it } from 'vitest'
import type { ActiveWorkout } from '../../store/workoutStore'
import type { WorkoutClosureIntent } from '../workoutClosureIntent'
import {
  canCreateStaleReplacement,
  classifyClosureFailure,
  decideConfirmedClosure,
  decideRemoteSessionSync,
  isAuthoritativeActiveSessionSnapshot,
  shouldResolveActiveSessionSyncFailure,
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
  it('accepts only server-confirmed snapshots as authoritative', () => {
    expect(isAuthoritativeActiveSessionSnapshot({
      fromCache: false,
      hasPendingWrites: false,
    })).toBe(true)
    expect(isAuthoritativeActiveSessionSnapshot({
      fromCache: true,
      hasPendingWrites: false,
    })).toBe(false)
    expect(isAuthoritativeActiveSessionSnapshot({
      fromCache: false,
      hasPendingWrites: true,
    })).toBe(false)
  })

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
      authoritative: true,
    })).toBe('clear_local')
  })

  it('keeps authoritative absence closed when the local session is already empty', () => {
    expect(decideRemoteSessionSync({
      localSession: null,
      remoteSession: null,
      closureIntent: null,
      authoritative: true,
    })).toBe('clear_local')
  })

  it.each([
    { fromCache: true, hasPendingWrites: false },
    { fromCache: false, hasPendingWrites: true },
  ])('does not clear local recovery from a non-authoritative snapshot: %o', (metadata) => {
    expect(decideRemoteSessionSync({
      localSession: session('session-1'),
      remoteSession: null,
      closureIntent: null,
      authoritative: isAuthoritativeActiveSessionSnapshot(metadata),
    })).toBe('keep_local')
  })

  it.each([
    { fromCache: true, hasPendingWrites: false },
    { fromCache: false, hasPendingWrites: true },
  ])('does not replace closure recovery from a non-authoritative snapshot: %o', (metadata) => {
    expect(decideRemoteSessionSync({
      localSession: session('session-1'),
      remoteSession: session('session-2'),
      closureIntent: intent('session-1'),
      authoritative: isAuthoritativeActiveSessionSnapshot(metadata),
    })).toBe('retain_closure_snapshot')
  })

  it('keeps local data while the authoritative remote session still matches', () => {
    expect(decideRemoteSessionSync({
      localSession: session('session-1'),
      remoteSession: session('session-1'),
      closureIntent: null,
    })).toBe('keep_local')
  })

  it('accepts a different remote session over a stale local session and intent', () => {
    expect(decideRemoteSessionSync({
      localSession: session('session-1'),
      remoteSession: session('session-2'),
      closureIntent: intent('session-1'),
    })).toBe('accept_remote')
  })

  it('preserves session B when confirmation belongs to session A', () => {
    expect(decideConfirmedClosure({
      confirmedSessionId: 'session-A',
      currentSessionId: 'session-B',
      remoteSessionId: 'session-B',
    })).toBe('preserve_authoritative')
    expect(decideConfirmedClosure({
      confirmedSessionId: 'session-A',
      currentSessionId: 'session-A',
      remoteSessionId: 'session-A',
    })).toBe('clear_confirmed')
  })

  it('presents a newly loaded different stale remote before accepting it', () => {
    expect(decideRemoteSessionSync({
      localSession: session('session-A'),
      remoteSession: session('session-B'),
      closureIntent: null,
      remoteSessionIsStale: true,
    })).toBe('review_stale_remote')
  })

  it('rehydrates the pending intent snapshot after observed session B is deleted', () => {
    expect(decideRemoteSessionSync({
      localSession: session('session-B'),
      remoteSession: null,
      closureIntent: intent('session-A'),
    })).toBe('retain_closure_snapshot')
  })

  it('maps definitive conflicts separately from ambiguous closure retries', () => {
    expect(classifyClosureFailure({
      kind: 'definitive',
      code: 'closure_conflict',
      status: 409,
    })).toBe('closure_conflict')
    expect(classifyClosureFailure({
      kind: 'definitive',
      code: 'session_not_active',
      status: 409,
    })).toBe('closure_conflict')
    expect(classifyClosureFailure({
      kind: 'definitive',
      code: 'unauthenticated',
      status: 401,
    })).toBe('auth_required')
    expect(classifyClosureFailure({ kind: 'ambiguous' })).toBe('closure_unconfirmed')
  })

  it('permits stale replacement only after confirmed discard', () => {
    expect(canCreateStaleReplacement({ status: 'discarded' })).toBe(true)
    expect(canCreateStaleReplacement({ status: 'closure_unconfirmed' })).toBe(false)
  })

  it('does not replace confirmed stale session A when session B won the race', () => {
    expect(canCreateStaleReplacement(
      { status: 'discarded' },
      {
        confirmedSessionId: 'session-A',
        currentSessionId: 'session-B',
        remoteSessionId: 'session-B',
      },
    )).toBe(false)
  })

  it('clears a sync failure only after a successful write or resolving authoritative snapshot', () => {
    expect(shouldResolveActiveSessionSyncFailure({
      writeSucceeded: true,
      authoritative: false,
      reconciliationResolved: false,
    })).toBe(true)
    expect(shouldResolveActiveSessionSyncFailure({
      writeSucceeded: false,
      authoritative: false,
      reconciliationResolved: true,
    })).toBe(false)
    expect(shouldResolveActiveSessionSyncFailure({
      writeSucceeded: false,
      authoritative: true,
      reconciliationResolved: true,
    })).toBe(true)
  })
})
