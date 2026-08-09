import { useEffect, useState } from 'react'
import type * as React from 'react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { updateProfile, type PrimaryGoal, type Units } from '../lib/userProfile'
import { useProfileStore } from '../store/profileStore'
import { useAuthStore } from '../store/authStore'
import { Button, Card, Input } from '../components/ui'

const GOALS: { value: PrimaryGoal; label: string; desc: string }[] = [
  { value: 'strength',    label: 'Siła',           desc: 'Maksymalne ciężary, niskie powtórzenia' },
  { value: 'hypertrophy', label: 'Masa mięśniowa', desc: 'Objętość i progresja' },
  { value: 'endurance',   label: 'Wytrzymałość',   desc: 'Więcej powtórzeń, mniejsze ciężary' },
  { value: 'weight_loss', label: 'Redukcja',        desc: 'Deficyt kaloryczny i cardio' },
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
  const [saved, setSaved] = useState(false)

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
      setSaved(true)
      toast.success('Profil zapisany')
      setTimeout(() => setSaved(false), 2000)
    } catch {
      toast.error('Nie udało się zapisać. Spróbuj ponownie.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <section className="hero-editorial">
        <motion.div
          className="flex flex-col gap-4 sm:gap-5"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <p className="hero-editorial-date">Ustawienia · konto</p>

          <div>
            <h1 className="hero-editorial-name">Twój profil</h1>
          </div>

        </motion.div>
      </section>

      <div className="profile-settings-shell mx-auto" style={{ maxWidth: '42rem' }}>
        <Card padding="sm" className="profile-form-panel sm:p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5 sm:gap-6">

            <div className="flex flex-col gap-1">
              <label htmlFor="profile-display-name" className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Imię</label>
              <Input
                id="profile-display-name"
                name="displayName"
                type="text"
                placeholder="np. Jan"
                value={displayName}
                onChange={(e) => { setDisplayName(e.target.value); setSaved(false) }}
                autoComplete="name"
                error={nameError}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Główny cel</label>
              <div className="grid grid-cols-2 gap-2">
                {GOALS.map((g) => (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => { setPrimaryGoal(g.value); setSaved(false) }}
                    aria-pressed={primaryGoal === g.value}
                    className="rounded-[var(--radius-md)] p-3 text-left transition-all sm:p-4"
                    style={{
                      background: primaryGoal === g.value ? 'var(--accent-soft)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${primaryGoal === g.value ? 'var(--accent-soft-strong)' : 'var(--border)'}`,
                      color: primaryGoal === g.value ? 'var(--text-strong)' : 'var(--text)',
                    }}
                  >
                    <div className="text-sm font-semibold">{g.label}</div>
                    <div className="mt-1 text-xs leading-5" style={{ color: primaryGoal === g.value ? 'var(--muted)' : 'var(--muted)' }}>
                      {g.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="profile-weekly-goal" className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                Cel tygodniowy
                <span className="ml-2 font-bold" style={{ color: 'var(--accent)' }}>{weeklyGoal}</span>
              </label>
              <input
                id="profile-weekly-goal"
                name="weeklyGoal"
                type="range"
                min={1} max={7}
                value={weeklyGoal}
                onChange={(e) => { setWeeklyGoal(Number(e.target.value)); setSaved(false) }}
                className="w-full accent-[var(--accent)]"
              />
              <div className="flex justify-between text-xs" style={{ color: 'var(--muted)' }}>
                <span>1</span><span>7</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Jednostki</label>
              <div className="flex gap-2">
                {(['kg', 'lbs'] as Units[]).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => { setUnits(u); setSaved(false) }}
                    aria-pressed={units === u}
                    className="flex-1 rounded-[var(--radius-md)] py-2.5 text-sm font-semibold transition-all sm:py-3"
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

            <Button
              type="submit"
              loading={saving}
              className="mt-2 w-full"
              style={{
                background: saved
                  ? 'var(--success-gradient)'
                  : 'var(--primary-gradient)',
                color: saved ? 'var(--success-foreground)' : 'var(--accent-foreground)',
                boxShadow: saved
                  ? '0 14px 32px rgba(143,184,160,0.2)'
                  : '0 14px 32px rgba(240,67,90,0.22)',
              }}
            >
              {saved ? 'Zapisano ✓' : 'Zapisz zmiany'}
            </Button>

          </form>
        </Card>
      </div>
    </>
  )
}
