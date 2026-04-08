import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateProfile, type PrimaryGoal, type Units } from '../lib/userProfile'
import { useProfileStore } from '../store/profileStore'
import { useAuthStore } from '../store/authStore'
import AppShell from '../components/AppShell'
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
    <AppShell current="profile">
      <div style={{ maxWidth: '42rem' }}>

        <div className="mb-8 flex items-center justify-between gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-sm transition-opacity hover:opacity-70"
            style={{ color: 'var(--muted)' }}
          >
            ← Powrót
          </button>
        </div>

        <Card>
          <div className="mb-6">
            <p className="eyebrow" style={{ color: 'var(--accent)' }}>
              Ustawienia
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-white">Twój profil</h1>
            <p className="mt-3 max-w-xl text-sm leading-6" style={{ color: 'var(--muted)' }}>
              Ustaw swoją bazę pracy: cel, tempo tygodnia i jednostki, na których opiera się cały produkt.
            </p>
          </div>

          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <div className="metric-card p-4">
              <p className="stat-meta">Użytkownik</p>
              <p className="mt-3 text-xl font-semibold tracking-[-0.03em] text-white">
                {profile?.displayName ?? '—'}
              </p>
            </div>
            <div className="metric-card p-4">
              <p className="stat-meta">Cel tygodniowy</p>
              <p className="mt-3 text-xl font-semibold tracking-[-0.03em] text-white tabular-nums">
                {weeklyGoal} sesje
              </p>
            </div>
            <div className="metric-card p-4">
              <p className="stat-meta">Jednostki</p>
              <p className="mt-3 text-xl font-semibold tracking-[-0.03em] text-white uppercase">
                {units}
              </p>
            </div>
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
                    className="rounded-[var(--radius-md)] p-4 text-left transition-all"
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

            <Button
              type="submit"
              loading={saving}
              className="mt-2 w-full"
              style={{
                background: saved
                  ? 'linear-gradient(180deg, var(--success) 0%, #11bc8b 100%)'
                  : 'linear-gradient(180deg, var(--accent) 0%, #3f8ff4 100%)',
                color: saved ? '#081813' : 'var(--accent-foreground)',
                boxShadow: saved
                  ? '0 14px 32px rgba(25,213,159,0.2)'
                  : '0 14px 32px rgba(90,166,255,0.22)',
              }}
            >
              {saved ? 'Zapisano ✓' : 'Zapisz zmiany'}
            </Button>

          </form>
        </Card>
      </div>
    </AppShell>
  )
}
