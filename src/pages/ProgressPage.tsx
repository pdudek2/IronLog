import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { motion } from 'framer-motion'
import NumberFlow from '@number-flow/react'
import { AlertCircle } from 'lucide-react'
import {
  Area, AreaChart, CartesianGrid, Cell,
  Line, LineChart,
  Bar, BarChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

import { Button } from '../components/ui'
import { useAuthStore } from '../store/authStore'
import { loadProgressData } from '../lib/progressLoadService'
import {
  aggregateActivityHeatmap,
  aggregateMuscleBalance,
  aggregatePeriodComparison,
  aggregateStrengthProgression,
  aggregateWeeklyVolume,
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
  { label: 'Rok', days: 365 },
]

const MUSCLE_COLORS: Record<string, string> = {
  chest:      '#D97B91',
  shoulders:  '#A898C8',
  triceps:    '#C38B73',
  back:       '#9BB7C8',
  biceps:     '#76ADB1',
  forearms:   '#A7A0B5',
  quads:      '#D6A06F',
  hamstrings: '#C09172',
  glutes:     '#B78568',
  calves:     '#C3A477',
  core:       '#918A9D',
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
const EMPTY_SESSIONS: ProgressSessionLite[] = []
const EMPTY_RECORDS: RecordSummary[] = []
const DEFAULT_VISIBLE_REMAINING_RECORDS = 5
const RECORDS_PAGE_SIZE = 20

function formatVolume(kg: number): string {
  if (kg >= 1_000_000) return `${(kg / 1_000_000).toFixed(1)}M kg`
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}k kg`
  return `${Math.round(kg)} kg`
}

function formatDelta(delta: number): string {
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(0)}% vs poprzednio`
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })
}

function formatHeatmapDate(date: string): string {
  const timestamp = Date.parse(`${date}T12:00:00`)
  return Number.isFinite(timestamp) ? formatDate(timestamp) : date
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

  const summaries = series.slice(0, 5).map(({ exerciseName, key }) => {
    const values = data
      .map((point) => Number(point[key] ?? 0))
      .filter((value) => value > 0)
    const latest = [...data]
      .reverse()
      .map((point) => Number(point[key] ?? 0))
      .find((value) => value > 0) ?? 0
    const top = values.length ? Math.max(...values) : 0
    return `${exerciseName}: ostatnio ${latest} kg, max ${top} kg`
  })

  const exerciseCount = series.length === 1 ? '1 ćwiczenia' : `${series.length} ćwiczeń`
  return `Progresja ciężaru dla ${exerciseCount}. ${summaries.join('; ')}.`
}

function summarizeMuscleBalance(data: MuscleBalancePoint[]): string {
  if (data.length === 0) return 'Balans grup mięśniowych: brak danych.'

  const top = data[0]
  if (!top) return 'Balans grup mięśniowych: brak danych.'
  const total = data.reduce((sum, point) => sum + point.count, 0)
  const muscleName = MUSCLE_PL[top.muscle] ?? top.muscle

  return `Balans grup mięśniowych. Najczęściej trenowana grupa: ${muscleName}, ${top.count} ${polishPlural(top.count, 'wpis', 'wpisy', 'wpisów')}. Łącznie ${total} ${polishPlural(total, 'wpis', 'wpisy', 'wpisów')} w zestawieniu.`
}

function summarizeActivityHeatmap(data: HeatmapDay[]): string {
  const activeDays = data.filter((cell) => cell.volume > 0)
  if (activeDays.length === 0) return 'Kalendarz treningów: brak aktywnych dni w wybranym zakresie.'

  const first = activeDays[0]
  if (!first) return 'Kalendarz treningów: brak aktywnych dni w wybranym zakresie.'
  const peak = activeDays.reduce((top, cell) => cell.volume > top.volume ? cell : top, first)

  return `Kalendarz treningów z ostatnich 12 tygodni. Aktywne dni: ${activeDays.length}. Największy dzień: ${formatHeatmapDate(peak.date)}, ${formatVolume(peak.volume)}.`
}

interface DarkTooltipProps {
  active?: boolean
  payload?: Array<{ name?: string; dataKey?: string | number; value?: number | string; color?: string }>
  label?: string
}

export function DarkTooltip({ active, payload, label }: DarkTooltipProps) {
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
  records: RecordSummary[]
  recordsTruncated: boolean
  fetchedAt: number
}

function ProgressLoadingSkeleton() {
  return (
    <>
      <span className="progress-visually-hidden" role="status">Ładowanie postępów</span>
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
  const [rangeDays, setRangeDays] = useState(90)
  const [requestedRangeDays, setRequestedRangeDays] = useState(90)
  const [snapshot, setSnapshot] = useState<ProgressSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sessionsError, setSessionsError] = useState(false)
  const [recordsError, setRecordsError] = useState(false)
  const [recordsLoadedOnce, setRecordsLoadedOnce] = useState(false)
  const [freshnessUncertain, setFreshnessUncertain] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [selectedStrengthKey, setSelectedStrengthKey] = useState<string | null>(null)
  const [selectedHeatmapDate, setSelectedHeatmapDate] = useState<string | null>(null)
  const [recordsPage, setRecordsPage] = useState<number | null>(null)

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
              recordsTruncated: next?.recordsTruncated ?? false,
              fetchedAt: result.fetchedAt,
            }
          }

          if (result.records.status === 'success') {
            next = {
              rangeDays: next?.rangeDays ?? 0,
              sessions: next?.sessions ?? [],
              sessionsTruncated: next?.sessionsTruncated ?? false,
              records: result.records.value.records,
              recordsTruncated: result.records.value.truncated,
              fetchedAt: next?.fetchedAt ?? 0,
            }
          }

          return next
        })
        setSessionsError(result.sessions.status === 'error')
        setRecordsError(result.records.status === 'error')
        if (result.records.status === 'success') setRecordsLoadedOnce(true)
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

  const weeklyData = useMemo(
    () => aggregateWeeklyVolume(currentSessions, rangeDays === 30 ? 5 : rangeDays === 90 ? 13 : 53, fetchedAt),
    [currentSessions, rangeDays, fetchedAt],
  )

  const muscleData = useMemo(() => aggregateMuscleBalance(currentSessions), [currentSessions])

  const periodComparison = useMemo(
    () => aggregatePeriodComparison(sessions, rangeDays, fetchedAt),
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
  const effectiveStrengthKey = strengthData.series.some(({ key }) => key === selectedStrengthKey)
    ? selectedStrengthKey
    : strengthData.series[0]?.key ?? null
  const selectedStrengthSeries = strengthData.series.find(({ key }) => key === effectiveStrengthKey) ?? null
  const selectedStrengthPoints = effectiveStrengthKey
    ? strengthData.data.filter((point) => Number(point[effectiveStrengthKey] ?? 0) > 0)
    : []
  const selectedStrengthValues = effectiveStrengthKey
    ? selectedStrengthPoints.map((point) => Number(point[effectiveStrengthKey] ?? 0))
    : []
  const firstStrength = selectedStrengthValues[0] ?? 0
  const latestStrength = selectedStrengthValues.at(-1) ?? 0
  const maxStrength = selectedStrengthValues.length ? Math.max(...selectedStrengthValues) : 0
  const strengthDelta = latestStrength - firstStrength
  const missingStrengthSessions = Math.max(0, 3 - selectedStrengthPoints.length)

  const heatmapData = useMemo(
    () => aggregateActivityHeatmap(currentSessions, 12, fetchedAt),
    [currentSessions, fetchedAt],
  )
  const activeHeatmapDays = useMemo(
    () => heatmapData.filter((cell) => cell.date && cell.volume > 0).sort((a, b) => b.date.localeCompare(a.date)),
    [heatmapData],
  )
  const effectiveHeatmapDate = activeHeatmapDays.some(({ date }) => date === selectedHeatmapDate)
    ? selectedHeatmapDate
    : activeHeatmapDays[0]?.date ?? null
  const selectedHeatmapDay = activeHeatmapDays.find(({ date }) => date === effectiveHeatmapDate) ?? null
  const heatmapMonthLabels = Array.from({ length: 12 }, (_, weekIndex) => {
    const monday = heatmapData.find((cell) => cell.weekIndex === weekIndex && cell.dayOfWeek === 0 && cell.date)
    if (!monday) return ''
    const month = new Date(`${monday.date}T12:00:00`).toLocaleDateString('pl-PL', { month: 'short' })
    const previous = weekIndex > 0
      ? heatmapData.find((cell) => cell.weekIndex === weekIndex - 1 && cell.dayOfWeek === 0 && cell.date)
      : null
    const previousMonth = previous
      ? new Date(`${previous.date}T12:00:00`).toLocaleDateString('pl-PL', { month: 'short' })
      : ''
    return weekIndex === 0 || month !== previousMonth ? month : ''
  })
  const weeklyVolumeLabel = useMemo(() => summarizeWeeklyVolume(weeklyData), [weeklyData])
  const strengthProgressionLabel = summarizeStrengthProgression(
    selectedStrengthPoints,
    selectedStrengthSeries ? [selectedStrengthSeries] : [],
  )
  const muscleBalanceLabel = useMemo(() => summarizeMuscleBalance(muscleData), [muscleData])
  const activityHeatmapLabel = useMemo(() => summarizeActivityHeatmap(heatmapData), [heatmapData])
  const activityHeatmapSummary = useMemo(() => {
    const activeDays = heatmapData.filter((cell) => cell.volume > 0)
    const peak = activeDays.reduce<HeatmapDay | null>(
      (top, cell) => !top || cell.volume > top.volume ? cell : top,
      null,
    )
    if (!peak) return ''

    return `${activeDays.length} ${polishPlural(activeDays.length, 'aktywny dzień', 'aktywne dni', 'aktywnych dni')} · najmocniejszy dzień ${formatHeatmapDate(peak.date)} · ${formatVolume(peak.volume)}`
  }, [heatmapData])

  const totalVolume = useMemo(
    () => currentSessions.reduce((sum, s) => sum + s.totalVolume, 0),
    [currentSessions],
  )
  const uniqueWorkouts = useMemo(
    () => new Set(currentSessions.map((s) => s.workoutId)).size,
    [currentSessions],
  )

  const uniqueExerciseCount = new Set(
    currentSessions.map((s) => `${s.exerciseSource}:${s.exerciseId}`),
  ).size
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
  const topMuscle = muscleData[0]
  const topMuscleName = topMuscle ? (MUSCLE_PL[topMuscle.muscle] ?? topMuscle.muscle) : 'Brak'
  const topRecord = records[0]
  const hasPreviousPeriod = periodComparison.previousSessions > 0
  const recordAccentKeys = Object.keys(MUSCLE_COLORS)
  const featuredRecords = records.slice(0, 1)
  const remainingRecords = records.slice(1)
  const hasHiddenRemainingRecords = remainingRecords.length > DEFAULT_VISIBLE_REMAINING_RECORDS
  const showAllRecords = recordsPage !== null
  const recordsPageCount = Math.max(1, Math.ceil(remainingRecords.length / RECORDS_PAGE_SIZE))
  const currentRecordsPage = Math.min(recordsPage ?? 0, recordsPageCount - 1)
  const recordsOffset = showAllRecords ? currentRecordsPage * RECORDS_PAGE_SIZE : 0
  const visibleRemainingRecords = remainingRecords.slice(
    recordsOffset,
    recordsOffset + (showAllRecords ? RECORDS_PAGE_SIZE : DEFAULT_VISIBLE_REMAINING_RECORDS),
  )
  const retryableIssues: string[] = []
  if (freshnessUncertain) {
    retryableIssues.push('Nie udało się potwierdzić świeżości danych. Ostatnie treningi mogą być jeszcze niewidoczne.')
  }
  if (sessionsError) retryableIssues.push('Nie udało się odświeżyć danych treningowych.')
  if (recordsError) retryableIssues.push('Nie udało się odświeżyć rekordów od początku.')
  const limitNotices: string[] = []
  if (hasRangeCoverage && snapshot?.sessionsTruncated) {
    limitNotices.push('Analizy treningowe obejmują najnowsze 5000 wpisów.')
  }
  if (snapshot?.recordsTruncated) {
    limitNotices.push('Lista rekordów jest ograniczona do 1000 wpisów.')
  }
  const issues = [...retryableIssues, ...limitNotices]

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
              <h1>Postępy</h1>
              {(!hasSessionSnapshot || uniqueWorkouts === 0) && (
                <p>
                  {!hasSessionSnapshot
                    ? (refreshing ? 'Ładowanie postępów' : 'Dane treningowe są chwilowo niedostępne.')
                    : 'Brak treningów w wybranym zakresie.'}
                </p>
              )}
            </div>

            <div className="progress-range-toggle" aria-label="Zakres danych">
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

          {hasSessionSnapshot && !showRangeEmpty && (
          <div className="progress-summary-grid" role="group" aria-label={`Podsumowanie: ${rangeDays} dni`}>
            <div className="progress-volume-tile" role="group" aria-label="Objętość">
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
              <p>Ostatnie {rangeDays} dni</p>
              {hasPreviousPeriod && (
                <p className="progress-metric-delta" data-trend={periodComparison.volumeDelta >= 0 ? 'up' : 'down'}>
                  {formatDelta(periodComparison.volumeDelta)}
                </p>
              )}
            </div>

            <div className="progress-signal-rail">
              {[
                {
                  label: 'Sesje',
                  value: uniqueWorkouts,
                  meta: 'w zakresie',
                  delta: hasPreviousPeriod ? periodComparison.sessionsDelta : undefined,
                },
                {
                  label: 'Śr. / sesję',
                  value: formatVolume(periodComparison.currentAvgVolume),
                  meta: 'w zakresie',
                  delta: hasPreviousPeriod ? periodComparison.avgVolumeDelta : undefined,
                },
                { label: 'Ćwiczenia', value: uniqueExerciseCount, meta: 'w zakresie' },
                {
                  label: 'Rekordy',
                  value: recordsLoadedOnce ? records.length : '—',
                  meta: recordsLoadedOnce
                    ? (topRecord ? topRecord.exerciseName : 'brak zapisów')
                    : 'niedostępne',
                },
                { label: 'Grupa mięśniowa', value: topMuscleName, meta: topMuscle ? `${topMuscle.count} ${polishPlural(topMuscle.count, 'wpis', 'wpisy', 'wpisów')}` : 'brak danych' },
              ].map((item) => (
                <div key={item.label} className="progress-signal-row" role="group" aria-label={item.label}>
                  <span>{item.label}</span>
                  <div>
                    <strong>{item.value}</strong>
                    <small
                      className={item.delta === undefined ? undefined : 'progress-metric-delta'}
                      data-trend={item.delta === undefined ? undefined : item.delta >= 0 ? 'up' : 'down'}
                    >
                      {item.delta === undefined ? item.meta : formatDelta(item.delta)}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          </div>

          )}
        </section>
        )}

        {issues.length > 0 && (
          <div className="progress-data-notice" role={hasUsableData ? 'status' : 'alert'}>
            <AlertCircle aria-hidden="true" />
            <div>
              <strong>
                {retryableIssues.length > 0
                  ? (hasUsableData ? 'Dane wymagają odświeżenia' : 'Nie udało się pobrać danych')
                  : 'Zakres danych został ograniczony'}
              </strong>
              {issues.map((issue) => <p key={issue}>{issue}</p>)}
            </div>
            {retryableIssues.length > 0 && (
              <Button type="button" onClick={handleRetry} disabled={refreshing}>
                {refreshing ? 'Odświeżanie…' : 'Spróbuj ponownie'}
              </Button>
            )}
          </div>
        )}

        {hasSessionSnapshot && currentSessions.length > 0 && (
          <>
          <div className="progress-analysis-grid">
            <motion.section
              className="progress-panel progress-panel--wide"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05, duration: 0.2 }}
            >
              <div className="progress-panel-head">
                <div>
                  <h2>Wolumen tygodniowy</h2>
                </div>
                <span>{rangeDays === 30 ? '5 tyg.' : rangeDays === 90 ? '13 tyg.' : '53 tyg.'}</span>
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
                      interval={rangeDays === 30 ? 0 : rangeDays === 90 ? 1 : 7}
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

            <section
              className={`progress-panel ${!selectedStrengthSeries || selectedStrengthPoints.length < 3 ? 'progress-panel--compact' : 'progress-panel--wide'}`}
            >
              <div className="progress-panel-head progress-panel-head--strength">
                <div>
                  <h2>Progresja ciężaru</h2>
                </div>
                {selectedStrengthSeries && (
                  <label className="progress-strength-picker">
                    <span>Ćwiczenie</span>
                    <select
                      aria-label="Ćwiczenie na wykresie"
                      value={effectiveStrengthKey ?? ''}
                      onChange={(event) => setSelectedStrengthKey(event.target.value)}
                    >
                      {strengthData.series.map((series) => (
                        <option key={series.key} value={series.key}>
                          {series.exerciseName}
                          {(strengthNameCounts.get(series.exerciseName) ?? 0) > 1
                            ? ` · ${series.key.startsWith('user:') ? 'moje' : 'globalne'}`
                            : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {selectedStrengthSeries && selectedStrengthPoints.length >= 3 && (
                <div className="progress-strength-insight" aria-label="Trend wybranego ćwiczenia">
                  <div>
                    <strong>Ostatnio {latestStrength} kg</strong>
                  </div>
                  <p>
                    <span>
                      {strengthDelta > 0
                        ? `+${strengthDelta} kg względem pierwszego w zakresie`
                        : strengthDelta < 0
                          ? `${strengthDelta} kg względem pierwszego w zakresie`
                          : 'Bez zmiany względem pierwszego w zakresie'}
                    </span>
                    {' · '}maks. {maxStrength} kg
                  </p>
                </div>
              )}
              {!selectedStrengthSeries ? (
                <p className="progress-muted-copy">
                  Brak zapisanych ciężarów większych od 0 kg w tym zakresie. Uzupełnij ciężar w serii, aby zobaczyć progresję.
                </p>
              ) : selectedStrengthPoints.length < 3 ? (
                <>
                  <p className="progress-muted-copy">
                    Potrzebujesz jeszcze {missingStrengthSessions} dni z zapisanym ciężarem do wykresu.
                  </p>
                  <div className="progress-session-markers" aria-label={`${selectedStrengthPoints.length} z 3 dni do wykresu`}>
                    {Array.from({ length: 3 }).map((_, index) => (
                      <span key={index} data-active={index < selectedStrengthPoints.length} />
                    ))}
                  </div>
                </>
              ) : (
                <div className="progress-chart-frame progress-chart-frame--strength" role="img" aria-label={strengthProgressionLabel}>
                  <ResponsiveContainer width="100%" aspect={2.05} minWidth={1} initialDimension={{ width: 1, height: 1 }}>
                    <LineChart data={selectedStrengthPoints} margin={{ top: 12, right: 10, left: 0, bottom: 8 }}>
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
                      {selectedStrengthSeries && (
                        <Line
                          type="monotone"
                          dataKey={selectedStrengthSeries.key}
                          name={selectedStrengthSeries.exerciseName}
                          stroke="var(--accent)"
                          strokeWidth={2.35}
                          dot={{ r: 3, fill: 'var(--accent)', strokeWidth: 0 }}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            {muscleData.length > 0 && (
              <motion.section
                className="progress-panel progress-panel--compact"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.2 }}
              >
                <div className="progress-panel-head">
                  <div>
                    <h2>Grupy mięśniowe</h2>
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
                    <h2>Kalendarz</h2>
                  </div>
                </div>
                <div className="progress-heatmap-months" aria-label="Miesiące kalendarza">
                  {heatmapMonthLabels.map((month, weekIndex) => (
                    <span key={weekIndex}>{month}</span>
                  ))}
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
                            title={cell?.date && cell.volume > 0
                              ? `${formatHeatmapDate(cell.date)}: ${formatVolume(cell.volume)}`
                              : cell?.date
                                ? formatHeatmapDate(cell.date)
                                : ''}
                            style={{ background: HEATMAP_COLORS[cell?.level ?? 0] }}
                          />
                        )
                      })}
                    </div>
                  ))}
                </div>
                {activityHeatmapSummary && (
                  <p className="progress-heatmap-summary">{activityHeatmapSummary}</p>
                )}
                {activeHeatmapDays.length > 0 && (
                  <div className="progress-heatmap-inspector">
                    <label>
                      <span>Sprawdź dzień</span>
                      <select
                        className="progress-heatmap-picker"
                        aria-label="Sprawdź dzień w kalendarzu"
                        value={effectiveHeatmapDate ?? ''}
                        onChange={(event) => setSelectedHeatmapDate(event.target.value)}
                      >
                        {activeHeatmapDays.map((day) => (
                          <option key={day.date} value={day.date}>
                            {formatHeatmapDate(day.date)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {selectedHeatmapDay && (
                      <p role="status">
                        {formatHeatmapDate(selectedHeatmapDay.date)} · {formatVolume(selectedHeatmapDay.volume)}
                      </p>
                    )}
                  </div>
                )}
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
          </>
        )}

        {showRangeEmpty && (
          <div className="progress-panel progress-empty-state" role="status">
            <div className="progress-empty-copy">
              <p className="text-base font-semibold text-white">W tym zakresie nie ma treningów</p>
              <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
                Wcześniejsze sesje i rekordy nadal są zapisane.
              </p>
            </div>
            {rangeDays < 365 && (
              <Button type="button" onClick={() => handleRangeChange(365)}>
                Pokaż rok
              </Button>
            )}
          </div>
        )}

        {records.length > 0 && (
          <motion.section
            className="progress-records"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.2 }}
          >
            <div className="progress-records-head">
              <h2>Rekordy od początku</h2>
            </div>

            <div className="progress-record-showcase" aria-label="Najlepszy rekord">
              {featuredRecords.map((rec, index) => (
                <article
                  key={rec.id}
                  className="progress-record-feature"
                  data-rank={index + 1}
                  style={{ '--record-accent': MUSCLE_COLORS[recordAccentKeys[index % recordAccentKeys.length] ?? 'chest'] } as CSSProperties}
                >
                  <div className="progress-record-feature-top">
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
              <div
                id="progress-remaining-records"
                className="progress-record-ledger"
                aria-label="Pozostałe rekordy"
              >
                <div className="progress-record-ledger-head" aria-hidden="true">
                  <span>Pozostałe rekordy</span>
                  <span>Wynik</span>
                </div>

                {visibleRemainingRecords.map((rec, index) => (
                  <div
                    key={rec.id}
                    className="progress-record-ledger-row"
                    style={{ '--record-accent': MUSCLE_COLORS[recordAccentKeys[(recordsOffset + index + featuredRecords.length) % recordAccentKeys.length] ?? 'chest'] } as CSSProperties}
                  >
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

                {showAllRecords && recordsPageCount > 1 && (
                  <nav aria-label="Strony rekordów" className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={currentRecordsPage === 0}
                      onClick={() => setRecordsPage(currentRecordsPage - 1)}
                      aria-label="Poprzednia strona rekordów"
                      aria-controls="progress-remaining-records"
                    >
                      Poprzednia
                    </Button>
                    <span className="text-sm" style={{ color: 'var(--muted)' }} aria-live="polite" aria-atomic="true">
                      Strona {currentRecordsPage + 1} z {recordsPageCount}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={currentRecordsPage === recordsPageCount - 1}
                      onClick={() => setRecordsPage(currentRecordsPage + 1)}
                      aria-label="Następna strona rekordów"
                      aria-controls="progress-remaining-records"
                    >
                      Następna
                    </Button>
                  </nav>
                )}

                {hasHiddenRemainingRecords && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="progress-record-toggle"
                    onClick={() => setRecordsPage((current) => current === null ? 0 : null)}
                    aria-expanded={showAllRecords}
                    aria-controls="progress-remaining-records"
                  >
                    {showAllRecords ? 'Pokaż mniej' : `Pokaż wszystkie (${remainingRecords.length})`}
                  </Button>
                )}
              </div>
            )}
          </motion.section>
        )}

        {showEmptyState && (
          <div className="progress-panel progress-empty-state">
            <div className="progress-empty-copy">
              <p className="text-lg font-semibold text-white">Brak danych</p>
              <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
                Ukończ kilka treningów, żeby zobaczyć wykresy i rekordy.
              </p>
            </div>
          </div>
        )}
        </>
      )}
    </div>
  )
}
