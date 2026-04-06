import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { logoutUser } from '../lib/auth'
import { getProfile } from '../lib/userProfile'
import { getRecentWorkouts, countWeeklyWorkouts, type WorkoutSummary } from '../lib/workoutService'
import { useAuthStore } from '../store/authStore'
import { useProfileStore } from '../store/profileStore'

const GOAL_LABELS = {
  strength:    'Siła',
  hypertrophy: 'Masa mięśniowa',
  endurance:   'Wytrzymałość',
  weight_loss: 'Redukcja',
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' })
}

function formatDuration(start: number, end: number): string {
  const m = Math.round((end - start) / 60_000)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function fadeUp(delay: number) {
  return {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.4 },
  }
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const { profile, loading, setProfile, setLoading } = useProfileStore()
  const navigate = useNavigate()

  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([])
  const [weeklyDone, setWeeklyDone] = useState(0)

  useEffect(() => {
    if (!user) return
    if (profile) {
      fetchWorkoutData()
      return
    }
    setLoading(true)
    getProfile(user.uid).then((p) => {
      if (!p) {
        navigate('/onboarding', { replace: true })
      } else {
        setProfile(p)
      }
    })
  }, [user, profile])

  async function fetchWorkoutData() {
    if (!user) return
    const recent = await getRecentWorkouts(user.uid, 20)
    setWorkouts(recent.slice(0, 5))
    setWeeklyDone(countWeeklyWorkouts(recent))
  }

  async function handleLogout() {
    await logoutUser()
  }

  if (loading) return null

  const weeklyGoal = profile?.weeklyGoal ?? 3
  const progressPct = weeklyGoal > 0 ? Math.min((weeklyDone / weeklyGoal) * 100, 100) : 0

  return (
    <div className="min-h-screen px-4 py-8 max-w-lg mx-auto">

      {/* Header */}
      <motion.div
        className="flex items-center justify-between mb-8"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Cześć,</p>
          <h1 className="text-2xl font-bold text-white">{profile?.displayName ?? '—'}</h1>
        </div>
        <motion.button
          onClick={handleLogout}
          className="px-4 py-2 rounded-lg text-sm"
          style={{ background: 'var(--card)', color: 'var(--muted)', border: '1px solid var(--border)' }}
          whileTap={{ scale: 0.95 }}
          whileHover={{ opacity: 0.7 }}
        >
          Wyloguj
        </motion.button>
      </motion.div>

      {/* Weekly progress */}
      <motion.div
        className="rounded-2xl p-5 mb-4"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        {...fadeUp(0.05)}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-white">Cel tygodniowy</span>
          <motion.span
            className="text-sm font-bold"
            style={{ color: 'var(--accent)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {weeklyDone}/{weeklyGoal}
          </motion.span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--input-bg)' }}>
          <motion.div
            className="h-2 rounded-full"
            style={{ background: 'var(--accent)' }}
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ delay: 0.3, duration: 0.8 }}
          />
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
          {profile ? GOAL_LABELS[profile.primaryGoal] : ''} · {profile?.units ?? 'kg'}
        </p>
      </motion.div>

      {/* Start workout CTA */}
      <motion.button
        className="w-full py-4 rounded-2xl font-semibold text-sm tracking-wide mb-6"
        style={{ background: 'var(--accent)', color: '#08061A' }}
        onClick={() => navigate('/workout/new')}
        {...fadeUp(0.12)}
        whileHover={{ scale: 1.01, opacity: 0.95 }}
        whileTap={{ scale: 0.98 }}
      >
        + Nowy trening
      </motion.button>

      {/* Recent workouts */}
      <motion.div {...fadeUp(0.19)}>
        <h2 className="text-sm font-semibold text-white mb-3">Ostatnie treningi</h2>
        <AnimatePresence mode="wait">
          {workouts.length === 0 ? (
            <motion.div
              key="empty"
              className="rounded-2xl p-6 text-center"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                Brak treningów. Czas na pierwszy!
              </p>
            </motion.div>
          ) : (
            <motion.div key="list" className="flex flex-col gap-3">
              {workouts.map((w, i) => (
                <motion.div
                  key={w.id}
                  className="rounded-2xl p-4"
                  style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.06, duration: 0.35 }}
                  whileHover={{ borderColor: 'rgba(232,255,87,0.25)', transition: { duration: 0.15 } }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-white">
                      {w.exercises.map((e) => e.name).join(', ') || 'Trening'}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>
                      {formatDuration(w.startedAt, w.finishedAt)}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    {formatDate(w.startedAt)} · {w.exercises.length} ćw.
                  </p>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

    </div>
  )
}
