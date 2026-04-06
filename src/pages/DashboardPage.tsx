import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Trash2 } from 'lucide-react'
import { logoutUser } from '../lib/auth'
import { getProfile } from '../lib/userProfile'
import {
  getRecentWorkouts, deleteWorkout, countWeeklyWorkouts,
  calcStreak, calcVolume, type WorkoutSummary,
} from '../lib/workoutService'
import { exercises as exerciseDb } from '../data/exercises'
import { useAuthStore } from '../store/authStore'
import { useProfileStore } from '../store/profileStore'

// ─── helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  chest:     '#4D8EFF',
  back:      '#9B6DFF',
  legs:      '#FF5757',
  arms:      '#FF9F43',
  shoulders: '#FF6B9D',
  core:      '#00D4AA',
  cardio:    '#FFD700',
}
const exerciseMap = new Map(exerciseDb.map((e) => [e.id, e]))

function workoutAccent(w: WorkoutSummary): string {
  const ex = w.exercises[0]
  if (!ex?.exerciseId) return '#808CB3'
  const cat = exerciseMap.get(ex.exerciseId)?.category
  return CATEGORY_COLORS[cat ?? ''] ?? '#808CB3'
}

function workoutTitle(w: WorkoutSummary): string {
  const names = w.exercises.map((e) => e.name)
  if (!names.length) return 'Trening'
  if (names.length <= 2) return names.join(' + ')
  return `${names[0]} +${names.length - 1}`
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' })
}

function formatDuration(start: number, end: number): string {
  const m = Math.round((end - start) / 60_000)
  if (m < 1) return '< 1 min'
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

const WEEK_LABELS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd']

function getWeekDates(): Date[] {
  const today = new Date()
  const monday = new Date(today)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function fadeUp(delay: number) {
  return {
    initial: { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.38 },
  }
}

// ─── component ────────────────────────────────────────────────────────────────

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
    if (profile) { fetchData(); return }
    setLoading(true)
    getProfile(user.uid).then((p) => {
      if (!p) navigate('/onboarding', { replace: true })
      else setProfile(p)
    })
  }, [user, profile])

  async function fetchData() {
    if (!user) return
    const all = await getRecentWorkouts(user.uid, 50)
    setWorkouts(all.slice(0, 10))
    setWeeklyDone(countWeeklyWorkouts(all))
    setStreak(calcStreak(all))
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Usunąć ten trening?')) return
    setDeletingId(id)
    try {
      await deleteWorkout(id)
      setWorkouts((prev) => prev.filter((w) => w.id !== id))
      if (weeklyDone > 0) setWeeklyDone((n) => n - 1)
    } catch {
      alert('Błąd usuwania. Sprawdź reguły Firestore.')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) return null

  const weeklyGoal = profile?.weeklyGoal ?? 3
  const progressPct = Math.min((weeklyDone / weeklyGoal) * 100, 100)
  const weekDates = getWeekDates()
  const today = new Date()
  const workoutDays = workouts.map((w) => new Date(w.startedAt))

  return (
    <div className="min-h-screen pb-10 max-w-lg mx-auto">

      {/* ── Header ── */}
      <motion.div
        className="flex items-start justify-between px-5 pt-10 pb-6"
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div>
          <p className="text-xs tracking-widest uppercase mb-1" style={{ color: 'var(--muted)' }}>
            Cześć,
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-white leading-none">
            {profile?.displayName ?? '—'}
          </h1>
        </div>
        <motion.button
          onClick={logoutUser}
          className="mt-1 px-3 py-1.5 rounded-lg text-xs"
          style={{ background: 'var(--card)', color: 'var(--muted)', border: '1px solid var(--border)' }}
          whileTap={{ scale: 0.93 }}
        >
          Wyloguj
        </motion.button>
      </motion.div>

      {/* ── Stats strip ── */}
      <motion.div className="grid grid-cols-3 gap-2 px-5 mb-5" {...fadeUp(0.06)}>
        {[
          { label: 'Treningów', value: workouts.length > 9 ? '10+' : String(workouts.length) },
          { label: 'Ten tydzień', value: `${weeklyDone}/${weeklyGoal}`, accent: true },
          { label: 'Seria dni', value: `${streak}` },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl p-3 text-center"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <p
              className="text-xl font-bold leading-none mb-1"
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
      </motion.div>

      {/* ── Week tracker ── */}
      <motion.div className="px-5 mb-5" {...fadeUp(0.12)}>
        <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>
          Ten tydzień
        </p>
        <div className="flex gap-1.5">
          {weekDates.map((date, i) => {
            const isToday = isSameDay(date, today)
            const hasWorkout = workoutDays.some((wd) => isSameDay(wd, date))
            const isPast = date <= today
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                  {WEEK_LABELS[i]}
                </p>
                <motion.div
                  className="w-full min-h-[2.5rem] aspect-square rounded-lg flex items-center justify-center"
                  style={{
                    background: hasWorkout ? 'var(--teal)' : isPast ? 'rgba(255,255,255,0.03)' : 'transparent',
                    border: isToday
                      ? '1.5px solid var(--accent)'
                      : `1px solid ${hasWorkout ? 'var(--teal)' : 'var(--border)'}`,
                  }}
                  animate={hasWorkout ? { scale: [0.85, 1] } : {}}
                  transition={{ delay: i * 0.04, duration: 0.3 }}
                >
                  {hasWorkout && (
                    <div className="w-1.5 h-1.5 rounded-full bg-[#08061A]" />
                  )}
                </motion.div>
              </div>
            )
          })}
        </div>
      </motion.div>

      {/* ── CTA ── */}
      <motion.div className="px-5 mb-7" {...fadeUp(0.2)}>
        <motion.button
          className="w-full py-4 rounded-2xl font-bold text-sm tracking-widest uppercase"
          style={{ background: 'var(--accent)', color: '#08061A' }}
          onClick={() => navigate('/workout/new')}
          whileHover={{ scale: 1.015 }}
          whileTap={{ scale: 0.97 }}
        >
          + Nowy trening
        </motion.button>
      </motion.div>

      {/* ── Workout history ── */}
      <div className="px-5">
        <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>
          Ostatnie treningi
        </p>
        <AnimatePresence mode="popLayout">
          {workouts.length === 0 ? (
            <motion.div
              key="empty"
              className="rounded-2xl p-8 text-center"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            >
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                Brak treningów. Czas na pierwszy!
              </p>
            </motion.div>
          ) : (
            workouts.map((w, i) => {
              const accent = workoutAccent(w)
              const vol = calcVolume(w)
              const totalSets = w.exercises.reduce((s, e) => s + e.sets.length, 0)
              return (
                <motion.div
                  key={w.id}
                  className="mb-3 rounded-2xl overflow-hidden cursor-pointer relative"
                  style={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderLeft: `3px solid ${accent}`,
                    opacity: deletingId === w.id ? 0.4 : 1,
                  }}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: deletingId === w.id ? 0.4 : 1, x: 0 }}
                  exit={{ opacity: 0, x: -30, height: 0, marginBottom: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.3 }}
                  whileHover={{ borderColor: accent, transition: { duration: 0.15 } }}
                  onClick={() => navigate(`/workout/${w.id}`)}
                >
                  <div className="px-4 py-3.5 flex items-center gap-3">
                    {/* Color dot */}
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: accent }}
                    />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {workoutTitle(w)}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs" style={{ color: 'var(--muted)' }}>
                          {formatDate(w.startedAt)}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--muted)' }}>·</span>
                        <span className="text-xs" style={{ color: 'var(--muted)' }}>
                          {formatDuration(w.startedAt, w.finishedAt)}
                        </span>
                      </div>
                    </div>

                    {/* Badges */}
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: `${accent}18`, color: accent }}
                      >
                        {totalSets} serii
                      </span>
                      {vol > 0 && (
                        <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
                          {vol.toLocaleString('pl-PL')} kg
                        </span>
                      )}
                    </div>

                    {/* Delete */}
                    <motion.button
                      onClick={(e) => handleDelete(w.id, e)}
                      className="ml-2 p-1.5 rounded-lg transition-opacity"
                      style={{ color: '#FF5757', opacity: 0.3 }}
                      whileHover={{ opacity: 1 }}
                      whileTap={{ scale: 0.85 }}
                      disabled={deletingId === w.id}
                    >
                      <Trash2 size={14} />
                    </motion.button>
                  </div>
                </motion.div>
              )
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
