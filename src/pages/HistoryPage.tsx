import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { LoadingState } from '../components/ui'
import { ActionFeedback } from '../components/ActionFeedback'
import { useAuthStore } from '../store/authStore'
import { useUserExercises } from '../hooks/useUserExercises'
import { getWorkoutHistory, calcVolume, type WorkoutSummary } from '../lib/workoutService'
import { exercises as exerciseDb, type Exercise } from '../data/exercises'
import { getCappedWorkoutFinishedAt } from '../lib/sessionDuration'
import { polishPlural } from '../lib/polishPlural'
import {
  EXERCISE_CATEGORY_COLORS,
  EXERCISE_CATEGORY_LABELS,
} from '../lib/exerciseLabels'

type RangePreset = '30' | '90' | '365' | 'all'

const RANGE_PRESETS: Array<{ key: RangePreset; label: string; days: number | null }> = [
  { key: '30', label: '30 dni', days: 30 },
  { key: '90', label: '90 dni', days: 90 },
  { key: '365', label: 'Rok', days: 365 },
  { key: 'all', label: 'Wszystko', days: null },
]

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
  const {
    state: userExercisesState,
    exercises: userExercises,
    retry: retryUserExercises,
  } = useUserExercises(user?.uid ?? null)
  const [historyTruncated, setHistoryTruncated] = useState(false)
  const historyMountedRef = useRef(false)
  const historyRequestRef = useRef(0)

  useEffect(() => {
    historyMountedRef.current = true

    return () => {
      historyMountedRef.current = false
      historyRequestRef.current += 1
    }
  }, [])

  const loadHistory = useCallback(async () => {
    const requestId = ++historyRequestRef.current
    if (!user) return

    setLoading(true)
    setLoadError(false)

    try {
      const history = await getWorkoutHistory(user.uid)
      if (!historyMountedRef.current || requestId !== historyRequestRef.current) return

      setWorkouts(history.workouts)
      setHistoryTruncated(history.truncated)
      setRangeAnchorMs(Date.now())
    } catch (err) {
      if (!historyMountedRef.current || requestId !== historyRequestRef.current) return
      console.error('[HistoryPage] load failed', err)
      setLoadError(true)
      setHistoryTruncated(false)
      toast.error('Nie udało się pobrać historii treningów.')
    } finally {
      if (historyMountedRef.current && requestId === historyRequestRef.current) {
        setLoading(false)
      }
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
  const hasActiveFilters = Boolean(searchText.trim() || activeCategory)
  const showRangeEmpty = workouts.length > 0 && filtered.length === 0 && !hasActiveFilters
  const showFilterEmpty = filtered.length === 0 && hasActiveFilters

  if (loading && workouts.length === 0) return <LoadingState message="Ładowanie historii..." />

  return (
    <div className="history-page">
      <header className="history-page-header">
        <h1>Historia</h1>
        <p>
          {loadError && workouts.length === 0
            ? 'Nie udało się pobrać historii treningów.'
            : showFilterEmpty
            ? 'Brak treningów pasujących do filtrów.'
            : showRangeEmpty
            ? 'W tym zakresie nie ma treningów.'
            : filtered.length === 0
            ? 'Nie masz jeszcze zapisanych treningów.'
            : `${filtered.length} ${polishPlural(filtered.length, 'sesja', 'sesje', 'sesji')} · ${formatCompactVolume(totalVolumeInRange)}${historyTruncated ? ' · ostatnie 2000' : ''}`}
        </p>
      </header>

      <section className="history-control-panel" aria-label="Filtry historii">
        {historyTruncated && (
          <div className="history-limit-notice">
            Historia została ograniczona do ostatnich 2000 treningów, żeby utrzymać płynność widoku.
          </div>
        )}

        {userExercisesState.status === 'error' && (
          <ActionFeedback
            status="error"
            message="Nie udało się wczytać Twoich ćwiczeń. Historia nadal jest dostępna, ale część kategorii może być niepełna."
            onRetry={retryUserExercises}
          />
        )}

        <div className="history-filter-row">
          <div className="history-range-row" role="group" aria-label="Zakres historii">
            {RANGE_PRESETS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setRangePreset(key)}
                className="history-range-button mobile-touch-target"
                data-active={rangePreset === key}
                aria-pressed={rangePreset === key}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="history-search relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted-soft)' }} />
            <input
              type="search"
              aria-label="Szukaj w historii treningów"
              placeholder="Szukaj treningu lub ćwiczenia..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="history-search-input w-full pl-9 pr-9 py-1.5 text-xs font-medium outline-none"
            />
            {searchText && (
              <button
                type="button"
                onClick={() => setSearchText('')}
                className="puls-icon-button mobile-touch-target absolute right-2 top-1/2 -translate-y-1/2 p-1"
                aria-label="Wyczyść wyszukiwanie"
              >
                <X size={12} style={{ color: 'var(--muted)' }} />
              </button>
            )}
          </div>
        </div>

        {availableCategories.length > 0 && (
          <div className="history-category-filter-group">
            <span id="history-category-filter-label" className="history-category-filter-label">
              Partie
            </span>
            <div className="history-category-filter-row" role="group" aria-labelledby="history-category-filter-label">
              {availableCategories.map((cat) => {
                const active = activeCategory === cat
                const color = EXERCISE_CATEGORY_COLORS[cat] ?? 'var(--accent)'
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(active ? null : cat)}
                    className="history-category-filter-button mobile-touch-target px-3 py-1 text-xs font-semibold"
                    data-active={active}
                    aria-pressed={active}
                    style={{ '--history-filter-accent': color } as CSSProperties}
                  >
                    {EXERCISE_CATEGORY_LABELS[cat] ?? cat}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </section>

      <div className="history-results">
        {/* Workout list */}
        {loadError && workouts.length === 0 ? (
          <div className="history-empty-state">
            <p className="text-lg font-semibold text-white">Nie udało się pobrać historii</p>
            <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
              Nie udało się pobrać danych. Spróbuj ponownie.
            </p>
            <button
              type="button"
              onClick={() => void loadHistory()}
              className="history-state-action mobile-touch-target mt-4"
            >
              Spróbuj ponownie
            </button>
          </div>
        ) : showRangeEmpty ? (
          <div className="history-empty-state">
            <p className="text-base font-semibold text-white">W tym zakresie nie ma treningów</p>
            <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
              Wcześniejsze sesje nadal są w historii.
            </p>
            <button
              type="button"
              onClick={() => setRangePreset('all')}
              className="history-state-action mobile-touch-target mt-4"
            >
              Pokaż wszystko
            </button>
          </div>
        ) : showFilterEmpty ? (
          <div className="history-empty-state">
            <p className="text-base font-semibold text-white">Brak wyników</p>
            <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
              Żaden trening nie pasuje do wyszukiwania i wybranych partii.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchText('')
                setActiveCategory(null)
              }}
              className="history-state-action mobile-touch-target mt-4"
            >
              Wyczyść filtry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="history-empty-state">
            <p className="text-base font-semibold text-white">Historia jest jeszcze pusta</p>
            <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
              Pierwszy ukończony trening pojawi się tutaj.
            </p>
          </div>
        ) : (
          <div className="history-workout-list">
            {filtered.map(({ workout, totalSets, totalVolume, categories, exerciseNames }) => (
              <button
                key={workout.id}
                type="button"
                onClick={() => navigate(`/workout/${workout.id}`)}
                className="history-workout-row"
                style={{ '--workout-accent': EXERCISE_CATEGORY_COLORS[Array.from(categories)[0] ?? ''] ?? 'var(--accent)' } as CSSProperties}
              >
                <div className="history-workout-main">
                  <div className="min-w-0">
                    <div className="history-workout-meta">
                      <span>{formatDate(workout.startedAt)}</span>
                      <span>{formatDuration(workout.startedAt, workout.finishedAt)}</span>
                      <span className="history-inline-stat">{formatCompactVolume(totalVolume)}</span>
                      <span className="history-inline-stat">{totalSets} serii</span>
                    </div>
                    <h3>{workout.label?.trim() || 'Sesja treningowa'}</h3>
                    <p>{exerciseNames.length > 0 ? exerciseNames.join(' · ') : 'brak ćwiczeń'}</p>
                    {Array.from(categories).length > 0 && (
                      <div className="history-category-row" aria-label="Partie mięśniowe">
                        {Array.from(categories).slice(0, 3).map((cat) => {
                          const color = EXERCISE_CATEGORY_COLORS[cat] ?? 'var(--accent)'
                          return (
                            <span
                              key={cat}
                              className="history-category-pill"
                              style={{ '--category-accent': color } as CSSProperties}
                            >
                              {EXERCISE_CATEGORY_LABELS[cat] ?? cat}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  <ChevronRight size={18} className="history-workout-arrow" aria-hidden="true" />
                </div>
                <div className="history-workout-metrics puls-ledger" aria-label="Statystyki treningu">
                  <div>
                    <span>Ćwiczenia</span>
                    <strong>{workout.exercises.length}</strong>
                  </div>
                  <div>
                    <span>Serie</span>
                    <strong>{totalSets}</strong>
                  </div>
                  <div>
                    <span>Objętość</span>
                    <strong>{formatCompactVolume(totalVolume)}</strong>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
