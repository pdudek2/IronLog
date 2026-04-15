import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import NumberFlow from '@number-flow/react'
import {
  Area, AreaChart, CartesianGrid, Cell,
  Line, LineChart,
  Bar, BarChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

import { LoadingState } from '../components/ui'
import { useAuthStore } from '../store/authStore'
import {
  aggregateActivityHeatmap,
  aggregateMuscleBalance,
  aggregatePeriodComparison,
  aggregateStrengthProgression,
  aggregateWeeklyVolume,
  getProgressSessions,
  getRecords,
  type ProgressSessionLite,
  type RecordSummary,
} from '../lib/progressService'

const RANGE_OPTIONS = [
  { label: '30 dni', days: 30 },
  { label: '90 dni', days: 90 },
]

const MUSCLE_COLORS: Record<string, string> = {
  chest:      '#5aa6ff',
  shoulders:  '#7b8fff',
  triceps:    '#a78bfa',
  back:       '#34d399',
  biceps:     '#6ee7b7',
  forearms:   '#a7f3d0',
  quads:      '#f59e0b',
  hamstrings: '#fbbf24',
  glutes:     '#fcd34d',
  calves:     '#fb923c',
  core:       '#f87171',
}

const MUSCLE_PL: Record<string, string> = {
  chest: 'Klatka',
  back: 'Plecy',
  shoulders: 'Barki',
  biceps: 'Biceps',
  triceps: 'Triceps',
  quads: 'Quady',
  hamstrings: 'Dwugłowe',
  glutes: 'Pośladki',
  core: 'Core',
  calves: 'Łydki',
  forearms: 'Przedramiona',
}

const HEATMAP_COLORS = [
  'rgba(255,255,255,0.04)',
  'rgba(90,166,255,0.15)',
  'rgba(90,166,255,0.35)',
  'rgba(90,166,255,0.6)',
  'rgba(90,166,255,0.9)',
]

const DAY_LABELS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd']

function formatVolume(kg: number): string {
  if (kg >= 1_000_000) return `${(kg / 1_000_000).toFixed(1)}M kg`
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}k kg`
  return `${Math.round(kg)} kg`
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })
}

interface DarkTooltipProps {
  active?: boolean
  payload?: Array<{ name?: string; value?: number | string; color?: string }>
  label?: string
}

function DarkTooltip({ active, payload, label }: DarkTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        padding: '10px 14px',
        fontSize: '12px',
      }}
    >
      <p style={{ color: 'var(--muted)', marginBottom: 4 }}>{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color ?? 'var(--accent)', fontWeight: 600 }}>
          {typeof p.value === 'number' && p.name !== 'sessions'
            ? `${p.value} kg`
            : p.value}{' '}
          {p.name === 'sessions' ? 'sesji' : ''}
        </p>
      ))}
    </div>
  )
}

export default function ProgressPage() {
  const { user } = useAuthStore()
  const [rangeDays, setRangeDays] = useState(90)
  const [sessions, setSessions] = useState<ProgressSessionLite[]>([])
  const [records, setRecords] = useState<RecordSummary[]>([])
  const [fetchedAt, setFetchedAt] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  function handleRangeChange(days: number) {
    if (days === rangeDays) return
    setError(false)
    setLoading(true)
    setRangeDays(days)
  }

  useEffect(() => {
    if (!user) return

    let cancelled = false
    const fromMs = Date.now() - rangeDays * 2 * 86_400_000

    Promise.all([
      getProgressSessions(user.uid, fromMs),
      getRecords(user.uid),
    ])
      .then(([s, r]) => {
        if (cancelled) return
        setSessions(s)
        setRecords(r)
        setFetchedAt(Date.now())
        setError(false)
      })
      .catch((err) => {
        console.error('[progress load error]', err)
        if (cancelled) return
        setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [user, rangeDays])

  const currentSessions = useMemo(() => {
    const cutoff = fetchedAt - rangeDays * 86_400_000
    return sessions.filter((s) => s.finishedAt >= cutoff)
  }, [sessions, rangeDays, fetchedAt])

  const weeklyData = useMemo(
    () => aggregateWeeklyVolume(currentSessions, rangeDays === 30 ? 5 : 13),
    [currentSessions, rangeDays],
  )

  const muscleData = useMemo(() => aggregateMuscleBalance(currentSessions), [currentSessions])

  const periodComparison = useMemo(
    () => aggregatePeriodComparison(sessions, rangeDays),
    [sessions, rangeDays],
  )

  const strengthData = useMemo(
    () => aggregateStrengthProgression(currentSessions, 5),
    [currentSessions],
  )

  const heatmapData = useMemo(
    () => aggregateActivityHeatmap(currentSessions, 12),
    [currentSessions],
  )

  const totalVolume = useMemo(
    () => currentSessions.reduce((sum, s) => sum + s.totalVolume, 0),
    [currentSessions],
  )
  const uniqueWorkouts = useMemo(
    () => new Set(currentSessions.map((s) => s.workoutId)).size,
    [currentSessions],
  )

  if (loading) return <LoadingState message="Ładowanie postępów..." />

  const uniqueExerciseCount = new Set(currentSessions.map((s) => s.exerciseName)).size

  return (
    <>
      <div className="space-y-6">
        {/* ── Editorial hero ──────────────────────────── */}
        <section className="hero-editorial">
          <motion.div
            className="flex flex-col gap-5"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <p className="hero-editorial-date">
                Analityka · ostatnie {rangeDays} dni
              </p>
              <div className="flex gap-2">
                {RANGE_OPTIONS.map(({ label, days }) => (
                  <button
                    key={days}
                    onClick={() => handleRangeChange(days)}
                    disabled={rangeDays === days}
                    className="rounded-[var(--radius-pill)] px-3.5 py-1.5 text-xs font-semibold transition-colors"
                    style={
                      rangeDays === days
                        ? { background: 'var(--accent-soft)', border: '1px solid var(--accent-soft-strong)', color: 'var(--accent)' }
                        : { background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)' }
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h1 className="hero-editorial-name">Progres<br />treningowy.</h1>
            </div>

            <p className="hero-editorial-sub">
              {uniqueWorkouts > 0
                ? `${uniqueWorkouts} ${uniqueWorkouts === 1 ? 'sesja' : 'sesji'} w tym oknie · ${formatVolume(totalVolume)} łącznej objętości`
                : 'Brak danych w wybranym zakresie. Zaloguj pierwszy trening aby zobaczyć trajektorię.'}
            </p>

            <div
              className="mt-4 pt-6 flex flex-wrap gap-x-10 gap-y-5 border-t"
              style={{ borderColor: 'var(--border)' }}
            >
              {[
                { label: 'Sesji', value: uniqueWorkouts, suffix: '' },
                { label: 'Objętość', value: Math.round(totalVolume), suffix: ' kg' },
                { label: 'Ćwiczeń', value: uniqueExerciseCount, suffix: '' },
                { label: 'Rekordy', value: records.length, suffix: '' },
              ].map((item) => (
                <div key={item.label} className="flex flex-col gap-1 min-w-[6.5rem]">
                  <span className="stat-meta">{item.label}</span>
                  <span className="text-2xl font-bold tabular-nums tracking-[-0.03em] text-white leading-none">
                    <NumberFlow
                      value={item.value}
                      transformTiming={{ duration: 600, easing: 'cubic-bezier(0.2,0.8,0.2,1)' }}
                      format={{ useGrouping: true }}
                      locales="pl-PL"
                    />
                    {item.suffix}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        </section>

        {error && (
          <div className="surface-panel rounded-[var(--radius-xl)] p-6 text-center">
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Nie udało się pobrać danych. Sprawdź połączenie i odśwież stronę.
            </p>
          </div>
        )}

        {/* ── Period Comparison ───────────────────────── */}
        {!error && periodComparison.previousSessions > 0 && (
          <motion.div
            className="surface-panel rounded-[var(--radius-xl)] p-4 sm:p-5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.03, duration: 0.2 }}
          >
            <p className="eyebrow mb-1">Porównanie</p>
            <p className="section-title mb-5">vs poprzednie {rangeDays} dni</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { label: 'Sesje', current: periodComparison.currentSessions, delta: periodComparison.sessionsDelta },
                { label: 'Wolumen', current: formatVolume(periodComparison.currentVolume), delta: periodComparison.volumeDelta },
                { label: 'Śr. wolumen/sesja', current: formatVolume(periodComparison.currentAvgVolume), delta: periodComparison.avgVolumeDelta },
              ].map(({ label, current, delta }) => (
                <div key={label} className="metric-card p-4 text-center">
                  <p className="stat-meta">{label}</p>
                  <p className="mt-2 text-2xl font-bold text-white tabular-nums tracking-[-0.04em]">{current}</p>
                  <p
                    className="mt-1 text-sm font-semibold"
                    style={{ color: delta >= 0 ? 'var(--success)' : '#ef4444' }}
                  >
                    {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(0)}%
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Volume chart ────────────────────────────── */}
        {!error && (
          <motion.div
            className="surface-panel rounded-[var(--radius-xl)] p-4 sm:p-5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.2 }}
          >
            <p className="eyebrow mb-1">Objętość</p>
            <p className="section-title mb-5">Wolumen treningowy</p>
            <div className="h-[180px] sm:h-[220px]">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <AreaChart data={weeklyData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis
                    dataKey="weekLabel"
                    tick={{ fill: 'var(--muted)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => formatVolume(Number(v))}
                    tick={{ fill: 'var(--muted)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                  />
                  <Tooltip content={<DarkTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="volume"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    fill="url(#volGrad)"
                    dot={false}
                    activeDot={{ r: 4, fill: 'var(--accent)', stroke: 'none' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}

        {/* ── Strength Progression ────────────────────── */}
        {!error && strengthData.data.length > 0 && (
          strengthData.data.length < 3 ? (
            <div className="surface-panel rounded-[var(--radius-xl)] p-4 sm:p-5">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div>
                  <p className="eyebrow mb-1">Siła</p>
                  <p className="section-title mb-2">Progresja ciężaru</p>
                  <p className="text-sm leading-6" style={{ color: 'var(--muted)' }}>
                    Potrzebujesz jeszcze {3 - strengthData.data.length}{' '}
                    {3 - strengthData.data.length === 1 ? 'sesji' : 'sesji'} z tym ćwiczeniem, żeby zobaczyć wykres progresji.
                  </p>
                </div>
                <div className="flex gap-2">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={index}
                      className="rounded-[var(--radius-lg)] border px-3 py-3 text-center"
                      style={{
                        minWidth: '4.5rem',
                        background: 'rgba(255,255,255,0.025)',
                        borderColor: index < strengthData.data.length ? 'var(--accent-soft-strong)' : 'var(--border)',
                        color: index < strengthData.data.length ? 'var(--accent)' : 'var(--muted)',
                      }}
                    >
                      <p className="stat-meta">Sesja</p>
                      <p className="mt-2 text-lg font-semibold tabular-nums">{index + 1}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
          <motion.div
            className="surface-panel rounded-[var(--radius-xl)] p-4 sm:p-5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.2 }}
          >
            <p className="eyebrow mb-1">Siła</p>
            <p className="section-title mb-5">Progresja ciężaru</p>
            <div className="h-[190px] sm:h-[240px]">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <LineChart data={strengthData.data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: 'var(--muted)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'var(--muted)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    unit=" kg"
                    width={56}
                  />
                  <Tooltip content={<DarkTooltip />} />
                  {strengthData.series.map((s) => (
                    <Line
                      key={s.exerciseName}
                      type="monotone"
                      dataKey={s.exerciseName}
                      stroke={s.color}
                      strokeWidth={2}
                      dot={{ r: 3, fill: s.color, strokeWidth: 0 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              {strengthData.series.map((s) => (
                <div key={s.exerciseName} className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: s.color }}
                  />
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>{s.exerciseName}</span>
                </div>
              ))}
            </div>
          </motion.div>
          )
        )}

        {/* ── Muscle balance ───────────────────────────── */}
        {!error && muscleData.length > 0 && (
          <motion.div
            className="surface-panel rounded-[var(--radius-xl)] p-4 sm:p-5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.2 }}
          >
            <p className="eyebrow mb-1">Balans</p>
            <p className="section-title mb-5">Partie mięśniowe</p>
            <div style={{ height: muscleData.length * 38 + 16 }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart
                  data={muscleData}
                  layout="vertical"
                  margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: 'var(--muted)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="muscle"
                    width={96}
                    tick={{ fill: 'var(--muted)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: string) => MUSCLE_PL[v] ?? v}
                  />
                  <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20}>
                    {muscleData.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={MUSCLE_COLORS[entry.muscle] ?? `rgba(90,166,255,${Math.max(0.4, 1 - index * 0.1)})`}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}

        {/* ── Activity Heatmap ─────────────────────────── */}
        {!error && currentSessions.length > 0 && (
          <motion.div
            className="surface-panel rounded-[var(--radius-xl)] p-4 sm:p-5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.2 }}
          >
            <p className="eyebrow mb-1">Aktywność</p>
            <p className="section-title mb-5">Kalendarz treningów</p>
            <div className="overflow-x-auto">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.5rem repeat(12, 1fr)',
                  gap: 3,
                  minWidth: 280,
                }}
              >
                {DAY_LABELS.map((day, dayIdx) => (
                  <div key={day} style={{ display: 'contents' }}>
                    <span
                      className="flex items-center justify-end pr-1"
                      style={{ color: 'var(--muted)', fontSize: 10 }}
                    >
                      {dayIdx % 2 === 0 ? day : ''}
                    </span>
                    {Array.from({ length: 12 }, (_, weekIdx) => {
                      const cell = heatmapData.find((c) => c.dayOfWeek === dayIdx && c.weekIndex === weekIdx)
                      return (
                        <div
                          key={weekIdx}
                          title={cell?.date && cell.volume > 0 ? `${cell.date}: ${formatVolume(cell.volume)}` : cell?.date ?? ''}
                          style={{
                            aspectRatio: '1',
                            borderRadius: 3,
                            background: HEATMAP_COLORS[cell?.level ?? 0],
                          }}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-1.5">
              <span className="text-[10px]" style={{ color: 'var(--muted)' }}>Mniej</span>
              {HEATMAP_COLORS.map((color, i) => (
                <div
                  key={i}
                  style={{ width: 12, height: 12, borderRadius: 2, background: color }}
                />
              ))}
              <span className="text-[10px]" style={{ color: 'var(--muted)' }}>Więcej</span>
            </div>
          </motion.div>
        )}

        {/* ── PR list ──────────────────────────────────── */}
        {!error && records.length > 0 && (
          <motion.div
            className="surface-panel rounded-[var(--radius-xl)] p-4 sm:p-5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.2 }}
          >
            <p className="eyebrow mb-1">Rekordy</p>
            <p className="section-title mb-5">Rekordy osobiste</p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {records.map((rec) => (
                <div key={rec.id} className="metric-card p-4">
                  <p className="text-sm font-semibold text-white truncate">{rec.exerciseName}</p>
                  <p className="mt-3 text-2xl font-bold text-white tabular-nums tracking-[-0.04em]">
                    {rec.maxWeight} <span className="text-base font-medium" style={{ color: 'var(--muted)' }}>kg</span>
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>
                      × {rec.maxReps} powt. • {rec.totalSessions} sesji
                    </p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>
                      {formatDate(rec.lastPerformedAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {!error && records.length === 0 && currentSessions.length === 0 && (
          <div className="surface-panel rounded-[var(--radius-xl)] p-10 text-center">
            <p className="text-lg font-semibold text-white">Brak danych</p>
            <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
              Ukończ kilka treningów, żeby zobaczyć wykresy i rekordy.
            </p>
          </div>
        )}
      </div>
    </>
  )
}
