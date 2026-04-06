import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Trash2 } from 'lucide-react'
import { logoutUser } from '../lib/auth'
import { getProfile } from '../lib/userProfile'
import {
  getRecentWorkouts, deleteWorkout, retryPendingMaterializations, countWeeklyWorkouts,
  calcStreak, calcVolume, type WorkoutSummary,
} from '../lib/workoutService'
import { exercises as exerciseDb } from '../data/exercises'
import { useAuthStore } from '../store/authStore'
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

function fadeUp(delay: number) {
  return {
    initial: { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.38 },
  }
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const { profile, loading, setProfile, setLoading } = useProfileStore()
  const navigate = useNavigate()

  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([])
  const [weeklyDone, setWeeklyDone] = useState(0)
  const [streak, setStreak] = useState(0)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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
  }, [user, profile, navigate, setLoading, setProfile])

  async function fetchData(uid: string) {
    const all = await getRecentWorkouts(uid, 50)
    setWorkouts(all.slice(0, 10))
    setWeeklyDone(countWeeklyWorkouts(all))
    setStreak(calcStreak(all))
    void retryPendingMaterializations(all)
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Usunąć ten trening?')) return
    setDeletingId(id)
    try {
      await deleteWorkout(id)
      if (user) void fetchData(user.uid)
    } catch {
      alert('Błąd usuwania. Spróbuj ponownie.')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) return null

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
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.28em]" style={{ color: 'var(--accent)' }}>
              Overview
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {profile?.displayName ?? '—'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: 'var(--muted)' }}>
              Szybki podgląd tygodnia, historii i wejście w kolejną sesję z jednego miejsca.
            </p>
          </div>
          <motion.button
            onClick={logoutUser}
            className="surface-panel rounded-xl px-4 py-2 text-xs font-semibold"
            style={{ color: 'var(--muted)' }}
            whileTap={{ scale: 0.93 }}
          >
            Wyloguj
          </motion.button>
        </motion.div>

        <div className="desktop-app-grid">
          <aside className="desktop-sticky space-y-4">
            <motion.div className="surface-panel rounded-[2rem] p-5" {...fadeUp(0.06)}>
              <div className="mb-4 grid grid-cols-3 gap-2">
                {[
                  { label: 'Treningów', value: workouts.length > 9 ? '10+' : String(workouts.length) },
                  { label: 'Ten tydzień', value: `${weeklyDone}/${weeklyGoal}`, accent: true },
                  { label: 'Seria dni', value: `${streak}` },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-2xl p-3 text-center"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}
                  >
                    <p
                      className="mb-1 text-xl font-bold leading-none"
                      style={{ color: stat.accent ? 'var(--accent)' : 'var(--text)' }}
                    >
                      {stat.value}
                    </p>
                    {stat.accent && (
                      <div className="mb-2 h-1 rounded-full overflow-hidden" style={{ background: 'var(--input-bg)' }}>
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: 'var(--accent)' }}
                          initial={{ width: 0 }}
                          animate={{ width: `${progressPct}%` }}
                          transition={{ delay: 0.4, duration: 0.9 }}
                        />
                      </div>
                    )}
                    <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>

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
                        <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                          {WEEK_LABELS[index]}
                        </p>
                        <motion.div
                          className="w-full min-h-[2.75rem] aspect-square rounded-xl flex items-center justify-center"
                          style={{
                            background: hasWorkout ? 'var(--teal)' : isPast ? 'rgba(255,255,255,0.03)' : 'transparent',
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
                Quick Start
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
                  className="surface-panel rounded-[2rem] p-10 text-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>
                    Brak treningów. Czas na pierwszy!
                  </p>
                </motion.div>
              ) : (
                <div className="grid gap-3 xl:grid-cols-2">
                  {workouts.map((workout, index) => {
                    const accent = workoutAccent(workout)
                    const volume = calcVolume(workout)
                    const totalSets = workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)

                    return (
                      <motion.div
                        key={workout.id}
                        className="surface-panel rounded-[1.75rem] overflow-hidden cursor-pointer relative"
                        style={{
                          borderLeft: `3px solid ${accent}`,
                          opacity: deletingId === workout.id ? 0.4 : 1,
                        }}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: deletingId === workout.id ? 0.4 : 1, x: 0 }}
                        exit={{ opacity: 0, x: -30, height: 0, marginBottom: 0 }}
                        transition={{ delay: index * 0.05, duration: 0.3 }}
                        whileHover={{ borderColor: accent, transition: { duration: 0.15 } }}
                        onClick={() => navigate(`/workout/${workout.id}`)}
                      >
                        <div className="flex items-center gap-3 px-4 py-4">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: accent }} />

                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">
                              {workout.label ?? workoutTitle(workout)}
                            </p>
                            <div className="mt-1 flex items-center gap-2">
                              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                                {formatDate(workout.startedAt)}
                              </span>
                              <span className="text-xs" style={{ color: 'var(--muted)' }}>·</span>
                              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                                {formatDuration(workout.startedAt, workout.finishedAt)}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1">
                            <span
                              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                              style={{ background: `${accent}18`, color: accent }}
                            >
                              {totalSets} serii
                            </span>
                            {volume > 0 && (
                              <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
                                {volume.toLocaleString('pl-PL')} kg
                              </span>
                            )}
                          </div>

                          <motion.button
                            onClick={(e) => handleDelete(workout.id, e)}
                            className="ml-2 p-1.5 rounded-lg transition-opacity"
                            style={{ color: '#FF5757', opacity: 0.3 }}
                            whileHover={{ opacity: 1 }}
                            whileTap={{ scale: 0.85 }}
                            disabled={deletingId === workout.id}
                          >
                            <Trash2 size={14} />
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
    </div>
  )
}
