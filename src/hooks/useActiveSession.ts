import { useEffect, useRef, useState } from 'react'
import { useWorkoutStore, type ActiveWorkout } from '../store/workoutStore'
import { saveActiveSession, deleteActiveSession, subscribeToActiveSession } from '../lib/activeSessionService'
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

function serializeActiveWorkout(value: unknown): string {
  return JSON.stringify(value ?? null)
}

/**
 * Subscribes to the Zustand workout store and syncs changes to Firestore
 * (activeSessions/{uid}) with a debounce. Provides clearSession() to delete
 * the Firestore document when the workout ends (finish or discard).
 *
 * IMPORTANT: always call clearWorkout() before clearSession() to prevent
 * a residual debounce timer from re-writing the deleted document.
 */
export function useActiveSession(uid: string | null) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeRef = useRef(useWorkoutStore.getState().active)
  const staleSessionRef = useRef<ActiveWorkout | null>(null)
  const applyingRemoteRef = useRef(false)
  const hadRemoteSessionRef = useRef(false)
  const hasUnsyncedLocalChangesRef = useRef(false)
  const [ready, setReady] = useState(uid === null)
  const [staleSession, setStaleSession] = useState<{ ageLabel: string } | null>(null)

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
    hasUnsyncedLocalChangesRef.current = Boolean(
      currentAtMount
      && backupAtMount
      && serializeActiveWorkout(currentAtMount) === serializeActiveWorkout(backupAtMount),
    )
    setReady(false)
    staleSessionRef.current = null
    setStaleSession(null)
    hadRemoteSessionRef.current = false

    const {
      hydrateFromDoc,
      clearWorkout,
      startWorkout,
    } = useWorkoutStore.getState()

    const unsubscribeRemote = subscribeToActiveSession(
      currentUid,
      ({ session, fromCache, hasPendingWrites }) => {
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

        if (session) {
          if (isActiveSessionStale(session)) {
            hadRemoteSessionRef.current = true
            staleSessionRef.current = session
            writeActiveSessionBackup(currentUid, session)
            setStaleSession({ ageLabel: getStaleSessionAgeLabel(session.startedAt) })
            setReady(true)
            return
          }

          staleSessionRef.current = null
          setStaleSession(null)

          if (current && hasUnsyncedLocalChangesRef.current && currentSerialized !== nextSerialized) {
            writeActiveSessionBackup(currentUid, current)
            void saveActiveSession(currentUid, current).catch(console.error)
            setReady(true)
            return
          }

          hadRemoteSessionRef.current = true
          writeActiveSessionBackup(currentUid, session)

          if (currentSerialized !== nextSerialized) {
            applyingRemoteRef.current = true
            hasUnsyncedLocalChangesRef.current = false
            activeRef.current = session
            hydrateFromDoc(session)
          } else {
            hasUnsyncedLocalChangesRef.current = false
          }
        } else if (hadRemoteSessionRef.current) {
          staleSessionRef.current = null
          setStaleSession(null)

          if (current && hasUnsyncedLocalChangesRef.current) {
            setReady(true)
            return
          }

          hadRemoteSessionRef.current = false
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
        } else if (!current) {
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
            void saveActiveSession(currentUid, backup).catch(console.error)
          } else {
            startWorkout()
            const createdSession = useWorkoutStore.getState().active
            activeRef.current = createdSession
            if (createdSession) {
              writeActiveSessionBackup(currentUid, createdSession)
              void saveActiveSession(currentUid, createdSession).catch(console.error)
            }
          }
        } else {
          writeActiveSessionBackup(currentUid, current)
          void saveActiveSession(currentUid, current).catch(console.error)
        }

        setReady(true)
      },
      (error) => {
        console.error('[activeSession subscribe error]', error)
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

      // Always clear the pending timer on any state change
      if (timerRef.current) clearTimeout(timerRef.current)

      if (applyingRemoteRef.current) {
        applyingRemoteRef.current = false
        return
      }

      // If active is null (clearWorkout was called), do not reschedule
      if (!state.active) {
        hasUnsyncedLocalChangesRef.current = false
        return
      }

      const snapshot = state.active
      hasUnsyncedLocalChangesRef.current = true
      writeActiveSessionBackup(currentUid, snapshot)
      timerRef.current = setTimeout(() => {
        saveActiveSession(currentUid, snapshot).catch(console.error)
      }, 400)
    })

    function flushPendingSession() {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }

      if (!activeRef.current) return
      writeActiveSessionBackup(currentUid, activeRef.current)
      void saveActiveSession(currentUid, activeRef.current)
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

  function clearSession(): Promise<void> {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (!uid) return Promise.resolve()
    clearActiveSessionBackup(uid)
    return deleteActiveSession(uid)
  }

  async function continueStaleSession(): Promise<void> {
    if (!uid || !staleSessionRef.current) return

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

  async function discardStaleSession(): Promise<void> {
    if (!uid) return

    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    staleSessionRef.current = null
    setStaleSession(null)
    clearActiveSessionBackup(uid)

    const { clearWorkout, startWorkout } = useWorkoutStore.getState()
    applyingRemoteRef.current = true
    hasUnsyncedLocalChangesRef.current = false
    activeRef.current = null
    clearWorkout()
    await deleteActiveSession(uid).catch(console.error)

    startWorkout()
    const createdSession = useWorkoutStore.getState().active
    activeRef.current = createdSession
    if (createdSession) {
      writeActiveSessionBackup(uid, createdSession)
      await saveActiveSession(uid, createdSession)
    }
  }

  return { clearSession, continueStaleSession, discardStaleSession, ready, staleSession }
}
