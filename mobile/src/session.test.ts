import assert from 'node:assert/strict'
import test from 'node:test'

import { deriveLegacySessionId } from '../../src/shared/sessionIdentity'
import {
  SessionDataError,
  formatElapsed,
  formatSet,
  parseSessionDocument,
} from './session'

function session(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-a',
    sessionId: 'session-a',
    sessionRevision: 'revision-a',
    startedAt: 1_000,
    templateId: null,
    label: 'Push',
    exercises: [{
      exerciseId: 'bench-press',
      exerciseSource: 'user',
      name: 'Bench Press',
      sets: [{ weight: '65', reps: '8', done: true }],
    }],
    ...overrides,
  }
}

test('parses identity, source, revision, set values, and units without exposing fallbacks', () => {
  const parsed = parseSessionDocument('user-a', session())

  assert.equal(parsed.sessionId, 'session-a')
  assert.equal(parsed.sessionRevision, 'revision-a')
  assert.equal(parsed.exercises[0]?.exerciseId, 'bench-press')
  assert.equal(parsed.exercises[0]?.exerciseSource, 'user')
  assert.equal(formatSet(parsed.exercises[0]!.sets[0]!, 'lbs'), '143.3 lbs × 8 reps')
})

test('preserves supported legacy identity, source, and done semantics', () => {
  const parsed = parseSessionDocument('user-a', session({
    sessionId: undefined,
    sessionRevision: undefined,
    exercises: [{
      exerciseId: 'squat',
      name: 'Squat',
      sets: [{ weight: 100, reps: 5 }],
    }],
  }))

  assert.equal(parsed.sessionId, deriveLegacySessionId('user-a', 1_000))
  assert.equal(parsed.sessionRevision, null)
  assert.equal(parsed.exercises[0]?.exerciseSource, 'global')
  assert.deepEqual(parsed.exercises[0]?.sets[0], { weight: '100', reps: '5', done: false })
})

test('rejects malformed documents instead of fabricating an empty session', () => {
  assert.throws(() => parseSessionDocument('user-a', session({ exercises: 'missing' })), SessionDataError)
  assert.throws(() => parseSessionDocument('user-a', session({
    exercises: [{ exerciseId: 'squat', name: 'Squat' }],
  })), SessionDataError)
  assert.throws(() => parseSessionDocument('user-b', session()), /owner does not match/)
})

test('elapsed time is derived from timestamps and clamped for future starts', () => {
  assert.equal(formatElapsed(0, 65_000), '01:05')
  assert.equal(formatElapsed(0, 3_665_000), '01:01:05')
  assert.equal(formatElapsed(10_000, 5_000), '00:00')
})
