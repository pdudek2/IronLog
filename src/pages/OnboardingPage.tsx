import { useState } from 'react'
import type * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { saveProfile, type PrimaryGoal, type Units } from '../lib/userProfile'
import { useProfileStore } from '../store/profileStore'
import { useAuthStore } from '../store/authStore'
import AuthShell from '../components/AuthShell'
import { Button, Input } from '../components/ui'

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
  const [submitError, setSubmitError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!user) return
    if (!displayName.trim()) {
      setNameError('Podaj imię')
      return
    }
    setNameError('')
    setSubmitError('')
    setLoading(true)
    const profile = {
      displayName: displayName.trim(),
      primaryGoal,
      weeklyGoal,
      units,
      createdAt: Date.now(),
    }
    try {
      await saveProfile(user.uid, profile)
      setProfile(profile)
      navigate('/dashboard')
    } catch {
      const message = 'Nie udało się zapisać profilu. Spróbuj ponownie.'
      setSubmitError(message)
      setLoading(false)
      toast.error(message)
    }
  }

  return (
    <AuthShell
      title="Skonfiguruj profil"
      subtitle="Zajmie to tylko chwilę."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-6" aria-describedby={submitError ? 'onboarding-submit-error' : undefined}>

        {/* Display name */}
        <div className="flex flex-col gap-1">
          <label htmlFor="onboarding-display-name" className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
            Jak mamy się do Ciebie zwracać?
          </label>
          <Input
            id="onboarding-display-name"
            name="displayName"
            type="text"
            placeholder="np. Jan"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="name"
            error={nameError}
          />
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
                aria-pressed={primaryGoal === g.value}
                className="rounded-[var(--radius-md)] p-4 text-left transition-all"
                style={{
                  background: primaryGoal === g.value ? 'var(--accent-soft)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${primaryGoal === g.value ? 'var(--accent-soft-strong)' : 'var(--border)'}`,
                  color: primaryGoal === g.value ? 'var(--text-strong)' : 'var(--text)',
                }}
              >
                <div className="text-sm font-semibold">{g.label}</div>
                <div className="mt-1 text-xs leading-5" style={{ color: 'var(--muted)' }}>{g.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Weekly goal */}
        <div className="flex flex-col gap-2">
          <label htmlFor="onboarding-weekly-goal" className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
            Ile treningów tygodniowo?
            <span className="ml-2 font-bold" style={{ color: 'var(--accent)' }}>{weeklyGoal}</span>
          </label>
          <input
            id="onboarding-weekly-goal"
            name="weeklyGoal"
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
                aria-pressed={units === u}
                className="flex-1 rounded-[var(--radius-md)] py-3 text-sm font-semibold transition-all"
                style={{
                  background: units === u ? 'var(--accent-soft)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${units === u ? 'var(--accent-soft-strong)' : 'var(--border)'}`,
                  color: units === u ? 'var(--text-strong)' : 'var(--text)',
                }}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        {submitError && <p id="onboarding-submit-error" role="alert" className="text-sm" style={{ color: '#FF4B4B' }}>{submitError}</p>}

        <Button type="submit" loading={loading} className="mt-2 w-full">
          Zaczynajmy
        </Button>
      </form>
    </AuthShell>
  )
}
