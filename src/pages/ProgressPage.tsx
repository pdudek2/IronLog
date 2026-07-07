import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { motion } from 'framer-motion'
import NumberFlow from '@number-flow/react'
import {
  Area, AreaChart, CartesianGrid, Cell,
  Line, LineChart,
  Bar, BarChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

import { Button, LoadingState } from '../components/ui'
import { useAuthStore } from '../store/authStore'
import {
  aggregateActivityHeatmap,
  aggregateMuscleBalance,
  aggregatePeriodComparison,
  aggregateStrengthProgression,
  aggregateWeeklyVolume,
  getProgressSessions,
  getRecords,
  type HeatmapDay,
  type MuscleBalancePoint,
  type ProgressSessionLite,
  type RecordSummary,
  type StrengthPoint,
  type StrengthSeries,
  type WeeklyPoint,
} from '../lib/progressService'
import { polishPlural } from '../lib/polishPlural'

const RANGE_OPTIONS = [
  { label: '30 dni', days: 30 },
  { label: '90 dni', days: 90 },
]

const MUSCLE_COLORS: Record<string, string> = {
  chest:      '#F0435A',
  shoulders:  '#D97B91',
  triceps:    '#E28A78',
  back:       '#8FB8A0',
  biceps:     '#A7D8BB',
  forearms:   '#B8A8B2',
  quads:      '#F0A75A',
  hamstrings: '#D9A06E',
  glutes:     '#C99571',
  calves:     '#C8A56C',
  core:       '#A09AA0',
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
  'rgba(240,67,90,0.15)',
  'rgba(240,67,90,0.35)',
  'rgba(240,67,90,0.6)',
  'rgba(240,67,90,0.9)',
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

function summarizeWeeklyVolume(data: WeeklyPoint[]): string {
  if (data.length === 0) return 'Wolumen treningowy: brak danych w wybranym zakresie.'

  const first = data[0]
  if (!first) return 'Wolumen treningowy: brak danych w wybranym zakresie.'

  const total = data.reduce((sum, point) => sum + point.volume, 0)
  const peak = data.reduce((top, point) => point.volume > top.volume ? point : top, first)
  const firstWeek = first.weekLabel
  const lastWeek = data[data.length - 1]?.weekLabel ?? 'koniec zakresu'

  return `Wolumen treningowy od ${firstWeek} do ${lastWeek}. Łącznie ${formatVolume(total)}. Najwyższy tydzień: ${peak.weekLabel}, ${formatVolume(peak.volume)}.`
}

function summarizeStrengthProgression(data: StrengthPoint[], series: StrengthSeries[]): string {
  if (data.length === 0 || series.length === 0) return 'Progresja ciężaru: brak danych do wykresu.'

  const summaries = series.slice(0, 5).map(({ exerciseName }) => {
    const values = data
      .map((point) => Number(point[exerciseName] ?? 0))
      .filter((value) => value > 0)
    const latest = [...data]
      .reverse()
      .map((point) => Number(point[exerciseName] ?? 0))
      .find((value) => value > 0) ?? 0
    const top = values.length ? Math.max(...values) : 0
    return `${exerciseName}: ostatnio ${latest} kg, max ${top} kg`
  })

  return `Progresja ciężaru dla ${series.length} ćwiczeń. ${summaries.join('; ')}.`
}

function summarizeMuscleBalance(data: MuscleBalancePoint[]): string {
  if (data.length === 0) return 'Balans partii mięśniowych: brak danych.'

  const top = data[0]
  if (!top) return 'Balans partii mięśniowych: brak danych.'
  const total = data.reduce((sum, point) => sum + point.count, 0)
  const muscleName = MUSCLE_PL[top.muscle] ?? top.muscle

  return `Balans partii mięśniowych. Najczęściej trenowana partia: ${muscleName}, ${top.count} wpisów. Łącznie ${total} wpisów w zestawieniu.`
}

function summarizeActivityHeatmap(data: HeatmapDay[]): string {
  const activeDays = data.filter((cell) => cell.volume > 0)
  if (activeDays.length === 0) return 'Kalendarz treningów: brak aktywnych dni w wybranym zakresie.'

  const first = activeDays[0]
  if (!first) return 'Kalendarz treningów: brak aktywnych dni w wybranym zakresie.'
  const peak = activeDays.reduce((top, cell) => cell.volume > top.volume ? cell : top, first)

  return `Kalendarz treningów z ostatnich 12 tygodni. Aktywne dni: ${activeDays.length}. Największy dzień: ${peak.date}, ${formatVolume(peak.volume)}.`
}

interface DarkTooltipProps {
  active?: boolean
  payload?: Array<{ name?: string; dataKey?: string | number; value?: number | string; color?: string }>
  label?: string
}

function DarkTooltip({ active, payload, label }: DarkTooltipProps) {
  if (!active || !payload?.length) return null
  const tooltipLabel = typeof label === 'string' ? (MUSCLE_PL[label] ?? label) : label

  function formatTooltipValue(item: NonNullable<DarkTooltipProps['payload']>[number]) {
    const key = String(item.dataKey ?? item.name ?? '')
    const value = item.value
    if (typeof value !== 'number') return value

    if (key === 'sessions') {
      return `${value} ${polishPlural(value, 'sesja', 'sesje', 'sesji')}`
    }
    if (key === 'count') {
      return `${value} ${polishPlural(value, 'wpis', 'wpisy', 'wpisów')}`
    }
    if (key === 'volume') {
      return formatVolume(value)
    }

    return `${value} kg`
  }

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
      <p style={{ color: 'var(--muted)', marginBottom: 4 }}>{tooltipLabel}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color ?? 'var(--accent)', fontWeight: 600 }}>
          {formatTooltipValue(p)}
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
  const [loadAttempt, setLoadAttempt] = useState(0)

  function handleRangeChange(days: number) {
    if (days === rangeDays) return
    setError(false)
    setLoading(true)
    setRangeDays(days)
  }

  function handleRetry() {
    setError(false)
    setLoading(true)
    setLoadAttempt((current) => current + 1)
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
  }, [user, rangeDays, loadAttempt])

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
  const weeklyVolumeLabel = useMemo(() => summarizeWeeklyVolume(weeklyData), [weeklyData])
  const strengthProgressionLabel = useMemo(
    () => summarizeStrengthProgression(strengthData.data, strengthData.series),
    [strengthData.data, strengthData.series],
  )
  const muscleBalanceLabel = useMemo(() => summarizeMuscleBalance(muscleData), [muscleData])
  const activityHeatmapLabel = useMemo(() => summarizeActivityHeatmap(heatmapData), [heatmapData])

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
  const missingStrengthSessions = Math.max(0, 3 - strengthData.data.length)
  const hasProgressData = currentSessions.length > 0 || records.length > 0
  const topMuscle = muscleData[0]
  const topMuscleName = topMuscle ? (MUSCLE_PL[topMuscle.muscle] ?? topMuscle.muscle) : 'Brak'
  const topRecord = records[0]
  const rangeLabel = `ostatnie ${rangeDays} dni`
  const comparisonItems = [
    { label: 'Sesje', value: periodComparison.currentSessions, delta: periodComparison.sessionsDelta },
    { label: 'Wolumen', value: formatVolume(periodComparison.currentVolume), delta: periodComparison.volumeDelta },
    { label: 'Śr. / sesję', value: formatVolume(periodComparison.currentAvgVolume), delta: periodComparison.avgVolumeDelta },
  ]
  const recordAccentKeys = Object.keys(MUSCLE_COLORS)
  const featuredRecords = records.slice(0, 3)
  const remainingRecords = records.slice(3)

  return (
    <>
      <div className="progress-page">
        <section className="progress-board">
          <motion.div
            className="progress-board-head"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div>
              <p className="progress-board-kicker">Postępy · {rangeLabel}</p>
              <h1>Postępy.</h1>
              <p>
                {uniqueWorkouts > 0
                  ? `${uniqueWorkouts} ${polishPlural(uniqueWorkouts, 'sesja', 'sesje', 'sesji')} · ${formatVolume(totalVolume)} · ${uniqueExerciseCount} ${polishPlural(uniqueExerciseCount, 'ćwiczenie', 'ćwiczenia', 'ćwiczeń')}`
                  : 'Brak treningów w wybranym zakresie.'}
              </p>
            </div>

            <div className="progress-range-toggle" aria-label="Zakres danych">
              {RANGE_OPTIONS.map(({ label, days }) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => handleRangeChange(days)}
                  aria-pressed={rangeDays === days}
                  className="progress-range-button"
                >
                  {label}
                </button>
              ))}
            </div>
          </motion.div>

          <div className="progress-summary-grid">
            <div className="progress-volume-tile">
              <span>Objętość</span>
              <strong>
                <NumberFlow
                  value={Math.round(totalVolume)}
                  transformTiming={{ duration: 600, easing: 'cubic-bezier(0.2,0.8,0.2,1)' }}
                  format={{ useGrouping: true }}
                  locales="pl-PL"
                />
                <small> kg</small>
              </strong>
              <p>{uniqueWorkouts} {polishPlural(uniqueWorkouts, 'sesja', 'sesje', 'sesji')} w zakresie</p>
            </div>

            <div className="progress-signal-rail">
              {[
                { label: 'Ćwiczenia', value: uniqueExerciseCount, meta: 'w zakresie' },
                { label: 'Rekordy', value: records.length, meta: topRecord ? topRecord.exerciseName : 'brak zapisów' },
                { label: 'Partia', value: topMuscleName, meta: topMuscle ? `${topMuscle.count} ${polishPlural(topMuscle.count, 'wpis', 'wpisy', 'wpisów')}` : 'brak danych' },
              ].map((item) => (
                <div key={item.label} className="progress-signal-row">
                  <span>{item.label}</span>
                  <div>
                    <strong>{item.value}</strong>
                    <small>{item.meta}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {periodComparison.previousSessions > 0 && (
            <div className="progress-comparison-strip" aria-label={`Porównanie z poprzednim okresem: ${rangeDays} dni`}>
              {comparisonItems.map((item) => (
                <div key={item.label} className="progress-comparison-item" data-trend={item.delta >= 0 ? 'up' : 'down'}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <small>{item.delta >= 0 ? '+' : ''}{item.delta.toFixed(0)}% vs poprzednio</small>
                </div>
              ))}
            </div>
          )}
        </section>

        {error && (
          <div className="progress-panel progress-empty-state">
            <p className="text-base font-semibold text-white">Nie udało się pobrać danych</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6" style={{ color: 'var(--muted)' }}>
              Sprawdź połączenie i spróbuj ponownie bez odświeżania strony.
            </p>
            <Button type="button" className="mt-5 min-w-[12rem]" onClick={handleRetry}>
              Spróbuj ponownie
            </Button>
          </div>
        )}

        {!error && (
          <div className="progress-analysis-grid">
            <motion.section
              className="progress-panel progress-panel--wide"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05, duration: 0.2 }}
            >
              <div className="progress-panel-head">
                <div>
                  <p>Objętość</p>
                  <h2>Wolumen tygodniowy</h2>
                </div>
                <span>{rangeDays === 30 ? '5 tyg.' : '13 tyg.'}</span>
              </div>
              <div className="progress-chart-frame progress-chart-frame--volume" role="img" aria-label={weeklyVolumeLabel}>
                <ResponsiveContainer width="100%" aspect={2.15} minWidth={1} initialDimension={{ width: 1, height: 1 }}>
                  <AreaChart data={weeklyData} margin={{ top: 12, right: 10, left: 0, bottom: 8 }}>
                    <defs>
                      <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.34} />
                        <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(244,241,242,0.085)" vertical={false} />
                    <XAxis
                      dataKey="weekLabel"
                      tick={{ fill: 'var(--muted)', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      interval={rangeDays === 90 ? 1 : 0}
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
                      strokeWidth={2.4}
                      fill="url(#volGrad)"
                      dot={false}
                      activeDot={{ r: 4.5, fill: 'var(--accent)', stroke: 'rgba(255,255,255,0.75)', strokeWidth: 1 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </motion.section>

            {strengthData.data.length > 0 && (
              strengthData.data.length < 3 ? (
                <section className="progress-panel progress-panel--compact">
                  <div className="progress-panel-head">
                    <div>
                      <p>Siła</p>
                      <h2>Progresja ciężaru</h2>
                    </div>
                  </div>
                  <p className="progress-muted-copy">
                    Potrzebujesz jeszcze {missingStrengthSessions}{' '}
                    {polishPlural(missingStrengthSessions, 'sesji', 'sesji', 'sesji')} z tym ćwiczeniem.
                  </p>
                  <div className="progress-session-markers" aria-label={`${strengthData.data.length} z 3 sesji do wykresu`}>
                    {Array.from({ length: 3 }).map((_, index) => (
                      <span key={index} data-active={index < strengthData.data.length} />
                    ))}
                  </div>
                </section>
              ) : (
                <motion.section
                  className="progress-panel progress-panel--wide"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08, duration: 0.2 }}
                >
                  <div className="progress-panel-head">
                    <div>
                      <p>Siła</p>
                      <h2>Progresja ciężaru</h2>
                    </div>
                  </div>
                  <div className="progress-chart-frame progress-chart-frame--strength" role="img" aria-label={strengthProgressionLabel}>
                    <ResponsiveContainer width="100%" aspect={2.05} minWidth={1} initialDimension={{ width: 1, height: 1 }}>
                      <LineChart data={strengthData.data} margin={{ top: 12, right: 10, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(244,241,242,0.085)" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: 'var(--muted)', fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                          interval="preserveStartEnd"
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
                            strokeWidth={2.35}
                            dot={{ r: 3, fill: s.color, strokeWidth: 0 }}
                            connectNulls
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="progress-legend">
                    {strengthData.series.map((s) => (
                      <div key={s.exerciseName}>
                        <span style={{ background: s.color }} />
                        <small>{s.exerciseName}</small>
                      </div>
                    ))}
                  </div>
                </motion.section>
              )
            )}

            {muscleData.length > 0 && (
              <motion.section
                className="progress-panel progress-panel--compact"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.2 }}
              >
                <div className="progress-panel-head">
                  <div>
                    <p>Balans</p>
                    <h2>Partie mięśniowe</h2>
                  </div>
                </div>
                <div style={{ height: muscleData.length * 34 + 16 }} role="img" aria-label={muscleBalanceLabel}>
                  <ResponsiveContainer
                    width="100%"
                    height={Math.max(230, muscleData.length * 34 + 16)}
                    minWidth={1}
                    initialDimension={{ width: 1, height: 1 }}
                  >
                    <BarChart
                      data={muscleData}
                      layout="vertical"
                      margin={{ top: 0, right: 12, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(244,241,242,0.085)" horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fill: 'var(--muted)', fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="muscle"
                        width={86}
                        tick={{ fill: 'var(--muted)', fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: string) => MUSCLE_PL[v] ?? v}
                      />
                      <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={18}>
                        {muscleData.map((entry, index) => (
                          <Cell
                            key={entry.muscle}
                            fill={MUSCLE_COLORS[entry.muscle] ?? `rgba(240,67,90,${Math.max(0.4, 1 - index * 0.1)})`}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </motion.section>
            )}

            {currentSessions.length > 0 && (
              <motion.section
                className="progress-panel progress-panel--compact"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12, duration: 0.2 }}
              >
                <div className="progress-panel-head">
                  <div>
                    <p>Aktywność</p>
                    <h2>Kalendarz</h2>
                  </div>
                </div>
                <div className="progress-heatmap" role="img" aria-label={activityHeatmapLabel}>
                  {DAY_LABELS.map((day, dayIdx) => (
                    <div key={day} className="progress-heatmap-row">
                      <span>{dayIdx % 2 === 0 ? day : ''}</span>
                      {Array.from({ length: 12 }, (_, weekIdx) => {
                        const cell = heatmapData.find((c) => c.dayOfWeek === dayIdx && c.weekIndex === weekIdx)
                        return (
                          <i
                            key={weekIdx}
                            title={cell?.date && cell.volume > 0 ? `${cell.date}: ${formatVolume(cell.volume)}` : cell?.date ?? ''}
                            style={{ background: HEATMAP_COLORS[cell?.level ?? 0] }}
                          />
                        )
                      })}
                    </div>
                  ))}
                </div>
                <div className="progress-heatmap-scale">
                  <span>Mniej</span>
                  {HEATMAP_COLORS.map((color) => (
                    <i key={color} style={{ background: color }} />
                  ))}
                  <span>Więcej</span>
                </div>
              </motion.section>
            )}
          </div>
        )}

        {!error && records.length > 0 && (
          <motion.section
            className="progress-records"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.2 }}
          >
            <div className="progress-records-head">
              <div>
                <p>Rekordy</p>
                <h2>Najlepsze wyniki</h2>
              </div>
              <span>{records.length}</span>
            </div>

            <div className="progress-record-showcase" aria-label="Trzy najlepsze rekordy">
              {featuredRecords.map((rec, index) => (
                <article
                  key={rec.id}
                  className="progress-record-feature"
                  data-rank={index + 1}
                  style={{ '--record-accent': MUSCLE_COLORS[recordAccentKeys[index % recordAccentKeys.length] ?? 'chest'] } as CSSProperties}
                >
                  <div className="progress-record-feature-top">
                    <span className="progress-record-rank">PR</span>
                    <span>{formatDate(rec.lastPerformedAt)}</span>
                  </div>

                  <strong>{rec.exerciseName}</strong>

                  <div className="progress-record-result">
                    <span>{rec.maxWeight}<small> kg</small></span>
                    <small>× {rec.maxReps}</small>
                  </div>

                  <p>{rec.totalSessions} {polishPlural(rec.totalSessions, 'sesja', 'sesje', 'sesji')}</p>
                </article>
              ))}
            </div>

            {remainingRecords.length > 0 && (
              <div className="progress-record-ledger" aria-label="Pozostałe rekordy">
                <div className="progress-record-ledger-head" aria-hidden="true">
                  <span>Pozostałe rekordy</span>
                  <span>Wynik</span>
                </div>

                {remainingRecords.map((rec, index) => (
                  <div
                    key={rec.id}
                    className="progress-record-ledger-row"
                    style={{ '--record-accent': MUSCLE_COLORS[recordAccentKeys[(index + featuredRecords.length) % recordAccentKeys.length] ?? 'chest'] } as CSSProperties}
                  >
                    <span className="progress-record-rank">PR</span>
                    <div className="progress-record-ledger-main">
                      <strong>{rec.exerciseName}</strong>
                      <small>
                        {formatDate(rec.lastPerformedAt)} · {rec.totalSessions}{' '}
                        {polishPlural(rec.totalSessions, 'sesja', 'sesje', 'sesji')}
                      </small>
                    </div>
                    <span className="progress-record-ledger-result">{rec.maxWeight} kg <small>× {rec.maxReps}</small></span>
                  </div>
                ))}
              </div>
            )}
          </motion.section>
        )}

        {!error && !hasProgressData && (
          <div className="progress-panel progress-empty-state">
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
