import { useCallback, useEffect, useRef, useState } from 'react'
import { stripWorkoutClientIds, useWorkoutStore, type ActiveWorkout } from '../store/workoutStore'
import {
  ActiveSessionConflictError,
  claimActiveSession,
  loadActiveSessionFromServer,
  saveActiveSession,
  subscribeToActiveSession,
} from '../lib/activeSessionService'
import {
  clearActiveSessionBackup,
  readActiveSessionBackup,
  readActiveSessionBackupRecord,
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
  classifyClosureFailure,
  decideConfirmedClosure,
  decideRemoteSessionSync,
  isAuthoritativeActiveSessionSnapshot,
  shouldPersistActiveSession,
  shouldResolveActiveSessionSyncFailure,
  type ClosureFailureState,
} from '../lib/activeSessionSyncPolicy'
import { WorkoutClosureError } from '../lib/workoutClosureService'
import { useAuthStore } from '../store/authStore'
import type { ActiveSessionSyncStatusValue } from '../components/workout/ActiveSessionSyncStatus'

export type ClosureUiState =
  | 'idle'
  | 'submitting'
  | ClosureFailureState

export type StaleSessionOperationResult =
  | { status: 'completed' }
  | { status: 'ignored' }
  | { status: 'sync_failed' }

export type PrepareFinishClosureResult =
  | { status: 'ready'; sessionRevision: string }
  | { status: 'failed' }

const COMPLETED_STALE_SESSION_OPERATION = { status: 'completed' } as const
const IGNORED_STALE_SESSION_OPERATION = { status: 'ignored' } as const
const FAILED_STALE_SESSION_SYNC_OPERATION = { status: 'sync_failed' } as const
const ACTIVE_SESSION_READY_TIMEOUT_MS = 8_000
// Navigation can mount another hook before the final write has settled.
const sessionSaveQueues = new Map<string, { promise: Promise<void>; revision: { value: string | null } }>()

function serializeActiveWorkout(value: ActiveWorkout | null): string {
  return JSON.stringify(value ? {
    sessionId: value.sessionId,
    startedAt: value.startedAt,
    templateId: value.templateId || null,
    label: value.label?.trim() || null,
    exercises: stripWorkoutClientIds(value).exercises,
  } : null)
}

interface SessionWriteContext {
  generation: number
  operation: number
  sessionId: string
}

function captureSessionWrite(
  sessionId: string,
  generation: number,
  operation: number,
): SessionWriteContext {
  return { generation, operation, sessionId }
}

function isConfirmedClosedSessionId(
  sessionId: string | undefined,
  closedSessionIds: ReadonlySet<string>,
): boolean {
  return sessionId !== undefined && closedSessionIds.has(sessionId)
}

function isSessionWriteCurrent(
  write: SessionWriteContext,
  currentGeneration: number,
  currentOperation: number,
  closedSessionIds: ReadonlySet<string>,
): boolean {
  return write.generation === currentGeneration
    && write.operation === currentOperation
    && !isConfirmedClosedSessionId(write.sessionId, closedSessionIds)
}

function isSessionWriteGenerationCurrent(
  generation: number,
  currentGeneration: number,
): boolean {
  return generation === currentGeneration
}

export function useActiveSession(uid: string | null) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeSessionRevisionRef = useRef<{ value: string | null }>({ value: null })
  const activeRef = useRef(useWorkoutStore.getState().active)
  const staleSessionRef = useRef<ActiveWorkout | null>(null)
  const closureIntentRef = useRef<WorkoutClosureIntent | null>(null)
  const remoteSessionRef = useRef<ActiveWorkout | null>(null)
  const applyingRemoteRef = useRef(false)
  const hadRemoteSessionRef = useRef(false)
  const hasUnsyncedLocalChangesRef = useRef(false)
  const confirmedClosedSessionIdsRef = useRef<Set<string>>(new Set())
  const sessionWriteGenerationRef = useRef(0)
  const sessionWriteOperationRef = useRef(0)
  const startingSessionRef = useRef(false)
  const [ready, setReady] = useState(uid === null)
  const [staleSession, setStaleSession] = useState<{ ageLabel: string } | null>(null)
  const [closureIntent, setClosureIntent] = useState<WorkoutClosureIntent | null>(null)
  const [closureState, setClosureState] = useState<ClosureUiState>('idle')
  const [activeSessionSyncStatus, setActiveSessionSyncStatus] = useState<ActiveSessionSyncStatusValue>('idle')

  function writeSessionBackup(currentUid: string, snapshot: ActiveWorkout, unsynced = hasUnsyncedLocalChangesRef.current) {
    writeActiveSessionBackup(currentUid, snapshot, {
      baseRevision: activeSessionRevisionRef.current.value,
      unsynced,
    })
  }

  function saveSessionWithRevision(
    currentUid: string,
    snapshot: ActiveWorkout,
    generation: number,
    finalWrite = false,
  ) {
    const queueKey = `${currentUid}:${snapshot.sessionId}`
    const revision = activeSessionRevisionRef.current
    const queuedSave = (sessionSaveQueues.get(queueKey)?.promise ?? Promise.resolve()).then(async () => {
      const currentGeneration = isSessionWriteGenerationCurrent(generation, sessionWriteGenerationRef.current)
      const backup = readActiveSessionBackupRecord(currentUid)
      const validFinalWrite = finalWrite
        && useAuthStore.getState().user?.uid === currentUid
        && useWorkoutStore.getState().active?.sessionId === snapshot.sessionId
        && backup?.session.sessionId === snapshot.sessionId
        && !readWorkoutClosureIntent(currentUid)
      if ((!currentGeneration && !validFinalWrite)
        || isConfirmedClosedSessionId(snapshot.sessionId, confirmedClosedSessionIdsRef.current)) {
        throw new Error('Active session write superseded.')
      }
      const expectedRevision = revision.value
      const saved = await saveActiveSession(currentUid, snapshot, expectedRevision)
      const latest = readActiveSessionBackupRecord(currentUid)
      if (latest?.session.sessionId === snapshot.sessionId && latest.baseRevision === expectedRevision
        && serializeActiveWorkout(latest.session) === serializeActiveWorkout(useWorkoutStore.getState().active)) {
        writeActiveSessionBackup(currentUid, latest.session, {
          baseRevision: saved.sessionRevision,
          unsynced: serializeActiveWorkout(latest.session) !== serializeActiveWorkout(snapshot),
        })
      }
      // Advance only this runtime's lineage; another tab's backup cannot authorize a write.
      if (revision.value === expectedRevision
        && useWorkoutStore.getState().active?.sessionId === snapshot.sessionId
        && !isConfirmedClosedSessionId(snapshot.sessionId, confirmedClosedSessionIdsRef.current)) {
        revision.value = saved.sessionRevision
      }
      return saved
    })
    const settled = queuedSave.then(() => undefined, () => undefined)
    sessionSaveQueues.set(queueKey, { promise: settled, revision })
    void settled.then(() => {
      if (sessionSaveQueues.get(queueKey)?.promise === settled) sessionSaveQueues.delete(queueKey)
    })
    return queuedSave
  }

  function reportSessionSaveFailure(error: unknown, context: string) {
    if (error instanceof ActiveSessionConflictError) {
      setActiveSessionSyncStatus('conflict')
      return
    }
    setActiveSessionSyncStatus('failed')
    console.error(context, error)
  }

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
        if (uid) writeSessionBackup(uid, authoritative)
      }
      return
    }
    confirmedClosedSessionIdsRef.current.add(confirmedSessionId)
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
      writeSessionBackup(uid, intent.session)
    }
    return intent
  }

  function markClosureUnconfirmed() {
    cancelPendingPersistence()
    setClosureState('closure_unconfirmed')
  }

  async function prepareFinishClosure(
    intent: WorkoutClosureIntent,
  ): Promise<PrepareFinishClosureResult> {
    if (!uid || closureIntentRef.current !== intent || intent.action !== 'finish') {
      return { status: 'failed' }
    }

    setActiveSessionSyncStatus('retrying')
    const write = captureSessionWrite(
      intent.session.sessionId,
      sessionWriteGenerationRef.current,
      ++sessionWriteOperationRef.current,
    )
    try {
      const saved = await saveSessionWithRevision(uid, intent.session, write.generation)
      if (
        closureIntentRef.current !== intent
        || !isSessionWriteCurrent(
          write,
          sessionWriteGenerationRef.current,
          sessionWriteOperationRef.current,
          confirmedClosedSessionIdsRef.current,
        )
      ) return { status: 'failed' }
      const preparedIntent = { ...intent, sessionRevision: saved.sessionRevision }
      writeWorkoutClosureIntent(uid, preparedIntent)
      setPendingIntent(preparedIntent)
      hasUnsyncedLocalChangesRef.current = false
      setActiveSessionSyncStatus('idle')
      return { status: 'ready', sessionRevision: saved.sessionRevision }
    } catch (error) {
      if (
        closureIntentRef.current !== intent
        || !isSessionWriteCurrent(
          write,
          sessionWriteGenerationRef.current,
          sessionWriteOperationRef.current,
          confirmedClosedSessionIdsRef.current,
        )
      ) return { status: 'failed' }
      clearWorkoutClosureIntent(uid)
      setPendingIntent(null)
      setClosureState('idle')
      reportSessionSaveFailure(error, '[prepare workout closure error]')
      return { status: 'failed' }
    }
  }

  function markSessionMismatch() {
    cancelPendingPersistence()
    setClosureState('session_mismatch')
  }

  async function markClosureError(error: WorkoutClosureError): Promise<ClosureFailureState | null> {
    cancelPendingPersistence()
    const failure = classifyClosureFailure(error)
    setClosureState(failure)
    if (
      failure === 'session_mismatch'
      || failure === 'closure_conflict'
      || failure === 'active_session_changed'
    ) {
      const reloaded = await reloadCurrentSession()
      if (!reloaded && failure === 'active_session_changed') {
        return null
      }
    }
    return failure
  }

  function reloadAuthentication() {
    cancelPendingPersistence()
    window.location.reload()
  }

  async function reloadCurrentSession(): Promise<boolean> {
    if (!uid) return false
    cancelPendingPersistence()
    const generation = sessionWriteGenerationRef.current
    setActiveSessionSyncStatus('retrying')
    setReady(false)
    try {
      const authoritative = await loadActiveSessionFromServer(uid)
      if (!isSessionWriteGenerationCurrent(generation, sessionWriteGenerationRef.current)) return false
      const authoritativeSession = authoritative.session
      activeSessionRevisionRef.current.value = authoritative.sessionRevision
      clearWorkoutClosureIntent(uid)
      clearActiveSessionBackup(uid)
      setPendingIntent(null)
      setClosureState('idle')
      staleSessionRef.current = null
      setStaleSession(null)
      remoteSessionRef.current = authoritativeSession
      hadRemoteSessionRef.current = authoritativeSession !== null
      hasUnsyncedLocalChangesRef.current = false
      applyingRemoteRef.current = true
      activeRef.current = authoritativeSession
      if (authoritativeSession) {
        useWorkoutStore.getState().hydrateFromDoc(authoritativeSession)
        writeSessionBackup(uid, authoritativeSession)
      } else {
        useWorkoutStore.getState().clearWorkout()
      }
      setActiveSessionSyncStatus('idle')
      setReady(true)
      return true
    } catch (error) {
      if (!isSessionWriteGenerationCurrent(generation, sessionWriteGenerationRef.current)) return false
      setActiveSessionSyncStatus('failed')
      setReady(true)
      console.error('[active session reload error]', error)
      return false
    }
  }

  const startNewSession = useCallback(async (): Promise<void> => {
    if (!uid || closureIntentRef.current || startingSessionRef.current) return
    if (useWorkoutStore.getState().active) {
      setReady(true)
      return
    }

    startingSessionRef.current = true
    const generation = sessionWriteGenerationRef.current
    applyingRemoteRef.current = true
    useWorkoutStore.getState().startWorkout()
    const candidate = useWorkoutStore.getState().active
    activeRef.current = candidate
    if (!candidate) {
      startingSessionRef.current = false
      return
    }

    setReady(false)
    setActiveSessionSyncStatus('retrying')
    try {
      const claimed = await claimActiveSession(uid, candidate)
      if (!isSessionWriteGenerationCurrent(generation, sessionWriteGenerationRef.current)) return
      activeSessionRevisionRef.current.value = claimed.sessionRevision
      remoteSessionRef.current = claimed.session
      hadRemoteSessionRef.current = true
      hasUnsyncedLocalChangesRef.current = false
      applyingRemoteRef.current = true
      activeRef.current = claimed.session
      useWorkoutStore.getState().hydrateFromDoc(claimed.session)
      writeSessionBackup(uid, claimed.session)
      setActiveSessionSyncStatus('idle')
      setReady(true)
    } catch (error) {
      if (!isSessionWriteGenerationCurrent(generation, sessionWriteGenerationRef.current)) return
      applyingRemoteRef.current = true
      activeRef.current = null
      useWorkoutStore.getState().clearWorkout()
      clearActiveSessionBackup(uid)
      setActiveSessionSyncStatus('failed')
      setReady(true)
      console.error('[active session claim error]', error)
    } finally {
      startingSessionRef.current = false
    }
  }, [uid])

  useEffect(() => {
    activeRef.current = useWorkoutStore.getState().active
  }, [])

  useEffect(() => {
    if (!uid || ready) return
    const timeout = window.setTimeout(() => {
      setActiveSessionSyncStatus('failed')
    }, ACTIVE_SESSION_READY_TIMEOUT_MS)
    return () => window.clearTimeout(timeout)
  }, [ready, uid])

  useEffect(() => {
    const sessionWriteGeneration = sessionWriteGenerationRef.current + 1
    sessionWriteGenerationRef.current = sessionWriteGeneration
    activeSessionRevisionRef.current = { value: null }
    confirmedClosedSessionIdsRef.current = new Set()
    if (!uid) {
      setReady(true)
      return () => {
        if (sessionWriteGenerationRef.current === sessionWriteGeneration) {
          sessionWriteGenerationRef.current += 1
        }
      }
    }

    const currentUid = uid
    const currentAtMount = useWorkoutStore.getState().active
    const backupAtMount = readActiveSessionBackupRecord(currentUid)
    const intentAtMount = readWorkoutClosureIntent(currentUid)
    closureIntentRef.current = intentAtMount
    setClosureIntent(intentAtMount)
    setClosureState(intentAtMount ? 'closure_unconfirmed' : 'idle')
    hasUnsyncedLocalChangesRef.current = Boolean(backupAtMount?.unsynced
      && (!currentAtMount || currentAtMount.sessionId === backupAtMount.session.sessionId))
    const mountedSessionId = currentAtMount?.sessionId ?? backupAtMount?.session.sessionId
    activeSessionRevisionRef.current = sessionSaveQueues.get(`${currentUid}:${mountedSessionId}`)?.revision
      ?? { value: backupAtMount?.baseRevision ?? null }
    setReady(false)
    staleSessionRef.current = null
    setStaleSession(null)
    hadRemoteSessionRef.current = false
    remoteSessionRef.current = null

    const { hydrateFromDoc, clearWorkout } = useWorkoutStore.getState()
    if (!intentAtMount && hasUnsyncedLocalChangesRef.current && backupAtMount) {
      activeRef.current = backupAtMount.session
      hydrateFromDoc(backupAtMount.session)
    }
    if (intentAtMount) {
      applyingRemoteRef.current = true
      hasUnsyncedLocalChangesRef.current = false
      activeRef.current = intentAtMount.session
      hydrateFromDoc(intentAtMount.session)
      writeSessionBackup(currentUid, intentAtMount.session)
    }

    function persistSession(snapshot: ActiveWorkout, finalWrite = false) {
      if (!isSessionWriteGenerationCurrent(
        sessionWriteGeneration,
        sessionWriteGenerationRef.current,
      ) || isConfirmedClosedSessionId(
        snapshot.sessionId,
        confirmedClosedSessionIdsRef.current,
      )) return
      if (!shouldPersistActiveSession(snapshot, closureIntentRef.current)) return
      const write = captureSessionWrite(
        snapshot.sessionId,
        sessionWriteGeneration,
        ++sessionWriteOperationRef.current,
      )
      void saveSessionWithRevision(currentUid, snapshot, sessionWriteGeneration, finalWrite)
        .then(() => {
          if (!isSessionWriteCurrent(
            write,
            sessionWriteGenerationRef.current,
            sessionWriteOperationRef.current,
            confirmedClosedSessionIdsRef.current,
          )) return
          if (shouldResolveActiveSessionSyncFailure({
            writeSucceeded: true,
            authoritative: false,
            reconciliationResolved: false,
          })) setActiveSessionSyncStatus('idle')
        })
        .catch((error: unknown) => {
          if (!isSessionWriteCurrent(
            write,
            sessionWriteGenerationRef.current,
            sessionWriteOperationRef.current,
            confirmedClosedSessionIdsRef.current,
          )) return
          reportSessionSaveFailure(error, '[active session save error]')
        })
    }

    const unsubscribeRemote = subscribeToActiveSession(
      currentUid,
      ({ session, sessionRevision, fromCache, hasPendingWrites }) => {
        const authoritative = isAuthoritativeActiveSessionSnapshot({ fromCache, hasPendingWrites })
        if (authoritative && isConfirmedClosedSessionId(
          session?.sessionId,
          confirmedClosedSessionIdsRef.current,
        )) {
          setReady(true)
          return
        }
        if (authoritative) {
          remoteSessionRef.current = session
        }
        const current = useWorkoutStore.getState().active
        const currentSerialized = serializeActiveWorkout(current)
        const nextSerialized = serializeActiveWorkout(session)
        const preserveLocalBaseRevision = Boolean(
          authoritative
          && current?.sessionId === session?.sessionId
          && hasUnsyncedLocalChangesRef.current
          && currentSerialized !== nextSerialized,
        )
        if (authoritative && !preserveLocalBaseRevision) {
          activeSessionRevisionRef.current.value = sessionRevision ?? null
        }
        const decision = decideRemoteSessionSync({
          localSession: current,
          remoteSession: session,
          closureIntent: closureIntentRef.current,
          remoteSessionIsStale: session ? isActiveSessionStale(session) : false,
          authoritative,
        })
        if (!authoritative) {
          if (!startingSessionRef.current && (current || closureIntentRef.current)) setReady(true)
          return
        }

        if (session && decision === 'review_stale_remote') {
          hadRemoteSessionRef.current = true
          staleSessionRef.current = session
          writeSessionBackup(currentUid, session, false)
          setStaleSession({ ageLabel: getStaleSessionAgeLabel(session.startedAt) })
          setReady(true)
          return
        } else if (session && decision === 'accept_remote') {
          hadRemoteSessionRef.current = true
          staleSessionRef.current = null
          setStaleSession(null)
          writeSessionBackup(currentUid, session, false)
          applyingRemoteRef.current = true
          hasUnsyncedLocalChangesRef.current = false
          activeRef.current = session
          hydrateFromDoc(session)
          if (closureIntentRef.current) {
            clearWorkoutClosureIntent(currentUid)
            setPendingIntent(null)
            setClosureState('idle')
          }
        } else if (session) {
          hadRemoteSessionRef.current = true
          const matchingIntent = closureIntentRef.current?.session.sessionId === session.sessionId
          if (!matchingIntent && isActiveSessionStale(session)) {
            const retained = current && hasUnsyncedLocalChangesRef.current ? current : session
            staleSessionRef.current = retained
            writeSessionBackup(currentUid, retained, hasUnsyncedLocalChangesRef.current)
            setStaleSession({ ageLabel: getStaleSessionAgeLabel(session.startedAt) })
            setReady(true)
            return
          }

          staleSessionRef.current = null
          setStaleSession(null)
          if (!matchingIntent && current && hasUnsyncedLocalChangesRef.current && currentSerialized !== nextSerialized) {
            writeSessionBackup(currentUid, current)
            persistSession(current)
            setReady(true)
            return
          }
          writeSessionBackup(currentUid, matchingIntent ? closureIntentRef.current!.session : session, false)
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
            writeSessionBackup(currentUid, pendingSnapshot)
            setClosureState('closure_unconfirmed')
          }
        } else if (decision === 'clear_local') {
          hadRemoteSessionRef.current = false
          hasUnsyncedLocalChangesRef.current = false
          staleSessionRef.current = null
          setStaleSession(null)
          clearActiveSessionBackup(currentUid)
          if (current) {
            applyingRemoteRef.current = true
            activeRef.current = null
            clearWorkout()
          }
        } else if (current && !closureIntentRef.current) {
          writeSessionBackup(currentUid, current)
          persistSession(current)
        }
        const reconciliationResolved = authoritative && (
          decision === 'clear_local'
          || decision === 'accept_remote'
          || (decision === 'keep_local' && currentSerialized === nextSerialized)
        )
        if (shouldResolveActiveSessionSyncFailure({
          writeSucceeded: false,
          authoritative,
          reconciliationResolved,
        })) setActiveSessionSyncStatus('idle')
        setReady(true)
      },
      (error) => {
        console.error('[activeSession subscribe error]', error)
        setActiveSessionSyncStatus('failed')
        if (closureIntentRef.current) {
          setReady(true)
          return
        }
        const current = useWorkoutStore.getState().active
        const backup = readActiveSessionBackup(currentUid)
        if (!current && backup) {
          activeRef.current = backup
          hydrateFromDoc(backup)
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
      if (isConfirmedClosedSessionId(
        snapshot.sessionId,
        confirmedClosedSessionIdsRef.current,
      )) return
      if (!shouldPersistActiveSession(snapshot, closureIntentRef.current)) return
      hasUnsyncedLocalChangesRef.current = true
      writeSessionBackup(currentUid, snapshot)
      timerRef.current = setTimeout(() => persistSession(snapshot), 400)
    })

    function flushPendingSession(finalWrite = false) {
      cancelPendingPersistence()
      if (isConfirmedClosedSessionId(
        activeRef.current?.sessionId,
        confirmedClosedSessionIdsRef.current,
      )) return
      if (!activeRef.current || !shouldPersistActiveSession(activeRef.current, closureIntentRef.current)) return
      writeSessionBackup(currentUid, activeRef.current)
      persistSession(activeRef.current, finalWrite)
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') flushPendingSession()
    }

    const handlePageHide = () => flushPendingSession()
    window.addEventListener('pagehide', handlePageHide)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      if (hasUnsyncedLocalChangesRef.current) flushPendingSession(true)
      unsubscribeRemote()
      unsubscribe()
      window.removeEventListener('pagehide', handlePageHide)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (sessionWriteGenerationRef.current === sessionWriteGeneration) {
        sessionWriteGenerationRef.current += 1
      }
    }
  }, [uid])

  async function continueStaleSession(): Promise<StaleSessionOperationResult> {
    if (!uid || !staleSessionRef.current || closureIntentRef.current) {
      return IGNORED_STALE_SESSION_OPERATION
    }
    const refreshedSession = refreshStaleActiveSession(staleSessionRef.current)
    staleSessionRef.current = null
    setStaleSession(null)
    applyingRemoteRef.current = true
    hasUnsyncedLocalChangesRef.current = false
    activeRef.current = refreshedSession
    useWorkoutStore.getState().hydrateFromDoc(refreshedSession)
    writeSessionBackup(uid, refreshedSession, true)
    const write = captureSessionWrite(
      refreshedSession.sessionId,
      sessionWriteGenerationRef.current,
      ++sessionWriteOperationRef.current,
    )
    try {
      await saveSessionWithRevision(
        uid,
        refreshedSession,
        sessionWriteGenerationRef.current,
      )
    } catch (error) {
      if (!isSessionWriteCurrent(
        write,
        sessionWriteGenerationRef.current,
        sessionWriteOperationRef.current,
        confirmedClosedSessionIdsRef.current,
      )) return IGNORED_STALE_SESSION_OPERATION
      hasUnsyncedLocalChangesRef.current = true
      reportSessionSaveFailure(error, '[continue stale session persistence error]')
      return FAILED_STALE_SESSION_SYNC_OPERATION
    }
    if (!isSessionWriteCurrent(
      write,
      sessionWriteGenerationRef.current,
      sessionWriteOperationRef.current,
      confirmedClosedSessionIdsRef.current,
    )) return IGNORED_STALE_SESSION_OPERATION
    setActiveSessionSyncStatus('idle')
    return COMPLETED_STALE_SESSION_OPERATION
  }

  async function discardStaleSession() {
    const pendingStaleDiscard = closureIntentRef.current?.action === 'discard'
      ? closureIntentRef.current.session
      : null
    const session = staleSessionRef.current ?? pendingStaleDiscard
    if (!uid || !session) return IGNORED_STALE_SESSION_OPERATION
    const sessionWriteGeneration = sessionWriteGenerationRef.current
    const intent = beginClosure('discard', session)
    if (!intent) return IGNORED_STALE_SESSION_OPERATION
    try {
      const result = await discardStaleSessionLifecycle({
        uid,
        session: intent.session,
        now: () => intent.createdAt,
        clearConfirmed: () => {
          if (!isSessionWriteGenerationCurrent(
            sessionWriteGeneration,
            sessionWriteGenerationRef.current,
          )) return
          clearConfirmedClosure()
        },
        startReplacement: () => {
          if (!isSessionWriteGenerationCurrent(
            sessionWriteGeneration,
            sessionWriteGenerationRef.current,
          )) return null
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
          if (!isSessionWriteGenerationCurrent(
            sessionWriteGeneration,
            sessionWriteGenerationRef.current,
          ) || isConfirmedClosedSessionId(
            createdSession.sessionId,
            confirmedClosedSessionIdsRef.current,
          )) return
          const write = captureSessionWrite(
            createdSession.sessionId,
            sessionWriteGeneration,
            ++sessionWriteOperationRef.current,
          )
          writeSessionBackup(uid, createdSession)
          try {
            await saveSessionWithRevision(uid, createdSession, sessionWriteGeneration)
            if (!isSessionWriteCurrent(
              write,
              sessionWriteGenerationRef.current,
              sessionWriteOperationRef.current,
              confirmedClosedSessionIdsRef.current,
            )) return
            setActiveSessionSyncStatus('idle')
          } catch (error) {
            if (!isSessionWriteCurrent(
              write,
              sessionWriteGenerationRef.current,
              sessionWriteOperationRef.current,
              confirmedClosedSessionIdsRef.current,
            )) return
            reportSessionSaveFailure(error, '[persist stale replacement error]')
          }
        },
      })
      if (!isSessionWriteGenerationCurrent(
        sessionWriteGeneration,
        sessionWriteGenerationRef.current,
      )) return IGNORED_STALE_SESSION_OPERATION
      if (result.status === 'closure_unconfirmed') markClosureUnconfirmed()
      return result
    } catch (error) {
      if (!isSessionWriteGenerationCurrent(
        sessionWriteGeneration,
        sessionWriteGenerationRef.current,
      )) return IGNORED_STALE_SESSION_OPERATION
      if (error instanceof WorkoutClosureError) await markClosureError(error)
      else markClosureUnconfirmed()
      throw error
    }
  }

  async function retryActiveSessionSync(): Promise<void> {
    if (!uid || !activeRef.current || closureIntentRef.current) return
    if (isConfirmedClosedSessionId(
      activeRef.current.sessionId,
      confirmedClosedSessionIdsRef.current,
    )) return
    const snapshot = activeRef.current
    const write = captureSessionWrite(
      snapshot.sessionId,
      sessionWriteGenerationRef.current,
      ++sessionWriteOperationRef.current,
    )
    writeSessionBackup(uid, snapshot)
    setActiveSessionSyncStatus('retrying')
    try {
      await saveSessionWithRevision(
        uid,
        snapshot,
        sessionWriteGenerationRef.current,
      )
      if (!isSessionWriteCurrent(
        write,
        sessionWriteGenerationRef.current,
        sessionWriteOperationRef.current,
        confirmedClosedSessionIdsRef.current,
      )) return
      hasUnsyncedLocalChangesRef.current = false
      setActiveSessionSyncStatus('idle')
    } catch (error) {
      if (!isSessionWriteCurrent(
        write,
        sessionWriteGenerationRef.current,
        sessionWriteOperationRef.current,
        confirmedClosedSessionIdsRef.current,
      )) return
      reportSessionSaveFailure(error, '[active session retry error]')
    }
  }

  return {
    activeSessionSyncStatus,
    beginClosure,
    closureIntent,
    closureState,
    confirmClosure: clearConfirmedClosure,
    continueStaleSession,
    discardStaleSession,
    markClosureUnconfirmed,
    markClosureError,
    markSessionMismatch,
    prepareFinishClosure,
    ready,
    reloadCurrentSession,
    reloadAuthentication,
    retryActiveSessionSync,
    startNewSession,
    staleSession,
  }
}
