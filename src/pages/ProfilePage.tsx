import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateProfile, type PrimaryGoal, type Units } from '../lib/userProfile'
import { useProfileStore } from '../store/profileStore'
import { useAuthStore } from '../store/authStore'
import { Button, Card, Input } from '../components/ui'
import BottomNav from '../components/BottomNav'

const GOALS: { value: PrimaryGoal; label: string; desc: string }[] = [
  { value: 'strength',    label: 'Siła',           desc: 'Maksymalne ciężary, niskie powtórzenia' },
  { value: 'hypertrophy', label: 'Masa mięśniowa', desc: 'Objętość i progresja' },
  { value: 'endurance',   label: 'Wytrzymałość',   desc: 'Więcej powtórzeń, mniejsze ciężary' },
  { value: 'weight_loss', label: 'Redukcja',        desc: 'Deficyt kaloryczny i cardio' },
]

export default function ProfilePage() {
  const { user } = useAuthStore()
  const { profile, setProfile } = useProfileStore()
  const navigate = useNavigate()

  const [displayName, setDisplayName] = useState(profile?.displayName ?? '')
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal>(profile?.primaryGoal ?? 'hypertrophy')
  const [weeklyGoal, setWeeklyGoal] = useState(profile?.weeklyGoal ?? 3)
  const [units, setUnits] = useState<Units>(profile?.units ?? 'kg')
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState('')
  const [saved, setSaved] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user || !profile) return
    if (!displayName.trim()) { setNameError('Podaj imię'); return }
    setNameError('')
    setSaving(true)
    const updated = { displayName: displayName.trim(), primaryGoal, weeklyGoal, units }
    await updateProfile(user.uid, updated)
    setProfile({ ...profile, ...updated })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="page-shell">
      <div className="page-container" style={{ maxWidth: '36rem' }}>

        <div className="mb-6 flex items-center justify-between gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-sm transition-opacity hover:opacity-70"
            style={{ color: 'var(--muted)' }}
          >
            ← Powrót
          </button>

          <div className="hidden sm:flex gap-2">
            <button
              onClick={() => navigate('/exercises')}
              className="surface-panel rounded-xl px-4 py-2 text-xs font-semibold"
              style={{ color: 'var(--muted)' }}
            >
              Ćwiczenia
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="surface-panel rounded-xl px-4 py-2 text-xs font-semibold"
              style={{ color: 'var(--muted)' }}
            >
              Start
            </button>
          </div>
        </div>

        <Card>
          <div className="mb-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em]" style={{ color: 'var(--accent)' }}>
              Ustawienia
            </p>
            <h1 className="mt-2 text-2xl font-bold text-white">Twój profil</h1>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Imię</label>
              <Input
                type="text"
                placeholder="np. Jan"
                value={displayName}
                onChange={(e) => { setDisplayName(e.target.value); setSaved(false) }}
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

            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                Cel tygodniowy
                <span className="ml-2 font-bold" style={{ color: 'var(--accent)' }}>{weeklyGoal}</span>
              </label>
              <input
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

            <Button
              type="submit"
              loading={saving}
              className="mt-2 w-full"
              style={{ background: saved ? 'var(--teal)' : 'var(--accent)' }}
            >
              {saved ? 'Zapisano ✓' : 'Zapisz zmiany'}
            </Button>

          </form>
        </Card>
      </div>
      <BottomNav />
    </div>
  )
}
