import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { logoutUser } from '../lib/auth'
import BottomNav from '../components/BottomNav'
import ConfirmDialog from '../components/ConfirmDialog'
import { LoadingState } from '../components/ui'
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
  const workoutsRef = useRef<WorkoutSummary[]>([])

  const fetchData = useCallback(async (uid: string) => {
    const all = await getRecentWorkouts(uid, 50)
    setSnapshot({
      workouts: all.slice(0, 10),
      weeklyDone: countWeeklyWorkouts(all),
      streak: calcStreak(all),
    })
    workoutsRef.current = all
    void retryPendingMaterializations(all)
  }, [setSnapshot])

  useEffect(() => {
    if (!user) return
    if (profile) {
      void fetchData(user.uid)
      return
    }
    setLoading(true)
    getProfile(user.uid).then((nextProfile) => {
      if (!nextProfile) navigate('/onboarding', { replace: true })
      else setProfile(nextProfile)
    })
  }, [user, profile, navigate, setLoading, setProfile, fetchData])

  useEffect(() => {
    function handleOnline() {
      void retryPendingMaterializations(workoutsRef.current)
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [])

  function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setConfirmDelete(id)
  }

  async function confirmDeleteWorkout() {
    if (!confirmDelete) return
    setDeletingId(confirmDelete)
    setConfirmDelete(null)
    try {
      await deleteWorkout(confirmDelete)
      if (user) void fetchData(user.uid)
      toast.success('Trening usunięty')
    } catch {
      toast.error('Błąd usuwania. Spróbuj ponownie.')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading || (!dashboardReady && !!user && !!profile)) {
    return <LoadingState message="Ładowanie dashboardu..." />
  }

  const weeklyGoal = profile?.weeklyGoal ?? 3
  const progressPct = Math.min((weeklyDone / weeklyGoal) * 100, 100)
  const weekDates = getWeekDates()
  const today = new Date()
  const workoutDays = workouts.map((workout) => new Date(workout.startedAt))

  return (
    <div className="page-shell">
      <div className="page-container">
        <motion.div
          className="mb-6 flex items-center justify-between gap-4"
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.28em]" style={{ color: 'var(--accent)' }}>
              {getGreeting()},
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {profile?.displayName ?? '—'}
            </h1>
          </div>
          <div className="flex gap-2">
            <motion.button
              onClick={() => navigate('/exercises')}
              className="surface-panel rounded-xl px-4 py-2 text-xs font-semibold"
              style={{ color: 'var(--muted)' }}
              whileTap={{ scale: 0.93 }}
            >
              Ćwiczenia
            </motion.button>
            <motion.button
              onClick={() => navigate('/profile')}
              className="surface-panel rounded-xl px-4 py-2 text-xs font-semibold"
              style={{ color: 'var(--muted)' }}
              whileTap={{ scale: 0.93 }}
            >
              Profil
            </motion.button>
            <motion.button
              onClick={logoutUser}
              className="surface-panel rounded-xl px-4 py-2 text-xs font-semibold"
              style={{ color: 'var(--muted)' }}
              whileTap={{ scale: 0.93 }}
            >
              Wyloguj
            </motion.button>
          </div>
        </motion.div>

        <div className="desktop-app-grid">
          <aside className="desktop-sticky space-y-4">
            <motion.div className="surface-panel rounded-[2rem] p-5" {...fadeUp(0.06)}>
              {/* Progress ring hero */}
              <div className="flex items-center gap-4 mb-5">
                <div className="relative flex-none">
                  <svg width="88" height="88" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="7" />
                    <motion.circle
                      cx="50" cy="50" r="40" fill="none"
                      stroke={progressPct >= 100 ? 'var(--teal)' : 'var(--accent)'}
                      strokeWidth="7" strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 40}
                      transform="rotate(-90 50 50)"
                      initial={{ strokeDashoffset: 2 * Math.PI * 40 }}
                      animate={{ strokeDashoffset: 2 * Math.PI * 40 * (1 - Math.min(progressPct / 100, 1)) }}
                      transition={{ delay: 0.3, duration: 1.1, ease: 'easeOut' }}
                    />
                    <text x="50" y="46" textAnchor="middle" fill="white" fontSize="18" fontWeight="700" fontFamily="Urbanist">{weeklyDone}</text>
                    <text x="50" y="61" textAnchor="middle" fill="rgba(128,140,179,0.8)" fontSize="10" fontFamily="Urbanist">z {weeklyGoal}</text>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>Ten tydzień</p>
                  <p className="text-2xl font-bold text-white leading-none mb-1">
                    {progressPct >= 100 ? 'Cel osiągnięty!' : `${Math.round(progressPct)}%`}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    {progressPct >= 100 ? 'Świetna robota 💪' : `${weeklyGoal - weeklyDone} ${weeklyGoal - weeklyDone === 1 ? 'trening' : 'treningi'} do celu`}
                  </p>
                </div>
              </div>

              {/* Secondary stats */}
              <div className="grid grid-cols-2 gap-2 mb-5">
                <div className="rounded-2xl p-3" style={{ background: 'rgba(18,209,142,0.07)', border: '1px solid rgba(18,209,142,0.15)' }}>
                  <p className="text-xl font-bold leading-none mb-1" style={{ color: 'var(--teal)' }}>{streak}</p>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Seria dni</p>
                </div>
                <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                  <p className="text-xl font-bold leading-none mb-1 text-white">{workouts.length > 9 ? '10+' : workouts.length}</p>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Treningów</p>
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
                              ? 'var(--teal)'
                              : isToday
                                ? 'rgba(232,255,87,0.08)'
                                : isPast ? 'rgba(255,255,255,0.03)' : 'transparent',
                            border: isToday
                              ? '1.5px solid var(--accent)'
                              : `1px solid ${hasWorkout ? 'var(--teal)' : 'var(--border)'}`,
                          }}
                          animate={hasWorkout ? { scale: [0.85, 1] } : {}}
                          transition={{ delay: index * 0.04, duration: 0.3 }}
                        >
                          {hasWorkout && <div className="w-1.5 h-1.5 rounded-full bg-[#08061A]" />}
                        </motion.div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </motion.div>

            <motion.div className="surface-panel rounded-[2rem] p-5" {...fadeUp(0.12)}>
              <p className="mb-2 text-[10px] uppercase tracking-[0.28em]" style={{ color: 'var(--accent)' }}>
                Szybki start
              </p>
              <p className="mb-5 text-sm leading-6" style={{ color: 'var(--muted)' }}>
                Zacznij nowy trening bez wracania do listy i utrzymaj tempo wejścia do aplikacji.
              </p>
              <motion.button
                className="w-full rounded-[1.4rem] py-4 text-sm font-bold uppercase tracking-[0.24em]"
                style={{ background: 'var(--accent)', color: '#08061A' }}
                onClick={() => navigate('/workout/new')}
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.97 }}
              >
                + Nowy trening
              </motion.button>
            </motion.div>
          </aside>

          <main className="min-w-0">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                  Historia
                </p>
                <h2 className="mt-2 text-2xl font-bold text-white">Ostatnie treningi</h2>
              </div>
              <p className="hidden text-sm lg:block" style={{ color: 'var(--muted)' }}>
                Kliknij kartę, aby wejść w szczegóły lub edycję.
              </p>
            </div>

            <AnimatePresence mode="popLayout">
              {workouts.length === 0 ? (
                <motion.div
                  key="empty"
                  className="surface-panel rounded-[2rem] p-10 text-center flex flex-col items-center gap-4"
                  initial={false}
                  animate={{ opacity: 1 }}
                >
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                    style={{ background: 'rgba(232,255,87,0.08)', border: '1px solid rgba(232,255,87,0.15)' }}
                  >
                    💪
                  </div>
                  <div>
                    <p className="font-semibold text-white mb-1">Brak treningów</p>
                    <p className="text-sm" style={{ color: 'var(--muted)' }}>
                      Zacznij pierwszą sesję i śledź swój progres.
                    </p>
                  </div>
                  <motion.button
                    onClick={() => navigate('/workout/new')}
                    className="mt-2 px-6 py-2.5 rounded-xl text-sm font-semibold"
                    style={{ background: 'var(--accent)', color: '#08061A' }}
                    whileTap={{ scale: 0.96 }}
                  >
                    + Nowy trening
                  </motion.button>
                </motion.div>
              ) : (
                <div className="grid gap-3 xl:grid-cols-2">
                  {workouts.map((workout) => {
                    const accent = workoutAccent(workout)
                    const volume = calcVolume(workout)
                    const totalSets = workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)

                    return (
                      <motion.div
                        key={workout.id}
                        className="cursor-pointer relative overflow-hidden rounded-[1.75rem] flex"
                        style={{
                          opacity: deletingId === workout.id ? 0.4 : 1,
                          background: 'linear-gradient(180deg, rgba(34,31,67,0.92) 0%, rgba(18,17,37,0.88) 100%)',
                          border: '1px solid rgba(128,140,179,0.14)',
                          boxShadow: '0 8px 32px rgba(4,6,18,0.35)',
                        }}
                        initial={false}
                        animate={{ opacity: deletingId === workout.id ? 0.4 : 1, x: 0 }}
                        exit={{ opacity: 0, x: -30, height: 0, marginBottom: 0 }}
                        transition={{ duration: 0.22 }}
                        whileHover={{ y: -2, boxShadow: `0 16px 48px rgba(4,6,18,0.55), inset 0 0 0 1px ${accent}30` }}
                        onClick={() => navigate(`/workout/${workout.id}`, {
                          state: { workoutPreview: workout },
                        })}
                      >
                        {/* Color strip */}
                        <div
                          className="w-1 flex-none rounded-l-[1.75rem]"
                          style={{ background: `linear-gradient(180deg, ${accent} 0%, ${accent}55 100%)` }}
                        />

                        <div className="flex flex-1 items-center gap-3 px-4 py-4 min-w-0">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">
                              {workout.label ?? workoutTitle(workout)}
                            </p>
                            <div className="mt-1 flex items-center gap-2 flex-wrap">
                              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                                {formatDate(workout.startedAt)}
                              </span>
                              <span className="text-xs" style={{ color: 'var(--muted)' }}>·</span>
                              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                                {formatDuration(workout.startedAt, workout.finishedAt)}
                              </span>
                              {volume > 0 && (
                                <>
                                  <span className="text-xs" style={{ color: 'var(--muted)' }}>·</span>
                                  <span className="text-xs font-medium" style={{ color: 'var(--teal)' }}>
                                    {volume.toLocaleString('pl-PL')} kg
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <span
                            className="flex-none text-[10px] font-bold px-2.5 py-1 rounded-full"
                            style={{ background: `${accent}15`, color: accent, border: `1px solid ${accent}30` }}
                          >
                            {totalSets}×
                          </span>

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
                      </motion.div>
                    )
                  })}
                </div>
              )}
            </AnimatePresence>
          </main>
        </div>
      </div>
      <BottomNav />

      {confirmDelete && (
        <ConfirmDialog
          message="Usunąć ten trening? Tej operacji nie można cofnąć."
          confirmLabel="Usuń"
          danger
          onConfirm={confirmDeleteWorkout}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
