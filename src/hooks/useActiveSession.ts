import { useEffect, useRef } from 'react'
import { useWorkoutStore } from '../store/workoutStore'
import { saveActiveSession, deleteActiveSession } from '../lib/activeSessionService'

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

  useEffect(() => {
    if (!uid) return

    const unsubscribe = useWorkoutStore.subscribe((state) => {
      // Always clear the pending timer on any state change
      if (timerRef.current) clearTimeout(timerRef.current)

      // If active is null (clearWorkout was called), do not reschedule
      if (!state.active) return

      const snapshot = state.active
      timerRef.current = setTimeout(() => {
        saveActiveSession(uid, snapshot).catch(console.error)
      }, 400)
    })

    return () => {
      unsubscribe()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [uid])

  function clearSession(): Promise<void> {
    if (!uid) return Promise.resolve()
    return deleteActiveSession(uid)
  }

  return { clearSession }
}
