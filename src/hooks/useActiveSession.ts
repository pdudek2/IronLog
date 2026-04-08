import { useEffect, useRef, useState } from 'react'
import { useWorkoutStore } from '../store/workoutStore'
import { saveActiveSession, deleteActiveSession, subscribeToActiveSession } from '../lib/activeSessionService'

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
  const applyingRemoteRef = useRef(false)
  const hadRemoteSessionRef = useRef(false)
  const [ready, setReady] = useState(uid === null)

  useEffect(() => {
    activeRef.current = useWorkoutStore.getState().active
  }, [])

  useEffect(() => {
    if (!uid) {
      setReady(true)
      return
    }

    const currentUid = uid
    setReady(false)
    hadRemoteSessionRef.current = false

    const {
      hydrateFromDoc,
      clearWorkout,
      startWorkout,
    } = useWorkoutStore.getState()

    const unsubscribeRemote = subscribeToActiveSession(
      currentUid,
      (session) => {
        const current = useWorkoutStore.getState().active
        const currentSerialized = serializeActiveWorkout(current)
        const nextSerialized = serializeActiveWorkout(session)

        if (session) {
          hadRemoteSessionRef.current = true

          if (currentSerialized !== nextSerialized) {
            applyingRemoteRef.current = true
            activeRef.current = session
            hydrateFromDoc(session)
          }
        } else if (hadRemoteSessionRef.current) {
          hadRemoteSessionRef.current = false
          if (current) {
            applyingRemoteRef.current = true
            activeRef.current = null
            clearWorkout()
          }
        } else if (!current) {
          startWorkout()
        } else {
          void saveActiveSession(currentUid, current).catch(console.error)
        }

        setReady(true)
      },
      (error) => {
        console.error('[activeSession subscribe error]', error)
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
      if (!state.active) return

        const snapshot = state.active
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
      void saveActiveSession(currentUid, activeRef.current)
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') flushPendingSession()
    }

    window.addEventListener('pagehide', flushPendingSession)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      unsubscribeRemote()
      unsubscribe()
      if (timerRef.current) clearTimeout(timerRef.current)
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
    return deleteActiveSession(uid)
  }

  return { clearSession, ready }
}
