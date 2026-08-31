import { useEffect, useState } from 'react'
import type * as React from 'react'
import { toast } from 'sonner'
import { updateProfile, type PrimaryGoal, type Units } from '../lib/userProfile'
import { useProfileStore } from '../store/profileStore'
import { useAuthStore } from '../store/authStore'
import { Button, Input } from '../components/ui'
import { polishPlural } from '../lib/polishPlural'

const GOALS: { value: PrimaryGoal; label: string }[] = [
  { value: 'strength', label: 'Siła' },
  { value: 'hypertrophy', label: 'Masa mięśniowa' },
  { value: 'endurance', label: 'Wytrzymałość' },
  { value: 'weight_loss', label: 'Redukcja' },
]

export default function ProfilePage() {
  const { user } = useAuthStore()
  const { profile, setProfile } = useProfileStore()

  const [displayName, setDisplayName] = useState(profile?.displayName ?? '')
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal>(profile?.primaryGoal ?? 'hypertrophy')
  const [weeklyGoal, setWeeklyGoal] = useState(profile?.weeklyGoal ?? 3)
  const [units, setUnits] = useState<Units>(profile?.units ?? 'kg')
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState('')

  useEffect(() => {
    if (!profile) return
    setDisplayName(profile.displayName ?? '')
    setPrimaryGoal(profile.primaryGoal ?? 'hypertrophy')
    setWeeklyGoal(profile.weeklyGoal ?? 3)
    setUnits(profile.units ?? 'kg')
  }, [profile])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!user || !profile) return
    if (!displayName.trim()) { setNameError('Podaj imię'); return }
    setNameError('')
    setSaving(true)
    const updated = { displayName: displayName.trim(), primaryGoal, weeklyGoal, units }
    try {
      await updateProfile(user.uid, updated)
      setProfile(user.uid, { ...profile, ...updated })
      toast.success('Profil zapisany')
    } catch {
      toast.error('Nie udało się zapisać. Spróbuj ponownie.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="workbench-page">
      <header
        className="pt-4 pb-5 sm:pt-6 sm:pb-6"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <h1 id="profile-title" className="page-title">Profil</h1>
      </header>

      <div className="profile-settings-shell" style={{ maxWidth: '42rem' }}>
        <section className="profile-form-panel" aria-labelledby="profile-title">
          <form onSubmit={handleSubmit} className="flex flex-col">
            <div
              className="flex flex-col gap-2 border-b py-5 sm:py-6"
              style={{ borderColor: 'var(--border)' }}
            >
              <label htmlFor="profile-display-name" className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                Imię
              </label>
              <Input
                id="profile-display-name"
                name="displayName"
                type="text"
                placeholder="np. Jan"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
                error={nameError}
              />
            </div>

            <fieldset
              className="m-0 min-w-0 border-0 border-b py-5 sm:py-6"
              style={{ borderColor: 'var(--border)' }}
            >
              <legend className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                Główny cel
              </legend>
              <div
                className="grid grid-cols-2 gap-px overflow-hidden"
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--border)',
                }}
              >
                {GOALS.map((g) => (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => setPrimaryGoal(g.value)}
                    aria-pressed={primaryGoal === g.value}
                    className="min-h-12 border-0 px-3 py-3 text-left text-sm font-semibold"
                    style={{
                      background: primaryGoal === g.value ? 'var(--accent-soft)' : 'var(--surface-muted)',
                      color: primaryGoal === g.value ? 'var(--text-strong)' : 'var(--muted)',
                      boxShadow: primaryGoal === g.value ? 'inset 3px 0 0 var(--accent)' : 'none',
                    }}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div
              className="grid gap-5 border-b py-5 sm:grid-cols-[minmax(0,1fr)_14rem] sm:gap-8 sm:py-6"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex items-baseline justify-between gap-4">
                  <label htmlFor="profile-weekly-goal" className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                    Treningi w tygodniu
                  </label>
                  <output
                    htmlFor="profile-weekly-goal"
                    className="text-sm font-semibold tabular-nums"
                    style={{ color: 'var(--accent-text)' }}
                    aria-live="polite"
                  >
                    {weeklyGoal} {polishPlural(weeklyGoal, 'trening', 'treningi', 'treningów')}
                  </output>
                </div>
                <input
                  id="profile-weekly-goal"
                  name="weeklyGoal"
                  type="range"
                  min={1}
                  max={7}
                  value={weeklyGoal}
                  aria-valuetext={`${weeklyGoal} ${polishPlural(weeklyGoal, 'trening', 'treningi', 'treningów')}`}
                  onChange={(e) => setWeeklyGoal(Number(e.target.value))}
                  className="readiness-slider w-full"
                />
                <div className="flex justify-between text-xs" style={{ color: 'var(--muted)' }} aria-hidden="true">
                  <span>1</span><span>7</span>
                </div>
              </div>

              <fieldset className="m-0 min-w-0 border-0 p-0">
                <legend className="mb-2 text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                  Jednostki
                </legend>
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
              </fieldset>
            </div>

            <div className="pt-5 sm:pt-6">
              <Button
                type="submit"
                disabled={saving}
                aria-busy={saving || undefined}
                className="w-full sm:w-auto sm:min-w-52"
              >
                {saving ? 'Zapisywanie…' : 'Zapisz zmiany'}
              </Button>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
