import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'
import {
  CartesianGrid, Cell,
  Area, AreaChart,
  Bar, BarChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

import { Button } from '../components/ui'
import { useAuthStore } from '../store/authStore'
import { loadProgressData } from '../lib/progressLoadService'
import {
  aggregateStrengthProgression,
  defaultStrengthKey,
  formatBestSet,
  formatCountChange,
  formatPercentChange,
  formatSetChange,
  previousPeriodLabel,
  strengthChartScale,
  strengthDeltaLabel,
  summarizeAllExercises,
  PROGRESS_MUSCLE_LABELS as MUSCLE_LABELS,
  type ProgressSessionLite,
  type RecordSummary,
  type StrengthPoint,
  type StrengthSeries,
  type SummaryWeek,
} from '../lib/progressService'
import { pluralize } from '../lib/pluralize'
import { useProfileStore } from '../store/profileStore'
import { formatCompactVolume as formatVolume, formatRoundedVolume, formatShortVolume, kgToDisplayWeight } from '../lib/weightUnits'
import type { Units } from '../lib/userProfile'

const RANGE_OPTIONS = [
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: 'Year', days: 365 },
]

const EMPTY_SESSIONS: ProgressSessionLite[] = []
const EMPTY_RECORDS: RecordSummary[] = []

function summarizeWeeklyVolume(weeks: SummaryWeek[], average: number | null, units: Units): string {
  const current = weeks.at(-1)
  const full = weeks.filter((week) => !week.current)
  const averageText = average === null ? 'No full week yet.' : `Average ${formatVolume(average, units)} per full week.`
  return `Weekly volume, ${full.length} full ${pluralize(full.length, 'week', 'weeks')}. ${averageText} This week so far ${formatVolume(current?.volume ?? 0, units)}.`
}

function summarizeStrengthProgression(data: StrengthPoint[], series: StrengthSeries[], units: Units): string {
  if (data.length === 0 || series.length === 0) return 'Weight progression: no chart data.'

  const summaries = series.slice(0, 5).map(({ exerciseName, key }) => {
    const values = data
      .map((point) => Number(point[key] ?? 0))
      .filter((value) => value > 0)
    const latest = [...data]
      .reverse()
      .map((point) => Number(point[key] ?? 0))
      .find((value) => value > 0) ?? 0
    const top = values.length ? Math.max(...values) : 0
    return `${exerciseName}: latest ${kgToDisplayWeight(latest, units)} ${units}, max ${kgToDisplayWeight(top, units)} ${units}`
  })

  const exerciseCount = series.length === 1 ? '1 exercise' : `${series.length} exercises`
  return `Weight progression for ${exerciseCount}. ${summaries.join('; ')}.`
}

interface DarkTooltipProps {
  active?: boolean
  payload?: Array<{ name?: string; dataKey?: string | number; value?: number | string; color?: string }>
  label?: string
  units?: Units
}

export function DarkTooltip({ active, payload, label, units = 'kg' }: DarkTooltipProps) {
  if (!active || !payload?.length) return null

  function formatTooltipValue(item: NonNullable<DarkTooltipProps['payload']>[number]) {
    const key = String(item.dataKey ?? item.name ?? '')
    const value = item.value
    if (typeof value !== 'number') return value

    if (key === 'volume') {
      return formatVolume(value, units)
    }

    return `${kgToDisplayWeight(value, units)} ${units}`
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
      <p style={{ color: 'var(--muted)', marginBottom: 4 }}>{label}</p>
      {payload.map((p, index) => (
        <p
          key={p.dataKey == null ? `${p.name ?? 'tooltip'}-${index}` : String(p.dataKey)}
          style={{ color: p.color ?? 'var(--accent)', fontWeight: 600 }}
        >
          {formatTooltipValue(p)}
        </p>
      ))}
    </div>
  )
}

interface ProgressSnapshot {
  rangeDays: number
  sessions: ProgressSessionLite[]
  sessionsTruncated: boolean
  // Read only to tell an account without workouts from a range without them.
  records: RecordSummary[]
  fetchedAt: number
}

function ProgressLoadingSkeleton() {
  return (
    <>
      <span className="progress-visually-hidden" role="status">Loading progress</span>
      <section className="progress-board progress-skeleton-board" aria-hidden="true">
        <div className="progress-skeleton-head">
          <span />
          <span />
          <span />
        </div>
        <div className="progress-skeleton-summary">
          {Array.from({ length: 4 }).map((_, index) => <span key={index} />)}
        </div>
      </section>
      <div className="progress-analysis-grid progress-skeleton-analysis" aria-hidden="true">
        <div className="progress-panel progress-skeleton-chart" />
        <div className="progress-panel progress-skeleton-chart" />
      </div>
    </>
  )
}

export default function ProgressPage() {
  const { user } = useAuthStore()
  return <ProgressContent key={user?.uid ?? 'signed-out'} userId={user?.uid} />
}

function ProgressContent({ userId }: { userId: string | undefined }) {
  const units = useProfileStore((state) => state.profile?.units ?? 'kg')
  const [rangeDays, setRangeDays] = useState(90)
  const [requestedRangeDays, setRequestedRangeDays] = useState(90)
  const [snapshot, setSnapshot] = useState<ProgressSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sessionsError, setSessionsError] = useState(false)
  const [recordsError, setRecordsError] = useState(false)
  const [freshnessUncertain, setFreshnessUncertain] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [selectedStrengthKey, setSelectedStrengthKey] = useState<string | null>(null)
  const strengthPanelRef = useRef<HTMLElement>(null)

  function handleRangeChange(days: number) {
    if (days === rangeDays) return
    setRangeDays(days)
    if (days > (snapshot?.rangeDays ?? 0)) {
      setRequestedRangeDays(days)
      setRefreshing(true)
      setLoadAttempt((current) => current + 1)
    }
  }

  function handleRetry() {
    setRequestedRangeDays(rangeDays)
    setRefreshing(true)
    setLoadAttempt((current) => current + 1)
  }

  useEffect(() => {
    if (!userId) return

    let cancelled = false
    loadProgressData(userId, requestedRangeDays)
      .then((result) => {
        if (cancelled) return

        if (result.sessions.status === 'error') {
          console.error('[ProgressPage] sessions load failed', result.sessions.error)
        }
        if (result.records.status === 'error') {
          console.error('[ProgressPage] records load failed', result.records.error)
        }

        setSnapshot((previous) => {
          let next = previous

          if (result.sessions.status === 'success') {
            next = {
              rangeDays: requestedRangeDays,
              sessions: result.sessions.value.sessions,
              sessionsTruncated: result.sessions.value.truncated,
              records: next?.records ?? [],
              fetchedAt: result.fetchedAt,
            }
          }

          if (result.records.status === 'success') {
            next = {
              rangeDays: next?.rangeDays ?? 0,
              sessions: next?.sessions ?? [],
              sessionsTruncated: next?.sessionsTruncated ?? false,
              records: result.records.value.records,
              fetchedAt: next?.fetchedAt ?? 0,
            }
          }

          return next
        })
        setSessionsError(result.sessions.status === 'error')
        setRecordsError(result.records.status === 'error')
        setFreshnessUncertain(result.freshness === 'uncertain')
      })
      .catch((error) => {
        if (cancelled) return
        console.error('[ProgressPage] load failed', error)
        setSessionsError(true)
        setRecordsError(true)
        setFreshnessUncertain(true)
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
        setRefreshing(false)
      })

    return () => {
      cancelled = true
    }
  }, [userId, requestedRangeDays, loadAttempt])


  const hasRangeCoverage = (snapshot?.rangeDays ?? 0) >= rangeDays
  const sessions = hasRangeCoverage ? snapshot?.sessions ?? EMPTY_SESSIONS : EMPTY_SESSIONS
  const records = snapshot?.records ?? EMPTY_RECORDS
  const fetchedAt = snapshot?.fetchedAt ?? 0

  const currentSessions = useMemo(() => {
    const cutoff = fetchedAt - rangeDays * 86_400_000
    return sessions.filter((s) => s.finishedAt >= cutoff)
  }, [sessions, rangeDays, fetchedAt])

  const summary = useMemo(
    () => summarizeAllExercises(sessions, rangeDays, fetchedAt),
    [sessions, rangeDays, fetchedAt],
  )

  const strengthData = useMemo(
    () => aggregateStrengthProgression(currentSessions),
    [currentSessions],
  )
  const strengthNameCounts = new Map<string, number>()
  for (const { exerciseName } of strengthData.series) {
    strengthNameCounts.set(exerciseName, (strengthNameCounts.get(exerciseName) ?? 0) + 1)
  }
  const chartableKeys = new Set(strengthData.series.map(({ key }) => key))
  const effectiveStrengthKey = chartableKeys.has(selectedStrengthKey ?? '')
    ? selectedStrengthKey
    : defaultStrengthKey(strengthData.series)
  const selectedStrengthSeries = strengthData.series.find(({ key }) => key === effectiveStrengthKey) ?? null
  const selectedStrengthPoints = effectiveStrengthKey
    ? strengthData.data.filter((point) => Number(point[effectiveStrengthKey] ?? 0) > 0)
    : []
  const selectedStrengthValues = effectiveStrengthKey
    ? selectedStrengthPoints.map((point) => Number(point[effectiveStrengthKey] ?? 0))
    : []
  const strengthScale = strengthChartScale(selectedStrengthValues)
  const firstStrength = selectedStrengthValues[0] ?? 0
  const latestStrength = selectedStrengthValues.at(-1) ?? 0
  const maxStrength = selectedStrengthValues.length ? Math.max(...selectedStrengthValues) : 0
  const missingStrengthSessions = Math.max(0, 3 - selectedStrengthPoints.length)

  const strengthProgressionLabel = summarizeStrengthProgression(
    selectedStrengthPoints,
    selectedStrengthSeries ? [selectedStrengthSeries] : [],
    units,
  )

  function handleChartExercise(key: string) {
    setSelectedStrengthKey(key)
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    strengthPanelRef.current?.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' })
  }

  const hasUsableData = snapshot !== null
  const hasSessionSnapshot = hasRangeCoverage && fetchedAt > 0
  const hasStoredData = sessions.length > 0 || records.length > 0
  const showEmptyState = hasUsableData
    && hasSessionSnapshot
    && !sessionsError
    && !recordsError
    && !hasStoredData
  const showRangeEmpty = hasSessionSnapshot
    && currentSessions.length === 0
    && !showEmptyState
  const retryableIssues: string[] = []
  if (freshnessUncertain) {
    retryableIssues.push('Could not confirm data freshness. Recent workouts may not be visible yet.')
  }
  // Records only decide whether an empty range means an empty account.
  if (sessionsError || (recordsError && sessions.length === 0)) retryableIssues.push('Could not refresh workout data.')
  const limitNotices: string[] = []
  if (hasRangeCoverage && snapshot?.sessionsTruncated) {
    limitNotices.push('Workout analytics include the 5,000 most recent entries.')
  }
  const issues = [...retryableIssues, ...limitNotices]
  const headlineVolume = summary.averageVolume ?? summary.weeks.at(-1)?.volume ?? 0
  const topMuscleSets = summary.muscles[0]?.sets || 1

  return (
    <div
      className="progress-page"
      data-testid="progress-page"
      aria-busy={loading || refreshing}
    >
      {loading && !snapshot ? (
        <ProgressLoadingSkeleton />
      ) : (
        <>
        {hasUsableData && (
        <section className="progress-board">
          <motion.div
            className="progress-board-head"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div>
              <h1>Progress</h1>
              {!hasSessionSnapshot && (
                <p>{refreshing ? 'Loading progress' : 'Workout data is temporarily unavailable.'}</p>
              )}
            </div>

            <div className="progress-range-toggle" aria-label="Date range">
              {RANGE_OPTIONS.map(({ label, days }) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => handleRangeChange(days)}
                  aria-pressed={rangeDays === days}
                  className="progress-range-button mobile-touch-target"
                >
                  {label}
                </button>
              ))}
            </div>
          </motion.div>

        </section>
        )}

        {issues.length > 0 && (
          <div className="progress-data-notice" role={hasUsableData ? 'status' : 'alert'}>
            <AlertCircle aria-hidden="true" />
            <div>
              <strong>
                {retryableIssues.length > 0
                  ? (hasUsableData ? 'Data needs refreshing' : 'Could not load data')
                  : 'Data range has been limited'}
              </strong>
              {issues.map((issue) => <p key={issue}>{issue}</p>)}
            </div>
            {retryableIssues.length > 0 && (
              <Button type="button" onClick={handleRetry} disabled={refreshing}>
                {refreshing ? 'Refreshing…' : 'Try again'}
              </Button>
            )}
          </div>
        )}

        {hasSessionSnapshot && currentSessions.length > 0 && (
          <div className="progress-analysis-grid">
            <section className="progress-overview" aria-label="All exercises">
              <div className="progress-hero">
                <p className="progress-hero-label">
                  <b>All exercises</b> · {summary.averageVolume === null ? 'this week so far' : 'average of full weeks'}
                </p>
                <p className="progress-hero-value">
                  {formatRoundedVolume(headlineVolume, units)}
                  <small>{units}{summary.averageVolume === null ? '' : ' / week'}</small>
                </p>
                {summary.comparable && (
                  <p className="progress-hero-delta">
                    {summary.averageDelta !== null && <><b>{formatPercentChange(summary.averageDelta)}</b> vs {previousPeriodLabel(rangeDays)}</>}
                  </p>
                )}
                <p className="progress-hero-label progress-hero-end">Workouts</p>
                <p className="progress-hero-count progress-hero-end">{summary.workouts}</p>
                {summary.comparable && (
                  <p className="progress-hero-delta progress-hero-end">
                    <b>{formatCountChange(summary.workouts - summary.previousWorkouts)}</b>
                  </p>
                )}
              </div>
              <WeeklyVolumeChart weeks={summary.weeks} average={summary.averageVolume} units={units} />
            </section>

            {summary.muscles.length > 0 && (
              <section className="progress-muscles">
                <div className="progress-section-head">
                  <h2>Sets per muscle group</h2>
                  <span>{summary.muscleBasis === 'average' ? 'avg / week' : 'this week'}</span>
                </div>
                <div className="progress-muscle-list">
                  {summary.muscles.map(({ muscle, sets }) => (
                    <div key={muscle} className="progress-muscle-row">
                      <span>{MUSCLE_LABELS[muscle] ?? muscle}</span>
                      <i aria-hidden="true"><b style={{ width: `${(sets / topMuscleSets) * 100}%` }} /></i>
                      <strong className="tabular-nums">{Math.round(sets)}</strong>
                    </div>
                  ))}
                </div>
                <p className="progress-section-note">Assisting muscles count half.</p>
              </section>
            )}

            <section className="progress-exercises">
              <div className="progress-section-head">
                <h2>Exercises</h2>
                <span>best set · vs {previousPeriodLabel(rangeDays)}</span>
              </div>
              {summary.exercises.map((row) => {
                const cells = (
                  <>
                    <span className="progress-exercise-name">{row.exerciseName}</span>
                    <span className="progress-exercise-best tabular-nums">{formatBestSet(row.best, units)}</span>
                    <span className="progress-exercise-change tabular-nums">{formatSetChange(row.change, units)}</span>
                  </>
                )
                return chartableKeys.has(row.key) ? (
                  <button key={row.key} type="button" className="progress-exercise-row" onClick={() => handleChartExercise(row.key)}>
                    {cells}
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                ) : (
                  <div key={row.key} className="progress-exercise-row">{cells}</div>
                )
              })}
            </section>

            <section
              ref={strengthPanelRef}
              className="progress-panel progress-strength-panel"
            >
              <div className="progress-panel-head progress-panel-head--strength">
                <h2 className="progress-visually-hidden">Weight progression</h2>
                {selectedStrengthSeries && (
                  <label className="progress-strength-picker">
                    <span>Exercise</span>
                    <select
                      aria-label="Chart exercise"
                      value={effectiveStrengthKey ?? ''}
                      onChange={(event) => setSelectedStrengthKey(event.target.value)}
                    >
                      {strengthData.series.map((series) => (
                        <option key={series.key} value={series.key}>
                          {series.exerciseName}
                          {(strengthNameCounts.get(series.exerciseName) ?? 0) > 1
                            ? ` · ${series.key.startsWith('user:') ? 'mine' : 'shared'}`
                            : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={18} aria-hidden="true" />
                  </label>
                )}
              </div>
              {selectedStrengthSeries && selectedStrengthPoints.length >= 3 && (
                <div className="progress-strength-insight" aria-label="Selected exercise trend">
                  <div>
                    <strong>Latest {kgToDisplayWeight(latestStrength, units)} {units}</strong>
                  </div>
                  <p>
                    <span>
                      {strengthDeltaLabel(firstStrength, latestStrength, selectedStrengthPoints[0]?.date ?? '', units)}
                    </span>
                    {' · '}max. {kgToDisplayWeight(maxStrength, units)} {units}
                  </p>
                </div>
              )}
              {!selectedStrengthSeries ? (
                <p className="progress-muted-copy">
                  No recorded weights above 0 {units} in this range. Add a set weight to see progression.
                </p>
              ) : selectedStrengthPoints.length < 3 ? (
                <>
                  <p className="progress-muted-copy">
                    Chart needs {missingStrengthSessions} more {pluralize(missingStrengthSessions, 'day', 'days')} with recorded weight.
                  </p>
                  <div className="progress-session-markers" aria-label={`${selectedStrengthPoints.length} of 3 days for the chart`}>
                    {Array.from({ length: 3 }).map((_, index) => (
                      <span key={index} data-active={index < selectedStrengthPoints.length} />
                    ))}
                  </div>
                </>
              ) : (
                <div className="progress-chart-frame progress-chart-frame--strength" role="img" aria-label={strengthProgressionLabel}>
                  <ResponsiveContainer width="100%" aspect={1.75} maxHeight={320} minWidth={1} initialDimension={{ width: 1, height: 1 }}>
                    <AreaChart data={selectedStrengthPoints} margin={{ top: 12, right: 10, left: 0, bottom: 8 }}>
                      <defs>
                        <linearGradient id="strength-fade" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0" stopColor="var(--accent)" stopOpacity={0.16} />
                          <stop offset="1" stopColor="var(--accent)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(244,241,242,0.05)" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: 'var(--muted)', fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                        tickMargin={10}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fill: 'var(--muted)', fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(value) => String(kgToDisplayWeight(Number(value), units))}
                        unit={` ${units}`}
                        width={56}
                        domain={[strengthScale.lo, strengthScale.hi]}
                        ticks={strengthScale.ticks}
                      />
                      <Tooltip content={<DarkTooltip units={units} />} />
                      {selectedStrengthSeries && (
                        <Area
                          type="monotone"
                          dataKey={selectedStrengthSeries.key}
                          name={selectedStrengthSeries.exerciseName}
                          stroke="var(--accent)"
                          strokeWidth={2}
                          fill="url(#strength-fade)"
                          dot={{ r: 2.5, fill: 'var(--accent)', strokeWidth: 0 }}
                          activeDot={{ r: 4.5, fill: 'var(--accent)', strokeWidth: 0 }}
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>
          </div>
        )}

        {showRangeEmpty && (
          <div className="progress-panel progress-empty-state" role="status">
            <div className="progress-empty-copy">
              <p className="text-base font-semibold text-white">No workouts in this date range</p>
              <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
                Earlier workouts are still saved.
              </p>
            </div>
            {rangeDays < 365 && (
              <Button type="button" onClick={() => handleRangeChange(365)}>
                Show year
              </Button>
            )}
          </div>
        )}

        {showEmptyState && (
          <div className="progress-panel progress-empty-state">
            <div className="progress-empty-copy">
              <p className="text-lg font-semibold text-white">No data</p>
              <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
                Complete a few workouts to see your progress.
              </p>
            </div>
          </div>
        )}
        </>
      )}
    </div>
  )
}

function WeeklyVolumeChart({ weeks, average, units }: { weeks: SummaryWeek[]; average: number | null; units: Units }) {
  const data = weeks.map((week) => ({ ...week, axisLabel: week.current ? 'so far' : week.weekLabel }))
  const currentIndex = weeks.findIndex(({ current }) => current)
  // Axis values next to the average label would collide with it.
  const tickLabel = (value: number) => value === 0 || (average !== null && Math.abs(value - average) < average * 0.25)
    ? ''
    : formatShortVolume(value, units)
  return (
    <div className="progress-chart-frame progress-chart-frame--volume" role="img" aria-label={summarizeWeeklyVolume(weeks, average, units)}>
      <ResponsiveContainer width="100%" aspect={2.6} maxHeight={240} minWidth={1} initialDimension={{ width: 1, height: 1 }}>
        <BarChart data={data} margin={{ top: 22, right: 0, left: 0, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid stroke="rgba(244,238,232,0.1)" vertical={false} />
          <XAxis
            dataKey="axisLabel"
            tick={({ x, y, payload }: { x?: number | string; y?: number | string; payload?: { value?: unknown } }) => (
              <text
                x={Number(x)}
                y={Number(y) + 12}
                textAnchor={payload?.value === 'so far' ? 'end' : 'middle'}
                dx={payload?.value === 'so far' ? 8 : 0}
                className={payload?.value === 'so far' ? 'progress-volume-tick progress-volume-tick--now' : 'progress-volume-tick'}
              >
                {String(payload?.value ?? '')}
              </text>
            )}
            axisLine={{ stroke: 'rgba(244,238,232,0.22)' }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis
            tickFormatter={(value) => tickLabel(Number(value))}
            tickCount={3}
            tick={{ fill: 'var(--muted-soft)', fontSize: 11.5 }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip content={<DarkTooltip units={units} />} cursor={{ fill: 'rgba(244,241,242,0.05)' }} />
          <Bar
            dataKey="volume"
            radius={2}
            maxBarSize={24}
            isAnimationActive={false}
            label={({ x, y, width, index }: { x?: number | string; y?: number | string; width?: number | string; index?: number }) => index === currentIndex
              ? <text x={Number(x) + Number(width)} y={Number(y) - 6} textAnchor="end" className="progress-volume-tick progress-volume-tick--now">{formatShortVolume(weeks[currentIndex]?.volume ?? 0, units)}</text>
              : null}
          >
            {data.map((week) => (
              <Cell
                key={week.weekStart}
                fill={week.current ? 'none' : 'var(--accent)'}
                stroke={week.current ? 'var(--accent)' : 'none'}
                strokeWidth={week.current ? 1.5 : 0}
              />
            ))}
          </Bar>
          {average !== null && (
            <ReferenceLine
              y={average}
              stroke="var(--muted)"
              strokeDasharray="2 4"
              label={{ value: formatShortVolume(average, units), position: 'left', className: 'progress-volume-tick progress-volume-tick--now' }}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
