import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid,
  Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

import AppShell from '../components/AppShell'
import { LoadingState } from '../components/ui'
import { useAuthStore } from '../store/authStore'
import {
  aggregateMuscleBalance,
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

function formatVolume(kg: number): string {
  if (kg >= 1_000_000) return `${(kg / 1_000_000).toFixed(1)}M kg`
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}k kg`
  return `${kg} kg`
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })
}

interface DarkTooltipProps {
  active?: boolean
  payload?: Array<{ name?: string; value?: number | string }>
  label?: string
}

function DarkTooltip({ active, payload, label }: DarkTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div
      style={{
        background: 'rgba(8,6,26,0.97)',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        padding: '10px 14px',
        fontSize: '12px',
      }}
    >
      <p style={{ color: 'var(--muted)', marginBottom: 4 }}>{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: 'var(--accent)', fontWeight: 600 }}>
          {typeof p.value === 'number' && p.name === 'volume'
            ? formatVolume(p.value)
            : p.value}{' '}
          {p.name === 'sessions' ? 'sesji' : ''}
        </p>
      ))}
    </div>
  )
}

export default function ProgressPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [rangeDays, setRangeDays] = useState(90)
  const [sessions, setSessions] = useState<ProgressSessionLite[]>([])
  const [records, setRecords] = useState<RecordSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!user) return
    setLoading(true)
    setError(false)

    const fromMs = Date.now() - rangeDays * 86_400_000

    Promise.all([
      getProgressSessions(user.uid, fromMs),
      getRecords(user.uid),
    ])
      .then(([s, r]) => {
        setSessions(s)
        setRecords(r)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [user, rangeDays])

  const weeklyData = useMemo(
    () => aggregateWeeklyVolume(sessions, rangeDays === 30 ? 5 : 13),
    [sessions, rangeDays],
  )

  const muscleData = useMemo(() => aggregateMuscleBalance(sessions), [sessions])

  const totalVolume = useMemo(
    () => sessions.reduce((sum, s) => sum + s.totalVolume, 0),
    [sessions],
  )
  const uniqueWorkouts = useMemo(
    () => new Set(sessions.map((s) => s.workoutId)).size,
    [sessions],
  )

  if (loading) return <LoadingState message="Ładowanie postępów..." />

  return (
    <AppShell current="progress">
      {/* ── Mobile sticky header ─────────────────────── */}
      <div
        className="fixed top-0 left-0 right-0 z-40 lg:hidden flex items-center gap-3 px-4"
        style={{
          paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))',
          paddingBottom: '0.75rem',
          background: 'rgba(10,14,22,0.9)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <button
          onClick={() => navigate('/dashboard')}
          aria-label="Wróć do dashboardu"
          className="transition-opacity hover:opacity-70"
          style={{ color: 'var(--muted)' }}
        >
          <ArrowLeft size={16} />
        </button>
        <span className="text-sm font-semibold text-white flex-1">Postępy</span>
      </div>

      <div className="pt-[4.5rem] lg:pt-0 space-y-5">
        {/* ── Desktop back nav ────────────────────────── */}
        <div className="hidden lg:flex items-center gap-3 mb-2">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-sm transition-opacity hover:opacity-70"
            style={{ color: 'var(--muted)' }}
          >
            <ArrowLeft size={14} />
            Dashboard
          </button>
          <span style={{ color: 'var(--border)' }}>·</span>
          <span className="text-sm font-semibold text-white">Postępy</span>
        </div>

        {/* ── Header ──────────────────────────────────── */}
        <motion.div
          className="surface-panel rounded-[var(--radius-xl)] p-5"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <p className="eyebrow mb-2" style={{ color: 'var(--accent)' }}>Analityka</p>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <h1 className="section-title">Postępy</h1>
            <div className="flex gap-2">
              {RANGE_OPTIONS.map(({ label, days }) => (
                <button
                  key={days}
                  onClick={() => setRangeDays(days)}
                  className="rounded-[var(--radius-md)] px-3 py-1.5 text-xs font-semibold transition-colors"
                  style={
                    rangeDays === days
                      ? { background: 'var(--accent)', color: 'var(--accent-foreground)' }
                      : { background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--muted)' }
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Sesji', value: uniqueWorkouts },
              { label: 'Objętość', value: formatVolume(totalVolume) },
              { label: 'Ćwiczeń', value: new Set(sessions.map((s) => s.exerciseName)).size },
              { label: 'Rekordy', value: records.length },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-[var(--radius-lg)] border p-3"
                style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'var(--border)' }}
              >
                <p className="stat-meta">{label}</p>
                <p className="mt-2 text-2xl font-bold text-white tabular-nums tracking-[-0.04em]">{value}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {error && (
          <div className="surface-panel rounded-[var(--radius-xl)] p-6 text-center">
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Nie udało się pobrać danych. Sprawdź połączenie i odśwież stronę.
            </p>
          </div>
        )}

        {/* ── Volume chart ────────────────────────────── */}
        {!error && (
          <motion.div
            className="surface-panel rounded-[var(--radius-xl)] p-5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.2 }}
          >
            <p className="eyebrow mb-1">Objętość</p>
            <p className="section-title mb-5">Wolumen treningowy</p>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
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
                    tick={{ fill: 'var(--muted)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => formatVolume(Number(v))}
                    tick={{ fill: 'var(--muted)', fontSize: 11 }}
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

        {/* ── Muscle balance ───────────────────────────── */}
        {!error && muscleData.length > 0 && (
          <motion.div
            className="surface-panel rounded-[var(--radius-xl)] p-5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.2 }}
          >
            <p className="eyebrow mb-1">Balans</p>
            <p className="section-title mb-5">Partie mięśniowe</p>
            <div style={{ height: muscleData.length * 38 + 16 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={muscleData}
                  layout="vertical"
                  margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: 'var(--muted)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="muscle"
                    width={96}
                    tick={{ fill: 'var(--muted)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20}>
                    {muscleData.map((_, index) => (
                      <Cell
                        key={index}
                        fill={index === 0 ? 'var(--accent)' : `rgba(232,255,87,${0.55 - index * 0.05})`}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}

        {/* ── PR list ──────────────────────────────────── */}
        {!error && records.length > 0 && (
          <motion.div
            className="surface-panel rounded-[var(--radius-xl)] p-5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.2 }}
          >
            <p className="eyebrow mb-1">Rekordy</p>
            <p className="section-title mb-5">Personal records</p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {records.map((rec) => (
                <div
                  key={rec.id}
                  className="metric-card p-4"
                >
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

        {!error && records.length === 0 && sessions.length === 0 && (
          <div className="surface-panel rounded-[var(--radius-xl)] p-10 text-center">
            <p className="text-lg font-semibold text-white">Brak danych</p>
            <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
              Ukończ kilka treningów, żeby zobaczyć wykresy i rekordy.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  )
}
