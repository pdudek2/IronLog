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
import { pluralize } from '../lib/pluralize'
import { workoutTitle } from '../lib/workoutCopy'
import { formatCompactVolume } from '../lib/weightUnits'
import { useProfileStore } from '../store/profileStore'
import {
  EXERCISE_CATEGORY_COLORS,
  EXERCISE_CATEGORY_LABELS,
} from '../lib/exerciseLabels'

type RangePreset = '30' | '90' | '365' | 'all'

const RANGE_PRESETS: Array<{ key: RangePreset; label: string; days: number | null }> = [
  { key: '30', label: '30 days', days: 30 },
  { key: '90', label: '90 days', days: 90 },
  { key: '365', label: 'Year', days: 365 },
  { key: 'all', label: 'All', days: null },
]

function formatDate(ts: number): string {
  const date = new Date(ts)
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return `${weekdays[date.getDay()]}, ${date.getDate()}`
}

function formatDuration(start: number, end: number): string {
  const cappedEnd = getCappedWorkoutFinishedAt(start, end)
  const minutes = Math.round((cappedEnd - start) / 60_000)
  if (minutes < 1) return '< 1 min'
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function formatExercisePreview(exerciseNames: string[]): string {
  if (exerciseNames.length === 0) return 'no exercises'

  const visibleNames = exerciseNames.slice(0, 3)
  const hiddenCount = exerciseNames.length - visibleNames.length

  return `${visibleNames.join(' · ')}${hiddenCount > 0 ? ` · +${hiddenCount}` : ''}`
}

interface DerivedWorkout {
  workout: WorkoutSummary
  totalSets: number
  totalVolume: number
  categories: Set<string>
  exerciseNames: string[]
}

interface WorkoutMonthGroup {
  key: string
  label: string
  workouts: DerivedWorkout[]
}

function formatMonthLabel(timestamp: number): string {
  const label = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(timestamp)
  return label.charAt(0).toLocaleUpperCase('en-US') + label.slice(1)
}

function groupWorkoutsByMonth(workouts: DerivedWorkout[]): WorkoutMonthGroup[] {
  const groups: WorkoutMonthGroup[] = []

  for (const item of workouts) {
    const date = new Date(item.workout.startedAt)
    const key = `${date.getFullYear()}-${date.getMonth()}`
    const current = groups.at(-1)

    if (current?.key === key) {
      current.workouts.push(item)
    } else {
      groups.push({
        key,
        label: formatMonthLabel(item.workout.startedAt),
        workouts: [item],
      })
    }
  }

  return groups
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
  const units = useProfileStore((state) => state.profile?.units ?? 'kg')
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
      toast.error('Could not load workout history.')
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
  const monthGroups = useMemo(() => groupWorkoutsByMonth(filtered), [filtered])

  const totalVolumeInRange = useMemo(
    () => filtered.reduce((sum, { totalVolume }) => sum + totalVolume, 0),
    [filtered],
  )
  const hasActiveFilters = Boolean(searchText.trim() || activeCategory)
  const showRangeEmpty = workouts.length > 0 && filtered.length === 0 && !hasActiveFilters
  const showFilterEmpty = filtered.length === 0 && hasActiveFilters

  if (loading && workouts.length === 0) return <LoadingState message="Loading history..." />

  return (
    <div className="history-page workbench-page">
      <header className="history-page-header">
        <h1>History</h1>
        <p>
          {loadError && workouts.length === 0
            ? 'Could not load workout history.'
            : showFilterEmpty
            ? 'No workouts match these filters.'
            : showRangeEmpty
            ? 'No workouts in this date range.'
            : filtered.length === 0
            ? 'You have no saved workouts yet.'
            : `${filtered.length} ${pluralize(filtered.length, 'session', 'sessions')} · ${formatCompactVolume(totalVolumeInRange, units)}${historyTruncated ? ' · latest 2,000' : ''}`}
        </p>
      </header>

      <section className="history-control-panel" aria-label="History filters">
        {historyTruncated && (
          <div className="history-limit-notice">
            History is limited to your 2,000 most recent workouts to keep this view responsive.
          </div>
        )}

        {userExercisesState.status === 'error' && (
          <ActionFeedback
            status="error"
            message="Could not load your exercises. History is still available, but some categories may be incomplete."
            onRetry={retryUserExercises}
          />
        )}

        <div className="history-filter-row">
          <div className="history-range-row" role="group" aria-label="History range">
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
              aria-label="Search workout history"
              placeholder="Search workouts or exercises..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="history-search-input w-full pl-9 pr-9 py-1.5 text-xs font-medium outline-none"
            />
            {searchText && (
              <button
                type="button"
                onClick={() => setSearchText('')}
                className="puls-icon-button mobile-touch-target absolute right-2 top-1/2 -translate-y-1/2 p-1"
                aria-label="Clear search"
              >
                <X size={12} style={{ color: 'var(--muted)' }} />
              </button>
            )}
          </div>
        </div>

        {availableCategories.length > 0 && (
          <div className="history-category-filter-group">
            <span id="history-category-filter-label" className="history-category-filter-label">
              Exercise categories
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
            <p className="text-lg font-semibold text-white">Could not load history</p>
            <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
              Could not load data. Try again.
            </p>
            <button
              type="button"
              onClick={() => void loadHistory()}
              className="history-state-action mobile-touch-target mt-4"
            >
              Try again
            </button>
          </div>
        ) : showRangeEmpty ? (
          <div className="history-empty-state">
            <p className="text-base font-semibold text-white">No workouts in this date range</p>
            <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
              Earlier sessions are still in your history.
            </p>
            <button
              type="button"
              onClick={() => setRangePreset('all')}
              className="history-state-action mobile-touch-target mt-4"
            >
              Show all
            </button>
          </div>
        ) : showFilterEmpty ? (
          <div className="history-empty-state">
            <p className="text-base font-semibold text-white">No results</p>
            <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
              No workouts match your search and selected muscle groups.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchText('')
                setActiveCategory(null)
              }}
              className="history-state-action mobile-touch-target mt-4"
            >
              Clear filters
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="history-empty-state">
            <p className="text-base font-semibold text-white">Your history is empty</p>
            <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
              Your first completed workout will appear here.
            </p>
          </div>
        ) : (
          <div className="history-month-list">
            {monthGroups.map((group) => {
              const headingId = `history-month-${group.key}`

              return (
                <section key={group.key} className="history-month-group" aria-labelledby={headingId}>
                  <div className="history-month-heading">
                    <h2 id={headingId}>{group.label}</h2>
                    <span>
                      {group.workouts.length}{' '}
                      {pluralize(group.workouts.length, 'session', 'sessions')}
                    </span>
                  </div>
                  <div className="history-workout-list">
                    {group.workouts.map(({ workout, totalSets, totalVolume, categories, exerciseNames }) => {
                      const accentCategory = categories.values().next().value ?? ''

                      return (
                        <button
                          key={workout.id}
                          type="button"
                          onClick={() => navigate(`/workout/${workout.id}`)}
                          className="history-workout-row"
                          style={{ '--workout-accent': EXERCISE_CATEGORY_COLORS[accentCategory] ?? 'var(--accent)' } as CSSProperties}
                        >
                          <div className="history-workout-main">
                            <div className="min-w-0">
                              <div className="history-workout-meta">
                                <span>{formatDate(workout.startedAt)}</span>
                                <span>{formatDuration(workout.startedAt, workout.finishedAt)}</span>
                                <span className="history-inline-stat">{formatCompactVolume(totalVolume, units)}</span>
                                <span className="history-inline-stat">{totalSets} {pluralize(totalSets, 'set', 'sets')}</span>
                              </div>
                              <h3>{workoutTitle(workout)}</h3>
                              {workoutTitle(workout) !== exerciseNames.map((name) => name.trim()).join(' + ') && (
                                <p>{formatExercisePreview(exerciseNames)}</p>
                              )}
                            </div>
                            <ChevronRight size={18} className="history-workout-arrow" aria-hidden="true" />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
