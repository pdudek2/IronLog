import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Timer, X } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkoutStore, type WorkoutExercise, type WorkoutSet } from '../store/workoutStore'
import { useAuthStore } from '../store/authStore'
import { useProfileStore } from '../store/profileStore'
import { getRecentWorkouts } from '../lib/workoutService'
import { discardWorkoutLifecycle, finishWorkoutLifecycle } from '../lib/workoutLifecycle'
import { finalizeWorkout, WorkoutClosureError } from '../lib/workoutClosureService'
import type { WorkoutClosureIntent } from '../lib/workoutClosureIntent'
import { getExerciseSessions, type ExerciseSession } from '../lib/exerciseDetailService'
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
import { kgToDisplayWeight } from '../lib/weightUnits'
import type { Units } from '../lib/userProfile'
import {
  EXERCISE_CATEGORY_COLORS,
  EXERCISE_CATEGORY_LABELS,
} from '../lib/exerciseLabels'
import { useMobileInteraction } from '../components/MobileInteractionProvider'

const WORKOUT_LABELS = ['Push', 'Pull', 'Nogi', 'Upper Body', 'Lower Body', 'Full Body', 'Plecy & Biceps', 'Klatka & Triceps', 'Cardio', 'Crossfit', 'Mobilność'] as const
const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: 'Sztanga',
  dumbbell: 'Hantle',
  cable: 'Wyciąg',
  machine: 'Maszyna',
  bodyweight: 'BW',
  kettlebell: 'KB',
}

type RestTimerState = { startedAt: number; totalSec: number }
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

function formatDuration(startedAt: number, now = Date.now()): { h: string; m: string; s: string } {
  const total = Math.floor((now - startedAt) / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return {
    h: String(h).padStart(2, '0'),
    m: String(m).padStart(2, '0'),
    s: String(s).padStart(2, '0'),
  }
}

function formatSessionTimer(startedAt: number, now = Date.now()): string {
  const t = formatDuration(startedAt, now)
  return t.h !== '00' ? `${t.h}:${t.m}:${t.s}` : `${t.m}:${t.s}`
}

interface ElapsedTimerProps {
  startedAt: number
  className?: string
}

type PreviousExerciseSessionState =
  | { status: 'loading' }
  | { status: 'loaded'; session: ExerciseSession }
  | { status: 'empty' | 'error' }

interface PreviousExerciseSessionProps {
  exerciseId: string
  exerciseName: string
  exerciseSource: 'global' | 'user'
  uid: string
  units: Units
  defaultOpen?: boolean
}

function PreviousExerciseSession({
  exerciseId,
  exerciseName,
  exerciseSource,
  uid,
  units,
  defaultOpen = false,
}: PreviousExerciseSessionProps) {
  const [state, setState] = useState<PreviousExerciseSessionState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    getExerciseSessions(uid, exerciseId, exerciseSource, 1)
      .then(([session]) => {
        if (!active) return
        setState(session && session.sets.length > 0
          ? { status: 'loaded', session }
          : { status: 'empty' })
      })
      .catch(() => {
        if (active) setState({ status: 'error' })
      })
    return () => { active = false }
  }, [exerciseId, exerciseSource, uid])

  if (state.status !== 'loaded') return null

  const { session } = state
  const date = new Date(session.startedAt).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })
  const previousSet = session.sets[0]

  return (
    <details
      className="workout-previous-session"
      aria-label={`Poprzedni trening ${exerciseName}`}
      open={defaultOpen || undefined}
    >
      <summary className="workout-previous-session-head">
        <span>Poprzedni trening</span>
        <span className="workout-previous-session-meta">
          <strong>{date}</strong> · {kgToDisplayWeight(previousSet.weight, units)} {units} × {previousSet.reps}
        </span>
      </summary>
      <ol className="workout-previous-set-list">
        {session.sets.map((set, index) => (
          <li key={`${set.weight}:${set.reps}:${index}`}>
            <span className="workout-previous-set-index">{index + 1}</span>
            <span>{kgToDisplayWeight(set.weight, units)} {units} × {set.reps}</span>
          </li>
        ))}
      </ol>
    </details>
  )
}

function ElapsedTimer({ startedAt, className = '' }: ElapsedTimerProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(interval)
  }, [startedAt])

  return <span className={className} data-testid="elapsed-session-timer">{formatSessionTimer(startedAt, now)}</span>
}

interface RestTimerBarProps {
  rest: RestTimerState
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
            <span>Gotowe — czas na kolejną serię</span>
          ) : (
            <>
              <span style={{ color: 'var(--muted)' }}>Przerwa</span>
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
                aria-label="Dodaj 30 sekund"
              >
                +30s
              </button>
            )}
            <button
              type="button"
              onClick={onSkip}
              className="rest-timer-action rest-timer-action--icon"
              aria-label="Pomiń przerwę"
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onSkip}
            className="rest-timer-action"
            aria-label="Zamknij"
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

function formatCompactVolume(volumeKg: number, units: Units): string {
  const volume = kgToDisplayWeight(volumeKg, units)
  if (!volume) return `0 ${units}`
  if (volume >= 10_000) return `${Math.round(volume / 1_000)}k ${units}`
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(1)}k ${units}`
  return `${Math.round(volume).toLocaleString('pl-PL')} ${units}`
}

function getExerciseClientId(exercise: WorkoutExercise, exerciseIndex: number): string {
  return exercise.clientId ?? `${exercise.exerciseSource}:${exercise.exerciseId}:${exerciseIndex}`
}

export default function WorkoutPage() {
  const { user } = useAuthStore()
  const { profile } = useProfileStore()
  const {
    active,
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
  const [handlingStaleSession, setHandlingStaleSession] = useState(false)
  const [keepExerciseStackMounted, setKeepExerciseStackMounted] = useState(false)
  const [manualExpandedExerciseClientId, setManualExpandedExerciseClientId] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [confirmFinishEmpty, setConfirmFinishEmpty] = useState(false)
  const [pendingExerciseRemovalIndex, setPendingExerciseRemovalIndex] = useState<number | null>(null)
  const [pendingSetRemoval, setPendingSetRemoval] = useState<PendingSetRemoval | null>(null)
  const {
    state: userExercisesState,
    exercises: userExercises,
    retry: retryUserExercises,
  } = useUserExercises(user?.uid ?? null)
  const [suggestions, setSuggestions] = useState<Record<string, OverloadSuggestion | null>>({})
  const [dismissedHints, setDismissedHints] = useState<Set<string>>(new Set())
  const fetchedKeys = useRef(new Set<string>())

  // Rest timer state
  const [rest, setRest] = useState<RestTimerState | null>(null)

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
      toast.error('Wpisz liczbę powtórzeń, zanim oznaczysz serię jako wykonaną.')
      return
    }
    toggleSetDone(exerciseIndex, setIndex)
    if (wasNotDone) {
      setRest({ startedAt: Date.now(), totalSec: 90 })
      if (completesExercise) setManualExpandedExerciseClientId(null)
      if ('vibrate' in navigator) navigator.vibrate(12)
    } else {
      setRest(null)
    }
  }, [])

  const handleAddRestTime = useCallback((deltaSec: number) => {
    setRest((prev) => prev ? { ...prev, totalSec: prev.totalSec + deltaSec } : prev)
  }, [])

  const handleSkipRest = useCallback(() => setRest(null), [])

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
      toast.error('Nie udało się przygotować bezpiecznego usunięcia serii. Odśwież widok i spróbuj ponownie.')
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
      toast.error('Sesja zmieniła się na innym urządzeniu. Sprawdź dane i zakończ ją ponownie.')
    }
  }

  async function submitFinish(intent: WorkoutClosureIntent) {
    if (!user || intent.action !== 'finish') return
    try {
      const prepared = intent.sessionRevision
        ? { status: 'ready', sessionRevision: intent.sessionRevision } as const
        : await prepareFinishClosure(intent)
      if (prepared.status === 'failed') return

      const result = await finishWorkoutLifecycle({
        uid: user.uid,
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
      navigate('/dashboard', { replace: true })
      toast.success(result.status === 'materialized'
        ? 'Trening zapisany!'
        : 'Trening zapisany. Statystyki oczekują na synchronizację.')
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
    void doFinish()
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
      setPendingExerciseRemovalIndex(exerciseIndex)
      return
    }
    if (currentActive.exercises.length === 1) {
      setKeepExerciseStackMounted(true)
    }
    useWorkoutStore.getState().removeExercise(exerciseIndex)
  }, [])

  function handleConfirmRemoveExercise() {
    if (pendingExerciseRemovalIndex === null) return
    if (useWorkoutStore.getState().active?.exercises.length === 1) {
      setKeepExerciseStackMounted(true)
    }
    useWorkoutStore.getState().removeExercise(pendingExerciseRemovalIndex)
    setPendingExerciseRemovalIndex(null)
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
        toast.error('Sesja została przywrócona lokalnie. Ponów synchronizację.')
        return
      }
      toast.success('Wróciłem do zapisanej sesji z odświeżonym timerem.')
    } catch (error) {
      console.error('[continue stale session error]', error)
      toast.error('Nie udało się przywrócić sesji. Spróbuj ponownie.')
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
        ? 'Stara sesja odrzucona. Zaczynamy od nowa.'
        : 'Stara sesja odrzucona. Zachowano aktualną sesję.')
    } catch (error) {
      console.error('[discard stale session error]', error)
      if (!(error instanceof WorkoutClosureError)) {
        toast.error('Nie udało się odrzucić starej sesji. Spróbuj ponownie.')
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
            message="Nie udało się wczytać aktualnej sesji. Sprawdź połączenie i spróbuj ponownie."
            onRetry={reloadAuthentication}
          />
        </div>
      )
    }
    return <LoadingState message="Przygotowuję trening..." />
  }

  if (staleSession) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="surface-panel rounded-[var(--radius-xl)] p-6">
          <p className="eyebrow mb-2" style={{ color: 'var(--accent)' }}>Aktywna sesja</p>
          <h1 className="section-title">Wrócić do starej sesji?</h1>
          <p className="mt-3 text-sm leading-6" style={{ color: 'var(--muted)' }}>
            Masz aktywną sesję sprzed {staleSession.ageLabel}. Możesz wrócić do wpisanych ćwiczeń z odświeżonym timerem albo odrzucić ją i zacząć od nowa.
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
              Kontynuuj
            </motion.button>
            <motion.button
              type="button"
              onClick={() => { void handleDiscardStaleSession() }}
              disabled={handlingStaleSession}
              className="rounded-[var(--radius-lg)] px-4 py-3 text-sm font-semibold disabled:opacity-50"
              style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--muted)', border: '1px solid var(--border)' }}
              whileTap={{ scale: 0.97 }}
            >
              Odrzuć i zacznij od nowa
            </motion.button>
          </div>
        </div>
      </div>
    )
  }

  if (!active) {
    return (
      <div style={{ maxWidth: '32rem' }}>
        <div className="surface-panel rounded-[var(--radius-xl)] px-6 py-10 text-center">
          <p className="mb-2 text-sm font-semibold text-white">Nie ma aktywnej sesji</p>
          <p className="mb-6 text-sm" style={{ color: 'var(--muted)' }}>
            Poprzednia sesja mogła zostać zakończona albo usunięta na innym urządzeniu.
          </p>
          <motion.button
            onClick={() => { void startNewSession() }}
            className="rounded-2xl px-6 py-3 text-sm font-semibold"
            style={{ background: 'var(--primary-gradient)', color: 'var(--accent-foreground)' }}
            whileTap={{ scale: 0.97 }}
          >
            Rozpocznij nową sesję
          </motion.button>
        </div>
      </div>
    )
  }

  const units = profile?.units ?? 'kg'
  const exerciseCatalog = new Map([...exerciseDb, ...userExercises].map((exercise) => [exercise.id, exercise]))
  const totalExercises = active.exercises.length
  const totalSets = active.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)
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
  const activeLabel = active.label?.trim() || 'Sesja w toku'
  const sessionSignal = totalExercises === 0
    ? 'Dodaj pierwsze ćwiczenie, żeby zacząć sesję.'
    : completedSets === 0
      ? 'Pierwsze serie jeszcze przed Tobą. Zacznij od głównego ruchu dnia.'
      : completionPct >= 100
        ? 'Cała rozpiska jest oznaczona jako wykonana. Możesz domknąć sesję albo dorzucić kolejne serie.'
        : `${completedSets} z ${totalSets} serii masz już zamknięte.`

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
      aria-label={`Aktywna sesja: ${activeLabel}`}
    >
      {closureState !== 'active_session_changed' && (
        <ActiveSessionSyncStatus
          status={activeSessionSyncStatus}
          onRetry={() => { void retryActiveSessionSync() }}
        />
      )}
      {closureState === 'active_session_changed' && (
        <div className="surface-panel mb-4 rounded-[var(--radius-xl)] border p-4" role="alert" style={{ borderColor: 'var(--danger)' }}>
          <p className="text-sm font-semibold text-white">Sesja zmieniła się na innym urządzeniu.</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            Nie udało się wczytać aktualnych danych. Edycja pozostaje zablokowana do czasu uzgodnienia sesji z serwerem.
          </p>
          <button
            type="button"
            onClick={() => { void reloadCurrentSession() }}
            className="mt-3 rounded-[var(--radius-lg)] px-4 py-2.5 text-sm font-semibold"
            style={{ background: 'var(--primary-gradient)', color: 'var(--accent-foreground)' }}
          >
            Wczytaj aktualną sesję
          </button>
        </div>
      )}
      {closureState === 'closure_unconfirmed' && (
        <div className="surface-panel mb-4 rounded-[var(--radius-xl)] border p-4" role="alert" style={{ borderColor: 'var(--danger)' }}>
          <p className="text-sm font-semibold text-white">Nie udało się potwierdzić zamknięcia sesji.</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            Dane treningu są zachowane. Edycja pozostaje zablokowana, dopóki serwer nie potwierdzi wyniku.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { void retryClosure() }}
              className="rounded-[var(--radius-lg)] px-4 py-2.5 text-sm font-semibold"
              style={{ background: 'var(--primary-gradient)', color: 'var(--accent-foreground)' }}
            >
              Spróbuj ponownie
            </button>
          </div>
        </div>
      )}

      {closureState === 'session_mismatch' && (
        <div className="surface-panel mb-4 rounded-[var(--radius-xl)] border p-4" role="alert" style={{ borderColor: 'var(--danger)' }}>
          <p className="text-sm font-semibold text-white">Ta sesja nie jest już aktywna na serwerze.</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            Nie udało się automatycznie uzgodnić sesji otwartej na innym urządzeniu.
          </p>
          <button
            type="button"
            onClick={() => { void reloadCurrentSession() }}
            className="mt-3 rounded-[var(--radius-lg)] px-4 py-2.5 text-sm font-semibold"
            style={{ background: 'var(--primary-gradient)', color: 'var(--accent-foreground)' }}
          >
            Spróbuj ponownie
          </button>
        </div>
      )}

      {closureState === 'closure_conflict' && (
        <div className="surface-panel mb-4 rounded-[var(--radius-xl)] border p-4" role="alert" style={{ borderColor: 'var(--danger)' }}>
          <p className="text-sm font-semibold text-white">Serwer odrzucił zamknięcie tej sesji.</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            Sesja została wcześniej zamknięta w inny sposób, a automatyczne uzgodnienie stanu nie powiodło się.
          </p>
          <button
            type="button"
            onClick={() => { void reloadCurrentSession() }}
            className="mt-3 rounded-[var(--radius-lg)] px-4 py-2.5 text-sm font-semibold"
            style={{ background: 'var(--primary-gradient)', color: 'var(--accent-foreground)' }}
          >
            Spróbuj ponownie
          </button>
        </div>
      )}

      {closureState === 'auth_required' && (
        <div className="surface-panel mb-4 rounded-[var(--radius-xl)] border p-4" role="alert" style={{ borderColor: 'var(--danger)' }}>
          <p className="text-sm font-semibold text-white">Sesja logowania wymaga odświeżenia.</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            Dane treningu są zachowane. Odśwież logowanie, a potem ponów zamknięcie sesji.
          </p>
          <button
            type="button"
            onClick={reloadAuthentication}
            className="mt-3 rounded-[var(--radius-lg)] px-4 py-2.5 text-sm font-semibold"
            style={{ background: 'var(--primary-gradient)', color: 'var(--accent-foreground)' }}
          >
            Odśwież logowanie
          </button>
        </div>
      )}

      {closureState === 'closure_failed' && (
        <div className="surface-panel mb-4 rounded-[var(--radius-xl)] border p-4" role="alert" style={{ borderColor: 'var(--danger)' }}>
          <p className="text-sm font-semibold text-white">Nie można zamknąć tej sesji.</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            Serwer definitywnie odrzucił operację. Spróbuj ponownie po sprawdzeniu połączenia.
          </p>
          <button
            type="button"
            onClick={() => { void retryClosure() }}
            className="mt-3 rounded-[var(--radius-lg)] px-4 py-2.5 text-sm font-semibold"
            style={{ background: 'var(--primary-gradient)', color: 'var(--accent-foreground)' }}
          >
            Spróbuj ponownie
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
          <motion.button
            type="button"
            onClick={handleDiscard}
            className="flex-none rounded-xl px-3 text-xs font-semibold min-h-11"
            style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--muted)', border: '1px solid var(--border)' }}
            whileTap={{ scale: 0.93 }}
          >
            Anuluj
          </motion.button>
          <ElapsedTimer startedAt={active.startedAt} className="text-xl font-bold tabular-nums text-white flex-none" />
          <div className="flex-1 min-w-0" />
          <motion.button
            type="button"
            onClick={handleFinish}
            disabled={saving}
            className="flex-none rounded-xl px-5 text-sm font-bold min-h-11"
            style={{ background: 'var(--primary-gradient)', color: 'var(--accent-foreground)' }}
            whileTap={{ scale: 0.93 }}
          >
            {saving ? '...' : 'Zakończ'}
          </motion.button>
        </div>
      )}

      <div className="workout-session-grid">

        {/* ── Desktop sidebar only ─────────────────── */}
        {isDesktop && (
          <aside className="hidden lg:block desktop-sticky">
            <div className="workout-control-panel">
              <p className="eyebrow mb-4" style={{ color: 'var(--accent)' }}>
                Aktywna sesja
              </p>

              <div className="workout-time-card">
                <p className="stat-meta mb-2">Czas sesji</p>
                <div className="flex items-end justify-between gap-3">
                  <ElapsedTimer startedAt={active.startedAt} className="workout-time-value" />
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
                  <p className="stat-meta">Ćwiczenia</p>
                  <p className="mt-2 text-2xl font-semibold text-white tabular-nums">{totalExercises}</p>
                </div>
                <div className="workout-micro-card">
                  <p className="stat-meta">Serie</p>
                  <p className="mt-2 text-2xl font-semibold text-white tabular-nums">{completedSets}/{totalSets}</p>
                </div>
                <div className="workout-micro-card">
                  <p className="stat-meta">Objętość</p>
                  <p className="mt-2 text-xl font-semibold text-white tabular-nums">{formatCompactVolume(totalVolume, units)}</p>
                </div>
                <div className="workout-micro-card">
                  <p className="stat-meta">Najcięższy set</p>
                  <p className="mt-2 text-xl font-semibold text-white tabular-nums">{strongestSet ? `${kgToDisplayWeight(strongestSet, units)} ${units}` : '—'}</p>
                </div>
              </div>

              <div>
                <p className="mb-3 text-xs uppercase" style={{ color: 'var(--muted)' }}>
                  Typ sesji
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
                  <span>Dodaj ćwiczenie</span>
                </motion.button>
                <div className="grid grid-cols-2 gap-2">
                  <motion.button
                    onClick={handleDiscard}
                    className="rounded-[var(--radius-lg)] py-3 text-sm font-semibold"
                    style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--muted)', border: '1px solid var(--border)' }}
                    whileTap={{ scale: 0.97 }}
                  >
                    Anuluj
                  </motion.button>
                  <motion.button
                    onClick={handleFinish}
                    disabled={saving}
                    className="rounded-[var(--radius-lg)] py-3 text-sm font-bold"
                    style={{ background: 'var(--primary-gradient)', color: 'var(--accent-foreground)', opacity: saving ? 0.6 : 1 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    {saving ? '...' : 'Zakończ'}
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
                Ćwiczenia
              </p>
              <h2 className="mt-2 text-2xl font-bold text-white">Bieżąca rozpiska</h2>
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
                <section className="workout-empty-state" aria-labelledby="workout-empty-title">
                  <p className="eyebrow" style={{ color: 'var(--accent)' }}>Start sesji</p>
                  <h3 id="workout-empty-title">Dodaj pierwszy ruch</h3>
                  <p>Wybierz ćwiczenie, wpisz pierwszą serię i prowadź sesję z jednego widoku.</p>
                  <motion.button
                    type="button"
                    onClick={() => setShowPicker(true)}
                    className="workout-primary-action"
                    style={{ background: 'var(--primary-gradient)', color: 'var(--accent-foreground)' }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <Plus size={16} strokeWidth={2.4} />
                    Dodaj ćwiczenie
                  </motion.button>
                </section>
                {quickPicks.length > 0 && (
                  <div>
                    <p className="eyebrow mb-3" style={{ color: 'var(--muted)' }}>Szybki start</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {quickPicks.map(({ id, name, source, count }) => {
                        const meta = exerciseCatalog.get(id)
                        const exerciseAccent = EXERCISE_CATEGORY_COLORS[meta?.category ?? ''] ?? 'var(--accent)'
                        return (
                          <motion.button
                            key={`${source}:${id}`}
                            type="button"
                            onClick={() => handlePickExercise(id, name, source)}
                            className="workout-quick-pick"
                            whileTap={{ scale: 0.98 }}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <p className="text-sm font-semibold text-white truncate">{name}</p>
                              {meta?.category && (
                                <span
                                  className="flex-none text-xs font-semibold uppercase px-1.5 py-0.5 rounded-full"
                                  style={{ background: `${exerciseAccent}18`, color: exerciseAccent }}
                                >
                                  {EXERCISE_CATEGORY_LABELS[meta.category] ?? meta.category}
                                </span>
                              )}
                            </div>
                            <p className="text-xs" style={{ color: 'var(--muted)' }}>
                              Użyte {count}× w ostatnich sesjach
                            </p>
                          </motion.button>
                        )
                      })}
                    </div>
                  </div>
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
                          previousSession={exerciseIndex === focusExerciseIndex && user
                            ? (
                                <PreviousExerciseSession
                                  key={`${exercise.exerciseSource}:${exercise.exerciseId}:ledger`}
                                  exerciseId={exercise.exerciseId}
                                  exerciseName={exercise.name}
                                  exerciseSource={exercise.exerciseSource}
                                  uid={user.uid}
                                  units={units}
                                  defaultOpen={isDesktop}
                                />
                              )
                            : undefined}
                          suggestion={suggestions[hintKey] ?? null}
                          units={units}
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
                    type="button"
                    onClick={() => setShowPicker(true)}
                    className="workout-primary-action workout-mobile-inline-add"
                    style={{ background: 'var(--primary-gradient)', color: 'var(--accent-foreground)' }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <Plus size={16} strokeWidth={2.4} />
                    <span>Dodaj ćwiczenie</span>
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
          }}
          onClose={() => setShowPicker(false)}
          userExercisesState={userExercisesState}
          onRetryUserExercises={retryUserExercises}
        />
      )}

      {confirmDiscard && (
        <ConfirmDialog
          title="Odrzucić trening?"
          message="Wszystkie dane tej sesji zostaną utracone."
          confirmLabel="Odrzuć trening"
          cancelLabel="Wróć"
          danger
          onConfirm={() => { setConfirmDiscard(false); void handleConfirmDiscard() }}
          onCancel={() => {
            setConfirmDiscard(false)
          }}
        />
      )}

      {confirmFinishEmpty && (
        <ConfirmDialog
          title="Zakończyć bez zapisu?"
          message="Nie zaznaczono żadnej serii jako wykonanej. Sesja zostanie odrzucona bez zapisywania treningu."
          confirmLabel="Odrzuć sesję"
          cancelLabel="Wróć"
          danger
          onConfirm={() => {
            setConfirmFinishEmpty(false)
            void handleConfirmDiscard()
          }}
          onCancel={() => setConfirmFinishEmpty(false)}
        />
      )}

      {pendingExerciseRemovalIndex !== null && (
        <ConfirmDialog
          title="Usunąć ćwiczenie?"
          message="To usunie ćwiczenie wraz z wpisanymi seriami z aktywnej sesji."
          confirmLabel="Usuń ćwiczenie"
          cancelLabel="Zostaw"
          danger
          onConfirm={handleConfirmRemoveExercise}
          onCancel={() => setPendingExerciseRemovalIndex(null)}
        />
      )}
      {pendingSetRemoval && (
        <ConfirmDialog
          title="Usunąć serię?"
          message="Ta seria zawiera wpisane dane lub jest oznaczona jako wykonana."
          confirmLabel="Usuń serię"
          cancelLabel="Zostaw"
          danger
          onConfirm={handleConfirmRemoveSet}
          onCancel={() => setPendingSetRemoval(null)}
        />
      )}
      </div>
    </div>
  )
}
