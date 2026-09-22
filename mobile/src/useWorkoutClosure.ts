import { useCallback, useEffect, useRef, useState } from 'react'

import type { ClosureFailureState } from '../../src/lib/activeSessionSyncPolicy'
import { closureIntentStorage } from './fileSessionJournal'
import { apiBaseUrl, currentIdToken } from './firebase'
import type { ActiveWorkout } from './session'
import {
  closureFailure,
  readClosureIntent,
  requestClosure,
  writeClosureIntent,
  type ClosureAction,
  type ClosureIntent,
  type ClosureResult,
} from './workoutClosure'

export type ClosureState = { intent: ClosureIntent; status: 'submitting' | ClosureFailureState }

// Failures after which the server state is authoritative again; the live listener already reloads it.
const RESOLVED_BY_RELOAD: ClosureFailureState[] = ['session_mismatch', 'closure_conflict', 'active_session_changed']

export function useWorkoutClosure(uid: string) {
  const [closure, setClosure] = useState<ClosureState | null>(null)
  const [completed, setCompleted] = useState<ClosureResult | null>(null)
  const inFlight = useRef(false)

  useEffect(() => {
    let active = true
    // A stored intent means the app stopped before the server outcome was known.
    void readClosureIntent(closureIntentStorage, uid).then((intent) => {
      if (active && intent) setClosure((current) => current ?? { intent, status: 'closure_unconfirmed' })
    }, () => undefined)
    return () => { active = false }
  }, [uid])

  const run = useCallback(async (intent: ClosureIntent) => {
    if (inFlight.current) return
    inFlight.current = true
    setClosure({ intent, status: 'submitting' })
    try {
      await writeClosureIntent(closureIntentStorage, uid, intent)
    } catch {
      inFlight.current = false
      setClosure({ intent, status: 'closure_failed' })
      return
    }
    try {
      const result = await requestClosure(intent, { apiBaseUrl, getIdToken: () => currentIdToken(uid), fetch })
      // If this clear fails the next launch shows "unconfirmed"; retrying is idempotent on the server.
      await closureIntentStorage.clear(uid).catch(() => undefined)
      setClosure(null)
      setCompleted(result)
    } catch (error) {
      const failure = closureFailure(error)
      if (RESOLVED_BY_RELOAD.includes(failure)) await closureIntentStorage.clear(uid).catch(() => undefined)
      setClosure({ intent, status: failure })
    } finally {
      inFlight.current = false
    }
  }, [uid])

  return {
    closure,
    completed,
    start: (action: ClosureAction, session: ActiveWorkout) => void run({
      action, sessionId: session.sessionId, sessionRevision: session.sessionRevision, createdAt: Date.now(),
    }),
    retry: () => { if (closure) void run(closure.intent) },
    dismiss: () => setClosure(null),
  }
}
