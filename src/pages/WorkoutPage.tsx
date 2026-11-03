import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronRight, Ellipsis, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkoutStore, type WorkoutExercise } from '../store/workoutStore'
import { useAuthStore } from '../store/authStore'
import { useProfileStore } from '../store/profileStore'
import { pluralize } from '../lib/pluralize'
import { getRecentWorkouts } from '../lib/workoutService'
import { recentExercisePicks, type RecentExercisePick } from '../shared/recentExercises'
import { discardWorkoutLifecycle, finishWorkoutLifecycle } from '../lib/workoutLifecycle'
import { finalizeWorkout, WorkoutClosureError } from '../lib/workoutClosureService'
import type { WorkoutClosureIntent } from '../lib/workoutClosureIntent'
import { getExerciseSessions } from '../lib/exerciseDetailService'
import { useActiveSession } from '../hooks/useActiveSession'
import { useUserExercises } from '../hooks/useUserExercises'
import { ActiveSessionSyncStatus } from '../components/workout/ActiveSessionSyncStatus'
import { ActionFeedback } from '../components/ActionFeedback'
import { useMediaQuery } from '../hooks/useMediaQuery'
import WorkoutExerciseLedgerItem from '../components/workout/WorkoutExerciseLedgerItem'
import ExercisePicker from '../components/ExercisePicker'
import BottomSheet from '../components/BottomSheet'
import ConfirmDialog from '../components/ConfirmDialog'
import { Bone, PageSkeleton } from '../components/ui'
import { suggestNextSession, type OverloadSuggestion } from '../lib/overloadService'
import { exercises as exerciseDb } from '../data/exercises'
import { isActiveSessionStale } from '../lib/sessionDuration'
import WorkoutSetPanel from '../components/workout/WorkoutSetPanel'
import { workoutCover } from '../shared/workoutCover'
import { formatCompactVolume, kgToDisplayWeight } from '../lib/weightUnits'
import { isValidCompletedSet, MAX_DONE_SETS_PER_EXERCISE, MAX_SESSION_EXERCISES, MAX_SET_REPS } from '../shared/workoutLimits'
import {
  EXERCISE_CATEGORY_LABELS,
} from '../lib/exerciseLabels'
import { useMobileInteraction } from '../components/MobileInteractionProvider'
import { ElapsedSessionTimer } from '../components/ActiveWorkoutReturnBar'

import { WORKOUT_LABELS, EQUIPMENT_LABELS, parseWeight, parseReps, calcSetVolume, exerciseTargetLabel, focusExerciseIndex, panelSetIndex, setPanelRestLabel, upNextQueue } from '../shared/workoutDisplay'

type PendingSetRemoval = { exerciseClientId: string; setClientId: string }

interface LabelChipsProps {
  activeLabel: string
  onToggle: (label: string) => void
  className?: string
}

function LabelChips({ activeLabel, onToggle }: LabelChipsProps) {
  return (
    <div role="group" aria-label="Session type" className="workout-label-chips flex gap-1.5 overflow-x-auto no-scrollbar">
      {WORKOUT_LABELS.map((label) => {
        const isActive = activeLabel === label
        return (
          <motion.button
            key={label}
            onClick={() => onToggle(label)}
            aria-pressed={isActive}
            className="mobile-touch-target flex-none whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{
              backgroundColor: isActive ? 'var(--accent-soft)' : 'rgba(255,255,255,0.06)',
              color: isActive ? 'var(--text-strong)' : 'var(--muted)',
              border: isActive ? '1px solid var(--accent-soft-strong)' : '1px solid var(--border)',
            }}
            whileTap={{ scale: 0.92 }}
          >
            {label}
          </motion.button>
        )
      })}
    </div>
  )
}

interface RestTimerBarProps {
  rest: { startedAt: number; totalSec: number }
  onAddTime: (deltaSec: number) => void
  onSkip: () => void
  variant?: 'full' | 'compact'
  label: string
  undoLabel?: string
  onUndo?: () => void
}

function RestTimerBar({ rest, onAddTime, onSkip, variant = 'full', label, undoLabel, onUndo }: RestTimerBarProps) {
  const [now, setNow] = useState(() => Date.now())
  const firedRef = useRef(false)
  const onSkipRef = useRef(onSkip)

  useEffect(() => {
    onSkipRef.current = onSkip
  }, [onSkip])

  useEffect(() => {
    firedRef.current = false
    const interval = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(interval)
  }, [rest.startedAt, rest.totalSec])

  const restEndsAt = rest.startedAt + rest.totalSec * 1000
  const restRemainingMs = Math.max(0, restEndsAt - now)
  const restRemainingSec = Math.ceil(restRemainingMs / 1000)
  const restProgress = restRemainingMs / (rest.totalSec * 1000)

  useEffect(() => {
    if (restRemainingMs > 0 || firedRef.current) return
    firedRef.current = true
    if ('vibrate' in navigator) navigator.vibrate([120, 60, 120])
    const timeout = window.setTimeout(() => onSkipRef.current(), 3500)
    return () => window.clearTimeout(timeout)
  }, [restRemainingMs])

  return (
    <motion.div
      key="rest-timer-bar"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      className="rest-timer-bar"
      data-finished={restRemainingMs === 0}
      data-variant={variant}
      role="status"
      aria-live={restRemainingMs === 0 ? 'polite' : 'off'}
    >
      <div className="rest-timer-progress" aria-hidden="true">
        <div className="rest-timer-progress-fill" style={{ width: `${restProgress * 100}%` }} />
      </div>
      <div className="rest-timer-content">
        <div className="rest-timer-label">
          {restRemainingMs === 0 ? (
            <span>Ready — time for the next set</span>
          ) : (
            <>
              <span style={{ color: 'var(--muted)' }}>{label}</span>
              <span className="rest-timer-value tabular-nums">
                {Math.floor(restRemainingSec / 60)}:{String(restRemainingSec % 60).padStart(2, '0')}
              </span>
            </>
          )}
        </div>
        {restRemainingMs > 0 ? (
          <>
            {undoLabel && onUndo && (
              <button type="button" onClick={onUndo} className="rest-timer-action">
                {undoLabel}
              </button>
            )}
            {variant === 'full' && (
              <button
                type="button"
                onClick={() => onAddTime(30)}
                className="rest-timer-action"
                aria-label="Add 30 seconds"
              >
                +30 s
              </button>
            )}
            <button
              type="button"
              onClick={onSkip}
              className="rest-timer-action"
              aria-label="Skip rest"
            >
              Skip
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onSkip}
            className="rest-timer-action"
            aria-label="Close"
          >
            OK
          </button>
        )}
      </div>
    </motion.div>
  )
}
function getExerciseClientId(exercise: WorkoutExercise, exerciseIndex: number): string {
  return exercise.clientId ?? `${exercise.exerciseSource}:${exercise.exerciseId}:${exerciseIndex}`
}

function WorkoutLoadingSkeleton() {
  return (
    <PageSkeleton label="Preparing workout...">
      <div style={{ display: 'grid', gap: '0.85rem', paddingTop: '1rem' }}>
        <Bone width="10rem" height="1.6rem" />
        <Bone width="min(15rem, 70%)" height="2.75rem" />
        <Bone height="10rem" style={{ marginTop: '0.75rem', borderRadius: 'var(--radius-xl)' }} />
        <Bone height="10rem" style={{ borderRadius: 'var(--radius-xl)' }} />
      </div>
    </PageSkeleton>
  )
}

export default function WorkoutPage() {
  const { user } = useAuthStore()
  const { profile } = useProfileStore()
  const {
    active,
    restTimer: rest,
    setLabel,
    addExercise,
  } = useWorkoutStore()
  const navigate = useNavigate()
  const location = useLocation()
  const routeState = location.state as { startNew?: unknown } | null
  const shouldStartFromRoute = routeState?.startNew === true
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const { compactFixedUi } = useMobileInteraction()
  const mobileRestVariant = compactFixedUi ? 'compact' : 'full'

  const {
    activeSessionSyncStatus,
    beginClosure,
    closureIntent,
    closureState,
    confirmClosure,
    continueStaleSession,
    discardStaleSession,
    markClosureError,
    markClosureUnconfirmed,
    prepareFinishClosure,
    ready,
    reloadAuthentication,
    reloadCurrentSession,
    retryActiveSessionSync,
    startNewSession,
    staleSession,
  } = useActiveSession(user?.uid ?? null)
  const [showPicker, setShowPicker] = useState(false)
  const [closureRejection, setClosureRejection] = useState<string | null>(null)
  const addExerciseRef = useRef<HTMLButtonElement>(null)
  const [handlingStaleSession, setHandlingStaleSession] = useState(false)
  const [keepExerciseStackMounted, setKeepExerciseStackMounted] = useState(false)
  const [lastLogged, setLastLogged] = useState<{ exerciseId: string; setIndex: number; draw: boolean } | null>(null)
  const [manualExerciseClientId, setManualExerciseClientId] = useState<string | null>(null)
  const [selectedSet, setSelectedSet] = useState<{ exerciseId: string; setId: string } | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [sessionSheet, setSessionSheet] = useState<'overview' | 'options' | null>(null)
  const [confirmFinishEmpty, setConfirmFinishEmpty] = useState(false)
  const [pendingFinish, setPendingFinish] = useState<{ uid: string; sessionId: string } | null>(null)
  const pendingFinishMatches = pendingFinish !== null
    && pendingFinish.uid === user?.uid
    && pendingFinish.sessionId === active?.sessionId
  if (pendingFinish && !pendingFinishMatches) setPendingFinish(null)
  const [pendingExerciseRemoval, setPendingExerciseRemoval] = useState<{ sessionId: string; exerciseClientId: string } | null>(null)
  const [pendingSetRemoval, setPendingSetRemoval] = useState<PendingSetRemoval | null>(null)
  const {
    state: userExercisesState,
    exercises: userExercises,
    retry: retryUserExercises,
  } = useUserExercises(user?.uid ?? null)
  const [suggestions, setSuggestions] = useState<Record<string, OverloadSuggestion | null>>({})
  const [dismissedHints, setDismissedHints] = useState<Set<string>>(new Set())
  const fetchedKeys = useRef(new Set<string>())

  useEffect(() => {
    if (!ready || !shouldStartFromRoute) return
    navigate(location.pathname, { replace: true, state: null })
    if (!active) void startNewSession()
  }, [active, location.pathname, navigate, ready, shouldStartFromRoute, startNewSession])

  const handleToggleSet = useCallback((exerciseIndex: number, setIndex: number) => {
    const { active: currentActive, toggleSetDone } = useWorkoutStore.getState()
    const currentSet = currentActive?.exercises[exerciseIndex]?.sets[setIndex]
    const wasNotDone = currentSet && !currentSet.done
    const completesExercise = wasNotDone && currentActive?.exercises[exerciseIndex]?.sets.every(
      (set, index) => index === setIndex || set.done,
    )
    if (wasNotDone && !isValidCompletedSet(currentSet)) {
      toast.error(isValidCompletedSet({ ...currentSet, weight: '0' })
        ? 'Weight cannot be negative or above 2000 kg (4409 lbs).'
        : `Enter whole reps from 1 to ${MAX_SET_REPS} before marking this set as complete.`)
      return
    }
    const completedSets = currentActive?.exercises[exerciseIndex]?.sets.filter((set) => set.done).length ?? 0
    if (wasNotDone && completedSets >= MAX_DONE_SETS_PER_EXERCISE) {
      toast.error(`An exercise can hold up to ${MAX_DONE_SETS_PER_EXERCISE} completed sets.`)
      return
    }
    toggleSetDone(exerciseIndex, setIndex)
    if (wasNotDone) {
      useWorkoutStore.getState().startRestTimer(90)
      const exercise = currentActive?.exercises[exerciseIndex]
      if (exercise) {
        const exerciseId = getExerciseClientId(exercise, exerciseIndex)
        setLastLogged({ exerciseId, setIndex, draw: true })
        // The next exercise waits for "Go to", so the logged set and Undo stay on screen.
        if (completesExercise) setManualExerciseClientId(exerciseId)
      }
      setSelectedSet(null)
      if ('vibrate' in navigator) navigator.vibrate(12)
    } else {
      useWorkoutStore.getState().clearRestTimer()
    }
  }, [])

  const handleAddRestTime = useCallback((deltaSec: number) => {
    useWorkoutStore.getState().addRestTimerSeconds(deltaSec)
  }, [])

  const handleSkipRest = useCallback(() => useWorkoutStore.getState().clearRestTimer(), [])

  const handleUpdateSet = useCallback((exerciseIndex: number, setIndex: number, field: 'weight' | 'reps', value: string) => {
    useWorkoutStore.getState().updateSet(exerciseIndex, setIndex, field, value)
  }, [])

  const handleAdjustSet = useCallback((exerciseIndex: number, setIndex: number, field: 'weight' | 'reps', delta: number) => {
    useWorkoutStore.getState().adjustSet(exerciseIndex, setIndex, field, delta)
    if ('vibrate' in navigator) navigator.vibrate(6)
  }, [])

  const handleRemoveSet = useCallback((exerciseIndex: number, setIndex: number) => {
    const { active: currentActive, removeSet } = useWorkoutStore.getState()
    const exercise = currentActive?.exercises[exerciseIndex]
    const set = exercise?.sets[setIndex]
    if (!exercise || !set) return

    const hasEnteredData = set.done || set.weight.trim() !== '' || set.reps.trim() !== ''
    if (!hasEnteredData) {
      removeSet(exerciseIndex, setIndex)
      return
    }

    if (!exercise.clientId || !set.clientId) {
      toast.error('Could not prepare to safely remove this set. Refresh the view and try again.')
      return
    }
    setPendingSetRemoval({ exerciseClientId: exercise.clientId, setClientId: set.clientId })
  }, [])

  function handleConfirmRemoveSet() {
    if (!pendingSetRemoval) return
    const { active: currentActive, removeSet } = useWorkoutStore.getState()
    const exerciseIndex = currentActive?.exercises.findIndex(
      (exercise) => exercise.clientId === pendingSetRemoval.exerciseClientId,
    ) ?? -1
    const setIndex = currentActive?.exercises[exerciseIndex]?.sets.findIndex(
      (set) => set.clientId === pendingSetRemoval.setClientId,
    ) ?? -1

    if (exerciseIndex >= 0 && setIndex >= 0) removeSet(exerciseIndex, setIndex)
    setPendingSetRemoval(null)
  }

  const handleAddSet = useCallback((exerciseIndex: number, button: HTMLButtonElement) => {
    useWorkoutStore.getState().addSet(exerciseIndex)
    if ('vibrate' in navigator) navigator.vibrate(8)
    window.setTimeout(() => button.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
  }, [])

  // Quick picks — top exercises from recent sessions, shown when live session is empty
  const [quickPicks, setQuickPicks] = useState<RecentExercisePick[]>([])
  const activeExercises = active?.exercises ?? null
  const exerciseSnapshotByClientId = useMemo(() => {
    if (!activeExercises) return new Map<string, WorkoutExercise>()
    return new Map(
      activeExercises.map((exercise, exerciseIndex) => [getExerciseClientId(exercise, exerciseIndex), exercise]),
    )
  }, [activeExercises])

  useEffect(() => {
    if (!user) return
    getRecentWorkouts(user.uid, 10)
      .then((wks) => setQuickPicks(recentExercisePicks(wks)))
      .catch(() => {})
  }, [user])

  const handlePickExercise = async (id: string, name: string, source: 'global' | 'user') => {
    if ((useWorkoutStore.getState().active?.exercises.length ?? 0) >= MAX_SESSION_EXERCISES) {
      toast.error(`A workout can hold up to ${MAX_SESSION_EXERCISES} exercises.`)
      return
    }
    addExercise(id, name, source)
    const nextActive = useWorkoutStore.getState().active
    const addedExerciseIndex = (nextActive?.exercises.length ?? 0) - 1
    const addedExercise = nextActive?.exercises[addedExerciseIndex]
    if (addedExercise) {
      setManualExerciseClientId(getExerciseClientId(addedExercise, addedExerciseIndex))
      setSelectedSet(null)
    }
    if (!user) return
    fetchSuggestion(id, source, user.uid)
    try {
      const sessions = await getExerciseSessions(user.uid, id, source, 1)
      const last = sessions[0]
      if (!last || last.bestSetWeight <= 0) return
      const state = useWorkoutStore.getState()
      if (!state.active) return
      // The same exercise can be in the session twice; the prefill belongs to the one just added.
      const idx = state.active.exercises.findIndex((ex) => ex.clientId === addedExercise?.clientId)
      if (idx === -1) return
      const firstSet = state.active.exercises[idx].sets[0]
      if (!firstSet || firstSet.weight || firstSet.reps) return
      state.updateSet(idx, 0, 'weight', String(last.bestSetWeight))
      if (last.bestSetReps > 0) state.updateSet(idx, 0, 'reps', String(last.bestSetReps))
    } catch { /* silent */ }
  }

  function fetchSuggestion(exerciseId: string, source: string, uid: string) {
    const key = `${source}:${exerciseId}`
    if (fetchedKeys.current.has(key)) return
    fetchedKeys.current.add(key)
    suggestNextSession(uid, exerciseId, source as 'global' | 'user')
      .then((suggestion) => setSuggestions((prev) => ({ ...prev, [key]: suggestion })))
      .catch(() => { fetchedKeys.current.delete(key) })
  }

  // Fetch suggestions for exercises loaded from template on mount
  useEffect(() => {
    if (!user || !active) return
    for (const ex of active.exercises) {
      fetchSuggestion(ex.exerciseId, ex.exerciseSource, user.uid)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, active?.exercises.length])

  const saving = closureState === 'submitting'
  const closureLocked = closureState !== 'idle' && closureState !== 'closure_rejected'

  async function handleClosureError(error: unknown): Promise<void> {
    if (!(error instanceof WorkoutClosureError)) {
      markClosureUnconfirmed()
      return
    }
    const failure = await markClosureError(error)
    if (failure === 'closure_rejected') setClosureRejection(error.message)
    if (failure === 'active_session_changed') {
      toast.error('The session changed on another device. Check the data and finish it again.')
    }
  }

  async function submitFinish(intent: WorkoutClosureIntent, uid = user?.uid) {
    if (!uid || intent.action !== 'finish') return
    try {
      const prepared = intent.sessionRevision
        ? { status: 'ready', sessionRevision: intent.sessionRevision } as const
        : await prepareFinishClosure(intent)
      if (prepared.status === 'failed') return

      const result = await finishWorkoutLifecycle({
        uid,
        session: intent.session,
        sessionRevision: prepared.sessionRevision,
        now: () => intent.createdAt,
        request: () => finalizeWorkout(intent.session.sessionId, prepared.sessionRevision),
        clearConfirmed: confirmClosure,
      })
      if (result.status === 'closure_unconfirmed') {
        markClosureUnconfirmed()
        return
      }
      navigate(`/workout/${encodeURIComponent(result.workoutId)}`, {
        replace: true,
        state: {
          workoutResult: {
            workoutId: result.workoutId,
            status: result.status,
          },
        },
      })
    } catch (error) {
      console.error('[finish workout closure error]', error)
      await handleClosureError(error)
    }
  }

  async function doFinish() {
    if (!active || !user || closureLocked) return
    const intent = beginClosure('finish', active)
    if (intent) await submitFinish(intent)
  }

  function handleFinish() {
    if (!active || !user || closureLocked) return
    const hasSets = active.exercises.some((exercise) => exercise.sets.some((set) => set.done))
    if (!hasSets) { setConfirmFinishEmpty(true); return }
    const unfinished = active.exercises.reduce(
      (count, exercise) => count + exercise.sets.filter((set) => !set.done).length,
      0,
    )
    if (unfinished > 0) {
      setPendingFinish({ uid: user.uid, sessionId: active.sessionId })
      return
    }
    void doFinish()
  }

  function handleConfirmFinish(pending: { uid: string; sessionId: string }) {
    if (closureLocked) return
    const currentUser = useAuthStore.getState().user
    const currentActive = useWorkoutStore.getState().active
    if (
      !currentUser
      || currentUser.uid !== pending.uid
      || !currentActive
      || currentActive.sessionId !== pending.sessionId
    ) return

    const hasCompletedSets = currentActive.exercises.some(
      (exercise) => exercise.sets.some((set) => set.done),
    )
    if (!hasCompletedSets) {
      setConfirmFinishEmpty(true)
      return
    }

    const intent = beginClosure('finish', currentActive)
    if (intent) void submitFinish(intent, currentUser.uid)
  }

  function handleDiscard() {
    setConfirmDiscard(true)
  }

  const handleRemoveExercise = useCallback((exerciseIndex: number) => {
    const currentActive = useWorkoutStore.getState().active
    const exercise = currentActive?.exercises[exerciseIndex]
    if (!exercise) return
    const hasEnteredSets = exercise.sets.some((set) => set.done || set.weight.trim() !== '' || set.reps.trim() !== '')
    if (hasEnteredSets) {
      if (!exercise.clientId) {
        toast.error('Could not prepare to safely remove this exercise. Refresh the view and try again.')
        return
      }
      setPendingExerciseRemoval({ sessionId: currentActive.sessionId, exerciseClientId: exercise.clientId })
      return
    }
    if (currentActive.exercises.length === 1) {
      setKeepExerciseStackMounted(true)
    }
    useWorkoutStore.getState().removeExercise(exerciseIndex)
  }, [])

  function handleConfirmRemoveExercise() {
    if (!pendingExerciseRemoval) return
    const { active: currentActive, removeExercise } = useWorkoutStore.getState()
    const index = currentActive?.sessionId === pendingExerciseRemoval.sessionId
      ? currentActive.exercises.findIndex((exercise) => exercise.clientId === pendingExerciseRemoval.exerciseClientId)
      : -1
    if (index >= 0) {
      if (currentActive?.exercises.length === 1) setKeepExerciseStackMounted(true)
      removeExercise(index)
    }
    setPendingExerciseRemoval(null)
  }

  const handleApplySuggestion = useCallback((exerciseIndex: number, hintKey: string, weight: number) => {
    useWorkoutStore.getState().applyOverload(exerciseIndex, weight)
    setDismissedHints((prev) => {
      const next = new Set(prev)
      next.add(hintKey)
      return next
    })
  }, [])

  const handleDismissSuggestion = useCallback((hintKey: string) => {
    setDismissedHints((prev) => {
      const next = new Set(prev)
      next.add(hintKey)
      return next
    })
  }, [])

  async function handleConfirmDiscard() {
    if (!active || !user || closureLocked) return
    const intent = beginClosure('discard', active)
    if (!intent) return
    try {
      const result = await discardWorkoutLifecycle({
        uid: user.uid,
        session: intent.session,
        now: () => intent.createdAt,
        clearConfirmed: confirmClosure,
      })
      if (result.status === 'closure_unconfirmed') {
        markClosureUnconfirmed()
        return
      }
      navigate('/dashboard', { replace: true })
    } catch (error) {
      console.error('[discard workout closure error]', error)
      await handleClosureError(error)
    }
  }

  async function handleContinueStaleSession() {
    if (handlingStaleSession) return
    setHandlingStaleSession(true)
    try {
      const result = await continueStaleSession()
      if (result.status === 'ignored') return
      if (result.status === 'sync_failed') {
        toast.error('Session restored locally. Retry sync.')
        return
      }
      toast.success('Saved session resumed with a refreshed timer.')
    } catch (error) {
      console.error('[continue stale session error]', error)
      toast.error('Could not restore the session. Try again.')
    } finally {
      setHandlingStaleSession(false)
    }
  }

  async function handleDiscardStaleSession() {
    if (handlingStaleSession) return
    setHandlingStaleSession(true)
    try {
      const result = await discardStaleSession()
      if (result.status === 'ignored' || result.status === 'closure_unconfirmed') return
      toast.success(result.replacement
        ? 'Old session discarded. Starting fresh.'
        : 'Old session discarded. Current session preserved.')
    } catch (error) {
      console.error('[discard stale session error]', error)
      if (!(error instanceof WorkoutClosureError)) {
        toast.error('Could not discard the old session. Try again.')
      }
    } finally {
      setHandlingStaleSession(false)
    }
  }

  async function retryClosure() {
    if (!closureIntent || closureState === 'submitting') return
    if (closureIntent.action === 'finish') {
      const intent = beginClosure('finish', closureIntent.session)
      if (intent) await submitFinish(intent)
      return
    }
    if (isActiveSessionStale(closureIntent.session, closureIntent.createdAt)) {
      await handleDiscardStaleSession()
      return
    }
    if (!user) return
    const intent = beginClosure('discard', closureIntent.session)
    if (!intent) return
    try {
      const result = await discardWorkoutLifecycle({
        uid: user.uid,
        session: intent.session,
        now: () => intent.createdAt,
        clearConfirmed: confirmClosure,
      })
      if (result.status === 'closure_unconfirmed') {
        markClosureUnconfirmed()
        return
      }
      navigate('/dashboard', { replace: true })
    } catch (error) {
      console.error('[retry discard closure error]', error)
      await handleClosureError(error)
    }
  }

  if (!ready) {
    if (activeSessionSyncStatus === 'failed') {
      return (
        <div className="mx-auto max-w-lg">
          <ActionFeedback
            status="error"
            message="Could not load the current session. Check your connection and try again."
            onRetry={reloadAuthentication}
          />
        </div>
      )
    }
    return <WorkoutLoadingSkeleton />
  }

  if (staleSession) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="surface-panel rounded-[var(--radius-xl)] p-6">
          <p className="eyebrow mb-2" style={{ color: 'var(--accent)' }}>Active session</p>
          <h1 className="section-title">Resume an old session?</h1>
          <p className="mt-3 text-sm leading-6" style={{ color: 'var(--muted)' }}>
            You have an active session from {staleSession.ageLabel} ago. Resume your exercises with a refreshed timer, or discard the session and start again.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <motion.button
              type="button"
              onClick={() => { void handleContinueStaleSession() }}
              disabled={handlingStaleSession}
              className="rounded-[var(--radius-lg)] px-4 py-3 text-sm font-semibold disabled:opacity-50"
              style={{ background: 'var(--primary-gradient)', color: 'var(--accent-foreground)' }}
              whileTap={{ scale: 0.97 }}
            >
              Continue
            </motion.button>
            <motion.button
              type="button"
              onClick={() => { void handleDiscardStaleSession() }}
              disabled={handlingStaleSession}
              className="rounded-[var(--radius-lg)] px-4 py-3 text-sm font-semibold disabled:opacity-50"
              style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--muted)', border: '1px solid var(--border)' }}
              whileTap={{ scale: 0.97 }}
            >
              Discard and start again
            </motion.button>
          </div>
        </div>
      </div>
    )
  }

  if (!active) {
    return (
      <section
        className="workout-session-entry"
        style={{ maxWidth: '32rem' }}
        aria-labelledby="workout-session-entry-title"
      >
        <h1 id="workout-session-entry-title" className="section-title">New workout</h1>
        {activeSessionSyncStatus === 'failed' && (
          <p role="alert" className="text-sm" style={{ color: 'var(--danger)' }}>
            Could not start the workout. Check your connection and try again.
          </p>
        )}
        <motion.button
          type="button"
          onClick={() => { void startNewSession() }}
          className="workout-primary-action"
          style={{ background: 'var(--primary-gradient)', color: 'var(--accent-foreground)' }}
          whileTap={{ scale: 0.97 }}
        >
          Start a new session
        </motion.button>
      </section>
    )
  }

  const units = profile?.units ?? 'kg'
  const exerciseCatalog = new Map([...exerciseDb, ...userExercises].map((exercise) => [exercise.id, exercise]))
  const totalSets = active.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)
  const unfinishedSets = active.exercises.reduce((sum, exercise) => (
    sum + exercise.sets.filter((set) => !set.done).length
  ), 0)
  const completedSets = active.exercises.reduce((sum, exercise) => (
    sum + exercise.sets.filter((set) => set.done && parseReps(set.reps) > 0).length
  ), 0)
  const totalVolume = active.exercises.reduce((sum, exercise) => (
    sum + exercise.sets.reduce((innerSum, set) => (
      set.done ? innerSum + calcSetVolume(set) : innerSum
    ), 0)
  ), 0)
  const strongestSet = active.exercises.reduce((top, exercise) => {
    const next = exercise.sets.reduce((currentTop, set) => (
      set.done ? Math.max(currentTop, parseWeight(set.weight)) : currentTop
    ), 0)
    return Math.max(top, next)
  }, 0)
  const activeLabel = active.label?.trim() || 'Session in progress'

  const focusedIndex = focusExerciseIndex(active.exercises)
  const manualIndex = active.exercises.findIndex((exercise, index) => getExerciseClientId(exercise, index) === manualExerciseClientId)
  const showExerciseStack = active.exercises.length > 0 || keepExerciseStackMounted
  const panelIndex = manualIndex >= 0 ? manualIndex : focusedIndex
  const panelExercise = panelIndex >= 0 ? active.exercises[panelIndex] ?? null : null
  const currentExerciseClientId = panelExercise ? getExerciseClientId(panelExercise, panelIndex) : null
  const selectedSetId = selectedSet?.exerciseId === currentExerciseClientId ? selectedSet?.setId ?? null : null
  const currentSetIndex = panelExercise ? panelSetIndex(panelExercise.sets, selectedSetId) : -1
  const undoExerciseIndex = lastLogged
    ? active.exercises.findIndex((exercise, index) => getExerciseClientId(exercise, index) === lastLogged.exerciseId)
    : -1
  const undoSet = lastLogged ? active.exercises[undoExerciseIndex]?.sets[lastLogged.setIndex] : undefined
  const queue = upNextQueue(active.exercises, panelIndex)
  const nextExerciseIndex = queue[0] ?? -1
  const goToExercise = (index: number) => {
    const exercise = active.exercises[index]
    if (!exercise) return
    setManualExerciseClientId(getExerciseClientId(exercise, index))
    setSelectedSet(null)
    setLastLogged((logged) => logged && { ...logged, draw: false })
    window.scrollTo({ top: 0 })
  }
  const panelSet = (currentSetIndex >= 0 ? panelExercise?.sets[currentSetIndex] : null) ?? null
  const setPanel = panelExercise && (
    <WorkoutSetPanel
      exerciseIndex={panelIndex}
      exerciseName={panelExercise.name}
      set={panelSet}
      setIndex={currentSetIndex}
      setCount={panelExercise.sets.length}
      units={units}
      openSetIndex={panelExercise.sets.findIndex((set) => !set.done)}
      nextExercise={nextExerciseIndex >= 0
        ? { index: nextExerciseIndex, name: active.exercises[nextExerciseIndex]?.name ?? '' }
        : null}
      finishing={saving}
      rest={rest !== null ? (
        <RestTimerBar
          rest={rest}
          onAddTime={handleAddRestTime}
          onSkip={handleSkipRest}
          variant={isDesktop ? 'full' : mobileRestVariant}
          label={setPanelRestLabel(panelSet, currentSetIndex)}
          undoLabel={undoSet?.done ? `Undo set ${lastLogged!.setIndex + 1}` : undefined}
          onUndo={() => handleToggleSet(undoExerciseIndex, lastLogged!.setIndex)}
        />
      ) : null}
      onAdjustSet={handleAdjustSet}
      onUpdateSet={handleUpdateSet}
      onToggleSet={handleToggleSet}
      onClearSelection={() => setSelectedSet(null)}
      onGoToExercise={goToExercise}
      onFinish={handleFinish}
    />
  )

  return (
    <div
      className="workout-focus-shell"
      role="region"
      aria-label={`Active session: ${activeLabel}`}
    >
      {closureState !== 'active_session_changed' && (
        <ActiveSessionSyncStatus
          status={activeSessionSyncStatus}
          onRetry={() => { void retryActiveSessionSync() }}
          onReload={() => { void reloadCurrentSession() }}
        />
      )}
      {closureState === 'active_session_changed' && (
        <div className="surface-panel mb-4 rounded-[var(--radius-xl)] border p-4" role="alert" style={{ borderColor: 'var(--danger)' }}>
          <p className="text-sm font-semibold text-white">The session changed on another device.</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            Could not load current data. Editing is locked until the session is synced with the server.
          </p>
          <button
            type="button"
            onClick={() => { void reloadCurrentSession() }}
            className="mt-3 rounded-[var(--radius-lg)] px-4 py-2.5 text-sm font-semibold"
            style={{ background: 'var(--primary-gradient)', color: 'var(--accent-foreground)' }}
          >
            Load current session
          </button>
        </div>
      )}
      {closureState === 'closure_unconfirmed' && (
        <div className="surface-panel mb-4 rounded-[var(--radius-xl)] border p-4" role="alert" style={{ borderColor: 'var(--danger)' }}>
          <p className="text-sm font-semibold text-white">Could not confirm session closure.</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            Your workout data is preserved. Editing is locked until the server confirms the outcome.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { void retryClosure() }}
              className="rounded-[var(--radius-lg)] px-4 py-2.5 text-sm font-semibold"
              style={{ background: 'var(--primary-gradient)', color: 'var(--accent-foreground)' }}
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {closureState === 'session_mismatch' && (
        <div className="surface-panel mb-4 rounded-[var(--radius-xl)] border p-4" role="alert" style={{ borderColor: 'var(--danger)' }}>
          <p className="text-sm font-semibold text-white">This session is no longer active on the server.</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            Could not automatically sync the session opened on another device.
          </p>
          <button
            type="button"
            onClick={() => { void reloadCurrentSession() }}
            className="mt-3 rounded-[var(--radius-lg)] px-4 py-2.5 text-sm font-semibold"
            style={{ background: 'var(--primary-gradient)', color: 'var(--accent-foreground)' }}
          >
            Try again
          </button>
        </div>
      )}

      {closureState === 'closure_conflict' && (
        <div className="surface-panel mb-4 rounded-[var(--radius-xl)] border p-4" role="alert" style={{ borderColor: 'var(--danger)' }}>
          <p className="text-sm font-semibold text-white">The server rejected closing this session.</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            This session was already closed with a different outcome, and automatic reconciliation failed.
          </p>
          <button
            type="button"
            onClick={() => { void reloadCurrentSession() }}
            className="mt-3 rounded-[var(--radius-lg)] px-4 py-2.5 text-sm font-semibold"
            style={{ background: 'var(--primary-gradient)', color: 'var(--accent-foreground)' }}
          >
            Try again
          </button>
        </div>
      )}

      {closureState === 'auth_required' && (
        <div className="surface-panel mb-4 rounded-[var(--radius-xl)] border p-4" role="alert" style={{ borderColor: 'var(--danger)' }}>
          <p className="text-sm font-semibold text-white">Your sign-in session needs refreshing.</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            Your workout data is preserved. Sign in again, then retry closing the session.
          </p>
          <button
            type="button"
            onClick={reloadAuthentication}
            className="mt-3 rounded-[var(--radius-lg)] px-4 py-2.5 text-sm font-semibold"
            style={{ background: 'var(--primary-gradient)', color: 'var(--accent-foreground)' }}
          >
            Sign in again
          </button>
        </div>
      )}

      {closureState === 'closure_rejected' && (
        <div className="surface-panel mb-4 rounded-[var(--radius-xl)] border p-4" role="alert" style={{ borderColor: 'var(--danger)' }}>
          <p className="text-sm font-semibold text-white">The server did not accept this workout.</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            {closureRejection ?? 'Some of its data is invalid.'} Correct it and try again.
          </p>
        </div>
      )}

      {closureState === 'closure_failed' && (
        <div className="surface-panel mb-4 rounded-[var(--radius-xl)] border p-4" role="alert" style={{ borderColor: 'var(--danger)' }}>
          <p className="text-sm font-semibold text-white">This session cannot be closed.</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            The server refused this request. Try again, or reload the page to see the latest state.
          </p>
          <button
            type="button"
            onClick={() => { void retryClosure() }}
            className="mt-3 rounded-[var(--radius-lg)] px-4 py-2.5 text-sm font-semibold"
            style={{ background: 'var(--primary-gradient)', color: 'var(--accent-foreground)' }}
          >
            Try again
          </button>
        </div>
      )}

      <div className="contents" inert={closureLocked ? true : undefined}>

      {/* ── Mobile sticky header ─────────────────── */}
      {!isDesktop && (
        <div
          className="workout-mobile-lifecycle-bar fixed top-0 left-0 right-0 z-40 flex items-center gap-2 lg:hidden"
          style={{
            paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))',
            paddingBottom: '0.75rem',
            paddingLeft: 'max(1rem, env(safe-area-inset-left, 1rem))',
            paddingRight: 'max(1rem, env(safe-area-inset-right, 1rem))',
            background: 'rgba(13, 12, 14, 0.95)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <ElapsedSessionTimer startedAt={active.startedAt} className="text-xl font-bold tabular-nums text-white flex-none" />
          <div className="flex-1 min-w-0" />
          <button
            type="button"
            className="workout-mobile-minimize"
            onClick={() => navigate('/dashboard')}
            disabled={closureLocked}
            aria-label="Minimize workout"
            aria-describedby="workout-mobile-minimize-help"
          >
            <ChevronDown size={17} aria-hidden="true" />
            <span>
              <strong>Minimize</strong>
              <small aria-hidden="true">Keeps running</small>
            </span>
          </button>
          <span id="workout-mobile-minimize-help" className="sr-only">Your workout keeps running</span>
          <button
            type="button"
            className="workout-mobile-options-trigger"
            onClick={() => setSessionSheet('options')}
            aria-label="More workout options"
            aria-haspopup="dialog"
          >
            <Ellipsis size={20} aria-hidden="true" />
          </button>
          <motion.button
            type="button"
            onClick={handleFinish}
            disabled={saving}
            className="flex-none rounded-xl px-5 text-sm font-bold min-h-11"
            style={{ background: 'var(--primary-gradient)', color: 'var(--accent-foreground)' }}
            whileTap={{ scale: 0.93 }}
          >
            {saving ? '...' : 'Finish'}
          </motion.button>
        </div>
      )}

      <div className="workout-session-grid">

        <div className="workout-session-list min-w-0">
          {isDesktop && (
            <div className="workout-desktop-bar">
              <ElapsedSessionTimer startedAt={active.startedAt} className="workout-desktop-time" />
              <span className="workout-desktop-label">{activeLabel}</span>
              {totalSets > 0 && (
                <span className="workout-desktop-sets">{completedSets} of {totalSets} {pluralize(totalSets, 'set', 'sets')}</span>
              )}
              <button
                type="button"
                className="workout-desktop-options"
                onClick={() => setSessionSheet('options')}
                aria-label="More workout options"
                aria-haspopup="dialog"
              >
                <Ellipsis size={20} aria-hidden="true" />
              </button>
              <motion.button
                type="button"
                className="workout-desktop-finish"
                onClick={handleFinish}
                disabled={saving}
                whileTap={{ scale: 0.97 }}
              >
                {saving ? '...' : 'Finish'}
              </motion.button>
            </div>
          )}
          <div className="workout-band" aria-hidden="true">
            <img src={`/covers/${workoutCover(activeLabel)}.jpg`} alt="" />
          </div>
          <div className="workout-segs" aria-hidden="true">
            {active.exercises.map((exercise, index) => (
              <i key={getExerciseClientId(exercise, index)} data-current={index === panelIndex}>
                <b style={{ width: `${exercise.sets.length ? exercise.sets.filter((set) => set.done).length / exercise.sets.length * 100 : 0}%` }} />
              </i>
            ))}
          </div>
          <div className="flex flex-col gap-4">
            {active.exercises.length === 0 && !keepExerciseStackMounted && (
              <>
                <section className="workout-empty-state" aria-label="No exercises yet">
                  <motion.button
                    ref={addExerciseRef}
                    type="button"
                    onClick={() => setShowPicker(true)}
                    className="workout-primary-action"
                    style={{ background: 'var(--primary-gradient)', color: 'var(--accent-foreground)' }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <Plus size={16} strokeWidth={2.4} />
                    Add exercise
                  </motion.button>
                </section>
                {quickPicks.length > 0 && (
                  <section className="workout-quick-start" aria-labelledby="workout-quick-start-title">
                    <h3 id="workout-quick-start-title">Recently used</h3>
                    <div className="workout-quick-pick-list">
                      {quickPicks.map(({ id, name, source }) => {
                        const meta = exerciseCatalog.get(id)
                        return (
                          <motion.button
                            key={`${source}:${id}`}
                            type="button"
                            onClick={() => handlePickExercise(id, name, source)}
                            className="workout-quick-pick"
                            whileTap={{ scale: 0.98 }}
                          >
                            <span className="workout-quick-pick-copy">
                              <strong className="workout-quick-pick-name">{name}</strong>
                              {meta?.category && (
                                <span className="workout-quick-pick-meta">
                                  {EXERCISE_CATEGORY_LABELS[meta.category] ?? meta.category}
                                </span>
                              )}
                            </span>
                            <span className="workout-quick-pick-action">Add</span>
                          </motion.button>
                        )
                      })}
                    </div>
                  </section>
                )}
              </>
            )}

            {showExerciseStack && (
              <>
                <div className="workout-exercise-stack">
                  <AnimatePresence mode="wait" initial={false} onExitComplete={() => setKeepExerciseStackMounted(false)}>
                    {panelExercise && currentExerciseClientId && (() => {
                      const exerciseMeta = exerciseCatalog.get(panelExercise.exerciseId)
                      const hintKey = `${panelExercise.exerciseSource}:${panelExercise.exerciseId}`
                      return (
                        <WorkoutExerciseLedgerItem
                          key={currentExerciseClientId}
                          exerciseClientId={currentExerciseClientId}
                          exerciseIndex={panelIndex}
                          exerciseCount={active.exercises.length}
                          fallbackExercise={exerciseSnapshotByClientId.get(currentExerciseClientId) ?? panelExercise}
                          categoryLabel={exerciseMeta?.category ? (EXERCISE_CATEGORY_LABELS[exerciseMeta.category] ?? exerciseMeta.category) : undefined}
                          equipmentLabel={exerciseMeta?.equipment ? (EQUIPMENT_LABELS[exerciseMeta.equipment] ?? exerciseMeta.equipment) : undefined}
                          panelSetIndex={currentSetIndex}
                          inlinePanel={isDesktop ? setPanel : undefined}
                          hintDismissed={dismissedHints.has(hintKey)}
                          hintKey={hintKey}
                          suggestion={suggestions[hintKey] ?? null}
                          units={units}
                          userId={user?.uid}
                          onAddSet={handleAddSet}
                          onApplySuggestion={handleApplySuggestion}
                          onDismissSuggestion={handleDismissSuggestion}
                          onOpenOverview={() => setSessionSheet('overview')}
                          drawnSetIndex={lastLogged?.draw && lastLogged.exerciseId === currentExerciseClientId ? lastLogged.setIndex : null}
                          onRemoveExercise={handleRemoveExercise}
                          onRemoveSet={handleRemoveSet}
                          onSelectSet={(setIndex) => {
                            const set = panelExercise.sets[setIndex]
                            if (set) setSelectedSet({ exerciseId: currentExerciseClientId, setId: set.clientId ?? String(setIndex) })
                          }}
                          onToggleSet={handleToggleSet}
                        />
                      )
                    })()}
                  </AnimatePresence>
                </div>

                {queue.length > 0 && (
                  <section className="workout-up-next" aria-labelledby="workout-up-next-title">
                    <h3 id="workout-up-next-title">Up next</h3>
                    {queue.map((index) => {
                      const exercise = active.exercises[index]!
                      return (
                        <button key={getExerciseClientId(exercise, index)} type="button" onClick={() => goToExercise(index)}>
                          <span>{exercise.name}</span>
                          <small className="tabular-nums">{exerciseTargetLabel(exercise.sets, units)}</small>
                          <ChevronRight size={16} aria-hidden="true" />
                        </button>
                      )
                    })}
                  </section>
                )}
                {isDesktop && (
                  <button ref={addExerciseRef} type="button" className="workout-desktop-add-exercise" onClick={() => setShowPicker(true)}>
                    <Plus size={15} strokeWidth={2.4} aria-hidden="true" />
                    Add exercise
                  </button>
                )}
              </>
            )}
          </div>

        </div>
      </div>

      {!isDesktop && setPanel}

      <AnimatePresence>
        {sessionSheet && (
          <BottomSheet
            key="session-sheet"
            title={sessionSheet === 'overview' ? active.label || 'This workout' : 'Workout options'}
            description={sessionSheet === 'options' && isDesktop ? (
              <span className="workout-options-summary tabular-nums">
                {active.exercises.length} {pluralize(active.exercises.length, 'exercise', 'exercises')} · {completedSets}/{totalSets} sets · {formatCompactVolume(totalVolume, units)}
                {strongestSet ? ` · heaviest ${kgToDisplayWeight(strongestSet, units)} ${units}` : ''}
              </span>
            ) : undefined}
            onClose={() => setSessionSheet(null)}
          >
            {sessionSheet === 'overview' ? (
              <>
                {active.exercises.map((exercise, exerciseIndex) => {
                  const clientId = getExerciseClientId(exercise, exerciseIndex)
                  return (
                    <button
                      key={clientId}
                      type="button"
                      className="bottom-sheet-row"
                      aria-current={clientId === currentExerciseClientId}
                      onClick={() => { goToExercise(exerciseIndex); setSessionSheet(null) }}
                    >
                      <span>{exercise.name}</span>
                      <small className="tabular-nums">{exercise.sets.filter((set) => set.done).length} of {exercise.sets.length}</small>
                    </button>
                  )
                })}
                <button type="button" className="bottom-sheet-row" onClick={() => { setSessionSheet(null); setShowPicker(true) }}>
                  <span>Add exercise</span>
                  <Plus size={16} aria-hidden="true" />
                </button>
              </>
            ) : (
              <>
                <button type="button" className="bottom-sheet-row" onClick={() => { setSessionSheet(null); setShowPicker(true) }}>
                  <span>Add exercise</span>
                  <Plus size={16} aria-hidden="true" />
                </button>
                {active.exercises.length > 0 && (
                  <button type="button" className="bottom-sheet-row" onClick={() => setSessionSheet('overview')}>
                    <span>All exercises</span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                )}
                <p className="bottom-sheet-label">Session type</p>
                <LabelChips
                  activeLabel={active.label ?? ''}
                  onToggle={(label) => setLabel(active.label === label ? '' : label)}
                />
                <hr className="bottom-sheet-rule" />
                <button type="button" className="bottom-sheet-row" data-quiet onClick={() => { setSessionSheet(null); handleDiscard() }}>
                  <span>Discard workout</span>
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </>
            )}
          </BottomSheet>
        )}
      </AnimatePresence>

      <ExercisePicker
        open={showPicker}
        recent={quickPicks}
        onSelect={(id, name, source) => {
          setShowPicker(false)
          void handlePickExercise(id, name, source)
          window.requestAnimationFrame(() => addExerciseRef.current?.focus())
        }}
        onClose={() => setShowPicker(false)}
        userExercisesState={userExercisesState}
        onRetryUserExercises={retryUserExercises}
      />

      {confirmDiscard && (
        <ConfirmDialog
          title="Discard workout?"
          message="All data from this session will be lost."
          confirmLabel="Discard workout"
          cancelLabel="Back"
          danger
          onConfirm={() => { setConfirmDiscard(false); void handleConfirmDiscard() }}
          onCancel={() => {
            setConfirmDiscard(false)
          }}
        />
      )}

      {confirmFinishEmpty && (
        <ConfirmDialog
          title="Finish without saving?"
          message="No sets are marked complete. The session will be discarded without saving a workout."
          confirmLabel="Discard session"
          cancelLabel="Back"
          danger
          onConfirm={() => {
            setConfirmFinishEmpty(false)
            void handleConfirmDiscard()
          }}
          onCancel={() => setConfirmFinishEmpty(false)}
        />
      )}

      {pendingFinishMatches && (
        <ConfirmDialog
          title="Finish workout?"
          message={`Unfinished sets: ${unfinishedSets}. Only completed sets will be saved.`}
          confirmLabel="Save completed sets"
          cancelLabel="Continue workout"
          confirmDisabled={closureLocked}
          onConfirm={() => {
            setPendingFinish(null)
            if (pendingFinish) handleConfirmFinish(pendingFinish)
          }}
          onCancel={() => setPendingFinish(null)}
        />
      )}

      {pendingExerciseRemoval !== null && (
        <ConfirmDialog
          title="Remove exercise?"
          message="This will remove the exercise and its sets from the active session."
          confirmLabel="Remove exercise"
          cancelLabel="Keep"
          danger
          onConfirm={handleConfirmRemoveExercise}
          onCancel={() => setPendingExerciseRemoval(null)}
        />
      )}
      {pendingSetRemoval && (
        <ConfirmDialog
          title="Remove set?"
          message="This set contains data or is marked complete."
          confirmLabel="Remove set"
          cancelLabel="Keep"
          danger
          onConfirm={handleConfirmRemoveSet}
          onCancel={() => setPendingSetRemoval(null)}
        />
      )}
      </div>
    </div>
  )
}
