import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronRight,
  Play,
  Plus,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import ReadinessWidget from '../components/ReadinessWidget'
import NextSessionCard from '../components/NextSessionCard'
import ConfirmDialog from '../components/ConfirmDialog'
import TemplateLaunchConfirmDialog from '../components/TemplateLaunchConfirmDialog'
import { ActionFeedback } from '../components/ActionFeedback'
import WorkoutProjectionStatus, {
  type ProjectionRetryState,
} from '../components/workout/WorkoutProjectionStatus'
import { Button, LoadingState } from '../components/ui'
import {
  getTemplates,
  type WorkoutTemplate,
} from '../lib/templateService'
import type { ReadinessEntry } from '../lib/readinessService'
import { useTemplateWorkoutLaunch } from '../hooks/useTemplateWorkoutLaunch'
import { usePassiveActiveSessionSync } from '../hooks/usePassiveActiveSessionSync'
import { preloadRouteByPath } from '../router/pageLoaders'
import {
  getRecentWorkouts, deleteWorkout, retryWorkoutMaterialization, countWeeklyWorkouts,
  calcStreak, calcVolume, type WorkoutSummary,
} from '../lib/workoutService'
import {
  clearWorkoutDeleteRecovery,
  readWorkoutDeleteRecovery,
  writeWorkoutDeleteRecovery,
} from '../lib/workoutDeleteRecovery'
import { hasActiveSessionWork } from '../lib/activeSessionService'
import { getCappedWorkoutFinishedAt } from '../lib/sessionDuration'
import { polishPlural } from '../lib/polishPlural'
import {
  DEFAULT_EXERCISE_CATEGORY_COLOR,
  EXERCISE_CATEGORY_COLORS,
} from '../lib/exerciseLabels'
import { exercises as exerciseDb } from '../data/exercises'
import { useAuthStore } from '../store/authStore'
import { useDashboardStore } from '../store/dashboardStore'
import { useProfileStore } from '../store/profileStore'
import { useWorkoutStore } from '../store/workoutStore'
import type { DataState } from '../types/dataState'

interface TemplatesResource {
  uid: string | null
  state: DataState<WorkoutTemplate[]>
}

interface WorkoutDeleteOperation {
  workoutId: string
  status: 'pending' | 'cleanup_pending' | 'error'
}

interface ReadinessResource {
  uid: string | null
  state: DataState<ReadinessEntry | null>
}

const WEEK_LABELS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd']
const exerciseMap = new Map(exerciseDb.map((exercise) => [exercise.id, exercise]))

function workoutAccent(workout: WorkoutSummary): string {
  const firstExercise = workout.exercises[0]
  if (!firstExercise?.exerciseId) return DEFAULT_EXERCISE_CATEGORY_COLOR
  const category = exerciseMap.get(firstExercise.exerciseId)?.category
  return EXERCISE_CATEGORY_COLORS[category ?? ''] ?? DEFAULT_EXERCISE_CATEGORY_COLOR
}

function workoutTitle(workout: WorkoutSummary): string {
  const names = workout.exercises.map((exercise) => exercise.name)
  if (!names.length) return 'Trening'
  if (names.length <= 2) return names.join(' + ')
  return `${names[0]} +${names.length - 1}`
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('pl-PL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function formatDuration(start: number, end: number): string {
  const cappedEnd = getCappedWorkoutFinishedAt(start, end)
  const minutes = Math.round((cappedEnd - start) / 60_000)
  if (minutes < 1) return '< 1 min'
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function formatCompactVolume(volume: number): string {
  if (!volume) return '0 kg'
  if (volume >= 10_000) return `${Math.round(volume / 1_000)}k kg`
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(1)}k kg`
  return `${Math.round(volume).toLocaleString('pl-PL')} kg`
}

function formatExerciseCount(count: number): string {
  return `${count} ${polishPlural(count, 'ćwiczenie', 'ćwiczenia', 'ćwiczeń')}`
}

function formatWeekRange(dates: Date[]): string {
  if (!dates.length) return ''
  const start = dates[0]
  const end = dates[dates.length - 1]
  const sameMonth = start.getMonth() === end.getMonth()
  const startMonth = start.toLocaleDateString('pl-PL', { month: 'short' })
  const endMonth = end.toLocaleDateString('pl-PL', { month: 'short' })
  return sameMonth
    ? `${start.getDate()}–${end.getDate()} ${endMonth}`
    : `${start.getDate()} ${startMonth} – ${end.getDate()} ${endMonth}`
}

function getWeekDates(): Date[] {
  const today = new Date()
  const monday = new Date(today)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    return date
  })
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return 'Dobranoc'
  if (hour < 12) return 'Dzień dobry'
  if (hour < 18) return 'Cześć'
  return 'Dobry wieczór'
}

function fadeUp(delay: number) {
  return {
    initial: false,
    animate: { opacity: 1, y: 0 },
    transition: { delay: delay > 0 ? 0.04 : 0, duration: 0.22 },
  }
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  usePassiveActiveSessionSync(user?.uid)
  const { profile } = useProfileStore()
  const active = useWorkoutStore((state) => state.active)
  const navigate = useNavigate()
  const {
    pendingLaunch,
    launchOperation,
    launchingTemplateId,
    requestTemplateLaunch,
    confirmTemplateLaunch,
    cancelTemplateLaunch,
    retryTemplateLaunch,
    dismissTemplateLaunchError,
  } = useTemplateWorkoutLaunch(user?.uid)
  const {
    workouts,
    weeklyDone,
    ready: dashboardReady,
    setSnapshot,
  } = useDashboardStore()
  const [transientDeleteOperation, setTransientDeleteOperation] = useState<WorkoutDeleteOperation | null>(null)
  const [openingWorkout, setOpeningWorkout] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [templatesResource, setTemplatesResource] = useState<TemplatesResource>({
    uid: user?.uid ?? null,
    state: { status: 'loading' },
  })
  const [readinessResource, setReadinessResource] = useState<ReadinessResource>({
    uid: user?.uid ?? null,
    state: { status: 'loading' },
  })
  const [dashboardError, setDashboardError] = useState(false)
  const [dashboardLoadAttempt, setDashboardLoadAttempt] = useState(0)
  const [projectionRetryStates, setProjectionRetryStates] = useState<Record<string, ProjectionRetryState>>({})
  const workoutsRef = useRef<WorkoutSummary[]>([])
  const snapshotRequestRef = useRef(0)
  const materializationRetriesRef = useRef(new Map<string, Promise<void>>())
  const templatesMountedRef = useRef(false)
  const templatesRequestRef = useRef(0)
  const requestedTemplatesUserRef = useRef<string | null>(null)
  const inFlightTemplatesUserRef = useRef<string | null>(null)
  const persistedDeleteRecovery = user?.uid ? readWorkoutDeleteRecovery(user.uid) : null
  const deleteOperation = transientDeleteOperation
    ?? (
      persistedDeleteRecovery
        ? { workoutId: persistedDeleteRecovery.workoutId, status: 'cleanup_pending' as const }
        : null
    )

  const loadTemplates = useCallback((uid: string) => {
    if (inFlightTemplatesUserRef.current === uid) return
    const requestId = ++templatesRequestRef.current
    inFlightTemplatesUserRef.current = uid

    getTemplates(uid)
      .then((data) => {
        if (!templatesMountedRef.current || requestId !== templatesRequestRef.current) return
        setTemplatesResource({ uid, state: { status: 'success', data } })
      })
      .catch((error: unknown) => {
        if (!templatesMountedRef.current || requestId !== templatesRequestRef.current) return
        console.error('[DashboardPage] getTemplates failed', error)
        toast.error('Nie udało się wczytać szablonów.')
        setTemplatesResource({ uid, state: { status: 'error', error } })
      })
      .finally(() => {
        if (requestId === templatesRequestRef.current) inFlightTemplatesUserRef.current = null
      })
  }, [])

  const retryProjectionOnce = useCallback((workoutId: string): Promise<void> => {
    const existingRetry = materializationRetriesRef.current.get(workoutId)
    if (existingRetry) return existingRetry

    const retry = Promise.resolve()
      .then(() => retryWorkoutMaterialization(workoutId))
      .finally(() => {
        if (materializationRetriesRef.current.get(workoutId) === retry) {
          materializationRetriesRef.current.delete(workoutId)
        }
      })
    materializationRetriesRef.current.set(workoutId, retry)
    return retry
  }, [])

  const markProjectionRetriesFailed = useCallback((workoutIds: string[]) => {
    const pendingIds = new Set(
      workoutsRef.current
        .filter((workout) => !workout.materialized)
        .map((workout) => workout.id),
    )
    const failedIds = workoutIds.filter((workoutId) => pendingIds.has(workoutId))
    if (failedIds.length === 0) return
    setProjectionRetryStates((current) => ({
      ...current,
      ...Object.fromEntries(failedIds.map((workoutId) => [workoutId, 'failed'])),
    }))
  }, [])

  const setDashboardSnapshot = useCallback((all: WorkoutSummary[]) => {
    setSnapshot({
      workouts: all,
      weeklyDone: countWeeklyWorkouts(all),
      streak: calcStreak(all),
    })
    workoutsRef.current = all
  }, [setSnapshot])

  const refreshDashboardSnapshot = useCallback(async (uid: string): Promise<WorkoutSummary[] | null> => {
    const requestId = ++snapshotRequestRef.current
    const all = await getRecentWorkouts(uid, 50)
    if (requestId !== snapshotRequestRef.current) return null

    setDashboardSnapshot(all)
    setProjectionRetryStates((current) => {
      const pendingIds = new Set(
        all.filter((workout) => !workout.materialized).map((workout) => workout.id),
      )
      const next: Record<string, ProjectionRetryState> = {}
      Object.entries(current).forEach(([workoutId, state]) => {
        if (pendingIds.has(workoutId)) next[workoutId] = state
      })
      return next
    })
    return all
  }, [setDashboardSnapshot])

  const retryPendingProjections = useCallback(async (
    uid: string,
    all: WorkoutSummary[],
  ) => {
    const pending = all.filter((workout) => !workout.materialized)
    if (pending.length === 0) return

    setProjectionRetryStates((current) => ({
      ...current,
      ...Object.fromEntries(pending.map((workout) => [workout.id, 'retrying'])),
    }))

    const results = await Promise.allSettled(
      pending.map((workout) => retryProjectionOnce(workout.id)),
    )

    const fulfilledIds = pending.flatMap((workout, index) => (
      results[index]?.status === 'fulfilled' ? [workout.id] : []
    ))
    const rejectedIds = pending.flatMap((workout, index) => (
      results[index]?.status === 'rejected' ? [workout.id] : []
    ))
    markProjectionRetriesFailed(rejectedIds)

    if (fulfilledIds.length > 0) {
      try {
        const refreshed = await refreshDashboardSnapshot(uid)
        if (!refreshed) return
        markProjectionRetriesFailed(fulfilledIds)
      } catch {
        markProjectionRetriesFailed(fulfilledIds)
      }
    }
  }, [markProjectionRetriesFailed, refreshDashboardSnapshot, retryProjectionOnce])

  const fetchData = useCallback(async (uid: string) => {
    setDashboardError(false)
    const all = await refreshDashboardSnapshot(uid)
    if (all) void retryPendingProjections(uid, all)
  }, [refreshDashboardSnapshot, retryPendingProjections])

  const handleDashboardFetchError = useCallback((error: unknown) => {
    console.error('[DashboardPage] getRecentWorkouts failed', error)
    setDashboardError(true)
    toast.error('Nie udało się wczytać treningów. Spróbuj ponownie.')
  }, [])

  useEffect(() => {
    if (!user) return
    void Promise.resolve()
      .then(() => fetchData(user.uid))
      .catch(handleDashboardFetchError)
  }, [dashboardLoadAttempt, user, fetchData, handleDashboardFetchError])

  useEffect(() => {
    function handleOnline() {
      if (user) void retryPendingProjections(user.uid, workoutsRef.current)
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [retryPendingProjections, user])

  useEffect(() => {
    if (!user) return
    templatesMountedRef.current = true
    if (requestedTemplatesUserRef.current !== user.uid) {
      requestedTemplatesUserRef.current = user.uid
      loadTemplates(user.uid)
    }
    return () => {
      templatesMountedRef.current = false
    }
  }, [loadTemplates, user])

  const hasActiveWork = useMemo(() => hasActiveSessionWork(active), [active])
  const handleReadinessStateChange = useCallback((state: DataState<ReadinessEntry | null>) => {
    setReadinessResource({ uid: user?.uid ?? null, state })
  }, [user?.uid])

  function handleDelete(id: string) {
    if (deleteOperation) return
    setConfirmDelete(id)
  }

  async function handleOpenWorkout() {
    if (openingWorkout) return
    setOpeningWorkout(true)
    try {
      await preloadRouteByPath('/workout/new')
    } finally {
      if (hasActiveWork) navigate('/workout/new')
      else navigate('/workout/new', { state: { startNew: true } })
      setOpeningWorkout(false)
    }
  }

  function openWorkout(workout: WorkoutSummary) {
    navigate(`/workout/${workout.id}`, {
      state: { workoutPreview: workout },
    })
  }

  async function handleProjectionRetry(workoutId: string) {
    if (!user || projectionRetryStates[workoutId] === 'retrying') return
    setProjectionRetryStates((current) => ({ ...current, [workoutId]: 'retrying' }))
    try {
      await retryProjectionOnce(workoutId)
      const refreshed = await refreshDashboardSnapshot(user.uid)
      if (!refreshed) return
      markProjectionRetriesFailed([workoutId])
    } catch {
      markProjectionRetriesFailed([workoutId])
    }
  }

  async function runWorkoutDelete(workoutId: string) {
    const retryingCommittedDelete = deleteOperation?.workoutId === workoutId
      && deleteOperation.status === 'cleanup_pending'
    setTransientDeleteOperation({ workoutId, status: 'pending' })
    try {
      const result = await deleteWorkout(workoutId)
      if (result.status === 'cleanup_pending') {
        if (user?.uid) writeWorkoutDeleteRecovery(user.uid, { workoutId })
        setTransientDeleteOperation({ workoutId, status: 'cleanup_pending' })
        return
      }
      if (user?.uid) clearWorkoutDeleteRecovery(user.uid)
      setDashboardSnapshot(workoutsRef.current.filter((workout) => workout.id !== workoutId))
      setTransientDeleteOperation(null)
      if (user) void fetchData(user.uid).catch(handleDashboardFetchError)
      toast.success('Trening usunięty')
    } catch {
      setTransientDeleteOperation({ workoutId, status: retryingCommittedDelete ? 'cleanup_pending' : 'error' })
      toast.error('Nie udało się usunąć treningu.')
    }
  }

  function confirmDeleteWorkout() {
    if (!confirmDelete || deleteOperation) return
    const workoutId = confirmDelete
    setConfirmDelete(null)
    void runWorkoutDelete(workoutId)
  }

  function retryWorkoutDelete() {
    if (!deleteOperation || (deleteOperation.status !== 'error' && deleteOperation.status !== 'cleanup_pending')) return
    void runWorkoutDelete(deleteOperation.workoutId)
  }

  if (dashboardError && !dashboardReady) {
    return (
      <div className="dashboard-load-state" role="alert">
        <div>
          <p className="text-lg font-semibold text-white">Nie udało się wczytać dashboardu</p>
          <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
            Dane treningów nie dotarły. Sprawdź połączenie i spróbuj ponownie.
          </p>
          <Button
            type="button"
            className="mt-5 min-w-[12rem]"
            onClick={() => setDashboardLoadAttempt((value) => value + 1)}
          >
            Spróbuj ponownie
          </Button>
        </div>
      </div>
    )
  }

  if (!dashboardReady && !!user) {
    return <LoadingState message="Ładowanie dashboardu..." />
  }

  const weeklyGoal = profile?.weeklyGoal ?? 3
  const remainingWeeklySessions = Math.max(weeklyGoal - weeklyDone, 0)
  const weekDates = getWeekDates()
  const today = new Date()
  const recentWorkouts = workouts.slice(0, 4)
  const hasDeleteRecoveryRow = deleteOperation?.status === 'cleanup_pending'
    && recentWorkouts.some((workout) => workout.id === deleteOperation.workoutId)
  const orphanedDeleteOperation = deleteOperation?.status === 'cleanup_pending' && !hasDeleteRecoveryRow
    ? deleteOperation
    : null
  const templatesState: DataState<WorkoutTemplate[]> =
    templatesResource.uid === user?.uid
      ? templatesResource.state
      : { status: 'loading' }
  const templates = templatesState.status === 'success' ? templatesState.data : []
  const recentTemplates = templates.slice(0, 3)
  const quickTemplate = recentTemplates[0] ?? null
  const quickTemplateRequestKey = quickTemplate
    ? `dashboard:${quickTemplate.id}:quick`
    : null
  const quickTemplateLaunchOperation = quickTemplateRequestKey
    && launchOperation?.target.requestKey === quickTemplateRequestKey
    ? launchOperation
    : null
  const quickTemplateLaunchErrorId = quickTemplate
    ? `dashboard-quick-template-launch-error-${quickTemplate.id}`
    : undefined
  const readinessState: DataState<ReadinessEntry | null> =
    readinessResource.uid === user?.uid
      ? readinessResource.state
      : { status: 'loading' }
  const quickTemplateHasExercises = Boolean(quickTemplate?.days[0]?.exercises.length)
  const showTodayRecommendation = !hasActiveWork
    && quickTemplateHasExercises
    && readinessState.status === 'success'
    && readinessState.data !== null

  function handleRetryTemplates() {
    if (!user) return
    requestedTemplatesUserRef.current = user.uid
    setTemplatesResource({ uid: user.uid, state: { status: 'loading' } })
    loadTemplates(user.uid)
  }
  const weekStart = weekDates[0]?.getTime() ?? 0
  const weekEnd = (weekDates[6]?.getTime() ?? 0) + 86_400_000
  const previousWeekStart = weekStart - 7 * 86_400_000
  const previousWeekEnd = weekStart
  const weeklyWorkouts = workouts.filter((workout) => workout.startedAt >= weekStart && workout.startedAt < weekEnd)
  const previousWeekWorkouts = workouts.filter((workout) => workout.startedAt >= previousWeekStart && workout.startedAt < previousWeekEnd)
  const weeklyVolume = weeklyWorkouts.reduce((sum, workout) => sum + calcVolume(workout), 0)
  const previousWeeklyVolume = previousWeekWorkouts.reduce((sum, workout) => sum + calcVolume(workout), 0)
  const previousWeeklyDone = previousWeekWorkouts.length
  const avgMinutes = weeklyWorkouts.length
    ? Math.round(weeklyWorkouts.reduce((sum, workout) => (
      sum + (getCappedWorkoutFinishedAt(workout.startedAt, workout.finishedAt) - workout.startedAt)
    ), 0) / weeklyWorkouts.length / 60_000)
    : 0
  const avgVolumePerSession = weeklyWorkouts.length ? Math.round(weeklyVolume / weeklyWorkouts.length) : 0
  const weeklySessionsDelta = weeklyDone - previousWeeklyDone
  const weeklyVolumeDelta = previousWeeklyVolume > 0
    ? Math.round(((weeklyVolume - previousWeeklyVolume) / previousWeeklyVolume) * 100)
    : null
  const weekDailyStats = weekDates.map((date, index) => {
    const dayStart = date.getTime()
    const dayEnd = dayStart + 86_400_000
    const dayWorkouts = weeklyWorkouts.filter((workout) => workout.startedAt >= dayStart && workout.startedAt < dayEnd)
    const volume = dayWorkouts.reduce((sum, workout) => sum + calcVolume(workout), 0)
    const sets = dayWorkouts.reduce((sum, workout) => (
      sum + workout.exercises.reduce((innerSum, exercise) => innerSum + exercise.sets.length, 0)
    ), 0)
    return {
      label: WEEK_LABELS[index],
      date,
      volume,
      sets,
      workouts: dayWorkouts.length,
      isToday: isSameDay(date, today),
    }
  })
  const maxDayVolume = Math.max(...weekDailyStats.map((day) => day.volume), 1)
  const activeDays = weekDailyStats.filter((day) => day.workouts > 0).length
  const peakDay = [...weekDailyStats].sort((a, b) => b.volume - a.volume)[0]
  const latestWorkout = recentWorkouts[0] ?? null
  const activeExerciseCount = active?.exercises.length ?? 0
  const activeLabel = active?.label?.trim()
  const supportLine = hasActiveWork
    ? [
        `Aktywna sesja${activeLabel ? `: ${activeLabel}` : ''}`,
        activeExerciseCount > 0 ? formatExerciseCount(activeExerciseCount) : null,
      ].filter(Boolean).join(' • ')
    : latestWorkout
      ? `Ostatni trening: ${latestWorkout.label ?? workoutTitle(latestWorkout)} • ${formatDate(latestWorkout.startedAt)} • ${formatDuration(latestWorkout.startedAt, latestWorkout.finishedAt)}`
      : 'Brak zapisanych treningów.'
  const weeklySummaryRows = [
    {
      label: 'Cel tygodnia',
      value: `${weeklyDone}/${weeklyGoal}`,
      copy: weeklyDone >= weeklyGoal
        ? 'Cel zamknięty.'
        : `${remainingWeeklySessions} ${polishPlural(remainingWeeklySessions, 'sesja', 'sesje', 'sesji')} do celu w tym tygodniu.`,
    },
    {
      label: 'Rytm',
      value: `${activeDays}/7 dni`,
      copy: weeklySessionsDelta >= 0
        ? `${weeklySessionsDelta === 0 ? 'Tak samo' : `+${weeklySessionsDelta}`} względem poprzedniego tygodnia`
        : `${weeklySessionsDelta} względem poprzedniego tygodnia`,
    },
    {
      label: 'Mocny dzień',
      value: peakDay?.volume ? `${peakDay.label}` : 'Brak',
      copy: peakDay?.volume ? `${formatCompactVolume(peakDay.volume)} • ${peakDay.sets} ${polishPlural(peakDay.sets, 'seria', 'serie', 'serii')}` : 'Brak treningów w tym tygodniu',
    },
    {
      label: 'Średnia sesja',
      value: avgMinutes ? `${avgMinutes} min` : '—',
      copy: avgVolumePerSession ? `${formatCompactVolume(avgVolumePerSession)} na trening` : 'Brak średniej w tym tygodniu',
    },
  ]

  return (
    <div className="dashboard-page">
        <section className={`dashboard-home${showTodayRecommendation ? ' dashboard-home--today' : ''}`}>
          <motion.div
            className="dashboard-home-copy"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <p className="dashboard-home-date">
              {new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <p className="dashboard-home-greeting">{getGreeting()},</p>
            <h1 className="dashboard-home-title">
              {profile?.displayName ?? 'treningowcu'}
            </h1>
            <p className="dashboard-home-copyline">{supportLine}</p>

            <div className="dashboard-home-action-stack">
              <div className="dashboard-home-actions">
                <motion.button
                  type="button"
                  onClick={() => { void handleOpenWorkout().catch(() => undefined) }}
                  disabled={openingWorkout}
                  className="hero-editorial-cta"
                  whileTap={{ scale: 0.97 }}
                >
                  {hasActiveWork ? <Play size={18} strokeWidth={2.4} /> : <Plus size={18} strokeWidth={2.4} />}
                  {openingWorkout
                    ? (hasActiveWork ? 'Otwieram sesję…' : 'Otwieram trening…')
                    : (hasActiveWork ? 'Wznów trening' : 'Rozpocznij nowy trening')}
                </motion.button>

                {quickTemplate && quickTemplateRequestKey && (
                  <motion.button
                    type="button"
                    onClick={() => { void requestTemplateLaunch(quickTemplate, 0, quickTemplateRequestKey) }}
                    disabled={launchingTemplateId !== null}
                    aria-busy={quickTemplateLaunchOperation?.status === 'pending' ? 'true' : undefined}
                    aria-describedby={quickTemplateLaunchOperation?.status === 'error'
                      ? quickTemplateLaunchErrorId
                      : undefined}
                    className="dashboard-quick-plan-button"
                    whileTap={{ scale: 0.97 }}
                  >
                    <Play size={16} strokeWidth={2.3} />
                    <span>
                      <small>Szybki start z planu</small>
                      <strong>{quickTemplate.name}</strong>
                    </span>
                  </motion.button>
                )}
              </div>

              {!showTodayRecommendation
                && quickTemplateLaunchOperation?.status === 'error'
                && quickTemplateLaunchErrorId && (
                <ActionFeedback
                  id={quickTemplateLaunchErrorId}
                  status="error"
                  message={quickTemplateLaunchOperation.errorMessage ?? 'Nie udało się uruchomić planu.'}
                  onRetry={() => { void retryTemplateLaunch() }}
                  onDismiss={dismissTemplateLaunchError}
                  className="dashboard-quick-plan-feedback"
                />
              )}
            </div>
          </motion.div>

          <motion.aside
            className="dashboard-home-panel"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <ReadinessWidget
              onStateChange={handleReadinessStateChange}
              renderSaved={(entry) => (
                !hasActiveWork && quickTemplate && quickTemplateHasExercises && quickTemplateRequestKey
                  ? (
                      <NextSessionCard
                        template={quickTemplate}
                        dayIndex={0}
                        readiness={entry}
                        workouts={workouts}
                        units={profile?.units ?? 'kg'}
                        launching={launchingTemplateId === quickTemplate.id}
                        describedBy={quickTemplateLaunchOperation?.status === 'error'
                          ? quickTemplateLaunchErrorId
                          : undefined}
                        onStart={(overrides) => {
                          void requestTemplateLaunch(
                            quickTemplate,
                            0,
                            quickTemplateRequestKey,
                            overrides,
                          )
                        }}
                        onEdit={() => navigate(`/templates/${quickTemplate.id}/edit`)}
                      />
                    )
                  : null
              )}
            />

            {showTodayRecommendation
              && quickTemplateLaunchOperation?.status === 'error'
              && quickTemplateLaunchErrorId && (
              <ActionFeedback
                id={quickTemplateLaunchErrorId}
                status="error"
                message={quickTemplateLaunchOperation.errorMessage ?? 'Nie udało się uruchomić planu.'}
                onRetry={() => { void retryTemplateLaunch() }}
                onDismiss={dismissTemplateLaunchError}
                className="dashboard-quick-plan-feedback"
              />
            )}
          </motion.aside>
        </section>

        <motion.div
          className="dashboard-main-flow"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.25 }}
        >
            <section className="dashboard-overview-grid">
              <motion.div className="dashboard-week-panel" {...fadeUp(0.09)}>
                <div className="dashboard-panel-head">
                  <div>
                    <h2 className="section-title">Ten tydzień</h2>
                  </div>
                  <div className="dashboard-range-chip">
                    <span>{formatWeekRange(weekDates)}</span>
                    <small>
                      {weeklyVolumeDelta === null
                        ? 'brak porównania'
                        : `${weeklyVolumeDelta >= 0 ? '+' : ''}${weeklyVolumeDelta}% vs poprzedni tydzień`}
                    </small>
                  </div>
                </div>

                {weeklyWorkouts.length === 0 ? (
                  <div className="dashboard-week-empty">
                    <div className="dashboard-week-empty-summary">
                      <div>
                        <p className="stat-meta">Cel tygodnia</p>
                        <p className="dashboard-week-empty-title">Zacznij pierwszy trening tygodnia</p>
                        <p className="dashboard-week-empty-copy">
                          {remainingWeeklySessions} {polishPlural(remainingWeeklySessions, 'sesja', 'sesje', 'sesji')} do celu.
                        </p>
                      </div>
                      <strong>{weeklyDone}/{weeklyGoal}</strong>
                    </div>

                    <div className="dashboard-week-empty-days" aria-label="Dni bieżącego tygodnia">
                      {weekDailyStats.map((day) => (
                        <span key={day.label} data-today={day.isToday}>
                          <strong>{day.label}</strong>
                          <small>{day.date.getDate()}</small>
                        </span>
                      ))}
                    </div>

                    <p className="dashboard-week-empty-note">
                      {workouts.length === 0
                        ? 'Statystyki tygodnia pojawią się po pierwszym treningu.'
                        : 'Brak zapisanych treningów w tym tygodniu.'}
                    </p>
                  </div>
                ) : (
                  <div className="dashboard-week-board">
                  <div className="dashboard-week-chart">
                    <div className="dashboard-week-chart-head">
                      <div>
                        <p className="stat-meta">Wolumen tygodnia</p>
                        <p className="dashboard-week-total">{formatCompactVolume(weeklyVolume)}</p>
                      </div>
                      <div className="dashboard-week-count">
                        <strong>{weeklyDone}/{weeklyGoal}</strong>
                        <span>sesji / cel</span>
                      </div>
                    </div>

                    <div className="dashboard-week-bars">
                      {weekDailyStats.map((day, index) => {
                        const heightPct = day.volume > 0 ? Math.max(18, Math.round((day.volume / maxDayVolume) * 100)) : 8
                        return (
                          <div key={day.label} className="dashboard-week-bar-cell" data-today={day.isToday} data-active={day.volume > 0}>
                            <div className="dashboard-week-bar-track">
                              <motion.i
                                style={{ height: `${heightPct}%` }}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.05 * index, duration: 0.22 }}
                              />
                            </div>
                            <span>{day.label}</span>
                            <small>{day.volume > 0 ? formatCompactVolume(day.volume).replace(' kg', '') : '—'}</small>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="dashboard-week-side">
                    <div className="dashboard-week-cta">
                      <button
                        type="button"
                        onClick={() => navigate('/progress')}
                        className="puls-link-button px-0 py-0 text-sm font-semibold"
                      >
                        Zobacz progres
                        <ChevronRight size={15} strokeWidth={2.3} />
                      </button>
                    </div>

                    <div className="dashboard-signal-list">
                      {weeklySummaryRows.map(({ label, value, copy }, index) => (
                        <motion.div
                          key={label}
                          className="dashboard-signal-row"
                          initial={{ opacity: 0, x: 12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.06 + index * 0.04, duration: 0.2 }}
                        >
                          <div>
                            <span>{label}</span>
                            <strong>{value}</strong>
                            <small>{copy}</small>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                  </div>
                )}
              </motion.div>
            </section>

            <section className="dashboard-plan-strip">
              <div className="dashboard-section-head">
                <div>
                  <h2 className="section-title">Plany</h2>
                </div>
                <motion.button
                  onClick={() => navigate('/templates')}
                  className="dashboard-section-action"
                  whileTap={{ scale: 0.97 }}
                >
                  Otwórz plany
                </motion.button>
              </div>

              {templatesState.status === 'loading' ? (
                <div className="dashboard-inline-state">
                  <p className="text-sm font-semibold text-white">Ładowanie planów...</p>
                </div>
              ) : templatesState.status === 'error' ? (
                <div className="dashboard-inline-state" role="alert">
                  <p className="text-sm font-semibold text-white">Nie udało się wczytać planów</p>
                  <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
                    Sprawdź połączenie i spróbuj ponownie.
                  </p>
                  <Button type="button" className="mt-5" onClick={handleRetryTemplates}>
                    Spróbuj ponownie
                  </Button>
                </div>
              ) : recentTemplates.length === 0 ? (
                <div className="dashboard-inline-state">
                  <p className="text-sm font-semibold text-white">Brak zapisanych szablonów</p>
                  <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
                    Nie masz jeszcze zapisanych szablonów.
                  </p>
                  <motion.button
                    onClick={() => navigate('/templates/new')}
                    className="dashboard-inline-primary"
                    whileTap={{ scale: 0.97 }}
                  >
                    Utwórz pierwszy plan
                  </motion.button>
                </div>
              ) : (
                <div className="dashboard-template-row">
                  {recentTemplates.map((template) => {
                    const exerciseCount = template.days.reduce((sum, day) => sum + day.exercises.length, 0)
                    const requestKey = `dashboard:${template.id}:primary`
                    const templateLaunchOperation = launchOperation?.target.requestKey === requestKey
                      ? launchOperation
                      : null
                    const isLaunching = templateLaunchOperation?.status === 'pending'
                    const launchErrorId = `dashboard-template-launch-error-${template.id}`
                    return (
                      <div key={template.id} className="dashboard-template-launch-item">
                        <motion.button
                          type="button"
                          onClick={() => { void requestTemplateLaunch(template, 0, requestKey) }}
                          disabled={launchingTemplateId !== null}
                          aria-busy={isLaunching ? 'true' : undefined}
                          aria-describedby={templateLaunchOperation?.status === 'error' ? launchErrorId : undefined}
                          aria-label={`Uruchom szablon ${template.name}`}
                          className="dashboard-template-tile"
                          style={{
                            opacity: isLaunching ? 0.72 : 1,
                          }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-white truncate">{template.name}</p>
                              <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
                                {template.days.length} {template.days.length === 1 ? 'dzień' : 'dni'} • {exerciseCount} {exerciseCount === 1 ? 'ćwiczenie' : 'ćwiczeń'}
                              </p>
                            </div>
                            {isLaunching ? (
                              <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>
                                Uruchamiam…
                              </span>
                            ) : (
                              <Play size={15} style={{ color: 'var(--accent)' }} />
                            )}
                          </div>
                          <div className="dashboard-template-days">
                            {template.days.slice(0, 3).map((day, index) => (
                              <span
                                key={`${template.id}-${index}`}
                                className="dashboard-template-day"
                              >
                                {day.name}
                              </span>
                            ))}
                          </div>
                        </motion.button>
                        {templateLaunchOperation?.status === 'error' && (
                          <ActionFeedback
                            id={launchErrorId}
                            status="error"
                            message={templateLaunchOperation.errorMessage ?? 'Nie udało się uruchomić planu.'}
                            onRetry={() => { void retryTemplateLaunch() }}
                            onDismiss={dismissTemplateLaunchError}
                            className="dashboard-template-feedback"
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
        </motion.div>

        <section className="dashboard-history-section">
          <div className="dashboard-section-head">
            <div>
              <h2 className="section-title">Ostatnie treningi</h2>
            </div>
            <button
              type="button"
              onClick={() => navigate('/history')}
              className="puls-link-button mobile-touch-target px-3 py-2 text-sm font-medium whitespace-nowrap"
            >
              Zobacz wszystkie
              <ChevronRight size={15} strokeWidth={2.3} />
            </button>
          </div>

          {orphanedDeleteOperation && (
            <ActionFeedback
              status="error"
              message="Trening usunięty. Nie udało się odświeżyć statystyk."
              onRetry={retryWorkoutDelete}
              className="dashboard-workout-delete-feedback mb-4"
            />
          )}

          <AnimatePresence mode="popLayout">
            {recentWorkouts.length === 0 ? (
                  <motion.div
                    key="empty"
                    className="dashboard-inline-state"
                    initial={false}
                    animate={{ opacity: 1 }}
                  >
                    <div>
                      <p className="font-semibold text-white mb-1">Brak treningów</p>
                      <p className="text-sm" style={{ color: 'var(--muted)' }}>
                        Po zapisaniu sesji pojawi się tutaj historia.
                      </p>
                    </div>
                    <motion.button
                      type="button"
                      onClick={() => { void handleOpenWorkout().catch(() => undefined) }}
                      disabled={openingWorkout}
                      className="dashboard-inline-primary"
                      whileTap={{ scale: 0.96 }}
                    >
                      {openingWorkout
                        ? (hasActiveWork ? 'Otwieram sesję…' : 'Otwieram trening…')
                        : (hasActiveWork ? 'Wznów trening' : 'Rozpocznij nowy trening')}
                    </motion.button>
                  </motion.div>
            ) : (
              <div className="dashboard-history-list">
                {recentWorkouts.map((workout) => {
                      const accent = workoutAccent(workout)
                      const volume = calcVolume(workout)
                      const totalSets = workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)
                      const totalExercises = workout.exercises.length
                      const workoutDeleteOperation = deleteOperation?.workoutId === workout.id
                        ? deleteOperation
                        : null
                      const isDeleting = workoutDeleteOperation?.status === 'pending'
                      const isWorkoutUnavailable = isDeleting || workoutDeleteOperation?.status === 'cleanup_pending'
                      const deleteFeedbackId = `dashboard-workout-delete-feedback-${workout.id}`

                      return (
                        <motion.div
                          key={workout.id}
                          className="dashboard-history-row"
                          style={{
                            '--workout-accent': accent,
                          } as React.CSSProperties}
                          initial={false}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -30, height: 0, marginBottom: 0 }}
                          transition={{ duration: 0.22 }}
                          whileHover={{ y: -2 }}
                          aria-busy={isDeleting ? 'true' : undefined}
                          aria-describedby={workoutDeleteOperation?.status === 'error'
                            || workoutDeleteOperation?.status === 'cleanup_pending'
                            ? deleteFeedbackId
                            : undefined}
                        >
                          <div className="dashboard-history-main">
                            <div className="dashboard-history-controls">
                              <button
                                type="button"
                                onClick={() => openWorkout(workout)}
                                className="dashboard-history-open"
                                disabled={isWorkoutUnavailable}
                                aria-label={`Otwórz trening ${workout.label ?? workoutTitle(workout)} z ${formatDate(workout.startedAt)}`}
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span
                                      className="dashboard-history-set"
                                    >
                                      {totalSets} {polishPlural(totalSets, 'seria', 'serie', 'serii')}
                                    </span>
                                  </div>
                                  <p className="mt-2 text-lg font-semibold text-white truncate">
                                    {workout.label ?? workoutTitle(workout)}
                                  </p>
                                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                                    <span className="text-xs" style={{ color: 'var(--muted)' }}>
                                      {formatDate(workout.startedAt)}
                                    </span>
                                  </div>
                                </div>
                              </button>
                              <motion.button
                                type="button"
                                onClick={() => handleDelete(workout.id)}
                                className="dashboard-history-delete"
                                style={{
                                  color: 'var(--danger)',
                                  opacity: 0.72,
                                }}
                                whileHover={{ opacity: 1 }}
                                whileTap={{ scale: 0.85 }}
                                disabled={deleteOperation !== null}
                                aria-describedby={workoutDeleteOperation?.status === 'error'
                                  || workoutDeleteOperation?.status === 'cleanup_pending'
                                  ? deleteFeedbackId
                                  : undefined}
                                aria-label={`Usuń trening ${workout.label ?? workoutTitle(workout)} z ${formatDate(workout.startedAt)}`}
                              >
                                <Trash2 size={13} />
                              </motion.button>
                            </div>

                            {workoutDeleteOperation && (
                              <ActionFeedback
                                id={deleteFeedbackId}
                                status={workoutDeleteOperation.status === 'pending' ? 'pending' : 'error'}
                                message={workoutDeleteOperation.status === 'pending'
                                  ? 'Usuwanie treningu…'
                                  : workoutDeleteOperation.status === 'cleanup_pending'
                                    ? 'Trening usunięty. Nie udało się odświeżyć statystyk.'
                                    : 'Nie udało się usunąć treningu.'}
                                onRetry={workoutDeleteOperation.status === 'error'
                                  || workoutDeleteOperation.status === 'cleanup_pending'
                                  ? retryWorkoutDelete
                                  : undefined}
                                onDismiss={workoutDeleteOperation.status === 'error'
                                  ? () => setTransientDeleteOperation(null)
                                  : undefined}
                                className="dashboard-workout-delete-feedback"
                              />
                            )}

                            {!workout.materialized && !isWorkoutUnavailable && (
                              <WorkoutProjectionStatus
                                state={projectionRetryStates[workout.id] ?? 'idle'}
                                onRetry={() => void handleProjectionRetry(workout.id)}
                              />
                            )}

                            <div className="dashboard-history-exercises">
                              {workout.exercises.slice(0, 3).map((exercise) => (
                                <span
                                  key={`${workout.id}-${exercise.exerciseId ?? exercise.name}`}
                                >
                                  {exercise.name}
                                </span>
                              ))}
                              {workout.exercises.length > 3 && (
                                <span>
                                  +{workout.exercises.length - 3}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="dashboard-history-metrics">
                            <div>
                              <span>Objętość</span>
                              <strong>{formatCompactVolume(volume)}</strong>
                            </div>
                            <div>
                              <span>Ćwiczenia</span>
                              <strong>{totalExercises}</strong>
                            </div>
                            <div>
                              <span>Czas</span>
                              <strong>{formatDuration(workout.startedAt, workout.finishedAt)}</strong>
                            </div>
                          </div>
                        </motion.div>
                      )
                })}
              </div>
            )}
          </AnimatePresence>
        </section>

      {confirmDelete && (
        <ConfirmDialog
          message="Usunąć ten trening? Tej operacji nie można cofnąć."
          confirmLabel="Usuń"
          danger
          onConfirm={confirmDeleteWorkout}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      <TemplateLaunchConfirmDialog
        open={pendingLaunch !== null}
        onConfirm={() => { void confirmTemplateLaunch() }}
        onCancel={cancelTemplateLaunch}
      />
    </div>
  )
}
