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
      setProfile(user.uid, profile)
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
      title="Ustaw profil"
      subtitle="Te ustawienia możesz później zmienić w profilu."
    >
      <form onSubmit={handleSubmit} className="onboarding-form flex flex-col gap-4" aria-describedby={submitError ? 'onboarding-submit-error' : undefined}>

        {/* Display name */}
        <div className="flex flex-col gap-1">
          <label htmlFor="onboarding-display-name" className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
            Imię
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
        <div className="flex flex-col gap-2" role="group" aria-labelledby="onboarding-goal-label">
          <span id="onboarding-goal-label" className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
            Cel treningowy
          </span>
          <div className="profile-choice-grid">
            {GOALS.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => setPrimaryGoal(g.value)}
                aria-pressed={primaryGoal === g.value}
                className="profile-choice"
              >
                <div className="text-sm font-semibold">{g.label}</div>
                <div className="mt-1 text-xs leading-5" style={{ color: 'var(--muted)' }}>{g.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Weekly goal */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="onboarding-weekly-goal" className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
              Treningi w tygodniu
            </label>
            <output htmlFor="onboarding-weekly-goal" className="text-sm font-bold" style={{ color: 'var(--accent)' }}>
              {weeklyGoal}
            </output>
          </div>
          <input
            id="onboarding-weekly-goal"
            name="weeklyGoal"
            type="range"
            min={1}
            max={7}
            value={weeklyGoal}
            onChange={(e) => setWeeklyGoal(Number(e.target.value))}
            aria-valuetext={`${weeklyGoal} z 7`}
            className="w-full accent-[var(--accent)]"
          />
          <div className="flex justify-between text-xs" style={{ color: 'var(--muted)' }}>
            <span>1</span><span>7</span>
          </div>
        </div>

        {/* Units */}
        <div className="flex flex-col gap-2" role="group" aria-labelledby="onboarding-units-label">
          <span id="onboarding-units-label" className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Jednostki</span>
          <div className="profile-unit-grid">
            {(['kg', 'lbs'] as Units[]).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnits(u)}
                aria-pressed={units === u}
                className="profile-unit-choice"
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        {submitError && <p id="onboarding-submit-error" role="alert" className="text-sm" style={{ color: 'var(--danger)' }}>{submitError}</p>}

        <Button type="submit" loading={loading} className="w-full">
          Zapisz profil
        </Button>
      </form>
    </AuthShell>
  )
}
