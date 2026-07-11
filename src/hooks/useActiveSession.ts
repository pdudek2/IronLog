import { useEffect, useRef, useState } from 'react'
import { useWorkoutStore, type ActiveWorkout } from '../store/workoutStore'
import { saveActiveSession, subscribeToActiveSession } from '../lib/activeSessionService'
import {
  clearActiveSessionBackup,
  readActiveSessionBackup,
  writeActiveSessionBackup,
} from '../lib/activeSessionBackup'
import {
  getStaleSessionAgeLabel,
  isActiveSessionStale,
  refreshStaleActiveSession,
} from '../lib/sessionDuration'
import { discardStaleSessionLifecycle } from '../lib/workoutLifecycle'
import {
  clearWorkoutClosureIntent,
  readWorkoutClosureIntent,
  writeWorkoutClosureIntent,
  type WorkoutClosureIntent,
} from '../lib/workoutClosureIntent'
import {
  canCreateStaleReplacement,
  classifyActiveSessionWriteError,
  classifyClosureFailure,
  decideConfirmedClosure,
  decideRemoteSessionSync,
  shouldAutoStartEmptySession,
  shouldPersistActiveSession,
} from '../lib/activeSessionSyncPolicy'
import { WorkoutClosureError } from '../lib/workoutClosureService'

export type ClosureUiState =
  | 'idle'
  | 'submitting'
  | 'closure_unconfirmed'
  | 'session_mismatch'
  | 'closure_conflict'
  | 'auth_required'
  | 'closure_failed'

function serializeActiveWorkout(value: unknown): string {
  return JSON.stringify(value ?? null)
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  const code = String(error.code)
  return code.endsWith('permission-denied') ? 'permission-denied' : code
}

export function useActiveSession(uid: string | null) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeRef = useRef(useWorkoutStore.getState().active)
  const staleSessionRef = useRef<ActiveWorkout | null>(null)
  const closureIntentRef = useRef<WorkoutClosureIntent | null>(null)
  const remoteSessionRef = useRef<ActiveWorkout | null>(null)
  const applyingRemoteRef = useRef(false)
  const hadRemoteSessionRef = useRef(false)
  const hasUnsyncedLocalChangesRef = useRef(false)
  const confirmedClosureRef = useRef(false)
  const [ready, setReady] = useState(uid === null)
  const [staleSession, setStaleSession] = useState<{ ageLabel: string } | null>(null)
  const [closureIntent, setClosureIntent] = useState<WorkoutClosureIntent | null>(null)
  const [closureState, setClosureState] = useState<ClosureUiState>('idle')

  function cancelPendingPersistence() {
    if (!timerRef.current) return
    clearTimeout(timerRef.current)
    timerRef.current = null
  }

  function setPendingIntent(intent: WorkoutClosureIntent | null) {
    closureIntentRef.current = intent
    setClosureIntent(intent)
  }

  function clearConfirmedClosure() {
    cancelPendingPersistence()
    const confirmedSessionId = closureIntentRef.current?.session.sessionId
    if (!confirmedSessionId) return
    const currentSession = useWorkoutStore.getState().active
    const decision = decideConfirmedClosure({
      confirmedSessionId,
      currentSessionId: currentSession?.sessionId,
      remoteSessionId: remoteSessionRef.current?.sessionId,
    })
    hasUnsyncedLocalChangesRef.current = false
    if (uid) {
      clearWorkoutClosureIntent(uid)
    }
    setPendingIntent(null)
    setClosureState('idle')
    if (decision === 'preserve_authoritative') {
      const authoritative = remoteSessionRef.current?.sessionId !== confirmedSessionId
        ? remoteSessionRef.current
        : currentSession
      if (authoritative) {
        if (isActiveSessionStale(authoritative)) {
          staleSessionRef.current = authoritative
          setStaleSession({ ageLabel: getStaleSessionAgeLabel(authoritative.startedAt) })
        } else {
          staleSessionRef.current = null
          setStaleSession(null)
        }
        applyingRemoteRef.current = true
        activeRef.current = authoritative
        useWorkoutStore.getState().hydrateFromDoc(authoritative)
        if (uid) writeActiveSessionBackup(uid, authoritative)
      }
      return
    }
    confirmedClosureRef.current = true
    staleSessionRef.current = null
    setStaleSession(null)
    applyingRemoteRef.current = true
    activeRef.current = null
    if (uid) clearActiveSessionBackup(uid)
    useWorkoutStore.getState().clearWorkout()
  }

  function beginClosure(
    action: WorkoutClosureIntent['action'],
    session = activeRef.current,
  ): WorkoutClosureIntent | null {
    if (!uid || !session) return null
    confirmedClosureRef.current = false
    cancelPendingPersistence()
    const existing = closureIntentRef.current
    const intent = existing
      && existing.action === action
      && existing.session.sessionId === session.sessionId
      ? existing
      : { action, session, createdAt: Date.now() }
    writeWorkoutClosureIntent(uid, intent)
    setPendingIntent(intent)
    setClosureState('submitting')
    staleSessionRef.current = null
    setStaleSession(null)
    if (activeRef.current?.sessionId !== intent.session.sessionId) {
      applyingRemoteRef.current = true
      activeRef.current = intent.session
      useWorkoutStore.getState().hydrateFromDoc(intent.session)
      writeActiveSessionBackup(uid, intent.session)
    }
    return intent
  }

  function markClosureUnconfirmed() {
    cancelPendingPersistence()
    setClosureState('closure_unconfirmed')
  }

  function markSessionMismatch() {
    cancelPendingPersistence()
    setClosureState('session_mismatch')
  }

  function markClosureError(error: WorkoutClosureError) {
    cancelPendingPersistence()
    setClosureState(classifyClosureFailure(error))
  }

  function reloadAuthentication() {
    cancelPendingPersistence()
    window.location.reload()
  }

  function reloadCurrentSession() {
    cancelPendingPersistence()
    if (uid) {
      clearWorkoutClosureIntent(uid)
      clearActiveSessionBackup(uid)
    }
    setPendingIntent(null)
    setClosureState('idle')
    window.location.reload()
  }

  useEffect(() => {
    activeRef.current = useWorkoutStore.getState().active
  }, [])

  useEffect(() => {
    if (!uid) {
      setReady(true)
      return
    }

    const currentUid = uid
    const currentAtMount = useWorkoutStore.getState().active
    const backupAtMount = readActiveSessionBackup(currentUid)
    const intentAtMount = readWorkoutClosureIntent(currentUid)
    closureIntentRef.current = intentAtMount
    setClosureIntent(intentAtMount)
    setClosureState(intentAtMount ? 'closure_unconfirmed' : 'idle')
    hasUnsyncedLocalChangesRef.current = Boolean(
      currentAtMount
      && backupAtMount
      && serializeActiveWorkout(currentAtMount) === serializeActiveWorkout(backupAtMount),
    )
    setReady(false)
    staleSessionRef.current = null
    setStaleSession(null)
    hadRemoteSessionRef.current = false
    remoteSessionRef.current = null
    confirmedClosureRef.current = false

    const { hydrateFromDoc, clearWorkout, startWorkout } = useWorkoutStore.getState()
    if (intentAtMount) {
      applyingRemoteRef.current = true
      hasUnsyncedLocalChangesRef.current = false
      activeRef.current = intentAtMount.session
      hydrateFromDoc(intentAtMount.session)
      writeActiveSessionBackup(currentUid, intentAtMount.session)
    }

    function handleRemoteClosure(snapshot: ActiveWorkout) {
      if (closureIntentRef.current?.session.sessionId === snapshot.sessionId) return
      clearActiveSessionBackup(currentUid)
      if (useWorkoutStore.getState().active?.sessionId !== snapshot.sessionId) return
      applyingRemoteRef.current = true
      activeRef.current = null
      clearWorkout()
    }

    function persistSession(snapshot: ActiveWorkout) {
      if (!shouldPersistActiveSession(snapshot, closureIntentRef.current)) return
      void saveActiveSession(currentUid, snapshot).catch((error: unknown) => {
        const classification = classifyActiveSessionWriteError({
          code: errorCode(error),
          attemptedSessionId: snapshot.sessionId,
          localSessionId: useWorkoutStore.getState().active?.sessionId,
        })
        if (classification === 'remote_closure') handleRemoteClosure(snapshot)
        else console.error('[active session save error]', error)
      })
    }

    const unsubscribeRemote = subscribeToActiveSession(
      currentUid,
      ({ session, fromCache, hasPendingWrites }) => {
        remoteSessionRef.current = session
        const current = useWorkoutStore.getState().active
        const currentSerialized = serializeActiveWorkout(current)
        const nextSerialized = serializeActiveWorkout(session)
        const awaitingServerConfirmation = (
          session === null
          && !hadRemoteSessionRef.current
          && fromCache
          && !hasPendingWrites
          && typeof navigator !== 'undefined'
          && navigator.onLine
        )
        const decision = decideRemoteSessionSync({
          localSession: current,
          remoteSession: session,
          closureIntent: closureIntentRef.current,
          remoteSessionIsStale: session ? isActiveSessionStale(session) : false,
        })

        if (session && decision === 'review_stale_remote') {
          hadRemoteSessionRef.current = true
          staleSessionRef.current = session
          writeActiveSessionBackup(currentUid, session)
          setStaleSession({ ageLabel: getStaleSessionAgeLabel(session.startedAt) })
          setReady(true)
          return
        } else if (session && decision === 'accept_remote') {
          hadRemoteSessionRef.current = true
          staleSessionRef.current = null
          setStaleSession(null)
          writeActiveSessionBackup(currentUid, session)
          applyingRemoteRef.current = true
          hasUnsyncedLocalChangesRef.current = false
          activeRef.current = session
          hydrateFromDoc(session)
          if (closureIntentRef.current) setClosureState('session_mismatch')
        } else if (session) {
          hadRemoteSessionRef.current = true
          const matchingIntent = closureIntentRef.current?.session.sessionId === session.sessionId
          if (!matchingIntent && isActiveSessionStale(session)) {
            staleSessionRef.current = session
            writeActiveSessionBackup(currentUid, session)
            setStaleSession({ ageLabel: getStaleSessionAgeLabel(session.startedAt) })
            setReady(true)
            return
          }

          staleSessionRef.current = null
          setStaleSession(null)
          if (!matchingIntent && current && hasUnsyncedLocalChangesRef.current && currentSerialized !== nextSerialized) {
            writeActiveSessionBackup(currentUid, current)
            persistSession(current)
            setReady(true)
            return
          }
          writeActiveSessionBackup(currentUid, matchingIntent ? closureIntentRef.current!.session : session)
          if (!matchingIntent && currentSerialized !== nextSerialized) {
            applyingRemoteRef.current = true
            hasUnsyncedLocalChangesRef.current = false
            activeRef.current = session
            hydrateFromDoc(session)
          } else {
            hasUnsyncedLocalChangesRef.current = false
          }
        } else if (decision === 'retain_closure_snapshot') {
          hasUnsyncedLocalChangesRef.current = false
          const pendingSnapshot = closureIntentRef.current?.session
          if (pendingSnapshot) {
            staleSessionRef.current = null
            setStaleSession(null)
            applyingRemoteRef.current = true
            activeRef.current = pendingSnapshot
            hydrateFromDoc(pendingSnapshot)
            writeActiveSessionBackup(currentUid, pendingSnapshot)
            setClosureState('closure_unconfirmed')
          }
        } else if (decision === 'clear_local' && !awaitingServerConfirmation) {
          hadRemoteSessionRef.current = false
          staleSessionRef.current = null
          setStaleSession(null)
          clearActiveSessionBackup(currentUid)
          if (current) {
            applyingRemoteRef.current = true
            hasUnsyncedLocalChangesRef.current = false
            activeRef.current = null
            clearWorkout()
          }
        } else if (awaitingServerConfirmation) {
          if (current) setReady(true)
          return
        } else if (shouldAutoStartEmptySession({
          currentSession: current,
          confirmedClosure: confirmedClosureRef.current,
        })) {
          const backup = readActiveSessionBackup(currentUid)
          if (backup) {
            if (isActiveSessionStale(backup)) {
              staleSessionRef.current = backup
              setStaleSession({ ageLabel: getStaleSessionAgeLabel(backup.startedAt) })
              setReady(true)
              return
            }
            activeRef.current = backup
            hydrateFromDoc(backup)
            persistSession(backup)
          } else if (!closureIntentRef.current) {
            startWorkout()
            const createdSession = useWorkoutStore.getState().active
            activeRef.current = createdSession
            if (createdSession) {
              writeActiveSessionBackup(currentUid, createdSession)
              persistSession(createdSession)
            }
          }
        } else if (current && !closureIntentRef.current) {
          writeActiveSessionBackup(currentUid, current)
          persistSession(current)
        }
        setReady(true)
      },
      (error) => {
        console.error('[activeSession subscribe error]', error)
        if (closureIntentRef.current) {
          setReady(true)
          return
        }
        const current = useWorkoutStore.getState().active
        const backup = readActiveSessionBackup(currentUid)
        if (!current && backup) {
          activeRef.current = backup
          hydrateFromDoc(backup)
        } else if (!current && !backup) {
          startWorkout()
          const createdSession = useWorkoutStore.getState().active
          activeRef.current = createdSession
          if (createdSession) writeActiveSessionBackup(currentUid, createdSession)
        }
        setReady(true)
      },
    )

    const unsubscribe = useWorkoutStore.subscribe((state) => {
      activeRef.current = state.active
      cancelPendingPersistence()
      if (applyingRemoteRef.current) {
        applyingRemoteRef.current = false
        return
      }
      if (!state.active) {
        hasUnsyncedLocalChangesRef.current = false
        return
      }
      const snapshot = state.active
      if (!shouldPersistActiveSession(snapshot, closureIntentRef.current)) return
      hasUnsyncedLocalChangesRef.current = true
      writeActiveSessionBackup(currentUid, snapshot)
      timerRef.current = setTimeout(() => persistSession(snapshot), 400)
    })

    function flushPendingSession() {
      cancelPendingPersistence()
      if (!activeRef.current || !shouldPersistActiveSession(activeRef.current, closureIntentRef.current)) return
      writeActiveSessionBackup(currentUid, activeRef.current)
      persistSession(activeRef.current)
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') flushPendingSession()
    }

    window.addEventListener('pagehide', flushPendingSession)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      flushPendingSession()
      unsubscribeRemote()
      unsubscribe()
      window.removeEventListener('pagehide', flushPendingSession)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [uid])

  async function continueStaleSession(): Promise<void> {
    if (!uid || !staleSessionRef.current || closureIntentRef.current) return
    const refreshedSession = refreshStaleActiveSession(staleSessionRef.current)
    staleSessionRef.current = null
    setStaleSession(null)
    applyingRemoteRef.current = true
    hasUnsyncedLocalChangesRef.current = false
    activeRef.current = refreshedSession
    useWorkoutStore.getState().hydrateFromDoc(refreshedSession)
    writeActiveSessionBackup(uid, refreshedSession)
    await saveActiveSession(uid, refreshedSession)
  }

  async function discardStaleSession() {
    const pendingStaleDiscard = closureIntentRef.current?.action === 'discard'
      ? closureIntentRef.current.session
      : null
    const session = staleSessionRef.current ?? pendingStaleDiscard
    if (!uid || !session) return null
    const intent = beginClosure('discard', session)
    if (!intent) return null
    try {
      const result = await discardStaleSessionLifecycle({
        uid,
        session: intent.session,
        now: () => intent.createdAt,
        clearConfirmed: clearConfirmedClosure,
        startReplacement: () => {
          const pendingSessionId = intent.session.sessionId
          const currentSessionId = useWorkoutStore.getState().active?.sessionId
          const remoteSessionId = remoteSessionRef.current?.sessionId
          if (!canCreateStaleReplacement(
            { status: 'discarded' },
            { confirmedSessionId: pendingSessionId, currentSessionId, remoteSessionId },
          )) return null
          useWorkoutStore.getState().startWorkout()
          const createdSession = useWorkoutStore.getState().active
          activeRef.current = createdSession
          return createdSession
        },
        persistReplacement: async (createdSession) => {
          writeActiveSessionBackup(uid, createdSession)
          try {
            await saveActiveSession(uid, createdSession)
          } catch (error) {
            console.error('[persist stale replacement error]', error)
          }
        },
      })
      if (result.status === 'closure_unconfirmed') markClosureUnconfirmed()
      return result
    } catch (error) {
      if (error instanceof WorkoutClosureError) markClosureError(error)
      else markClosureUnconfirmed()
      throw error
    }
  }

  return {
    beginClosure,
    closureIntent,
    closureState,
    confirmClosure: clearConfirmedClosure,
    continueStaleSession,
    discardStaleSession,
    markClosureUnconfirmed,
    markClosureError,
    markSessionMismatch,
    ready,
    reloadCurrentSession,
    reloadAuthentication,
    staleSession,
  }
}
