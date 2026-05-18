import { useEffect, useState } from 'react'
import type * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { getProfile, updateProfile, type PrimaryGoal, type Units } from '../lib/userProfile'
import { useProfileStore } from '../store/profileStore'
import { useAuthStore } from '../store/authStore'
import { Button, Card, Input, LoadingState } from '../components/ui'

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
  const [bootstrapping, setBootstrapping] = useState(() => Boolean(user && !profile))
  const [profileLoadError, setProfileLoadError] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    if (!user) {
      setBootstrapping(false)
      setProfileLoadError(false)
      return
    }

    if (profile) {
      setBootstrapping(false)
      setProfileLoadError(false)
      return
    }

    const currentUser = user

    async function loadProfile() {
      setBootstrapping(true)
      setProfileLoadError(false)

      try {
        const nextProfile = await getProfile(currentUser.uid)

        if (cancelled) return

        if (!nextProfile) {
          navigate('/onboarding', { replace: true })
          return
        }

        setProfile(nextProfile)
      } catch (err) {
        if (cancelled) return
        console.error('[ProfilePage] getProfile failed', err)
        setProfileLoadError(true)
        toast.error('Nie udało się wczytać profilu. Spróbuj ponownie.')
      } finally {
        if (!cancelled) setBootstrapping(false)
      }
    }

    void loadProfile()

    return () => {
      cancelled = true
    }
  }, [loadAttempt, navigate, profile, setProfile, user])

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
      setProfile({ ...profile, ...updated })
      setSaved(true)
      toast.success('Profil zapisany')
      setTimeout(() => setSaved(false), 2000)
    } catch {
      toast.error('Nie udało się zapisać. Spróbuj ponownie.')
    } finally {
      setSaving(false)
    }
  }

  if (bootstrapping && !profile) {
    return <LoadingState message="Ładowanie profilu..." />
  }

  if (profileLoadError && !profile) {
    return (
      <div className="mx-auto" style={{ maxWidth: '36rem' }}>
        <Card>
          <div className="flex flex-col gap-4 text-center">
            <div>
              <p className="text-lg font-semibold text-white">Nie udało się wczytać profilu</p>
              <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
                Spróbuj ponownie za chwilę. Gdy połączenie wróci, formularz załaduje Twoje dane.
              </p>
            </div>

            <Button type="button" onClick={() => setLoadAttempt((value) => value + 1)} className="mx-auto min-w-[12rem]">
              Spróbuj ponownie
            </Button>
          </div>
        </Card>
      </div>
    )
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
            <h1 className="hero-editorial-name">Twój<br />profil.</h1>
          </div>

          <p className="hero-editorial-sub">
            Ustaw bazę pracy: cel, tempo tygodnia i jednostki — to fundament, na którym opiera się cały produkt.
          </p>

          <div
            className="mt-3 grid grid-cols-3 gap-4 border-t pt-4 sm:mt-4 sm:flex sm:flex-wrap sm:gap-x-10 sm:gap-y-5 sm:pt-6"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex flex-col gap-1 min-w-0">
              <span className="stat-meta">Użytkownik</span>
              <span className="text-xl font-bold tracking-[-0.03em] text-white leading-none sm:text-2xl">
                {profile?.displayName ?? '—'}
              </span>
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <span className="stat-meta">Cel tyg.</span>
              <span className="text-xl font-bold tabular-nums tracking-[-0.03em] text-white leading-none sm:text-2xl">
                {weeklyGoal} <span className="text-base" style={{ color: 'var(--muted)' }}>sesje</span>
              </span>
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <span className="stat-meta">Jednostki</span>
              <span className="text-xl font-bold tracking-[-0.03em] text-white leading-none uppercase sm:text-2xl">
                {units}
              </span>
            </div>
          </div>
        </motion.div>
      </section>

      <div className="mx-auto" style={{ maxWidth: '42rem' }}>
        <Card padding="sm" className="sm:p-6">
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
    </>
  )
}
