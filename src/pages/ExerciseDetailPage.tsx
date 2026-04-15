import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BarChart3, Layers3, Target } from 'lucide-react'
import { exercises as globalExercises, type Exercise } from '../data/exercises'
import { getUserExercises } from '../lib/userExercisesService'
import {
  getExerciseSessions,
  getExerciseRecord,
  type ExerciseSession,
  type ExerciseRecord,
} from '../lib/exerciseDetailService'
import { useAuthStore } from '../store/authStore'
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

const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Klatka',
  back: 'Plecy',
  shoulders: 'Barki',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Przedramiona',
  quads: 'Quady',
  hamstrings: 'Dwugłowe',
  glutes: 'Pośladki',
  calves: 'Łydki',
  core: 'Core',
  lats: 'Najszersze',
  traps: 'Czworoboczne',
  abs: 'Brzuch',
  obliques: 'Skośne',
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
          <div className="flex flex-wrap items-center gap-2">
            {exercise?.category && (
              <span
                className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
                style={{ background: `${accent}1e`, color: accent, border: `1px solid ${accent}30` }}
              >
                {CATEGORY_LABELS[exercise.category] ?? exercise.category}
              </span>
            )}
            {exercise?.equipment && (
              <span
                className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
                style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--muted)', border: '1px solid var(--border)' }}
              >
                {EQUIPMENT_LABELS[exercise.equipment] ?? exercise.equipment}
              </span>
            )}
            {source === 'user' && (
              <span
                className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent-soft-strong)' }}
              >
                moje
              </span>
            )}
          </div>

          <div>
            <h1 className="hero-editorial-name">{exercise?.name ?? id}.</h1>
          </div>

          {exercise?.muscles && exercise.muscles.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {exercise.muscles.map((m) => (
                <span
                  key={m}
                  className="text-[11px] px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--muted)', border: '1px solid var(--border)' }}
                >
                  {MUSCLE_LABELS[m] ?? m}
                </span>
              ))}
            </div>
          )}

          <p className="hero-editorial-sub">
            {sessions.length > 0
              ? `${sessions.length} ${sessions.length === 1 ? 'sesja' : 'sesji'} w historii · ${formatVolume(totalVolumeAll)} łącznej objętości`
              : 'Brak historii. Dodaj to ćwiczenie do sesji, żeby zacząć śledzić progres.'}
          </p>

          {sessions.length === 0 && (
            <div className="mt-2">
              <button
                type="button"
                className="rounded-[var(--radius-lg)] px-4 py-2.5 text-sm font-semibold"
                style={{ background: 'linear-gradient(180deg, var(--accent) 0%, #3f8ff4 100%)', color: 'var(--accent-foreground)' }}
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
                <span className="text-2xl font-bold tabular-nums tracking-[-0.03em] text-white leading-none">
                  {record.maxWeight} <span className="text-base" style={{ color: 'var(--muted)' }}>kg</span>
                </span>
              </div>
              <div className="flex flex-col gap-1 min-w-[6.5rem]">
                <span className="stat-meta">Powt. max</span>
                <span className="text-2xl font-bold tabular-nums tracking-[-0.03em] text-white leading-none">
                  {record.maxReps}
                </span>
              </div>
              <div className="flex flex-col gap-1 min-w-[6.5rem]">
                <span className="stat-meta">Sesje</span>
                <span className="text-2xl font-bold tabular-nums tracking-[-0.03em] text-white leading-none">
                  {record.totalSessions}
                </span>
              </div>
              <div className="flex flex-col gap-1 min-w-[6.5rem]">
                <span className="stat-meta">Top wolumen</span>
                <span className="text-2xl font-bold tabular-nums tracking-[-0.03em] text-white leading-none">
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
              <div className="rounded-[var(--radius-lg)] border px-5 py-5" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)]" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                      <Target size={18} />
                    </div>
                    <p className="text-sm font-semibold text-white">Brak historii</p>
                    <p className="mt-2 max-w-xl text-sm leading-6" style={{ color: 'var(--muted)' }}>
                      Po pierwszym użyciu zobaczysz tu ostatnie serie, wolumen i sygnały progresu dla tego ruchu.
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

      </div>
    </>
  )
}
