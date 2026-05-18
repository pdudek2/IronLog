import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart3,
  CalendarDays,
  Clock3,
  Flame,
  Layers3,
  Plus,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
} from 'lucide-react'
import { toast } from 'sonner'
import NumberFlow from '@number-flow/react'
import ReadinessWidget from '../components/ReadinessWidget'
import ConfirmDialog from '../components/ConfirmDialog'
import { Button, LoadingState } from '../components/ui'
import { getTemplates, type WorkoutTemplate } from '../lib/templateService'
import { getProfile } from '../lib/userProfile'
import {
  getRecentWorkouts, deleteWorkout, retryPendingMaterializations, countWeeklyWorkouts,
  calcStreak, calcVolume, type WorkoutSummary,
} from '../lib/workoutService'
import { exercises as exerciseDb } from '../data/exercises'
import { useAuthStore } from '../store/authStore'
import { useDashboardStore } from '../store/dashboardStore'
import { useProfileStore } from '../store/profileStore'

const CATEGORY_COLORS: Record<string, string> = {
  chest: '#4D8EFF',
  back: '#9B6DFF',
  legs: '#FF5757',
  arms: '#FF9F43',
  shoulders: '#FF6B9D',
  core: '#00D4AA',
  cardio: '#FFD700',
}

const WEEK_LABELS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd']
const exerciseMap = new Map(exerciseDb.map((exercise) => [exercise.id, exercise]))
const CATEGORY_LABELS: Record<string, string> = {
  chest: 'Klatka',
  back: 'Plecy',
  legs: 'Nogi',
  arms: 'Ramiona',
  shoulders: 'Barki',
  core: 'Core',
  cardio: 'Cardio',
}

function workoutAccent(workout: WorkoutSummary): string {
  const firstExercise = workout.exercises[0]
  if (!firstExercise?.exerciseId) return '#808CB3'
  const category = exerciseMap.get(firstExercise.exerciseId)?.category
  return CATEGORY_COLORS[category ?? ''] ?? '#808CB3'
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
  const minutes = Math.round((end - start) / 60_000)
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
  const navigate = useNavigate()
  const {
    workouts,
    weeklyDone,
    streak,
    ready: dashboardReady,
    setSnapshot,
  } = useDashboardStore()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
  const [dashboardError, setDashboardError] = useState(false)
  const [dashboardLoadAttempt, setDashboardLoadAttempt] = useState(0)
  const workoutsRef = useRef<WorkoutSummary[]>([])

  const fetchData = useCallback(async (uid: string) => {
    setDashboardError(false)
    const all = await getRecentWorkouts(uid, 50)
    setSnapshot({
      workouts: all,
      weeklyDone: countWeeklyWorkouts(all),
      streak: calcStreak(all),
    })
    workoutsRef.current = all
    void retryPendingMaterializations(all)
  }, [setSnapshot])

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
      void retryPendingMaterializations(workoutsRef.current)
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [])

  useEffect(() => {
    if (!user) return
    getTemplates(user.uid)
      .then(setTemplates)
      .catch(() => toast.error('Nie udało się wczytać szablonów.'))
  }, [user])

  function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setConfirmDelete(id)
  }

  function openWorkout(workout: WorkoutSummary) {
    navigate(`/workout/${workout.id}`, {
      state: { workoutPreview: workout },
    })
  }

  function handleWorkoutCardKeyDown(event: React.KeyboardEvent, workout: WorkoutSummary) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    openWorkout(workout)
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
  const progressPct = Math.min((weeklyDone / weeklyGoal) * 100, 100)
  const weekDates = getWeekDates()
  const today = new Date()
  const recentWorkouts = workouts.slice(0, 4)
  const recentTemplates = templates.slice(0, 3)
  const workoutDays = workouts.map((workout) => new Date(workout.startedAt))
  const weekStart = weekDates[0]?.getTime() ?? 0
  const weekEnd = (weekDates[6]?.getTime() ?? 0) + 86_400_000
  const previousWeekStart = weekStart - 7 * 86_400_000
  const previousWeekEnd = weekStart
  const monthStartDate = new Date()
  monthStartDate.setHours(0, 0, 0, 0)
  monthStartDate.setDate(1)
  const monthStart = monthStartDate.getTime()
  const weeklyWorkouts = workouts.filter((workout) => workout.startedAt >= weekStart && workout.startedAt < weekEnd)
  const previousWeekWorkouts = workouts.filter((workout) => workout.startedAt >= previousWeekStart && workout.startedAt < previousWeekEnd)
  const monthlyWorkouts = workouts.filter((workout) => workout.startedAt >= monthStart)
  const weeklyVolume = weeklyWorkouts.reduce((sum, workout) => sum + calcVolume(workout), 0)
  const previousWeeklyVolume = previousWeekWorkouts.reduce((sum, workout) => sum + calcVolume(workout), 0)
  const weeklySetsTotal = weeklyWorkouts.reduce((sum, workout) => (
    sum + workout.exercises.reduce((innerSum, exercise) => innerSum + exercise.sets.length, 0)
  ), 0)
  const previousWeeklyDone = previousWeekWorkouts.length
  const avgMinutes = weeklyWorkouts.length
    ? Math.round(weeklyWorkouts.reduce((sum, workout) => sum + (workout.finishedAt - workout.startedAt), 0) / weeklyWorkouts.length / 60_000)
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
  const focusEntries = Object.entries(weeklyWorkouts.reduce<Record<string, number>>((acc, workout) => {
    workout.exercises.forEach((exercise) => {
      const category = exercise.exerciseId ? exerciseMap.get(exercise.exerciseId)?.category : null
      if (!category) return
      acc[category] = (acc[category] ?? 0) + 1
    })
    return acc
  }, {}))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
  const totalFocusCount = focusEntries.reduce((sum, [, count]) => sum + count, 0)
  const topFocus = focusEntries[0]
  const upcomingMessage = weeklyDone >= weeklyGoal
    ? 'Cel tygodnia dowieziony. Utrzymaj rytm i zostaw przestrzeń na recovery.'
    : `Brakuje jeszcze ${weeklyGoal - weeklyDone} ${weeklyGoal - weeklyDone === 1 ? 'sesji' : 'sesji'} do założonego celu.`
  const overviewCards = [
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
      copy: peakDay?.volume ? `${formatCompactVolume(peakDay.volume)} • ${peakDay.sets} serii` : 'Pierwszy mocny dzień pojawi się po pierwszych sesjach',
      icon: TrendingUp,
    },
    {
      label: 'Średnia sesja',
      value: avgMinutes ? `${avgMinutes} min` : '—',
      copy: avgVolumePerSession ? `${formatCompactVolume(avgVolumePerSession)} na trening` : 'Zbieramy pierwsze dane do średniej',
      icon: Clock3,
    },
  ]
  const dashboardHighlights: Array<{ label: string; value: number; suffix: string; sublabel: string }> = [
    { label: 'Treningi', value: weeklyDone, suffix: '', sublabel: 'w tym tygodniu' },
    { label: 'Serie', value: weeklySetsTotal, suffix: '', sublabel: weeklySetsTotal ? 'w tym tygodniu' : 'w tym tygodniu · brak sesji' },
    { label: 'Objętość', value: weeklyVolume, suffix: ' kg', sublabel: weeklyVolume ? 'tygodniowy wolumen' : 'tygodniowy wolumen · brak sesji' },
    { label: 'Śr. czas', value: avgMinutes, suffix: ' min', sublabel: avgMinutes ? 'na sesję' : 'na sesję · brak danych' },
  ]

  return (
    <>
        <section className="hero-editorial">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <motion.div
              className="flex flex-col gap-5 min-w-0"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <p className="hero-editorial-date">
                {new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <div>
                <p className="hero-editorial-greeting">{getGreeting()},</p>
                <h1 className="hero-editorial-name mt-1">
                  {profile?.displayName ?? 'treningowcu'}
                </h1>
              </div>
              <p className="hero-editorial-sub">{upcomingMessage}</p>
              <div className="flex flex-wrap items-center gap-3 mt-1">
                <motion.button
                  type="button"
                  onClick={() => navigate('/workout/new')}
                  className="hero-editorial-cta"
                  whileTap={{ scale: 0.97 }}
                >
                  <Plus size={18} strokeWidth={2.4} />
                  Rozpocznij trening
                </motion.button>
                <button
                  type="button"
                  onClick={() => navigate('/progress')}
                  className="px-3 py-2 text-sm font-medium rounded-full transition-colors hover:bg-white/5"
                  style={{ color: 'var(--muted)' }}
                >
                  Zobacz pełne postępy →
                </button>
              </div>
            </motion.div>

            <motion.aside
              className={`hero-streak-card lg:w-[280px] ${streak === 0 ? 'hero-streak-card--empty' : ''}`}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15, duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <p className="hero-streak-label">
                <Flame size={12} strokeWidth={2.4} style={{ display: 'inline-block', marginRight: '0.3rem', verticalAlign: '-1px' }} />
                Aktualna seria
              </p>
              <p className="hero-streak-value">
                <NumberFlow value={streak} transformTiming={{ duration: 700, easing: 'cubic-bezier(0.2,0.8,0.2,1)' }} />
              </p>
              <p className="hero-streak-meta">
                {streak === 0
                  ? 'Zacznij pierwszą sesję w tym tygodniu'
                  : streak === 1
                    ? 'dzień z treningiem — utrzymaj rytm'
                    : `dni nieprzerwanej serii`}
              </p>
            </motion.aside>
          </div>

          <div
            className="mt-10 pt-6 flex flex-wrap gap-x-10 gap-y-5 border-t"
            style={{ borderColor: 'var(--border)' }}
          >
            {dashboardHighlights.map((item) => (
              <div key={item.label} className="flex flex-col gap-1 min-w-[6.5rem]">
                <span className="stat-meta">{item.label}</span>
                <span className="text-2xl font-bold tabular-nums tracking-[-0.03em] text-white leading-none">
                  <NumberFlow
                    value={item.value}
                    transformTiming={{ duration: 600, easing: 'cubic-bezier(0.2,0.8,0.2,1)' }}
                    format={{ useGrouping: true }}
                    locales="pl-PL"
                  />
                  {item.suffix}
                </span>
                <span className="text-xs mt-0.5" style={{ color: 'var(--muted-soft)' }}>
                  {item.sublabel}
                </span>
              </div>
            ))}
          </div>
        </section>

        <hr className="border-t my-4 lg:hidden" style={{ borderColor: 'var(--border)' }} />

        <motion.div
          className="mb-6"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.25 }}
        >
          <ReadinessWidget />
        </motion.div>

        <hr className="border-t my-4 lg:hidden" style={{ borderColor: 'var(--border)' }} />

        <motion.div
          className="desktop-app-grid"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14, duration: 0.25 }}
        >
          <aside className="desktop-sticky space-y-4 hidden lg:block">
            <motion.div className="surface-panel rounded-[var(--radius-xl)] p-5" {...fadeUp(0.06)}>
              {/* Progress ring hero */}
              <div className="flex items-center gap-4 mb-5">
                <div className="relative flex-none">
                  <svg width="88" height="88" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="7" />
                    <motion.circle
                      cx="50" cy="50" r="40" fill="none"
                      stroke={progressPct >= 100 ? 'var(--success)' : 'var(--accent)'}
                      strokeWidth="7" strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 40}
                      transform="rotate(-90 50 50)"
                      initial={{ strokeDashoffset: 2 * Math.PI * 40 }}
                      animate={{ strokeDashoffset: 2 * Math.PI * 40 * (1 - Math.min(progressPct / 100, 1)) }}
                      transition={{ delay: 0.3, duration: 1.1, ease: 'easeOut' }}
                    />
                    <text x="50" y="46" textAnchor="middle" fill="white" fontSize="18" fontWeight="700" fontFamily="Urbanist">{weeklyDone}</text>
                    <text x="50" y="61" textAnchor="middle" fill="rgba(154,167,194,0.9)" fontSize="10" fontFamily="Urbanist">z {weeklyGoal}</text>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="stat-meta mb-2">Ten tydzień</p>
                  <p className="text-3xl font-bold text-white leading-none mb-1 tracking-[-0.05em] tabular-nums">
                    {progressPct >= 100 ? 'Cel osiągnięty!' : `${Math.round(progressPct)}%`}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    {progressPct >= 100 ? 'Świetna robota' : `${weeklyGoal - weeklyDone} ${weeklyGoal - weeklyDone === 1 ? 'trening' : 'treningi'} do celu`}
                  </p>
                </div>
              </div>

              {/* Secondary stats */}
              <div className="grid grid-cols-2 gap-2 mb-5">
                <div className="rounded-[var(--radius-lg)] p-3" style={{ background: 'var(--success-soft)', border: '1px solid rgba(25,213,159,0.18)' }}>
                  <p className="text-2xl font-bold leading-none mb-1 tracking-[-0.04em] tabular-nums" style={{ color: 'var(--success)' }}>{streak}</p>
                  <p className="stat-meta">Seria dni</p>
                </div>
                <div className="rounded-[var(--radius-lg)] p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                  <p className="text-2xl font-bold leading-none mb-1 text-white tracking-[-0.04em] tabular-nums">{monthlyWorkouts.length}</p>
                  <p className="stat-meta">W miesiącu</p>
                </div>
              </div>

              {/* Week tracker */}
              <div>
                <p className="mb-3 text-[10px] uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                  Ten tydzień
                </p>
                <div className="flex gap-1.5">
                  {weekDates.map((date, index) => {
                    const isToday = isSameDay(date, today)
                    const hasWorkout = workoutDays.some((workoutDay) => isSameDay(workoutDay, date))
                    const isPast = date <= today

                    return (
                      <div key={index} className="flex-1 flex flex-col items-center gap-1">
                        <p className="text-[10px] uppercase tracking-wide" style={{ color: isToday ? 'var(--accent)' : 'var(--muted)' }}>
                          {WEEK_LABELS[index]}
                        </p>
                        <motion.div
                          className="w-full aspect-square rounded-xl flex items-center justify-center"
                          style={{
                            background: hasWorkout
                              ? 'var(--success)'
                              : isToday
                                ? 'var(--accent-soft)'
                                : isPast ? 'rgba(255,255,255,0.03)' : 'transparent',
                            border: isToday
                              ? '1.5px solid var(--accent)'
                              : `1px solid ${hasWorkout ? 'var(--success)' : 'var(--border)'}`,
                          }}
                          animate={hasWorkout ? { scale: [0.85, 1] } : {}}
                          transition={{ delay: index * 0.04, duration: 0.3 }}
                        >
                          {hasWorkout && <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(7,17,31,0.85)' }} />}
                        </motion.div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </motion.div>

            <motion.div className="surface-panel rounded-[var(--radius-xl)] p-5" {...fadeUp(0.12)}>
              <p className="eyebrow mb-2" style={{ color: 'var(--accent)' }}>
                Szybki start
              </p>
              <p className="mb-5 text-sm leading-6" style={{ color: 'var(--muted)' }}>
                Wejdź prosto w kolejną sesję bez szukania jej w historii.
              </p>
              <div className="mb-5 space-y-2 rounded-[var(--radius-lg)] border p-3" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.025)' }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="stat-meta">Na teraz</span>
                  <Target size={14} style={{ color: 'var(--accent)' }} />
                </div>
                <p className="text-sm font-semibold text-white leading-6">
                  {upcomingMessage}
                </p>
              </div>
              <motion.button
                className="w-full rounded-[var(--radius-lg)] py-4 text-sm font-semibold"
                style={{ background: 'linear-gradient(180deg, var(--accent) 0%, #3f8ff4 100%)', color: 'var(--accent-foreground)' }}
                onClick={() => navigate('/workout/new')}
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.97 }}
              >
                Rozpocznij trening
              </motion.button>
            </motion.div>
          </aside>

          <main className="min-w-0 space-y-5">
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(19rem,0.92fr)]">
              <motion.div className="surface-panel rounded-[var(--radius-xl)] p-5" {...fadeUp(0.09)}>
                <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="eyebrow">Przegląd tygodnia</p>
                    <h2 className="section-title mt-2">Tydzień w skrócie</h2>

                    <p className="mt-3 max-w-2xl text-sm leading-6" style={{ color: 'var(--muted)' }}>
                      Najważniejsze sygnały z ostatnich dni: tempo, objętość i najmocniejszy dzień.
                    </p>
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="rounded-[var(--radius-lg)] border px-4 py-3" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.025)' }}>
                      <p className="stat-meta">Zakres</p>
                      <p className="mt-2 text-sm font-semibold text-white">{formatWeekRange(weekDates)}</p>
                      <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                        {weeklyVolumeDelta === null
                          ? 'Pierwszy tydzień buduje punkt odniesienia'
                          : `${weeklyVolumeDelta >= 0 ? '+' : ''}${weeklyVolumeDelta}% vs poprzedni tydzień`}
                      </p>
                    </div>
                    <button
                      onClick={() => navigate('/progress')}
                      className="rounded-[var(--radius-lg)] px-4 py-2.5 text-sm font-semibold text-left transition-opacity hover:opacity-80"
                      style={{ background: 'rgba(232,255,87,0.07)', border: '1px solid rgba(232,255,87,0.18)', color: 'var(--accent)' }}
                    >
                      Zobacz progres →
                    </button>
                  </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(16rem,0.9fr)]">
                  <div className="sub-card-volume p-4">
                    <div className="mb-4 flex items-end justify-between gap-4">
                      <div>
                        <p className="stat-meta">Wolumen tygodnia</p>
                        <p className="mt-3 stat-value">{formatCompactVolume(weeklyVolume)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-white">{activeDays}/7 dni z treningiem</p>
                        <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                          {weeklyDone >= weeklyGoal
                            ? 'cel tygodnia zrobiony'
                            : `${weeklyGoal - weeklyDone} sesje do celu`}
                        </p>
                      </div>
                    </div>

                    <div className="grid h-48 grid-cols-7 gap-2 items-end">
                      {weekDailyStats.map((day, index) => {
                        const heightPct = day.volume > 0 ? Math.max(18, Math.round((day.volume / maxDayVolume) * 100)) : 8
                        return (
                          <div key={day.label} className="flex min-w-0 flex-col justify-end gap-2">
                            <div className="flex h-36 items-end">
                              <motion.div
                                className="w-full rounded-[var(--radius-md)] border"
                                style={{
                                  height: `${heightPct}%`,
                                  background: day.volume > 0
                                    ? day.isToday
                                      ? 'linear-gradient(180deg, rgba(90,166,255,0.95) 0%, rgba(90,166,255,0.4) 100%)'
                                      : 'linear-gradient(180deg, rgba(25,213,159,0.82) 0%, rgba(25,213,159,0.2) 100%)'
                                    : 'rgba(255,255,255,0.035)',
                                  borderColor: day.volume > 0
                                    ? day.isToday ? 'rgba(90,166,255,0.55)' : 'rgba(25,213,159,0.3)'
                                    : 'var(--border)',
                                }}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.05 * index, duration: 0.22 }}
                              />
                            </div>
                            <div className="text-center">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: day.isToday ? 'var(--accent)' : 'var(--muted)' }}>
                                {day.label}
                              </p>
                              <p className="mt-1 text-[11px] font-medium tabular-nums" style={{ color: day.volume > 0 ? 'var(--text-strong)' : 'var(--muted-soft)' }}>
                                {day.volume > 0 ? formatCompactVolume(day.volume).replace(' kg', '') : '—'}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="grid gap-3">
                    {overviewCards.map(({ label, value, copy, icon: Icon }, index) => (
                      <motion.div
                        key={label}
                        className="rounded-[var(--radius-lg)] border p-4"
                        style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.025)' }}
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.06 + index * 0.04, duration: 0.2 }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="stat-meta">{label}</p>
                          <Icon size={15} style={{ color: 'var(--accent)' }} />
                        </div>
                        <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white tabular-nums">
                          {value}
                        </p>
                        <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
                          {copy}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </motion.div>

              <motion.div className="surface-panel rounded-[var(--radius-xl)] p-5" {...fadeUp(0.12)}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="eyebrow">Fokus tygodnia</p>
                    <h2 className="section-title mt-2">Najważniejsze teraz</h2>
                  </div>
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-lg)]"
                    style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-soft-strong)', color: 'var(--accent)' }}
                  >
                    <Sparkles size={18} />
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  <div className="sub-card-insight p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="stat-meta">Trajektoria</p>
                      <BarChart3 size={15} style={{ color: 'var(--accent)' }} />
                    </div>
                    <p className="mt-3 text-lg font-semibold tracking-[-0.03em] text-white">
                      {weeklyVolumeDelta === null
                        ? 'Za mało danych na trend'
                        : weeklyVolumeDelta >= 0
                          ? `Wolumen +${weeklyVolumeDelta}%`
                          : `Wolumen -${Math.abs(weeklyVolumeDelta)}%`}
                    </p>
                    <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
                      {weeklySessionsDelta === 0
                        ? 'Liczba sesji jest taka sama jak tydzień temu.'
                        : weeklySessionsDelta > 0
                          ? `Masz o ${weeklySessionsDelta} ${weeklySessionsDelta === 1 ? 'sesję' : 'sesje'} więcej niż tydzień temu.`
                          : `Masz o ${Math.abs(weeklySessionsDelta)} ${Math.abs(weeklySessionsDelta) === 1 ? 'sesję' : 'sesje'} mniej niż tydzień temu.`}
                    </p>
                  </div>

                  <div className="sub-card-insight p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="stat-meta">Główna partia</p>
                      <Target size={15} style={{ color: 'var(--accent)' }} />
                    </div>
                    <p className="mt-3 text-lg font-semibold tracking-[-0.03em] text-white">
                      {topFocus ? CATEGORY_LABELS[topFocus[0]] ?? topFocus[0] : 'Brak dominującej partii'}
                    </p>
                    <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
                      {topFocus
                        ? `${topFocus[1]} logowanych bloków ćwiczeń w tym tygodniu.`
                        : 'Dodaj kolejne sesje, a zobaczysz gdzie idzie najwięcej pracy.'}
                    </p>

                    {focusEntries.length > 0 && (
                      <div className="mt-4 space-y-3">
                        {focusEntries.map(([category, count]) => {
                          const width = totalFocusCount ? (count / totalFocusCount) * 100 : 0
                          return (
                            <div key={category}>
                              <div className="mb-1 flex items-center justify-between gap-3">
                                <span className="text-sm font-medium text-white">
                                  {CATEGORY_LABELS[category] ?? category}
                                </span>
                                <span className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
                                  {count}
                                </span>
                              </div>
                              <div className="h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${width}%`,
                                    background: `linear-gradient(90deg, ${CATEGORY_COLORS[category] ?? '#5aa6ff'} 0%, ${CATEGORY_COLORS[category] ?? '#5aa6ff'}88 100%)`,
                                  }}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <div className="sub-card-insight p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="stat-meta">Ostatnia sesja</p>
                      <Sparkles size={15} style={{ color: 'var(--accent)' }} />
                    </div>
                    <p className="mt-3 text-lg font-semibold tracking-[-0.03em] text-white">
                      {latestWorkout ? (latestWorkout.label ?? workoutTitle(latestWorkout)) : 'Czekamy na pierwszą sesję'}
                    </p>
                    <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
                      {latestWorkout
                        ? `${formatDate(latestWorkout.startedAt)} • ${formatDuration(latestWorkout.startedAt, latestWorkout.finishedAt)} • ${formatCompactVolume(calcVolume(latestWorkout))}`
                        : 'Po pierwszym treningu zobaczysz tu ostatnią zapisaną sesję.'}
                    </p>
                  </div>
                </div>
              </motion.div>
            </section>

            <section className="surface-panel rounded-[var(--radius-xl)] p-5">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="eyebrow">Moje plany</p>
                  <h2 className="section-title mt-2">Szablony gotowe do startu</h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6" style={{ color: 'var(--muted)' }}>
                    Stałe rozpiski skracają wejście w sesję i pilnują rytmu tygodnia.
                  </p>
                </div>
                <motion.button
                  onClick={() => navigate('/templates')}
                  className="rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-semibold"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'white' }}
                  whileTap={{ scale: 0.97 }}
                >
                  Otwórz plany
                </motion.button>
              </div>

              {recentTemplates.length === 0 ? (
                <div
                  className="rounded-[var(--radius-lg)] border border-dashed px-5 py-8 text-center"
                  style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.02)' }}
                >
                  <p className="text-sm font-semibold text-white">Brak zapisanych szablonów</p>
                  <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
                    Zacznij od jednej rozpiski na stały dzień treningowy, a potem uruchamiaj ją bez ręcznego układania ćwiczeń.
                  </p>
                  <motion.button
                    onClick={() => navigate('/templates/new')}
                    className="mt-5 rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-semibold"
                    style={{ background: 'linear-gradient(180deg, var(--accent) 0%, #3f8ff4 100%)', color: 'var(--accent-foreground)' }}
                    whileTap={{ scale: 0.97 }}
                  >
                    Utwórz pierwszy plan
                  </motion.button>
                </div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-3">
                  {recentTemplates.map((template) => {
                    const exerciseCount = template.days.reduce((sum, day) => sum + day.exercises.length, 0)
                    return (
                      <motion.button
                        key={template.id}
                        onClick={() => navigate(`/templates/${template.id}/edit`)}
                        className="rounded-[var(--radius-lg)] border p-4 text-left transition-transform hover:-translate-y-0.5"
                        style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.025)' }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{template.name}</p>
                            <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
                              {template.days.length} {template.days.length === 1 ? 'dzień' : 'dni'} • {exerciseCount} {exerciseCount === 1 ? 'ćwiczenie' : 'ćwiczeń'}
                            </p>
                          </div>
                          <Layers3 size={15} style={{ color: 'var(--accent)' }} />
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {template.days.slice(0, 3).map((day, index) => (
                            <span
                              key={`${template.id}-${index}`}
                              className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--muted)' }}
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
          </main>
        </motion.div>

        <section className="mt-5">
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
                  className="text-sm font-medium px-3 py-2 rounded-full transition-colors hover:bg-white/5 whitespace-nowrap"
                  style={{ color: 'var(--accent)' }}
                >
                  Zobacz wszystkie →
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
                      className="w-16 h-16 rounded-[var(--radius-lg)] flex items-center justify-center text-3xl"
                      style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-soft-strong)' }}
                    >
                      ✦
                    </div>
                    <div>
                      <p className="font-semibold text-white mb-1">Brak treningów</p>
                      <p className="text-sm" style={{ color: 'var(--muted)' }}>
                        Zacznij pierwszą sesję i odblokuj overview tygodnia, insighty i historię pracy.
                      </p>
                    </div>
                    <motion.button
                      onClick={() => navigate('/workout/new')}
                      className="mt-2 rounded-[var(--radius-md)] px-6 py-2.5 text-sm font-semibold"
                      style={{ background: 'linear-gradient(180deg, var(--accent) 0%, #3f8ff4 100%)', color: 'var(--accent-foreground)' }}
                      whileTap={{ scale: 0.96 }}
                    >
                      + Nowy trening
                    </motion.button>
                  </motion.div>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {recentWorkouts.map((workout) => {
                      const accent = workoutAccent(workout)
                      const volume = calcVolume(workout)
                      const totalSets = workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)
                      const totalExercises = workout.exercises.length

                      return (
                        <motion.div
                          key={workout.id}
                          className="cursor-pointer relative overflow-hidden rounded-[var(--radius-xl)]"
                          style={{
                            opacity: deletingId === workout.id ? 0.4 : 1,
                            background: 'linear-gradient(180deg, rgba(24,32,48,0.92) 0%, rgba(16,22,34,0.96) 100%)',
                            border: '1px solid var(--border)',
                            boxShadow: '0 10px 36px rgba(2,8,20,0.38)',
                          }}
                          initial={false}
                          role="link"
                          tabIndex={0}
                          aria-label={`Otwórz trening ${workout.label ?? workoutTitle(workout)}`}
                          animate={{ opacity: deletingId === workout.id ? 0.4 : 1, x: 0 }}
                          exit={{ opacity: 0, x: -30, height: 0, marginBottom: 0 }}
                          transition={{ duration: 0.22 }}
                          whileHover={{ y: -2, boxShadow: `0 18px 52px rgba(2,8,20,0.55), inset 0 0 0 1px ${accent}33` }}
                          onClick={() => openWorkout(workout)}
                          onKeyDown={(event) => handleWorkoutCardKeyDown(event, workout)}
                        >
                          <div
                            className="absolute inset-x-0 top-0 h-px"
                            style={{ background: `linear-gradient(90deg, ${accent}00 0%, ${accent} 50%, ${accent}00 100%)` }}
                          />

                          <div className="p-5">
                            <div className="mb-4 flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span
                                    className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                                    style={{ background: `${accent}15`, color: accent, border: `1px solid ${accent}30` }}
                                  >
                                    {totalSets}×
                                  </span>
                                  {!workout.materialized && (
                                    <span
                                      className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                                      style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--muted)', border: '1px solid var(--border)' }}
                                    >
                                      sync
                                    </span>
                                  )}
                                </div>
                                <p className="mt-3 text-lg font-semibold tracking-[-0.03em] text-white truncate">
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

                              <motion.button
                                onClick={(e) => handleDelete(workout.id, e)}
                                className="flex-none rounded-lg p-1.5"
                                style={{
                                  color: '#FF5757',
                                  opacity: 0.72,
                                  background: 'rgba(255,87,87,0.08)',
                                  border: '1px solid rgba(255,87,87,0.12)',
                                }}
                                whileHover={{ opacity: 1 }}
                                whileTap={{ scale: 0.85 }}
                                disabled={deletingId === workout.id}
                                aria-label="Usuń trening"
                              >
                                <Trash2 size={13} />
                              </motion.button>
                            </div>

                            <div className="mb-4 flex flex-wrap gap-2">
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

                            <div className="grid grid-cols-3 gap-2">
                              <div className="rounded-[var(--radius-lg)] border p-3" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.025)' }}>
                                <p className="stat-meta">Objętość</p>
                                <p className="mt-2 text-lg font-semibold text-white tabular-nums">{formatCompactVolume(volume)}</p>
                              </div>
                              <div className="rounded-[var(--radius-lg)] border p-3" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.025)' }}>
                                <p className="stat-meta">Ćwiczenia</p>
                                <p className="mt-2 text-lg font-semibold text-white tabular-nums">{totalExercises}</p>
                              </div>
                              <div className="rounded-[var(--radius-lg)] border p-3" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.025)' }}>
                                <p className="stat-meta">Czas</p>
                                <p className="mt-2 text-lg font-semibold text-white tabular-nums">{formatDuration(workout.startedAt, workout.finishedAt)}</p>
                              </div>
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
    </>
  )
}
