import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Ellipsis, Plus, Timer, X } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkoutStore, type WorkoutExercise, type WorkoutSet } from '../store/workoutStore'
import { useAuthStore } from '../store/authStore'
import { useProfileStore } from '../store/profileStore'
import { getRecentWorkouts } from '../lib/workoutService'
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
import ConfirmDialog from '../components/ConfirmDialog'
import { LoadingState } from '../components/ui'
import { suggestNextSession, type OverloadSuggestion } from '../lib/overloadService'
import { exercises as exerciseDb } from '../data/exercises'
import { isActiveSessionStale } from '../lib/sessionDuration'
import { formatCompactVolume, kgToDisplayWeight } from '../lib/weightUnits'
import {
  EXERCISE_CATEGORY_COLORS,
  EXERCISE_CATEGORY_LABELS,
} from '../lib/exerciseLabels'
import { useMobileInteraction } from '../components/MobileInteractionProvider'
import { ElapsedSessionTimer } from '../components/ActiveWorkoutReturnBar'

const WORKOUT_LABELS = ['Push', 'Pull', 'Legs', 'Upper Body', 'Lower Body', 'Full Body', 'Back & Biceps', 'Chest & Triceps', 'Cardio', 'Crossfit', 'Mobility'] as const
const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbells',
  cable: 'Cable',
  machine: 'Machine',
  bodyweight: 'BW',
  kettlebell: 'KB',
}

type PendingSetRemoval = { exerciseClientId: string; setClientId: string }

interface LabelChipsProps {
  activeLabel: string
  onToggle: (label: string) => void
  className?: string
}

function LabelChips({ activeLabel, onToggle, className = '' }: LabelChipsProps) {
  return (
    <div className={`workout-label-chips flex gap-1.5 overflow-x-auto no-scrollbar ${className}`}>
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
}

function RestTimerBar({ rest, onAddTime, onSkip, variant = 'full' }: RestTimerBarProps) {
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
        <Timer size={16} strokeWidth={2.2} className="flex-none" />
        <div className="rest-timer-label">
          {restRemainingMs === 0 ? (
            <span>Ready — time for the next set</span>
          ) : (
            <>
              <span style={{ color: 'var(--muted)' }}>Rest</span>
              <span className="tabular-nums font-bold ml-2">
                {Math.floor(restRemainingSec / 60)}:{String(restRemainingSec % 60).padStart(2, '0')}
              </span>
            </>
          )}
        </div>
        {restRemainingMs > 0 ? (
          <>
            {variant === 'full' && (
              <button
                type="button"
                onClick={() => onAddTime(30)}
                className="rest-timer-action"
                aria-label="Add 30 seconds"
              >
                +30s
              </button>
            )}
            <button
              type="button"
              onClick={onSkip}
              className="rest-timer-action rest-timer-action--icon"
              aria-label="Skip rest"
            >
              <X size={14} />
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

function parseWeight(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseReps(value: string): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function calcSetVolume(set: Pick<WorkoutSet, 'weight' | 'reps'>): number {
  return parseWeight(set.weight) * parseReps(set.reps)
}

function getExerciseClientId(exercise: WorkoutExercise, exerciseIndex: number): string {
  return exercise.clientId ?? `${exercise.exerciseSource}:${exercise.exerciseId}:${exerciseIndex}`
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
  const { compactFixedUi, visualViewportHeight } = useMobileInteraction()
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
  const mobileAddExerciseRef = useRef<HTMLButtonElement>(null)
  const [handlingStaleSession, setHandlingStaleSession] = useState(false)
  const [keepExerciseStackMounted, setKeepExerciseStackMounted] = useState(false)
  const [manualExpandedExerciseClientId, setManualExpandedExerciseClientId] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
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

  useEffect(() => {
    if (isDesktop || !compactFixedUi || rest === null) return
    let settledFrame: number | null = null
    const layoutFrame = window.requestAnimationFrame(() => {
      settledFrame = window.requestAnimationFrame(() => {
        const activeElement = document.activeElement
        if (
          activeElement instanceof HTMLInputElement
          && activeElement.matches('.workout-focus-shell .workout-set-row input')
        ) {
          activeElement.scrollIntoView({ block: 'nearest' })
        }
      })
    })
    return () => {
      window.cancelAnimationFrame(layoutFrame)
      if (settledFrame !== null) window.cancelAnimationFrame(settledFrame)
    }
  }, [compactFixedUi, isDesktop, rest, visualViewportHeight])

  const handleToggleSet = useCallback((exerciseIndex: number, setIndex: number) => {
    const { active: currentActive, toggleSetDone } = useWorkoutStore.getState()
    const currentSet = currentActive?.exercises[exerciseIndex]?.sets[setIndex]
    const wasNotDone = currentSet && !currentSet.done
    const completesExercise = wasNotDone && currentActive?.exercises[exerciseIndex]?.sets.every(
      (set, index) => index === setIndex || set.done,
    )
    if (wasNotDone && parseReps(currentSet.reps) <= 0) {
      toast.error('Enter reps before marking this set as complete.')
      return
    }
    toggleSetDone(exerciseIndex, setIndex)
    if (wasNotDone) {
      useWorkoutStore.getState().startRestTimer(90)
      if (completesExercise) setManualExpandedExerciseClientId(null)
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
  const [quickPicks, setQuickPicks] = useState<Array<{ id: string; name: string; source: 'global' | 'user'; count: number }>>([])
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
      .then((wks) => {
        const map = new Map<string, { id: string; name: string; source: 'global' | 'user'; count: number }>()
        for (const w of wks) {
          for (const ex of w.exercises) {
            if (!ex.exerciseId) continue
            const source: 'global' | 'user' = ex.exerciseSource === 'user' ? 'user' : 'global'
            const key = `${source}:${ex.exerciseId}`
            const existing = map.get(key)
            if (existing) existing.count += 1
            else map.set(key, { id: ex.exerciseId, name: ex.name, source, count: 1 })
          }
        }
        const top = Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 6)
        setQuickPicks(top)
      })
      .catch(() => {})
  }, [user])

  const handlePickExercise = async (id: string, name: string, source: 'global' | 'user') => {
    addExercise(id, name, source)
    const nextActive = useWorkoutStore.getState().active
    const addedExerciseIndex = (nextActive?.exercises.length ?? 0) - 1
    const addedExercise = nextActive?.exercises[addedExerciseIndex]
    if (addedExercise) {
      setManualExpandedExerciseClientId(getExerciseClientId(addedExercise, addedExerciseIndex))
    }
    if (!user) return
    fetchSuggestion(id, source, user.uid)
    try {
      const sessions = await getExerciseSessions(user.uid, id, source, 1)
      const last = sessions[0]
      if (!last || last.bestSetWeight <= 0) return
      const state = useWorkoutStore.getState()
      if (!state.active) return
      const idx = state.active.exercises.findIndex(
        (ex) => ex.exerciseId === id && ex.exerciseSource === source,
      )
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
  const closureLocked = closureState !== 'idle'

  async function handleClosureError(error: unknown): Promise<void> {
    if (!(error instanceof WorkoutClosureError)) {
      markClosureUnconfirmed()
      return
    }
    const failure = await markClosureError(error)
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
    useWorkoutStore.getState().updateSet(exerciseIndex, 0, 'weight', String(weight))
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
    return <LoadingState message="Preparing workout..." />
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
  const totalExercises = active.exercises.length
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
  const completionPct = totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0
  const activeLabel = active.label?.trim() || 'Session in progress'
  const sessionSignal = totalExercises === 0
    ? 'Add your first exercise to start a session.'
    : completedSets === 0
      ? 'Your first sets are ahead. Start with your main lift for the day.'
      : completionPct >= 100
        ? 'All sets are marked complete. Finish the session or add more sets.'
        : `${completedSets} of ${totalSets} sets completed.`

  const focusExerciseIndex = (() => {
    const nextIndex = active.exercises.findIndex((exercise) => exercise.sets.some((set) => !set.done))
    if (nextIndex >= 0) return nextIndex
    return active.exercises.length > 0 ? active.exercises.length - 1 : -1
  })()
  const focusExercise = focusExerciseIndex >= 0 ? active.exercises[focusExerciseIndex] : null
  const defaultExpandedExerciseClientId = focusExercise
    ? getExerciseClientId(focusExercise, focusExerciseIndex)
    : null
  const manualExpandedExerciseExists = manualExpandedExerciseClientId === '' || active.exercises.some(
    (exercise, exerciseIndex) => getExerciseClientId(exercise, exerciseIndex) === manualExpandedExerciseClientId,
  )
  const expandedExerciseClientId = manualExpandedExerciseExists
    ? manualExpandedExerciseClientId || null
    : defaultExpandedExerciseClientId
  const showExerciseStack = active.exercises.length > 0 || keepExerciseStackMounted
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

      {closureState === 'closure_failed' && (
        <div className="surface-panel mb-4 rounded-[var(--radius-xl)] border p-4" role="alert" style={{ borderColor: 'var(--danger)' }}>
          <p className="text-sm font-semibold text-white">This session cannot be closed.</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            The server rejected this operation. Check your connection and try again.
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
            popoverTarget="workout-mobile-options"
            aria-label="More workout options"
            aria-haspopup="menu"
          >
            <Ellipsis size={20} aria-hidden="true" />
          </button>
          <div
            id="workout-mobile-options"
            className="workout-mobile-options-menu"
            popover="auto"
            role="menu"
            aria-label="Workout options"
          >
            <button
              type="button"
              role="menuitem"
              popoverTarget="workout-mobile-options"
              popoverTargetAction="hide"
              onClick={handleDiscard}
            >
              Discard workout
            </button>
          </div>
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

        {/* ── Desktop sidebar only ─────────────────── */}
        {isDesktop && (
          <aside className="hidden lg:block desktop-sticky">
            <div className="workout-control-panel">
              <p className="eyebrow mb-4" style={{ color: 'var(--accent)' }}>
                Active session
              </p>

              <div className="workout-time-card">
                <p className="stat-meta mb-2">Session time</p>
                <div className="flex items-end justify-between gap-3">
                  <ElapsedSessionTimer startedAt={active.startedAt} className="workout-time-value" />
                  <span
                    className="workout-live-pill"
                  >
                    {activeLabel}
                  </span>
                </div>
                <div className="workout-progress-track">
                  <div
                    className="workout-progress-fill"
                    style={{
                      width: `${Math.max(totalSets ? completionPct : 12, totalSets ? 12 : 0)}%`,
                      background: completionPct >= 100
                        ? 'linear-gradient(90deg, var(--success) 0%, #6f9d83 100%)'
                        : 'linear-gradient(90deg, var(--accent) 0%, var(--accent-text) 100%)',
                    }}
                  />
                </div>
                <p className="mt-3 text-sm leading-6" style={{ color: 'var(--muted)' }}>
                  {sessionSignal}
                </p>
              </div>

              <AnimatePresence initial={false}>
                {rest !== null && (
                  <RestTimerBar rest={rest} onAddTime={handleAddRestTime} onSkip={handleSkipRest} />
                )}
              </AnimatePresence>

              <div className="workout-side-metrics">
                <div className="workout-micro-card">
                  <p className="stat-meta">Exercises</p>
                  <p className="mt-2 text-2xl font-semibold text-white tabular-nums">{totalExercises}</p>
                </div>
                <div className="workout-micro-card">
                  <p className="stat-meta">Sets</p>
                  <p className="mt-2 text-2xl font-semibold text-white tabular-nums">{completedSets}/{totalSets}</p>
                </div>
                <div className="workout-micro-card">
                  <p className="stat-meta">Volume</p>
                  <p className="mt-2 text-xl font-semibold text-white tabular-nums">{formatCompactVolume(totalVolume, units)}</p>
                </div>
                <div className="workout-micro-card">
                  <p className="stat-meta">Heaviest set</p>
                  <p className="mt-2 text-xl font-semibold text-white tabular-nums">{strongestSet ? `${kgToDisplayWeight(strongestSet, units)} ${units}` : '—'}</p>
                </div>
              </div>

              <div>
                <p className="mb-3 text-xs uppercase" style={{ color: 'var(--muted)' }}>
                  Session type
                </p>
                <LabelChips
                  activeLabel={active.label ?? ''}
                  onToggle={(label) => setLabel(active.label === label ? '' : label)}
                  className="workout-label-chips--desktop"
                />
              </div>

              <div className="mt-5">
                <motion.button
                  onClick={() => setShowPicker(true)}
                  className="workout-primary-action mb-3"
                  style={{ background: 'var(--primary-gradient)', color: 'var(--accent-foreground)' }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <Plus size={16} strokeWidth={2.4} />
                  <span>Add exercise</span>
                </motion.button>
                <div className="grid grid-cols-2 gap-2">
                  <motion.button
                    onClick={handleDiscard}
                    className="rounded-[var(--radius-lg)] py-3 text-sm font-semibold"
                    style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--muted)', border: '1px solid var(--border)' }}
                    whileTap={{ scale: 0.97 }}
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    onClick={handleFinish}
                    disabled={saving}
                    className="rounded-[var(--radius-lg)] py-3 text-sm font-bold"
                    style={{ background: 'var(--primary-gradient)', color: 'var(--accent-foreground)', opacity: saving ? 0.6 : 1 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    {saving ? '...' : 'Finish'}
                  </motion.button>
                </div>
              </div>
            </div>
          </aside>
        )}

        <div className={`min-w-0 ${rest ? 'pb-36' : 'pb-20'} lg:pb-0`}>
          <div className="workout-section-head">
            <div>
              <p className="eyebrow" style={{ color: 'var(--muted)' }}>
                Exercises
              </p>
              <h2 className="mt-2 text-2xl font-bold text-white">Current exercises</h2>
            </div>
          </div>

          <div className="workout-mobile-label-row lg:hidden">
            <LabelChips
              activeLabel={active.label ?? ''}
              onToggle={(label) => setLabel(active.label === label ? '' : label)}
            />
          </div>

          <div className="flex flex-col gap-4">
            {active.exercises.length === 0 && !keepExerciseStackMounted && (
              <>
                <section className="workout-empty-state" aria-label="No exercises yet">
                  <motion.button
                    ref={mobileAddExerciseRef}
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
                  <AnimatePresence onExitComplete={() => setKeepExerciseStackMounted(false)}>
                    {active.exercises.map((exercise, exerciseIndex) => {
                      const exerciseMeta = exerciseCatalog.get(exercise.exerciseId)
                      const exerciseClientId = getExerciseClientId(exercise, exerciseIndex)
                      const hintKey = `${exercise.exerciseSource}:${exercise.exerciseId}`
                      const exerciseOpenSetIndex = exercise.sets.findIndex((set) => !set.done)
                      const exerciseFocusSetIndex = exerciseOpenSetIndex >= 0
                        ? exerciseOpenSetIndex
                        : Math.max(exercise.sets.length - 1, 0)
                      const isCollapsible = active.exercises.length > 1
                      const isExpanded = !isCollapsible || exerciseClientId === expandedExerciseClientId

                      return (
                        <WorkoutExerciseLedgerItem
                          key={exerciseClientId}
                          exerciseAccent={EXERCISE_CATEGORY_COLORS[exerciseMeta?.category ?? ''] ?? 'var(--accent)'}
                          exerciseClientId={exerciseClientId}
                          exerciseIndex={exerciseIndex}
                          fallbackExercise={exerciseSnapshotByClientId.get(exerciseClientId) ?? exercise}
                          categoryLabel={exerciseMeta?.category ? (EXERCISE_CATEGORY_LABELS[exerciseMeta.category] ?? exerciseMeta.category) : undefined}
                          equipmentLabel={exerciseMeta?.equipment ? (EQUIPMENT_LABELS[exerciseMeta.equipment] ?? exerciseMeta.equipment) : undefined}
                          focusSetIndex={exerciseFocusSetIndex}
                          hintDismissed={dismissedHints.has(hintKey)}
                          hintKey={hintKey}
                          isCollapsible={isCollapsible}
                          isExpanded={isExpanded}
                          isFocusedExercise={exerciseIndex === focusExerciseIndex}
                          suggestion={suggestions[hintKey] ?? null}
                          units={units}
                          userId={user?.uid}
                          onAddSet={handleAddSet}
                          onAdjustSet={handleAdjustSet}
                          onApplySuggestion={handleApplySuggestion}
                          onDismissSuggestion={handleDismissSuggestion}
                          onExpandExercise={(clientId) => setManualExpandedExerciseClientId(
                            clientId === expandedExerciseClientId ? '' : clientId,
                          )}
                          onRemoveExercise={handleRemoveExercise}
                          onRemoveSet={handleRemoveSet}
                          onToggleSet={handleToggleSet}
                          onUpdateSet={handleUpdateSet}
                        />
                      )
                    })}
                  </AnimatePresence>
                </div>

                {active.exercises.length > 0 && (
                  <motion.button
                    ref={mobileAddExerciseRef}
                    type="button"
                    onClick={() => setShowPicker(true)}
                    className="workout-primary-action workout-mobile-inline-add"
                    style={{ background: 'var(--primary-gradient)', color: 'var(--accent-foreground)' }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <Plus size={16} strokeWidth={2.4} />
                    <span>Add exercise</span>
                  </motion.button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {!isDesktop && rest !== null && (
        <div
          className="workout-mobile-action-bar fixed left-0 right-0 flex justify-center px-4 lg:hidden"
          data-variant={mobileRestVariant}
        >
          <div className="surface-panel w-full max-w-sm rounded-[var(--radius-xl)] p-3">
            <AnimatePresence initial={false}>
              <RestTimerBar
                rest={rest}
                onAddTime={handleAddRestTime}
                onSkip={handleSkipRest}
                variant={mobileRestVariant}
              />
            </AnimatePresence>
          </div>
        </div>
      )}

      {showPicker && (
        <ExercisePicker
          onSelect={(id, name, source) => {
            setShowPicker(false)
            void handlePickExercise(id, name, source)
            window.requestAnimationFrame(() => mobileAddExerciseRef.current?.focus())
          }}
          onClose={() => setShowPicker(false)}
          userExercisesState={userExercisesState}
          onRetryUserExercises={retryUserExercises}
        />
      )}

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
