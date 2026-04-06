import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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

  return (
    <div className="min-h-screen px-4 py-8 max-w-lg mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Cześć,</p>
          <h1 className="text-2xl font-bold text-white">{profile?.displayName ?? '—'}</h1>
        </div>
        <button
          onClick={handleLogout}
          className="px-4 py-2 rounded-lg text-sm transition-opacity hover:opacity-70"
          style={{ background: 'var(--card)', color: 'var(--muted)', border: '1px solid var(--border)' }}
        >
          Wyloguj
        </button>
      </div>

      {/* Weekly progress */}
      <div
        className="rounded-2xl p-5 mb-4"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-white">Cel tygodniowy</span>
          <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>
            {weeklyDone}/{weeklyGoal}
          </span>
        </div>
        <div className="h-2 rounded-full" style={{ background: 'var(--input-bg)' }}>
          <div
            className="h-2 rounded-full transition-all"
            style={{
              background: 'var(--accent)',
              width: `${weeklyGoal > 0 ? Math.min((weeklyDone / weeklyGoal) * 100, 100) : 0}%`,
            }}
          />
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
          {profile ? GOAL_LABELS[profile.primaryGoal] : ''} · {profile?.units ?? 'kg'}
        </p>
      </div>

      {/* Start workout CTA */}
      <button
        className="w-full py-4 rounded-2xl font-semibold text-sm tracking-wide transition-opacity hover:opacity-90 mb-6"
        style={{ background: 'var(--accent)', color: '#08061A' }}
        onClick={() => navigate('/workout/new')}
      >
        + Nowy trening
      </button>

      {/* Recent workouts */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3">Ostatnie treningi</h2>
        {workouts.length === 0 ? (
          <div
            className="rounded-2xl p-6 text-center"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Brak treningów. Czas na pierwszy!
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {workouts.map((w) => (
              <div
                key={w.id}
                className="rounded-2xl p-4"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
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
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
