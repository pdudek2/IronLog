import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, BarChart3, Layers3, Target, TrendingUp } from 'lucide-react'
import { exercises as globalExercises, type Exercise } from '../data/exercises'
import { getUserExercises } from '../lib/userExercisesService'
import {
  getExerciseSessions,
  getExerciseRecord,
  type ExerciseSession,
  type ExerciseRecord,
} from '../lib/exerciseDetailService'
import { useAuthStore } from '../store/authStore'
import AppShell from '../components/AppShell'
import { LoadingState } from '../components/ui'

const CATEGORY_LABELS: Record<string, string> = {
  chest: 'Klatka',
  back: 'Plecy',
  legs: 'Nogi',
  shoulders: 'Barki',
  arms: 'Ramiona',
  core: 'Core',
  cardio: 'Cardio',
}

const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: 'Sztanga',
  dumbbell: 'Hantle',
  cable: 'Wyciąg',
  machine: 'Maszyna',
  bodyweight: 'Własne ciało',
  kettlebell: 'Kettlebell',
}

const CATEGORY_COLORS: Record<string, string> = {
  chest: '#4D8EFF',
  back: '#9B6DFF',
  legs: '#FF5757',
  arms: '#FF9F43',
  shoulders: '#FF6B9D',
  core: '#00D4AA',
  cardio: '#FFD700',
}

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

  const globalExercise = useMemo(
    () => (id ? globalExercises.find((ex) => ex.id === id) ?? null : null),
    [id],
  )

  const [userExercise, setUserExercise] = useState<Exercise | null>(null)
  const [sessions, setSessions] = useState<ExerciseSession[]>([])
  const [record, setRecord] = useState<ExerciseRecord | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user || !id) return

    const currentUser = user
    const exerciseId = id

    let cancelled = false

    async function loadExerciseDetail() {
      try {
        if (source === 'user') {
          const list = await getUserExercises(currentUser.uid)
          if (!cancelled) {
            setUserExercise(list.find((ex) => ex.id === exerciseId) ?? null)
          }
        }

        const exSource: 'global' | 'user' = source === 'user' ? 'user' : 'global'
        const [sess, rec] = await Promise.all([
          getExerciseSessions(currentUser.uid, exerciseId, exSource),
          getExerciseRecord(currentUser.uid, exerciseId, exSource),
        ])

        if (!cancelled) {
          setSessions(sess)
          setRecord(rec)
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
  }, [user, id, source])

  const exercise = source === 'user' ? userExercise : globalExercise

  if (loading) return <LoadingState message="Ładowanie ćwiczenia..." />

  const accent = CATEGORY_COLORS[exercise?.category ?? ''] ?? 'var(--accent)'
  const maxVolume = sessions.length ? Math.max(...sessions.map((s) => s.totalVolume), 1) : 1

  return (
    <AppShell current="exercises">
      <motion.div
        className="mb-6 flex items-center gap-3"
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
      >
        <button
          onClick={() => navigate(-1)}
          className="surface-panel p-2 rounded-xl transition-opacity hover:opacity-70"
          style={{ color: 'var(--text)' }}
          aria-label="Wróć"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <p className="eyebrow">Ćwiczenia → Szczegóły</p>
          <p className="mt-1 text-sm font-semibold text-white">
            {exercise?.name ?? id}
          </p>
        </div>
      </motion.div>

      <div className="desktop-app-grid">

        {/* Sidebar */}
        <aside className="desktop-sticky space-y-4 hidden lg:block">
          <div className="surface-panel rounded-[var(--radius-xl)] overflow-hidden" style={{ borderLeft: `4px solid ${accent}` }}>
            <div className="p-5">
              {exercise ? (
                <>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {exercise.category && (
                      <span
                        className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
                        style={{ background: `${accent}18`, color: accent }}
                      >
                        {CATEGORY_LABELS[exercise.category] ?? exercise.category}
                      </span>
                    )}
                    {exercise.equipment && (
                      <span
                        className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
                        style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--muted)', border: '1px solid var(--border)' }}
                      >
                        {EQUIPMENT_LABELS[exercise.equipment] ?? exercise.equipment}
                      </span>
                    )}
                    {source === 'user' && (
                      <span
                        className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
                        style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent-soft-strong)' }}
                      >
                        moje
                      </span>
                    )}
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-4">{exercise.name}</h2>
                  {exercise.muscles.length > 0 && (
                    <div>
                      <p className="stat-meta mb-2">Partie mięśniowe</p>
                      <div className="flex flex-wrap gap-1.5">
                        {exercise.muscles.map((m) => (
                          <span key={m} className="text-[11px] px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-white">{id}</p>
              )}
            </div>
          </div>

          {record && (
            <div className="surface-panel rounded-[var(--radius-xl)] p-5">
              <p className="eyebrow mb-4" style={{ color: accent }}>Rekord osobisty</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="metric-card p-3">
                  <p className="stat-meta mb-2">Ciężar</p>
                  <p className="text-xl font-bold text-white tabular-nums">{record.maxWeight} kg</p>
                </div>
                <div className="metric-card p-3">
                  <p className="stat-meta mb-2">Powt.</p>
                  <p className="text-xl font-bold text-white tabular-nums">{record.maxReps}</p>
                </div>
                <div className="metric-card p-3">
                  <p className="stat-meta mb-2">Sesje</p>
                  <p className="text-xl font-bold text-white tabular-nums">{record.totalSessions}</p>
                </div>
                <div className="metric-card p-3">
                  <p className="stat-meta mb-2">Wolumen</p>
                  <p className="text-xl font-bold text-white tabular-nums">{formatVolume(record.bestVolume)}</p>
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* Main content */}
        <main className="min-w-0 space-y-5">

          {/* Mobile: exercise info card */}
          <div className="surface-panel rounded-[var(--radius-xl)] overflow-hidden lg:hidden" style={{ borderLeft: `4px solid ${accent}` }}>
            <div className="p-4">
              {exercise ? (
                <>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {exercise.category && (
                      <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
                        style={{ background: `${accent}18`, color: accent }}>
                        {CATEGORY_LABELS[exercise.category] ?? exercise.category}
                      </span>
                    )}
                    {exercise.equipment && (
                      <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
                        style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                        {EQUIPMENT_LABELS[exercise.equipment] ?? exercise.equipment}
                      </span>
                    )}
                  </div>
                  <h1 className="text-xl font-bold text-white">{exercise.name}</h1>
                </>
              ) : (
                <h1 className="text-xl font-bold text-white">{id}</h1>
              )}
            </div>
          </div>

          {/* Mobile: record card */}
          {record && (
            <div className="surface-panel rounded-[var(--radius-xl)] p-4 lg:hidden">
              <p className="eyebrow mb-3" style={{ color: accent }}>Rekord osobisty</p>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Ciężar', value: `${record.maxWeight} kg` },
                  { label: 'Powt.', value: String(record.maxReps) },
                  { label: 'Sesje', value: String(record.totalSessions) },
                  { label: 'Wolumen', value: formatVolume(record.bestVolume) },
                ].map((item) => (
                  <div key={item.label} className="metric-card p-2.5 text-center">
                    <p className="text-sm font-bold text-white tabular-nums">{item.value}</p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                      <p className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--muted-soft)' }}>
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
              <div className="rounded-[var(--radius-lg)] border px-5 py-8 text-center" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                <Target size={22} className="mx-auto mb-3" style={{ color: 'var(--muted)' }} />
                <p className="text-sm font-semibold text-white mb-1">Brak historii</p>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  Ćwiczenie pojawi się tutaj po pierwszym użyciu w treningu.
                </p>
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
                        <p className="mt-0.5 text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>wolumen</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg p-2 text-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <p className="text-xs font-semibold text-white tabular-nums">{session.totalSets}</p>
                        <p className="text-[10px] uppercase tracking-wide mt-0.5" style={{ color: 'var(--muted)' }}>serie</p>
                      </div>
                      <div className="rounded-lg p-2 text-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <p className="text-xs font-semibold text-white tabular-nums">{session.totalReps}</p>
                        <p className="text-[10px] uppercase tracking-wide mt-0.5" style={{ color: 'var(--muted)' }}>powt.</p>
                      </div>
                      <div className="rounded-lg p-2 text-center" style={{ background: `${accent}14` }}>
                        <p className="text-xs font-semibold tabular-nums" style={{ color: accent }}>
                          {session.bestSetWeight ? `${session.bestSetWeight} kg` : '—'}
                        </p>
                        <p className="text-[10px] uppercase tracking-wide mt-0.5" style={{ color: 'var(--muted)' }}>top set</p>
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

          {/* Stats row */}
          {sessions.length > 0 && (
            <div className="surface-panel rounded-[var(--radius-xl)] p-5">
              <p className="eyebrow mb-4">Statystyki ogólne</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { icon: Target, label: 'Sesje razem', value: String(record?.totalSessions ?? sessions.length) },
                  { icon: TrendingUp, label: 'Rekord', value: record?.maxWeight ? `${record.maxWeight} kg` : '—' },
                  { icon: Layers3, label: 'Łączne serie', value: String(sessions.reduce((sum, s) => sum + s.totalSets, 0)) },
                  { icon: BarChart3, label: 'Łączny wolumen', value: formatVolume(sessions.reduce((sum, s) => sum + s.totalVolume, 0)) },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="metric-card p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="stat-meta">{label}</p>
                      <Icon size={13} style={{ color: accent }} />
                    </div>
                    <p className="text-xl font-bold text-white tabular-nums">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </AppShell>
  )
}
