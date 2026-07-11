import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart3,
  CalendarDays,
  ChevronRight,
  Clock3,
  Play,
  Plus,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
} from 'lucide-react'
import { toast } from 'sonner'
import ReadinessWidget from '../components/ReadinessWidget'
import ConfirmDialog from '../components/ConfirmDialog'
import TemplateLaunchConfirmDialog from '../components/TemplateLaunchConfirmDialog'
import WorkoutProjectionStatus, {
  type ProjectionRetryState,
} from '../components/workout/WorkoutProjectionStatus'
import { Button, LoadingState } from '../components/ui'
import {
  getTemplates,
  type WorkoutTemplate,
} from '../lib/templateService'
import { useTemplateWorkoutLaunch } from '../hooks/useTemplateWorkoutLaunch'
import { getProfile } from '../lib/userProfile'
import {
  getRecentWorkouts, deleteWorkout, retryWorkoutMaterialization, countWeeklyWorkouts,
  calcStreak, calcVolume, type WorkoutSummary,
} from '../lib/workoutService'
import { hasActiveSessionWork, subscribeToActiveSession } from '../lib/activeSessionService'
import { getCappedWorkoutFinishedAt } from '../lib/sessionDuration'
import { polishPlural } from '../lib/polishPlural'
import { exercises as exerciseDb } from '../data/exercises'
import { useAuthStore } from '../store/authStore'
import { useDashboardStore } from '../store/dashboardStore'
import { useProfileStore } from '../store/profileStore'
import { useWorkoutStore, type ActiveWorkout } from '../store/workoutStore'

const CATEGORY_COLORS: Record<string, string> = {
  chest: '#F0435A',
  back: '#8FB8A0',
  legs: '#F0A75A',
  arms: '#D9A06E',
  shoulders: '#D97B91',
  core: '#B8A8B2',
  cardio: '#A7D8BB',
}

const WEEK_LABELS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd']
const exerciseMap = new Map(exerciseDb.map((exercise) => [exercise.id, exercise]))

function workoutAccent(workout: WorkoutSummary): string {
  const firstExercise = workout.exercises[0]
  if (!firstExercise?.exerciseId) return '#A09AA0'
  const category = exerciseMap.get(firstExercise.exerciseId)?.category
  return CATEGORY_COLORS[category ?? ''] ?? '#A09AA0'
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
  const { profile, loading, setProfile, setLoading } = useProfileStore()
  const active = useWorkoutStore((state) => state.active)
  const navigate = useNavigate()
  const {
    pendingLaunch,
    launchingTemplateId,
    requestTemplateLaunch,
    confirmTemplateLaunch,
    cancelTemplateLaunch,
  } = useTemplateWorkoutLaunch(user?.uid)
  const {
    workouts,
    weeklyDone,
    ready: dashboardReady,
    setSnapshot,
  } = useDashboardStore()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
  const [dashboardError, setDashboardError] = useState(false)
  const [dashboardLoadAttempt, setDashboardLoadAttempt] = useState(0)
  const [remoteActiveSession, setRemoteActiveSession] = useState<ActiveWorkout | null>(null)
  const [projectionRetryStates, setProjectionRetryStates] = useState<Record<string, ProjectionRetryState>>({})
  const workoutsRef = useRef<WorkoutSummary[]>([])
  const snapshotRequestRef = useRef(0)

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
      const next = { ...current }
      all.filter((workout) => workout.materialized).forEach((workout) => {
        delete next[workout.id]
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
      pending.map((workout) => retryWorkoutMaterialization(workout.id)),
    )

    const fulfilledIds = pending.flatMap((workout, index) => (
      results[index]?.status === 'fulfilled' ? [workout.id] : []
    ))
    setProjectionRetryStates((current) => ({
      ...current,
      ...Object.fromEntries(pending.flatMap((workout, index) => (
        results[index]?.status === 'rejected' ? [[workout.id, 'failed']] : []
      ))),
    }))

    if (fulfilledIds.length > 0) {
      try {
        const refreshed = await refreshDashboardSnapshot(uid)
        if (!refreshed) return
        setProjectionRetryStates((current) => {
          const next = { ...current }
          fulfilledIds.forEach((workoutId) => {
            const workout = refreshed.find((item) => item.id === workoutId)
            if (workout?.materialized) delete next[workoutId]
            else if (workout) next[workoutId] = 'failed'
          })
          return next
        })
      } catch {
        setProjectionRetryStates((current) => ({
          ...current,
          ...Object.fromEntries(fulfilledIds.map((workoutId) => [workoutId, 'failed'])),
        }))
      }
    }
  }, [refreshDashboardSnapshot])

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
    if (profile) {
      void fetchData(user.uid).catch(handleDashboardFetchError)
      return
    }
    setLoading(true)
    getProfile(user.uid)
      .then((nextProfile) => {
        if (!nextProfile) navigate('/onboarding', { replace: true })
        else setProfile(nextProfile)
      })
      .catch(() => {
        setLoading(false)
        toast.error('Nie udało się wczytać profilu. Sprawdź połączenie.')
      })
  }, [dashboardLoadAttempt, user, profile, navigate, setLoading, setProfile, fetchData, handleDashboardFetchError])

  useEffect(() => {
    function handleOnline() {
      if (user) void retryPendingProjections(user.uid, workoutsRef.current)
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [retryPendingProjections, user])

  useEffect(() => {
    if (!user) return
    getTemplates(user.uid)
      .then(setTemplates)
      .catch(() => toast.error('Nie udało się wczytać szablonów.'))
  }, [user])

  useEffect(() => {
    if (!user) return
    return subscribeToActiveSession(user.uid, ({ session }) => {
      setRemoteActiveSession(session)
    })
  }, [user])

  const effectiveActive = useMemo(
    () => (hasActiveSessionWork(active) ? active : remoteActiveSession),
    [active, remoteActiveSession],
  )
  const hasActiveWork = useMemo(() => hasActiveSessionWork(effectiveActive), [effectiveActive])

  function handleDelete(id: string) {
    setConfirmDelete(id)
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
      await retryWorkoutMaterialization(workoutId)
      const refreshed = await refreshDashboardSnapshot(user.uid)
      if (!refreshed) return
      const workout = refreshed.find((item) => item.id === workoutId)
      if (workout && !workout.materialized) {
        setProjectionRetryStates((current) => ({ ...current, [workoutId]: 'failed' }))
      }
    } catch {
      setProjectionRetryStates((current) => ({ ...current, [workoutId]: 'failed' }))
    }
  }

  async function confirmDeleteWorkout() {
    if (!confirmDelete) return
    setDeletingId(confirmDelete)
    setConfirmDelete(null)
    try {
      await deleteWorkout(confirmDelete)
      if (user) void fetchData(user.uid).catch(handleDashboardFetchError)
      toast.success('Trening usunięty')
    } catch {
      toast.error('Błąd usuwania. Spróbuj ponownie.')
    } finally {
      setDeletingId(null)
    }
  }

  if (dashboardError && !dashboardReady) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="surface-panel rounded-[var(--radius-xl)] p-6 text-center">
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

  if (loading || (!dashboardReady && !!user && !!profile)) {
    return <LoadingState message="Ładowanie dashboardu..." />
  }

  const weeklyGoal = profile?.weeklyGoal ?? 3
  const remainingWeeklySessions = Math.max(weeklyGoal - weeklyDone, 0)
  const weekDates = getWeekDates()
  const today = new Date()
  const recentWorkouts = workouts.slice(0, 4)
  const recentTemplates = templates.slice(0, 3)
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
  const activeExerciseCount = effectiveActive?.exercises.length ?? 0
  const activeLabel = effectiveActive?.label?.trim()
  const supportLine = hasActiveWork
    ? [
        `Aktywna sesja${activeLabel ? `: ${activeLabel}` : ''}`,
        activeExerciseCount > 0 ? formatExerciseCount(activeExerciseCount) : null,
      ].filter(Boolean).join(' • ')
    : latestWorkout
      ? `Ostatni trening: ${latestWorkout.label ?? workoutTitle(latestWorkout)} • ${formatDate(latestWorkout.startedAt)} • ${formatDuration(latestWorkout.startedAt, latestWorkout.finishedAt)}`
      : 'Brak zapisanych treningów.'
  const comparisonCopy = weeklySessionsDelta === 0
    ? 'Sesje bez zmian względem poprzedniego tygodnia.'
    : weeklySessionsDelta > 0
      ? `${weeklySessionsDelta} ${polishPlural(weeklySessionsDelta, 'sesja', 'sesje', 'sesji')} więcej niż tydzień temu.`
      : `${Math.abs(weeklySessionsDelta)} ${polishPlural(Math.abs(weeklySessionsDelta), 'sesja', 'sesje', 'sesji')} mniej niż tydzień temu.`
  const weeklySummaryRows = [
    {
      label: 'Cel tygodnia',
      value: `${weeklyDone}/${weeklyGoal}`,
      copy: weeklyDone >= weeklyGoal
        ? 'Cel zamknięty.'
        : `${remainingWeeklySessions} ${polishPlural(remainingWeeklySessions, 'sesja', 'sesje', 'sesji')} do celu w tym tygodniu.`,
      icon: Target,
    },
    {
      label: 'Rytm',
      value: `${activeDays}/7 dni`,
      copy: weeklySessionsDelta >= 0
        ? `${weeklySessionsDelta === 0 ? 'Tak samo' : `+${weeklySessionsDelta}`} względem poprzedniego tygodnia`
        : `${weeklySessionsDelta} względem poprzedniego tygodnia`,
      icon: CalendarDays,
    },
    {
      label: 'Mocny dzień',
      value: peakDay?.volume ? `${peakDay.label}` : 'Brak',
      copy: peakDay?.volume ? `${formatCompactVolume(peakDay.volume)} • ${peakDay.sets} serii` : 'Brak treningów w tym tygodniu',
      icon: TrendingUp,
    },
    {
      label: 'Średnia sesja',
      value: avgMinutes ? `${avgMinutes} min` : '—',
      copy: avgVolumePerSession ? `${formatCompactVolume(avgVolumePerSession)} na trening` : 'Brak średniej w tym tygodniu',
      icon: Clock3,
    },
    {
      label: 'Porównanie',
      value: weeklyVolumeDelta === null ? 'Brak' : `${weeklyVolumeDelta >= 0 ? '+' : ''}${weeklyVolumeDelta}%`,
      copy: weeklyVolumeDelta === null ? 'Za mało danych na trend.' : comparisonCopy,
      icon: BarChart3,
    },
  ]

  return (
    <>
        <section className="dashboard-home">
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

            <div className="dashboard-home-actions">
              <motion.button
                type="button"
                onClick={() => navigate('/workout/new')}
                className="hero-editorial-cta"
                whileTap={{ scale: 0.97 }}
              >
                {hasActiveWork ? <Play size={18} strokeWidth={2.4} /> : <Plus size={18} strokeWidth={2.4} />}
                {hasActiveWork ? 'Wróć do sesji' : 'Rozpocznij trening'}
              </motion.button>
            </div>

            <div className="dashboard-home-rhythm" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </motion.div>

          <motion.aside
            className="dashboard-home-panel"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.08, duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <ReadinessWidget />
          </motion.aside>
        </section>

        <motion.div
          className="dashboard-main-flow"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.25 }}
        >
            <section className="dashboard-overview-grid puls-panel">
              <motion.div className="dashboard-week-panel" {...fadeUp(0.09)}>
                <div className="dashboard-panel-head">
                  <div>
                    <p className="eyebrow">Tydzień</p>
                    <h2 className="section-title mt-2">Ten tydzień</h2>
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

                <div className="dashboard-week-board">
                  <div className="dashboard-week-chart puls-rail">
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
                      <p>{weeklyDone >= weeklyGoal
                        ? 'Cel tygodnia zrobiony'
                        : `${remainingWeeklySessions} ${polishPlural(remainingWeeklySessions, 'sesja', 'sesje', 'sesji')} do celu`}</p>
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
                      {weeklySummaryRows.map(({ label, value, copy, icon: Icon }, index) => (
                        <motion.div
                          key={label}
                          className="dashboard-signal-row"
                          initial={{ opacity: 0, x: 12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.06 + index * 0.04, duration: 0.2 }}
                        >
                          <Icon size={15} style={{ color: 'var(--accent)' }} />
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
              </motion.div>
            </section>

            <section className="dashboard-plan-strip puls-rail">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="eyebrow">Moje plany</p>
                    <h2 className="section-title mt-2">Plany</h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6" style={{ color: 'var(--muted)' }}>
                    Ostatnio używane.
                  </p>
                </div>
                <motion.button
                  onClick={() => navigate('/templates')}
                  className="rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-semibold"
                  style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--text-strong)' }}
                  whileTap={{ scale: 0.97 }}
                >
                  Otwórz plany
                </motion.button>
              </div>

              {recentTemplates.length === 0 ? (
                <div
                  className="rounded-[var(--radius-lg)] border border-dashed px-5 py-8 text-center"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}
                >
                  <p className="text-sm font-semibold text-white">Brak zapisanych szablonów</p>
                  <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
                    Nie masz jeszcze zapisanych szablonów.
                  </p>
                  <motion.button
                    onClick={() => navigate('/templates/new')}
                    className="mt-5 rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-semibold"
                    style={{ background: 'var(--primary-gradient)', color: 'var(--accent-foreground)' }}
                    whileTap={{ scale: 0.97 }}
                  >
                    Utwórz pierwszy plan
                  </motion.button>
                </div>
              ) : (
                <div className="dashboard-template-row puls-ledger">
                  {recentTemplates.map((template) => {
                    const exerciseCount = template.days.reduce((sum, day) => sum + day.exercises.length, 0)
                    const isLaunching = launchingTemplateId === template.id
                    return (
                      <motion.button
                        key={template.id}
                        type="button"
                        onClick={() => { void requestTemplateLaunch(template, 0) }}
                        disabled={launchingTemplateId !== null}
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
                            <span className="text-[11px] font-semibold" style={{ color: 'var(--accent)' }}>
                              Start...
                            </span>
                          ) : (
                            <Play size={15} style={{ color: 'var(--accent)' }} />
                          )}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
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
                    )
                  })}
                </div>
              )}
            </section>
        </motion.div>

        <section className="dashboard-history-section mt-5">
          <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <p className="eyebrow">
                    Historia
                  </p>
                  <h2 className="section-title mt-2">Ostatnie treningi</h2>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/history')}
                  className="puls-link-button px-3 py-2 text-sm font-medium whitespace-nowrap"
                >
                  Zobacz wszystkie
                  <ChevronRight size={15} strokeWidth={2.3} />
                </button>
              </div>

              <AnimatePresence mode="popLayout">
                {recentWorkouts.length === 0 ? (
                  <motion.div
                    key="empty"
                    className="surface-panel rounded-[var(--radius-xl)] p-10 text-center flex flex-col items-center gap-4"
                    initial={false}
                    animate={{ opacity: 1 }}
                  >
                    <div
                      className="w-16 h-16 rounded-[var(--radius-lg)] flex items-center justify-center"
                      style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-soft-strong)', color: 'var(--accent)' }}
                    >
                      <Sparkles size={24} />
                    </div>
                    <div>
                      <p className="font-semibold text-white mb-1">Brak treningów</p>
                      <p className="text-sm" style={{ color: 'var(--muted)' }}>
                        Po zapisaniu sesji pojawi się tutaj historia.
                      </p>
                    </div>
                    <motion.button
                      onClick={() => navigate('/workout/new')}
                      className="mt-2 rounded-[var(--radius-md)] px-6 py-2.5 text-sm font-semibold"
                      style={{ background: 'var(--primary-gradient)', color: 'var(--accent-foreground)' }}
                      whileTap={{ scale: 0.96 }}
                    >
                      + Nowy trening
                    </motion.button>
                  </motion.div>
                ) : (
                  <div className="dashboard-history-list">
                    {recentWorkouts.map((workout) => {
                      const accent = workoutAccent(workout)
                      const volume = calcVolume(workout)
                      const totalSets = workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)
                      const totalExercises = workout.exercises.length

                      return (
                        <motion.div
                          key={workout.id}
                          className="dashboard-history-row"
                          style={{
                            opacity: deletingId === workout.id ? 0.4 : 1,
                            '--workout-accent': accent,
                          } as React.CSSProperties}
                          initial={false}
                          animate={{ opacity: deletingId === workout.id ? 0.4 : 1, x: 0 }}
                          exit={{ opacity: 0, x: -30, height: 0, marginBottom: 0 }}
                          transition={{ duration: 0.22 }}
                          whileHover={{ y: -2 }}
                        >
                          <div className="dashboard-history-accent" aria-hidden="true" />

                          <div className="dashboard-history-main">
                            <div className="dashboard-history-controls">
                              <button
                                type="button"
                                onClick={() => openWorkout(workout)}
                                className="dashboard-history-open"
                                aria-label={`Otwórz trening ${workout.label ?? workoutTitle(workout)} z ${formatDate(workout.startedAt)}`}
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span
                                      className="dashboard-history-set"
                                    >
                                      {totalSets}×
                                    </span>
                                  </div>
                                  <p className="mt-2 text-lg font-semibold text-white truncate">
                                    {workout.label ?? workoutTitle(workout)}
                                  </p>
                                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                                    <span className="text-xs" style={{ color: 'var(--muted)' }}>
                                      {formatDate(workout.startedAt)}
                                    </span>
                                    <span className="text-xs" style={{ color: 'var(--muted)' }}>·</span>
                                    <span className="text-xs" style={{ color: 'var(--muted)' }}>
                                      {formatDuration(workout.startedAt, workout.finishedAt)}
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
                                  background: 'var(--danger-soft)',
                                  border: '1px solid rgba(240,167,90,0.18)',
                                }}
                                whileHover={{ opacity: 1 }}
                                whileTap={{ scale: 0.85 }}
                                disabled={deletingId === workout.id}
                                aria-label={`Usuń trening ${workout.label ?? workoutTitle(workout)} z ${formatDate(workout.startedAt)}`}
                              >
                                <Trash2 size={13} />
                              </motion.button>
                            </div>

                            {!workout.materialized && (
                              <WorkoutProjectionStatus
                                state={projectionRetryStates[workout.id] ?? 'idle'}
                                onRetry={() => void handleProjectionRetry(workout.id)}
                              />
                            )}

                            <div className="mt-4 flex flex-wrap gap-2">
                              {workout.exercises.slice(0, 3).map((exercise) => (
                                <span
                                  key={`${workout.id}-${exercise.exerciseId ?? exercise.name}`}
                                  className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                                  style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text)', border: '1px solid var(--border)' }}
                                >
                                  {exercise.name}
                                </span>
                              ))}
                              {workout.exercises.length > 3 && (
                                <span
                                  className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                                  style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--muted)', border: '1px solid var(--border)' }}
                                >
                                  +{workout.exercises.length - 3}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="dashboard-history-metrics puls-ledger">
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
    </>
  )
}
