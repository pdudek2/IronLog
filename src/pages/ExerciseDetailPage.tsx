import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { exercises as globalExercises } from '../data/exercises'
import {
  getExerciseSessions,
  getExerciseRecord,
  type ExerciseSession,
  type ExerciseRecord,
} from '../lib/exerciseDetailService'
import {
  EXERCISE_CATEGORY_COLORS,
  EXERCISE_CATEGORY_LABELS,
  getEquipmentLabel,
  getMuscleLabel,
} from '../lib/exerciseLabels'
import { pluralize } from '../lib/pluralize'
import { useAuthStore } from '../store/authStore'
import { useUserExercises } from '../hooks/useUserExercises'
import { ActionFeedback } from '../components/ActionFeedback'
import { Button, LoadingState } from '../components/ui'
import { useProfileStore } from '../store/profileStore'
import { formatCompactVolume, kgToDisplayWeight } from '../lib/weightUnits'

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export default function ExerciseDetailPage() {
  const { source, id } = useParams<{ source: string; id: string }>()
  const { user } = useAuthStore()
  const units = useProfileStore((state) => state.profile?.units ?? 'kg')
  const navigate = useNavigate()
  const exerciseSource = source === 'global' || source === 'user' ? source : null

  const globalExercise = useMemo(
    () => (exerciseSource === 'global' && id
      ? globalExercises.find((ex) => ex.id === id) ?? null
      : null),
    [exerciseSource, id],
  )
  const userCatalog = useUserExercises(
    exerciseSource === 'user' ? user?.uid ?? null : null,
  )

  const [sessions, setSessions] = useState<ExerciseSession[]>([])
  const [record, setRecord] = useState<ExerciseRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    if (!user || !id || !exerciseSource) return
    if (exerciseSource === 'global' && !globalExercise) return

    const currentUser = user
    const exerciseId = id
    const currentSource = exerciseSource

    let cancelled = false

    async function loadExerciseDetail() {
      try {
        const [sess, rec] = await Promise.all([
          getExerciseSessions(currentUser.uid, exerciseId, currentSource),
          getExerciseRecord(currentUser.uid, exerciseId, currentSource),
        ])

        if (!cancelled) {
          setSessions(sess)
          setRecord(rec)
          setLoadError(false)
        }
      } catch (error) {
        console.error('[ExerciseDetailPage] load failed', error)
        if (!cancelled) {
          setSessions([])
          setRecord(null)
          setLoadError(true)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadExerciseDetail()

    return () => {
      cancelled = true
    }
  }, [user, id, exerciseSource, globalExercise, loadAttempt])

  const chronologicalSessions = useMemo(() => [...sessions].reverse(), [sessions])
  const latestVolume = sessions[0]?.totalVolume ?? 0
  const maxVolume = sessions.length
    ? Math.max(...sessions.map((session) => session.totalVolume), 1)
    : 1
  const latestIsMaximum = latestVolume === maxVolume

  const userExercise = exerciseSource === 'user' && userCatalog.state.status === 'success'
    ? userCatalog.exercises.find((exercise) => exercise.id === id) ?? null
    : null
  const exercise = exerciseSource === 'user' ? userExercise : globalExercise
  const hasHistory = sessions.length > 0 || record !== null
  const invalidRoute = !id || !exerciseSource
  const globalMetadataMissing = exerciseSource === 'global' && !globalExercise
  const skipHistoryLoad = invalidRoute || globalMetadataMissing
  const userCatalogLoading = exerciseSource === 'user' && userCatalog.state.status === 'loading'
  const metadataConfirmedMissing = globalMetadataMissing || (
    exerciseSource === 'user'
    && userCatalog.state.status === 'success'
    && !userExercise
  )

  if ((!skipHistoryLoad && loading) || userCatalogLoading) {
    return <LoadingState message="Loading exercise..." />
  }

  if (!skipHistoryLoad && loadError) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="surface-panel rounded-[var(--radius-xl)] p-6 text-center">
          <p className="text-lg font-semibold text-white">Could not load exercise</p>
          <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
            History data did not load. Check your connection and try again.
          </p>
          <Button
            type="button"
            className="mt-5 min-w-[12rem]"
            onClick={() => {
              setLoading(true)
              setLoadError(false)
              setLoadAttempt((value) => value + 1)
            }}
          >
            Try again
          </Button>
        </div>
      </div>
    )
  }

  if (invalidRoute || (metadataConfirmedMissing && !hasHistory)) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="surface-panel rounded-[var(--radius-xl)] p-6 text-center sm:p-8">
          <p className="eyebrow">Exercise library</p>
          <h1 className="section-title mt-2">Exercise not found</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6" style={{ color: 'var(--muted)' }}>
            This link is outdated or the exercise has been deleted.
          </p>
          <Button type="button" className="mt-5 min-w-[12rem]" onClick={() => navigate('/exercises')}>
            Back to library
          </Button>
        </div>
      </div>
    )
  }

  const accent = EXERCISE_CATEGORY_COLORS[exercise?.category ?? ''] ?? 'var(--accent)'
  const categoryLabel = exercise?.category
    ? EXERCISE_CATEGORY_LABELS[exercise.category] ?? exercise.category
    : null
  const taxonomy = Array.from(new Set([
    categoryLabel,
    exercise?.equipment ? getEquipmentLabel(exercise.equipment) : null,
    exerciseSource === 'user' ? 'Custom' : null,
  ].filter((label): label is string => Boolean(label))))
  const muscleLabels = Array.from(new Set(
    (exercise?.muscles ?? [])
      .map(getMuscleLabel)
      .filter((label) => label !== categoryLabel),
  ))
  const allTimeSessions = Math.max(record?.totalSessions ?? 0, sessions.length)

  return (
    <div className="exercise-detail-page">
      <section className="hero-editorial">
        <motion.div
          className="flex flex-col gap-5"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {exerciseSource === 'user' && userCatalog.state.status === 'error' && (
            <ActionFeedback
              status="error"
              message="Could not load this exercise name and category. History and records are still available."
              onRetry={userCatalog.retry}
            />
          )}

          {taxonomy.length > 0 && (
            <div className="exercise-detail-classification">
              <div className="exercise-detail-taxonomy">
                {taxonomy.map((label, index) => (
                  <span key={label} style={index === 0 ? { color: accent } : undefined}>
                    {label}
                  </span>
                ))}
              </div>
              {muscleLabels.length > 0 && (
                <div className="exercise-detail-muscles" aria-label={`Muscles: ${muscleLabels.join(', ')}`}>
                  <span>Muscles</span>
                  {muscleLabels.map((label) => <span key={label}>{label}</span>)}
                </div>
              )}
            </div>
          )}

          <div>
            <h1 className="hero-editorial-name">{exercise?.name ?? record?.exerciseName ?? id}</h1>
          </div>

          <p className="hero-editorial-sub">
            {allTimeSessions > 0
              ? `${allTimeSessions} ${pluralize(allTimeSessions, 'session', 'sessions')} total${sessions.length > 0 && allTimeSessions > sessions.length ? ` · ${sessions.length} most recent below` : ''}`
              : 'No history yet. Add this exercise to a session to start tracking progress.'}
          </p>

          {record && (
            <dl className="exercise-detail-records">
              <div>
                <dt>Max weight</dt>
                <dd>
                  {kgToDisplayWeight(record.maxWeight, units)} <span className="text-base" style={{ color: 'var(--muted)' }}>{units}</span>
                </dd>
              </div>
              <div>
                <dt>Reps at record weight</dt>
                <dd>
                  {record.maxReps}
                </dd>
              </div>
            </dl>
          )}
        </motion.div>
      </section>

      <div className="space-y-5">

          {/* Volume trend */}
          {sessions.length > 0 && (
            <section className="exercise-detail-panel exercise-detail-trend">
              <div className="mb-4">
                <h2 className="section-title">Volume per session</h2>
              </div>
              <div className="exercise-detail-volume-summary">
                {latestIsMaximum ? (
                  <p><span>Latest · maximum</span><strong>{formatCompactVolume(latestVolume, units)}</strong></p>
                ) : (
                  <>
                    <p><span>Latest</span><strong>{formatCompactVolume(latestVolume, units)}</strong></p>
                    <p><span>Maximum</span><strong>{formatCompactVolume(maxVolume, units)}</strong></p>
                  </>
                )}
              </div>
              <div
                className="exercise-detail-volume-chart"
                tabIndex={0}
                role="list"
                aria-label={latestIsMaximum
                  ? `Volume over the last ${chronologicalSessions.length} ${pluralize(chronologicalSessions.length, 'session', 'sessions')}. Latest and maximum ${formatCompactVolume(latestVolume, units)}.`
                  : `Volume over the last ${chronologicalSessions.length} ${pluralize(chronologicalSessions.length, 'session', 'sessions')}. Latest ${formatCompactVolume(latestVolume, units)}. Maximum ${formatCompactVolume(maxVolume, units)}.`}
              >
                {chronologicalSessions.map((session) => (
                  <div
                    key={session.id}
                    className="exercise-detail-volume-column"
                    role="listitem"
                    aria-label={`${formatDate(session.startedAt)}: ${formatCompactVolume(session.totalVolume, units)}`}
                  >
                    <div className="exercise-detail-volume-track">
                      <motion.div
                        aria-hidden="true"
                        className="exercise-detail-volume-bar"
                        style={{
                          background: accent,
                          height: `${Math.max((session.totalVolume / maxVolume) * 100, 4)}%`,
                        }}
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        transition={{ duration: 0.5, ease: 'easeOut', delay: 0.1 }}
                      />
                    </div>
                    <span>
                      {new Date(session.startedAt).toLocaleDateString('en-US', { day: 'numeric', month: 'numeric' })}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Recent sessions */}
          {sessions.length > 0 && (
            <section className="exercise-detail-panel exercise-detail-history">
              <div className="mb-4">
                <h2 className="section-title">Recent workouts</h2>
              </div>

              <div className="exercise-detail-session-list">
                {sessions.map((session) => (
                  <details
                    key={session.id}
                    className="exercise-detail-session-row"
                  >
                    <summary className="exercise-detail-session-summary">
                      <div className="exercise-detail-session-head">
                        <div>
                          <p className="text-sm font-semibold text-white">{formatDate(session.startedAt)}</p>
                          {session.label && (
                            <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>{session.label}</p>
                          )}
                        </div>
                        <div className="exercise-detail-session-volume">
                          <p className="text-sm font-bold text-white tabular-nums">{formatCompactVolume(session.totalVolume, units)}</p>
                          <span className="exercise-detail-session-toggle" aria-hidden="true">
                            Details
                            <ChevronDown className="exercise-detail-session-chevron" size={16} />
                          </span>
                        </div>
                      </div>
                      <div className="exercise-detail-session-metrics">
                        <span><strong>{session.totalSets}</strong> {pluralize(session.totalSets, 'set', 'sets')}</span>
                        <span><strong>{session.totalReps}</strong> reps</span>
                        <span>
                          top <strong style={{ color: accent }}>
                            {session.bestSetWeight ? `${kgToDisplayWeight(session.bestSetWeight, units)} ${units}` : '—'}
                          </strong>
                        </span>
                      </div>
                    </summary>

                    {session.sets.length > 0 && (
                      <div className="exercise-detail-set-list">
                        <span className="stat-meta">Sets</span>
                        <div>
                          {session.sets.map((set, i) => (
                            <span
                              key={i}
                              className="text-xs tabular-nums"
                            >
                              {kgToDisplayWeight(set.weight, units)}×{set.reps}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </details>
                ))}
              </div>
            </section>
          )}

      </div>
    </div>
  )
}
