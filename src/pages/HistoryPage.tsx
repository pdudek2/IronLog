import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import NumberFlow from '@number-flow/react'
import { ChevronRight, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { LoadingState } from '../components/ui'
import { useAuthStore } from '../store/authStore'
import { getWorkoutHistory, calcVolume, type WorkoutSummary } from '../lib/workoutService'
import { exercises as exerciseDb, type Exercise } from '../data/exercises'
import { getUserExercises } from '../lib/userExercisesService'
import { getCappedWorkoutFinishedAt } from '../lib/sessionDuration'
import { polishPlural } from '../lib/polishPlural'

type RangePreset = '30' | '90' | '365' | 'all'

const RANGE_PRESETS: Array<{ key: RangePreset; label: string; days: number | null }> = [
  { key: '30', label: '30 dni', days: 30 },
  { key: '90', label: '90 dni', days: 90 },
  { key: '365', label: 'Rok', days: 365 },
  { key: 'all', label: 'Wszystko', days: null },
]

const CATEGORY_LABELS: Record<string, string> = {
  chest: 'Klatka',
  back: 'Plecy',
  legs: 'Nogi',
  shoulders: 'Barki',
  arms: 'Ramiona',
  core: 'Core',
  cardio: 'Cardio',
}

const CATEGORY_COLORS: Record<string, string> = {
  chest: '#F0435A',
  back: '#8FB8A0',
  legs: '#F0A75A',
  shoulders: '#D97B91',
  arms: '#D9A06E',
  core: '#B8A8B2',
  cardio: '#A7D8BB',
}

function formatCompactVolume(volume: number): string {
  if (!volume) return '0 kg'
  if (volume >= 10_000) return `${Math.round(volume / 1_000)}k kg`
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(1)}k kg`
  return `${Math.round(volume).toLocaleString('pl-PL')} kg`
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function formatDuration(start: number, end: number): string {
  const cappedEnd = getCappedWorkoutFinishedAt(start, end)
  const minutes = Math.round((cappedEnd - start) / 60_000)
  if (minutes < 1) return '< 1 min'
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

interface DerivedWorkout {
  workout: WorkoutSummary
  totalSets: number
  totalVolume: number
  categories: Set<string>
  exerciseNames: string[]
}

function deriveWorkout(workout: WorkoutSummary, exerciseMap: Map<string, Exercise>): DerivedWorkout {
  const categories = new Set<string>()
  const exerciseNames: string[] = []
  let totalSets = 0

  for (const ex of workout.exercises) {
    exerciseNames.push(ex.name)
    totalSets += ex.sets.length
    if (ex.exerciseId) {
      const meta = exerciseMap.get(`${ex.exerciseSource ?? 'global'}:${ex.exerciseId}`)
      if (meta?.category) categories.add(meta.category)
    }
  }

  return {
    workout,
    totalSets,
    totalVolume: calcVolume(workout),
    categories,
    exerciseNames,
  }
}

export default function HistoryPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([])
  const [rangePreset, setRangePreset] = useState<RangePreset>('90')
  const [searchText, setSearchText] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [rangeAnchorMs, setRangeAnchorMs] = useState(() => Date.now())
  const [userExercises, setUserExercises] = useState<Exercise[]>([])
  const [historyTruncated, setHistoryTruncated] = useState(false)

  const loadHistory = useCallback(async () => {
    if (!user) return

    setLoading(true)
    setLoadError(false)

    try {
      const [history, nextUserExercises] = await Promise.all([
        getWorkoutHistory(user.uid),
        getUserExercises(user.uid).catch(() => []),
      ])

      setWorkouts(history.workouts)
      setHistoryTruncated(history.truncated)
      setUserExercises(nextUserExercises)
      setRangeAnchorMs(Date.now())
    } catch (err) {
      console.error('[HistoryPage] load failed', err)
      setLoadError(true)
      setHistoryTruncated(false)
      toast.error('Nie udało się pobrać historii treningów.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  useEffect(() => {
    setRangeAnchorMs(Date.now())
  }, [rangePreset])

  const historyExerciseMap = useMemo(() => {
    const map = new Map<string, Exercise>()
    exerciseDb.forEach((exercise) => map.set(`global:${exercise.id}`, exercise))
    userExercises.forEach((exercise) => map.set(`user:${exercise.id}`, exercise))
    return map
  }, [userExercises])

  const derived = useMemo(
    () => workouts.map((workout) => deriveWorkout(workout, historyExerciseMap)),
    [historyExerciseMap, workouts],
  )

  const availableCategories = useMemo(() => {
    const counts = new Map<string, number>()
    derived.forEach(({ categories }) => {
      categories.forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1))
    })
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([cat]) => cat)
  }, [derived])

  const filtered = useMemo(() => {
    const rangeDef = RANGE_PRESETS.find((r) => r.key === rangePreset)
    const cutoff = rangeDef?.days ? rangeAnchorMs - rangeDef.days * 86_400_000 : 0
    const search = searchText.trim().toLowerCase()

    return derived.filter(({ workout, categories, exerciseNames }) => {
      if (workout.startedAt < cutoff) return false
      if (activeCategory && !categories.has(activeCategory)) return false
      if (search) {
        const hit =
          (workout.label ?? '').toLowerCase().includes(search) ||
          exerciseNames.some((name) => name.toLowerCase().includes(search))
        if (!hit) return false
      }
      return true
    })
  }, [derived, rangePreset, activeCategory, searchText, rangeAnchorMs])

  const totalVolumeInRange = useMemo(
    () => filtered.reduce((sum, { totalVolume }) => sum + totalVolume, 0),
    [filtered],
  )

  const activeFiltersCount = (activeCategory ? 1 : 0) + (searchText.trim() ? 1 : 0) + (rangePreset !== '90' ? 1 : 0)

  if (loading && workouts.length === 0) return <LoadingState message="Ładowanie historii..." />

  return (
    <>
      <section className="hero-editorial">
        <motion.div
          className="flex flex-col gap-5"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <p className="hero-editorial-date">
            Archiwum · {workouts.length} {polishPlural(workouts.length, 'trening', 'treningi', 'treningów')} łącznie
          </p>

          <div>
            <h1 className="hero-editorial-name">Historia<br />treningów.</h1>
          </div>

          <p className="hero-editorial-sub">
            {loadError && workouts.length === 0
              ? 'Nie udało się pobrać historii treningów. Spróbuj ponownie za chwilę.'
              : filtered.length === 0
              ? 'Brak treningów w wybranym zakresie — spróbuj szerszego filtru lub innego ćwiczenia.'
              : `${filtered.length} ${polishPlural(filtered.length, 'sesja', 'sesje', 'sesji')} w wyborze · ${formatCompactVolume(totalVolumeInRange)} objętości${activeFiltersCount > 0 ? ` · ${activeFiltersCount} ${polishPlural(activeFiltersCount, 'filtr aktywny', 'filtry aktywne', 'filtrów aktywnych')}` : ''}${historyTruncated ? ' · widok oparty o ostatnie 2000 sesji' : ''}`}
          </p>

          <div
            className="mt-4 pt-6 flex flex-wrap gap-x-10 gap-y-5 border-t"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex flex-col gap-1 min-w-[6.5rem]">
              <span className="stat-meta">Wyniki</span>
              <span className="text-2xl font-bold tabular-nums text-white leading-none">
                <NumberFlow value={filtered.length} />
              </span>
            </div>
            <div className="flex flex-col gap-1 min-w-[6.5rem]">
              <span className="stat-meta">Objętość</span>
              <span className="text-2xl font-bold tabular-nums text-white leading-none">
                <NumberFlow value={Math.round(totalVolumeInRange)} locales="pl-PL" format={{ useGrouping: true }} /> kg
              </span>
            </div>
          </div>
        </motion.div>
      </section>

      <div className="space-y-5">
        {/* Filter bar */}
        <div className="space-y-3">
          {historyTruncated && (
            <div
              className="rounded-[var(--radius-lg)] border px-4 py-3 text-sm"
              style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'var(--border)', color: 'var(--muted)' }}
            >
              Historia została ograniczona do ostatnich 2000 treningów, żeby utrzymać płynność widoku.
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {RANGE_PRESETS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setRangePreset(key)}
                className="rounded-[var(--radius-pill)] px-3.5 py-1.5 text-xs font-semibold transition-colors"
                style={
                  rangePreset === key
                    ? { background: 'var(--accent-soft)', border: '1px solid var(--accent-soft-strong)', color: 'var(--accent)' }
                    : { background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)' }
                }
              >
                {label}
              </button>
            ))}

            <div className="relative flex-1 min-w-[14rem]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted-soft)' }} />
              <input
                type="search"
                placeholder="Szukaj ćwiczenia lub etykiety..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full rounded-[var(--radius-pill)] pl-9 pr-9 py-1.5 text-xs font-medium outline-none"
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
              {searchText && (
                <button
                  type="button"
                  onClick={() => setSearchText('')}
                  className="puls-icon-button absolute right-2 top-1/2 -translate-y-1/2 p-1"
                  aria-label="Wyczyść wyszukiwanie"
                >
                  <X size={12} style={{ color: 'var(--muted)' }} />
                </button>
              )}
            </div>
          </div>

          {availableCategories.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[0.68rem] font-semibold uppercase mr-1" style={{ color: 'var(--muted-soft)' }}>
                Partie
              </span>
              {availableCategories.map((cat) => {
                const active = activeCategory === cat
                const color = CATEGORY_COLORS[cat] ?? 'var(--accent)'
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(active ? null : cat)}
                    className="rounded-[var(--radius-pill)] px-3 py-1 text-xs font-semibold transition-colors"
                    style={
                      active
                        ? { background: `${color}22`, border: `1px solid ${color}55`, color }
                        : { background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)' }
                    }
                  >
                    {CATEGORY_LABELS[cat] ?? cat}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Workout list */}
        {loadError && workouts.length === 0 ? (
          <div className="surface-panel rounded-[var(--radius-xl)] p-10 text-center">
            <p className="text-lg font-semibold text-white">Nie udało się pobrać historii</p>
            <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
              To wygląda na chwilowy problem z połączeniem albo odpowiedzią Firestore.
            </p>
            <button
              type="button"
              onClick={() => void loadHistory()}
              className="mt-4 rounded-[var(--radius-pill)] px-4 py-2 text-xs font-semibold"
              style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-soft-strong)', color: 'var(--accent)' }}
            >
              Spróbuj ponownie
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="surface-panel rounded-[var(--radius-xl)] p-10 text-center">
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Nic nie pasuje do obecnych filtrów. Spróbuj zwiększyć zakres lub wyczyścić filtry.
            </p>
            {(activeCategory || searchText || rangePreset !== '90') && (
              <button
                type="button"
                onClick={() => {
                  setRangePreset('90')
                  setSearchText('')
                  setActiveCategory(null)
                }}
                className="mt-4 rounded-[var(--radius-pill)] px-4 py-2 text-xs font-semibold"
                style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-soft-strong)', color: 'var(--accent)' }}
              >
                Wyczyść filtry
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map(({ workout, totalSets, totalVolume, categories, exerciseNames }, idx) => (
              <motion.button
                key={workout.id}
                type="button"
                onClick={() => navigate(`/workout/${workout.id}`)}
                className="surface-panel rounded-[var(--radius-xl)] p-4 text-left transition-transform hover:translate-y-[-1px]"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx * 0.02, 0.2), duration: 0.25 }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase" style={{ color: 'var(--muted)' }}>
                      {formatDate(workout.startedAt)} · {formatDuration(workout.startedAt, workout.finishedAt)}
                    </p>
                    <h3 className="mt-1.5 text-lg font-bold text-white">
                      {workout.label?.trim() || 'Sesja treningowa'}
                    </h3>
                    <p className="mt-2 text-xs truncate" style={{ color: 'var(--muted)' }}>
                      {exerciseNames.length > 0 ? exerciseNames.join(' · ') : 'brak ćwiczeń'}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--muted)' }}>
                      <span>
                        <b className="tabular-nums text-white">{workout.exercises.length}</b> ćw
                      </span>
                      <span>
                        <b className="tabular-nums text-white">{totalSets}</b> serii
                      </span>
                      <span>
                        <b className="tabular-nums text-white">{formatCompactVolume(totalVolume)}</b>
                      </span>
                      {Array.from(categories).slice(0, 3).map((cat) => {
                        const color = CATEGORY_COLORS[cat] ?? 'var(--accent)'
                        return (
                          <span
                            key={cat}
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={{ background: `${color}18`, color, border: `1px solid ${color}28` }}
                          >
                            {CATEGORY_LABELS[cat] ?? cat}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                  <ChevronRight size={18} className="flex-none mt-1" style={{ color: 'var(--muted-soft)' }} />
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
