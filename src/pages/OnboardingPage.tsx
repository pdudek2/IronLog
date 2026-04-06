import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { saveProfile, type PrimaryGoal, type Units } from '../lib/userProfile'
import { useProfileStore } from '../store/profileStore'
import { useAuthStore } from '../store/authStore'

const GOALS: { value: PrimaryGoal; label: string; desc: string }[] = [
  { value: 'strength', label: 'Siła', desc: 'Maksymalne ciężary, niskie powtórzenia' },
  { value: 'hypertrophy', label: 'Masa mięśniowa', desc: 'Objętość i progresja' },
  { value: 'endurance', label: 'Wytrzymałość', desc: 'Więcej powtórzeń, mniejsze ciężary' },
  { value: 'weight_loss', label: 'Redukcja', desc: 'Deficyt kaloryczny i cardio' },
]

export default function OnboardingPage() {
  const { user } = useAuthStore()
  const { setProfile } = useProfileStore()
  const navigate = useNavigate()

  const [displayName, setDisplayName] = useState('')
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal>('hypertrophy')
  const [weeklyGoal, setWeeklyGoal] = useState(3)
  const [units, setUnits] = useState<Units>('kg')
  const [loading, setLoading] = useState(false)
  const [nameError, setNameError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    if (!displayName.trim()) {
      setNameError('Podaj imię')
      return
    }
    setNameError('')
    setLoading(true)
    const profile = {
      displayName: displayName.trim(),
      primaryGoal,
      weeklyGoal,
      units,
      createdAt: Date.now(),
    }
    await saveProfile(user.uid, profile)
    setProfile(profile)
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <div className="mb-10">
          <span className="text-2xl font-bold tracking-tight" style={{ color: 'var(--accent)' }}>
            IronLog
          </span>
          <h1 className="mt-3 text-3xl font-semibold text-white">Skonfiguruj profil</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            Zajmie to tylko chwilę
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">

          {/* Display name */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
              Jak mamy się do Ciebie zwracać?
            </label>
            <input
              type="text"
              placeholder="np. Jan"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="px-4 py-3 rounded-lg text-sm text-white outline-none transition-all"
              style={{ background: 'var(--input-bg)', border: `1px solid ${nameError ? '#FF4B4B' : 'var(--border)'}` }}
            />
            {nameError && <p className="text-xs" style={{ color: '#FF4B4B' }}>{nameError}</p>}
          </div>

          {/* Primary goal */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
              Główny cel
            </label>
            <div className="grid grid-cols-2 gap-2">
              {GOALS.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => setPrimaryGoal(g.value)}
                  className="p-3 rounded-lg text-left transition-all"
                  style={{
                    background: primaryGoal === g.value ? 'var(--accent)' : 'var(--card)',
                    border: `1px solid ${primaryGoal === g.value ? 'var(--accent)' : 'var(--border)'}`,
                    color: primaryGoal === g.value ? '#08061A' : 'var(--text)',
                  }}
                >
                  <div className="text-xs font-semibold">{g.label}</div>
                  <div className="text-xs mt-0.5 opacity-70">{g.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Weekly goal */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
              Ile treningów tygodniowo?
              <span className="ml-2 font-bold" style={{ color: 'var(--accent)' }}>{weeklyGoal}</span>
            </label>
            <input
              type="range"
              min={1}
              max={7}
              value={weeklyGoal}
              onChange={(e) => setWeeklyGoal(Number(e.target.value))}
              className="w-full accent-[var(--accent)]"
            />
            <div className="flex justify-between text-xs" style={{ color: 'var(--muted)' }}>
              <span>1</span><span>7</span>
            </div>
          </div>

          {/* Units */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Jednostki</label>
            <div className="flex gap-2">
              {(['kg', 'lbs'] as Units[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnits(u)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all"
                  style={{
                    background: units === u ? 'var(--accent)' : 'var(--card)',
                    border: `1px solid ${units === u ? 'var(--accent)' : 'var(--border)'}`,
                    color: units === u ? '#08061A' : 'var(--text)',
                  }}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 py-3 rounded-lg font-semibold text-sm tracking-wide transition-opacity disabled:opacity-50 hover:opacity-90"
            style={{ background: 'var(--accent)', color: '#08061A' }}
          >
            {loading ? 'Zapisywanie...' : 'Zaczynajmy'}
          </button>

        </form>
      </div>
    </div>
  )
}
