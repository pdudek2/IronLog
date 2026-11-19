import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, ChevronLeft, ChevronRight, Ellipsis, Plus, Trash2 } from 'lucide-react'
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
import { CollapsedExercise, GroupBlock, SessionTimeLine } from '../components/workout/SessionList'
import { MEMBER_LETTERS } from '../components/workout/sessionHelpers'
import ExercisePicker from '../components/ExercisePicker'
import BottomSheet from '../components/BottomSheet'
import SessionCutSheet from '../components/SessionCutSheet'
import ConfirmDialog from '../components/ConfirmDialog'
import { Bone, PageSkeleton } from '../components/ui'
import { readProgressionSessions } from '../lib/overloadService'
import { getTemplate, type WorkoutTemplate } from '../lib/templateService'
import { getReadiness } from '../lib/readinessService'
import { computeReadinessScore, todayKey } from '../shared/readiness'
import { buildProgression, planTarget, sessionHint, type ProgressionSession } from '../shared/progression'
import { exercises as exerciseDb } from '../data/exercises'
import { isActiveSessionStale } from '../lib/sessionDuration'
import WorkoutSetPanel from '../components/workout/WorkoutSetPanel'
import { formatCompactVolume, kgToDisplayWeight } from '../lib/weightUnits'
import { completedSetError, MAX_SESSION_EXERCISES, needsWeightConfirm } from '../shared/workoutLimits'
import { lastSessionBest, weightSlip } from '../shared/setInput'
import {
  EXERCISE_CATEGORY_LABELS,
} from '../lib/exerciseLabels'
import { useMobileInteraction } from '../components/MobileInteractionProvider'
import { ElapsedSessionTimer } from '../components/ActiveWorkoutReturnBar'

import { WORKOUT_LABELS, EQUIPMENT_LABELS, parseWeight, parseReps, calcSetVolume, focusExerciseIndex, nextGroupMember, panelSetIndex, removeSetMessage, restAfterSet, sessionBlocks, upNextQueue } from '../shared/workoutDisplay'
import { catalogueMeta, sessionRoles } from '../shared/nextSessionRecommendation'

type PendingSetRemoval = { exerciseClientId: string; setClientId: string; done: boolean }

interface RestTimerBarProps {
  rest: { startedAt: number; totalSec: number }
  onAddTime: (deltaSec: number) => void
  onSkip: () => void
  variant?: 'full' | 'compact'
  next: string
}

function RestTimerBar({ rest, onAddTime, onSkip, variant = 'full', next }: RestTimerBarProps) {
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
              <span style={{ color: 'var(--muted)' }}>Rest</span>
              <span className="rest-timer-value tabular-nums">
                {Math.floor(restRemainingSec / 60)}:{String(restRemainingSec % 60).padStart(2, '0')}
              </span>
              <small className="rest-timer-next">then {next}</small>
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
// Finish works from any scroll position, but the closure banners sit at the top of the page.
function revealClosureAlert(alert: HTMLDivElement | null) {
  alert?.scrollIntoView?.({ block: 'center' })
  alert?.focus({ preventScroll: true })
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
  const units = profile?.units ?? 'kg'
  const {
    active,
    restTimer: rest,
    setLabel,
    addExercise,
  } = useWorkoutStore()
  const navigate = useNavigate()
  const location = useLocation()
  const routeState = location.state as { startNew?: unknown; launched?: unknown } | null
  const shouldStartFromRoute = routeState?.startNew === true
  // A plan just started on Train is already in the store, so it shows (locked) while the session is confirmed.
  const justLaunched = routeState?.launched === true
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
  const scrolledBlockRef = useRef<string | null>(null)
  const [lastLogged, setLastLogged] = useState<{ exerciseId: string; setIndex: number; draw: boolean } | null>(null)
  const [manualExerciseClientId, setManualExerciseClientId] = useState<string | null>(null)
  const [selectedSet, setSelectedSet] = useState<{ exerciseId: string; setId: string } | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const keepTrainingRef = useRef<HTMLButtonElement>(null)
  const [sessionSheet, setSessionSheet] = useState<'options' | 'type' | null>(null)
  const [cutOpen, setCutOpen] = useState(false)
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
  const [histories, setHistories] = useState<Record<string, ProgressionSession[]>>({})
  const [sessionTemplate, setSessionTemplate] = useState<{ id: string; template: WorkoutTemplate | null } | null>(null)
  // null until today's readiness is read, so a raise never flashes before a low entry arrives.
  const [lowReadiness, setLowReadiness] = useState<boolean | null>(null)
  const [dismissedHints, setDismissedHints] = useState<Set<string>>(new Set())
  const fetchedKeys = useRef(new Set<string>())

  useEffect(() => {
    if (!ready || (!shouldStartFromRoute && !justLaunched)) return
    navigate(location.pathname, { replace: true, state: null })
    if (shouldStartFromRoute && !active) void startNewSession()
  }, [active, justLaunched, location.pathname, navigate, ready, shouldStartFromRoute, startNewSession])

  const handleToggleSet = useCallback(function toggleSet(exerciseIndex: number, setIndex: number, confirmed = false) {
    const { active: currentActive, toggleSetDone } = useWorkoutStore.getState()
    const currentSet = currentActive?.exercises[exerciseIndex]?.sets[setIndex]
    const wasNotDone = currentSet && !currentSet.done
    // The toast's action comes later; a set logged in between must not be unticked by it.
    if (confirmed && !wasNotDone) return
    const completesExercise = wasNotDone && currentActive?.exercises[exerciseIndex]?.sets.every(
      (set, index) => index === setIndex || set.done,
    )
    const completedSets = currentActive?.exercises[exerciseIndex]?.sets.filter((set) => set.done).length ?? 0
    const error = wasNotDone ? completedSetError(currentSet, completedSets) : null
    if (error) {
      toast.error(error)
      return
    }
    const userMeta = new Map(userExercises.map((entry) => [`user:${entry.id}`, entry]))
    const loggedExercise = currentActive?.exercises[exerciseIndex]
    const history = loggedExercise && histories[`${loggedExercise.exerciseSource}:${loggedExercise.exerciseId}`]
    const slip = wasNotDone && !confirmed && loggedExercise ? weightSlip(currentSet.weight, history && lastSessionBest(history), units) : null
    const unweighted = wasNotDone && !confirmed && loggedExercise
      && needsWeightConfirm(currentSet, { exerciseId: loggedExercise.exerciseId, ...catalogueMeta(loggedExercise.exerciseId, loggedExercise.exerciseSource, userMeta) })
    if (loggedExercise && currentSet && (unweighted || slip)) {
      // Indexes can shift before the tap (a removed set, a cut, a sync), so the action finds the same set again.
      const exerciseKey = getExerciseClientId(loggedExercise, exerciseIndex)
      const setKey = currentSet.clientId
      const logAnyway = () => {
        const exercises = useWorkoutStore.getState().active?.exercises ?? []
        const at = exercises.findIndex((exercise, index) => getExerciseClientId(exercise, index) === exerciseKey)
        const setAt = at >= 0 ? exercises[at]!.sets.findIndex((set, index) => (setKey ? set.clientId === setKey : index === setIndex)) : -1
        if (setAt >= 0) toggleSet(at, setAt, true)
      }
      if (unweighted) toast('No weight entered. Log this set without weight?', { id: 'log-without-weight', action: { label: 'Log without weight', onClick: logAnyway } })
      else if (slip) toast(`${slip.title} ${slip.message}`, {
        id: 'log-weight-slip',
        action: { label: 'Log anyway', onClick: logAnyway },
        cancel: { label: 'Fix', onClick: () => document.querySelector<HTMLInputElement>('.workout-set-panel input[role="spinbutton"]')?.focus() },
      })
      return
    }
    toggleSetDone(exerciseIndex, setIndex)
    if (wasNotDone) {
      const next = useWorkoutStore.getState().active
      const rest = next ? restAfterSet(next.exercises, exerciseIndex, sessionRoles(next.exercises, userMeta), next.compression?.shortRest === true) : 0
      if (rest > 0) useWorkoutStore.getState().startRestTimer(rest)
      else useWorkoutStore.getState().clearRestTimer()
      const exercise = currentActive?.exercises[exerciseIndex]
      if (exercise) {
        const exerciseId = getExerciseClientId(exercise, exerciseIndex)
        setLastLogged({ exerciseId, setIndex, draw: true })
        // The next exercise waits for "Go to", so the logged set and Undo stay on screen; a pair or circuit moves on by itself.
        // Inside an open round the next member takes the screen, even if this one was picked with Go to.
        const partner = next ? nextGroupMember(next.exercises, exerciseIndex) : null
        if (next && partner !== null && partner !== exerciseIndex) setManualExerciseClientId(getExerciseClientId(next.exercises[partner]!, partner))
        else if (completesExercise) setManualExerciseClientId(exerciseId)
      }
      setSelectedSet(null)
      if ('vibrate' in navigator) navigator.vibrate(12)
    } else {
      useWorkoutStore.getState().clearRestTimer()
    }
  }, [histories, units, userExercises])

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
    setPendingSetRemoval({ exerciseClientId: exercise.clientId, setClientId: set.clientId, done: set.done })
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
    readProgressionSessions(uid, exerciseId, source as 'global' | 'user')
      .then((sessions) => setHistories((prev) => ({ ...prev, [key]: sessions })))
      .catch((error) => { console.error('[overloadService] query failed', error); fetchedKeys.current.delete(key) })
  }

  const templateId = active?.templateId ?? null
  useEffect(() => {
    if (!templateId) return
    let current = true
    getTemplate(templateId).then(
      (template) => { if (current) setSessionTemplate({ id: templateId, template }) },
      () => { if (current) setSessionTemplate({ id: templateId, template: null }) },
    )
    return () => { current = false }
  }, [templateId])

  useEffect(() => {
    if (!user) return
    let current = true
    getReadiness(user.uid, todayKey()).then((entry) => {
      if (current) setLowReadiness(entry !== null && computeReadinessScore(entry).tone === 'low')
    }, () => { if (current) setLowReadiness(false) })
    return () => { current = false }
  }, [user])

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

  // The exercise's ⋯: removing is the one action there, and it always asks.
  const handleRemoveExercise = useCallback((exerciseIndex: number) => {
    const currentActive = useWorkoutStore.getState().active
    const exercise = currentActive?.exercises[exerciseIndex]
    if (!exercise) return
    if (!exercise.clientId) {
      toast.error('Could not prepare to safely remove this exercise. Refresh the view and try again.')
      return
    }
    setPendingExerciseRemoval({ sessionId: currentActive.sessionId, exerciseClientId: exercise.clientId })
  }, [])

  function handleConfirmRemoveExercise() {
    if (!pendingExerciseRemoval) return
    const { active: currentActive, removeExercise } = useWorkoutStore.getState()
    const index = currentActive?.sessionId === pendingExerciseRemoval.sessionId
      ? currentActive.exercises.findIndex((exercise) => exercise.clientId === pendingExerciseRemoval.exerciseClientId)
      : -1
    if (index >= 0) removeExercise(index)
    setPendingExerciseRemoval(null)
  }

  const handleApplySuggestion = useCallback((exerciseIndex: number, hintKey: string, values: { weight?: number; reps?: number }) => {
    useWorkoutStore.getState().applyOverload(exerciseIndex, values)
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

  const confirming = !ready && justLaunched && active !== null
  if (!ready && !confirming) {
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

  if (staleSession && !confirming) {
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
  const panelIndex = manualIndex >= 0 ? manualIndex : focusedIndex
  const panelExercise = panelIndex >= 0 ? active.exercises[panelIndex] ?? null : null
  const currentExerciseClientId = panelExercise ? getExerciseClientId(panelExercise, panelIndex) : null
  const selectedSetId = selectedSet?.exerciseId === currentExerciseClientId ? selectedSet?.setId ?? null : null
  const currentSetIndex = panelExercise ? panelSetIndex(panelExercise.sets, selectedSetId) : -1
  const queue = upNextQueue(active.exercises, panelIndex)
  const nextExerciseIndex = queue[0] ?? -1
  const blocks = sessionBlocks(active.exercises)
  const currentBlock = blocks.find((block) => block.kind === 'group' ? block.indices.includes(panelIndex) : block.index === panelIndex)
  const currentBlockKey = currentBlock ? currentBlock.kind === 'group' ? `group:${currentBlock.group}` : currentExerciseClientId : null
  // A newly current exercise or group is brought just under the header; the first one only when it is not at the top.
  const currentBlockRef = (node: HTMLDivElement | null) => {
    if (!node || scrolledBlockRef.current === currentBlockKey) return
    const first = scrolledBlockRef.current === null
    scrolledBlockRef.current = currentBlockKey
    if (!first || blocks[0] !== currentBlock) node.scrollIntoView?.({ block: 'start', behavior: first ? 'auto' : 'smooth' })
  }
  const goToExercise = (index: number) => {
    const exercise = active.exercises[index]
    if (!exercise) return
    setManualExerciseClientId(getExerciseClientId(exercise, index))
    setSelectedSet(null)
    setLastLogged((logged) => logged && { ...logged, draw: false })
  }
  const selectMemberSet = (index: number, setIndex: number) => {
    const exercise = active.exercises[index]
    const set = exercise?.sets[setIndex]
    if (!exercise || !set) return
    const clientId = getExerciseClientId(exercise, index)
    setManualExerciseClientId(clientId)
    setSelectedSet({ exerciseId: clientId, setId: set.clientId ?? String(setIndex) })
  }
  const userExerciseMeta = new Map(userExercises.map((entry) => [`user:${entry.id}`, entry]))
  const metaLine = (exercise: WorkoutExercise) => {
    const meta = exerciseCatalog.get(exercise.exerciseId)
    const category = meta?.category ? (EXERCISE_CATEGORY_LABELS[meta.category] ?? meta.category) : undefined
    const equipment = meta?.equipment ? (EQUIPMENT_LABELS[meta.equipment] ?? meta.equipment) : undefined
    return [category, equipment].filter(Boolean).join(' · ') || null
  }
  const panelSet = (currentSetIndex >= 0 ? panelExercise?.sets[currentSetIndex] : null) ?? null
  // The panel names the exercise and set its numbers go to; in a pair or circuit, the member and its round.
  const panelTitle = (() => {
    if (!panelExercise || !panelSet) return 'All sets done'
    if (currentBlock?.kind === 'group') {
      const rounds = Math.max(...currentBlock.indices.map((index) => active.exercises[index]?.sets.length ?? 0))
      return `${MEMBER_LETTERS[currentBlock.indices.indexOf(panelIndex)] ?? '?'} · ${panelExercise.name} · ${panelSet.done ? 'editing ' : ''}round ${currentSetIndex + 1} of ${rounds}`
    }
    return `${panelExercise.name} · ${panelSet.done ? 'editing ' : ''}set ${currentSetIndex + 1} of ${panelExercise.sets.length}`
  })()
  const setPanel = panelExercise && (
    <WorkoutSetPanel
      exerciseIndex={panelIndex}
      exerciseName={panelExercise.name}
      title={panelTitle}
      set={panelSet}
      setIndex={currentSetIndex}
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
          next={panelSet ? panelTitle : nextExerciseIndex >= 0 ? active.exercises[nextExerciseIndex]?.name ?? 'the next exercise' : 'Finish'}
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
  const ledgerItem = (exercise: WorkoutExercise, index: number) => {
    const clientId = getExerciseClientId(exercise, index)
    const exerciseMeta = exerciseCatalog.get(exercise.exerciseId)
    const historyKey = `${exercise.exerciseSource}:${exercise.exerciseId}`
    const hint = sessionHint(
      histories[historyKey] && lowReadiness !== null && (!templateId || sessionTemplate?.id === templateId) ? buildProgression({
        sessions: histories[historyKey],
        target: planTarget(templateId ? sessionTemplate?.template : null, exercise.exerciseId, exercise.exerciseSource, active?.planDayId),
        equipment: exerciseMeta?.equipment,
        category: exerciseMeta?.category,
        units,
        lowReadiness,
        now: Date.now(),
      }) : null,
      exercise.sets,
      units,
      exerciseMeta?.equipment,
    )
    // A trial announces itself and then proposes a weight; dismissing one must not hide the next.
    const hintKey = `${historyKey}|${hint?.label ?? ''}`
    return (
      <WorkoutExerciseLedgerItem
        key={clientId}
        exerciseClientId={clientId}
        exerciseIndex={index}
        fallbackExercise={exerciseSnapshotByClientId.get(clientId) ?? exercise}
        categoryLabel={exerciseMeta?.category ? (EXERCISE_CATEGORY_LABELS[exerciseMeta.category] ?? exerciseMeta.category) : undefined}
        equipmentLabel={exerciseMeta?.equipment ? (EQUIPMENT_LABELS[exerciseMeta.equipment] ?? exerciseMeta.equipment) : undefined}
        panelSetIndex={currentSetIndex}
        inlinePanel={isDesktop ? setPanel : undefined}
        hintDismissed={dismissedHints.has(hintKey)}
        hintKey={hintKey}
        suggestion={hint}
        units={units}
        userId={user?.uid}
        onAddSet={handleAddSet}
        onApplySuggestion={handleApplySuggestion}
        onDismissSuggestion={handleDismissSuggestion}
        drawnSetIndex={lastLogged?.draw && lastLogged.exerciseId === clientId ? lastLogged.setIndex : null}
        onRemoveExercise={handleRemoveExercise}
        onRemoveSet={handleRemoveSet}
        onSelectSet={(setIndex) => {
          const set = exercise.sets[setIndex]
          if (set) setSelectedSet({ exerciseId: clientId, setId: set.clientId ?? String(setIndex) })
        }}
        onToggleSet={handleToggleSet}
      />
    )
  }
  const sessionHeader = (
    <div className="workout-session-header">
      <button
        type="button"
        className="workout-back"
        onClick={() => navigate('/dashboard')}
        disabled={closureLocked}
        aria-label="Back to Train"
        aria-describedby="workout-back-help"
      >
        <ChevronLeft size={20} aria-hidden="true" />
      </button>
      <span id="workout-back-help" className="sr-only">Your workout keeps running</span>
      <span className="workout-session-title">
        <strong>{activeLabel}</strong>
        <small className="tabular-nums">
          <ElapsedSessionTimer startedAt={active.startedAt} />
          {totalSets > 0 && ` · ${completedSets} of ${totalSets} ${pluralize(totalSets, 'set', 'sets')}`}
        </small>
      </span>
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
        className="workout-desktop-finish"
        onClick={handleFinish}
        disabled={saving}
        whileTap={{ scale: 0.95 }}
      >
        {saving ? '...' : 'Finish'}
      </motion.button>
    </div>
  )

  return (
    <div
      className="workout-focus-shell"
      role="region"
      aria-label={`Active session: ${activeLabel}`}
      data-panel={setPanel && !isDesktop ? true : undefined}
    >
      {closureState !== 'active_session_changed' && (
        <ActiveSessionSyncStatus
          status={activeSessionSyncStatus}
          onRetry={() => { void retryActiveSessionSync() }}
          onReload={() => { void reloadCurrentSession() }}
        />
      )}
      {closureState === 'active_session_changed' && (
        <div className="surface-panel mb-4 rounded-[var(--radius-xl)] border p-4" role="alert" ref={revealClosureAlert} tabIndex={-1} style={{ borderColor: 'var(--danger)' }}>
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
        <div className="surface-panel mb-4 rounded-[var(--radius-xl)] border p-4" role="alert" ref={revealClosureAlert} tabIndex={-1} style={{ borderColor: 'var(--danger)' }}>
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
        <div className="surface-panel mb-4 rounded-[var(--radius-xl)] border p-4" role="alert" ref={revealClosureAlert} tabIndex={-1} style={{ borderColor: 'var(--danger)' }}>
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
        <div className="surface-panel mb-4 rounded-[var(--radius-xl)] border p-4" role="alert" ref={revealClosureAlert} tabIndex={-1} style={{ borderColor: 'var(--danger)' }}>
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
        <div className="surface-panel mb-4 rounded-[var(--radius-xl)] border p-4" role="alert" ref={revealClosureAlert} tabIndex={-1} style={{ borderColor: 'var(--danger)' }}>
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
        <div className="surface-panel mb-4 rounded-[var(--radius-xl)] border p-4" role="alert" ref={revealClosureAlert} tabIndex={-1} style={{ borderColor: 'var(--danger)' }}>
          <p className="text-sm font-semibold text-white">The server did not accept this workout.</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            {closureRejection ?? 'Some of its data is invalid.'} Correct it and try again.
          </p>
        </div>
      )}

      {closureState === 'closure_failed' && (
        <div className="surface-panel mb-4 rounded-[var(--radius-xl)] border p-4" role="alert" ref={revealClosureAlert} tabIndex={-1} style={{ borderColor: 'var(--danger)' }}>
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

      <div className="contents" inert={closureLocked || confirming ? true : undefined}>

      <div className="workout-session-top">
        {sessionHeader}
        {active.exercises.length > 0 && (
          <>
            <div className="workout-progress" aria-hidden="true"><i style={{ width: `${totalSets ? completedSets / totalSets * 100 : 0}%` }} /></div>
            <SessionTimeLine session={active} userExercises={userExerciseMeta} onOpen={() => setCutOpen(true)} />
          </>
        )}
      </div>

      <div className="workout-session-grid">
        <div className="workout-session-list min-w-0">
          {active.exercises.length === 0 ? (
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
          ) : (
            <div className="workout-exercise-stack">
              {blocks.map((block) => {
                if (block.kind === 'group') {
                  const key = `group:${block.group}`
                  return (
                    <div key={key} className="workout-block" ref={key === currentBlockKey ? currentBlockRef : undefined}>
                      <GroupBlock
                        session={active}
                        indices={block.indices}
                        currentIndex={panelIndex}
                        panelSet={currentSetIndex}
                        units={units}
                        userId={user?.uid}
                        userExercises={userExerciseMeta}
                        metaOf={metaLine}
                        inlinePanel={isDesktop ? setPanel : undefined}
                        drawnSetId={lastLogged?.draw ? active.exercises.find((exercise, index) => getExerciseClientId(exercise, index) === lastLogged.exerciseId)?.sets[lastLogged.setIndex]?.clientId ?? null : null}
                        onSelect={selectMemberSet}
                        onRemove={handleRemoveExercise}
                        onAddRound={(indices) => {
                          indices.forEach((index) => useWorkoutStore.getState().addSet(index))
                          if ('vibrate' in navigator) navigator.vibrate(8)
                        }}
                      />
                    </div>
                  )
                }
                const exercise = active.exercises[block.index]!
                const clientId = getExerciseClientId(exercise, block.index)
                return block.index === panelIndex ? (
                  <div key={clientId} className="workout-block" ref={currentBlockRef}>{ledgerItem(exercise, block.index)}</div>
                ) : (
                  <CollapsedExercise key={clientId} exercise={exercise} units={units} onOpen={() => goToExercise(block.index)} />
                )
              })}
              <button ref={addExerciseRef} type="button" className="workout-list-add" onClick={() => setShowPicker(true)}>
                <Plus size={15} strokeWidth={2.4} aria-hidden="true" />
                Add exercise
              </button>
            </div>
          )}
        </div>
      </div>

      {!isDesktop && setPanel}

      <AnimatePresence>
        {sessionSheet && (
          <BottomSheet
            key="session-sheet"
            title={sessionSheet === 'type' ? 'Session type' : 'Workout options'}
            description={sessionSheet === 'options' && isDesktop ? (
              <span className="workout-options-summary tabular-nums">
                {active.exercises.length} {pluralize(active.exercises.length, 'exercise', 'exercises')} · {completedSets}/{totalSets} sets · {formatCompactVolume(totalVolume, units)}
                {strongestSet ? ` · heaviest ${kgToDisplayWeight(strongestSet, units)} ${units}` : ''}
              </span>
            ) : undefined}
            onClose={() => setSessionSheet(null)}
          >
            {sessionSheet === 'type' ? (
              WORKOUT_LABELS.map((label) => (
                <button
                  key={label}
                  type="button"
                  className="bottom-sheet-row"
                  aria-pressed={active.label === label}
                  onClick={() => { setLabel(active.label === label ? '' : label); setSessionSheet('options') }}
                >
                  <span>{label}</span>
                  {active.label === label && <Check size={16} aria-hidden="true" />}
                </button>
              ))
            ) : (
              <>
                <button type="button" className="bottom-sheet-row" onClick={() => { setSessionSheet(null); setShowPicker(true) }}>
                  <span>Add exercise</span>
                  <Plus size={16} aria-hidden="true" />
                </button>
                <button type="button" className="bottom-sheet-row" onClick={() => setSessionSheet('type')}>
                  <span>Session type</span>
                  <small>{active.label || 'None'}</small>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
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

      <AnimatePresence>
        {cutOpen && (
          <SessionCutSheet
            key="cut-sheet"
            session={active}
            userExercises={new Map(userExercises.map((entry) => [`user:${entry.id}`, entry]))}
            disabled={closureLocked}
            onCut={(choice, now) => useWorkoutStore.getState().cutRest(choice, now, new Map(userExercises.map((entry) => [`user:${entry.id}`, entry])))}
            onFinish={handleFinish}
            onClose={() => setCutOpen(false)}
          />
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

      <AnimatePresence>
        {pendingFinishMatches && (
          <BottomSheet
            key="finish-sheet"
            title="Finish workout?"
            description={`${completedSets} ${pluralize(completedSets, 'set', 'sets')} logged, ${unfinishedSets} not logged. Only logged sets are saved.`}
            initialFocusRef={keepTrainingRef}
            onClose={() => setPendingFinish(null)}
          >
            <div className="finish-sheet-actions">
              <button
                type="button"
                className="dialog-action"
                disabled={closureLocked}
                onClick={() => {
                  setPendingFinish(null)
                  if (pendingFinish) handleConfirmFinish(pendingFinish)
                }}
              >
                Save {completedSets} {pluralize(completedSets, 'set', 'sets')} and finish
              </button>
              <button ref={keepTrainingRef} type="button" className="dialog-action" data-quiet onClick={() => setPendingFinish(null)}>
                Keep training
              </button>
            </div>
          </BottomSheet>
        )}
      </AnimatePresence>

      {pendingExerciseRemoval !== null && (() => {
        const exercise = active.exercises.find((candidate) => candidate.clientId === pendingExerciseRemoval.exerciseClientId)
        const entered = exercise?.sets.some((set) => set.done || set.weight.trim() !== '' || set.reps.trim() !== '')
        return (
        <ConfirmDialog
          title={exercise ? `Remove ${exercise.name}?` : 'Remove exercise?'}
          message={entered ? 'Remove this exercise and its sets from the active session?' : 'Remove this exercise from the active session?'}
          confirmLabel="Remove exercise"
          cancelLabel="Keep"
          danger
          onConfirm={handleConfirmRemoveExercise}
          onCancel={() => setPendingExerciseRemoval(null)}
        />
        )
      })()}
      {pendingSetRemoval && (
        <ConfirmDialog
          title="Remove set?"
          message={removeSetMessage(pendingSetRemoval.done)}
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
