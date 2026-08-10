import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BarChart3, Layers3, Target } from 'lucide-react'
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
import { polishPlural } from '../lib/polishPlural'
import { useAuthStore } from '../store/authStore'
import { useUserExercises } from '../hooks/useUserExercises'
import { ActionFeedback } from '../components/ActionFeedback'
import { Button, LoadingState } from '../components/ui'

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('pl-PL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function formatVolume(v: number): string {
  if (!v) return '0 kg'
  if (v >= 10_000) return `${Math.round(v / 1_000)}k kg`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k kg`
  return `${Math.round(v).toLocaleString('pl-PL')} kg`
}

export default function ExerciseDetailPage() {
  const { source, id } = useParams<{ source: string; id: string }>()
  const { user } = useAuthStore()
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
    return <LoadingState message="Ładowanie ćwiczenia..." />
  }

  if (!skipHistoryLoad && loadError) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="surface-panel rounded-[var(--radius-xl)] p-6 text-center">
          <p className="text-lg font-semibold text-white">Nie udało się wczytać ćwiczenia</p>
          <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
            Dane historii nie dotarły. Sprawdź połączenie i spróbuj ponownie.
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
            Spróbuj ponownie
          </Button>
        </div>
      </div>
    )
  }

  if (invalidRoute || (metadataConfirmedMissing && !hasHistory)) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="surface-panel rounded-[var(--radius-xl)] p-6 text-center sm:p-8">
          <p className="eyebrow">Biblioteka ćwiczeń</p>
          <h1 className="section-title mt-2">Ćwiczenie nie istnieje</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6" style={{ color: 'var(--muted)' }}>
            Ten link jest nieaktualny albo ćwiczenie zostało usunięte.
          </p>
          <Button type="button" className="mt-5 min-w-[12rem]" onClick={() => navigate('/exercises')}>
            Wróć do biblioteki
          </Button>
        </div>
      </div>
    )
  }

  const accent = EXERCISE_CATEGORY_COLORS[exercise?.category ?? ''] ?? 'var(--accent)'
  const maxVolume = sessions.length ? Math.max(...sessions.map((s) => s.totalVolume), 1) : 1

  const totalVolumeAll = sessions.reduce((sum, s) => sum + s.totalVolume, 0)

  return (
    <>
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
              message="Nie udało się wczytać nazwy i kategorii tego ćwiczenia. Historia i rekordy nadal są dostępne."
              onRetry={userCatalog.retry}
            />
          )}

          <div className="flex flex-wrap items-center gap-2">
            {exercise?.category && (
              <span
                className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase"
                style={{ background: `${accent}1e`, color: accent, border: `1px solid ${accent}30` }}
              >
                {EXERCISE_CATEGORY_LABELS[exercise.category] ?? exercise.category}
              </span>
            )}
            {exercise?.equipment && (
              <span
                className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase"
                style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--muted)', border: '1px solid var(--border)' }}
              >
                {getEquipmentLabel(exercise.equipment)}
              </span>
            )}
            {exerciseSource === 'user' && (
              <span
                className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent-soft-strong)' }}
              >
                moje
              </span>
            )}
          </div>

          <div>
            <h1 className="hero-editorial-name">{exercise?.name ?? record?.exerciseName ?? id}</h1>
          </div>

          {exercise?.muscles && exercise.muscles.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {exercise.muscles.map((m) => (
                <span
                  key={m}
                  className="text-[11px] px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--muted)', border: '1px solid var(--border)' }}
                >
                  {getMuscleLabel(m)}
                </span>
              ))}
            </div>
          )}

          <p className="hero-editorial-sub">
            {sessions.length > 0
              ? `${sessions.length} ${polishPlural(sessions.length, 'sesja', 'sesje', 'sesji')} w historii · ${formatVolume(totalVolumeAll)} łącznej objętości`
              : 'Brak historii. Dodaj to ćwiczenie do sesji, żeby zacząć śledzić progres.'}
          </p>

          {sessions.length === 0 && (
            <div className="mt-2">
              <button
                type="button"
                className="rounded-[var(--radius-lg)] px-4 py-2.5 text-sm font-semibold"
                style={{ background: 'var(--primary-gradient)', color: 'var(--accent-foreground)' }}
                onClick={() => navigate('/workout/new')}
              >
                Rozpocznij trening
              </button>
            </div>
          )}

          {record && (
            <div
              className="mt-4 pt-6 flex flex-wrap gap-x-10 gap-y-5 border-t"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="flex flex-col gap-1 min-w-[6.5rem]">
                <span className="stat-meta">Rekord</span>
                <span className="text-2xl font-bold tabular-nums text-white leading-none">
                  {record.maxWeight} <span className="text-base" style={{ color: 'var(--muted)' }}>kg</span>
                </span>
              </div>
              <div className="flex flex-col gap-1 min-w-[6.5rem]">
                <span className="stat-meta">Powt. max</span>
                <span className="text-2xl font-bold tabular-nums text-white leading-none">
                  {record.maxReps}
                </span>
              </div>
              <div className="flex flex-col gap-1 min-w-[6.5rem]">
                <span className="stat-meta">Sesje</span>
                <span className="text-2xl font-bold tabular-nums text-white leading-none">
                  {record.totalSessions}
                </span>
              </div>
              <div className="flex flex-col gap-1 min-w-[6.5rem]">
                <span className="stat-meta">Top wolumen</span>
                <span className="text-2xl font-bold tabular-nums text-white leading-none">
                  {formatVolume(record.bestVolume)}
                </span>
              </div>
            </div>
          )}
        </motion.div>
      </section>

      <div className="space-y-5">

          {/* Volume trend */}
          {sessions.length > 0 && (
            <div className="surface-panel rounded-[var(--radius-xl)] p-5">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="eyebrow">Historia</p>
                  <h2 className="section-title mt-2">Wolumen na sesję</h2>
                </div>
                <BarChart3 size={18} style={{ color: 'var(--muted)' }} />
              </div>
              <div className="flex items-end gap-1.5 h-20">
                {sessions.slice().reverse().map((session) => {
                  const heightPct = maxVolume > 0 ? (session.totalVolume / maxVolume) * 100 : 0
                  return (
                    <div key={session.id} className="flex-1 flex flex-col items-center gap-1 group">
                      <div className="relative w-full flex items-end" style={{ height: '4rem' }}>
                        <motion.div
                          className="w-full rounded-t-sm"
                          style={{ background: accent, opacity: 0.7 }}
                          initial={{ height: 0 }}
                          animate={{ height: `${Math.max(heightPct, 4)}%` }}
                          transition={{ duration: 0.5, ease: 'easeOut', delay: 0.1 }}
                          title={`${formatDate(session.startedAt)}: ${formatVolume(session.totalVolume)}`}
                        />
                      </div>
                      <p className="text-[9px] uppercase" style={{ color: 'var(--muted-soft)' }}>
                        {new Date(session.startedAt).toLocaleDateString('pl-PL', { day: 'numeric', month: 'numeric' })}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Recent sessions */}
          <div className="surface-panel rounded-[var(--radius-xl)] p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="eyebrow">Historia sesji</p>
                <h2 className="section-title mt-2">Ostatnie treningi</h2>
              </div>
              <Layers3 size={18} style={{ color: 'var(--muted)' }} />
            </div>

            {sessions.length === 0 ? (
              <div className="rounded-[var(--radius-lg)] border px-5 py-5" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)]" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                      <Target size={18} />
                    </div>
                    <p className="text-sm font-semibold text-white">Brak historii</p>
                    <p className="mt-2 max-w-xl text-sm leading-6" style={{ color: 'var(--muted)' }}>
                      Brak zapisanych serii dla tego ćwiczenia.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {['Sesje', 'Top set', 'Wolumen'].map((item) => (
                      <span
                        key={item}
                        className="rounded-full px-3 py-1.5 text-[11px] font-medium"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--muted)' }}
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {sessions.map((session) => (
                  <motion.div
                    key={session.id}
                    className="rounded-[var(--radius-lg)] border p-4"
                    style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'var(--border)' }}
                    initial={false}
                    animate={{ opacity: 1 }}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{formatDate(session.startedAt)}</p>
                        {session.label && (
                          <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>{session.label}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-white tabular-nums">{formatVolume(session.totalVolume)}</p>
                        <p className="mt-0.5 text-[10px] uppercase" style={{ color: 'var(--muted)' }}>wolumen</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg p-2 text-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <p className="text-xs font-semibold text-white tabular-nums">{session.totalSets}</p>
                        <p className="text-[10px] uppercase mt-0.5" style={{ color: 'var(--muted)' }}>serie</p>
                      </div>
                      <div className="rounded-lg p-2 text-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <p className="text-xs font-semibold text-white tabular-nums">{session.totalReps}</p>
                        <p className="text-[10px] uppercase mt-0.5" style={{ color: 'var(--muted)' }}>powt.</p>
                      </div>
                      <div className="rounded-lg p-2 text-center" style={{ background: `${accent}14` }}>
                        <p className="text-xs font-semibold tabular-nums" style={{ color: accent }}>
                          {session.bestSetWeight ? `${session.bestSetWeight} kg` : '—'}
                        </p>
                        <p className="text-[10px] uppercase mt-0.5" style={{ color: 'var(--muted)' }}>top set</p>
                      </div>
                    </div>

                    {session.sets.length > 0 && (
                      <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                        <div className="flex flex-wrap gap-1.5">
                          {session.sets.map((set, i) => (
                            <span
                              key={i}
                              className="text-[11px] px-2 py-0.5 rounded-full tabular-nums"
                              style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text)', border: '1px solid var(--border)' }}
                            >
                              {set.weight}×{set.reps}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </div>

      </div>
    </>
  )
}
