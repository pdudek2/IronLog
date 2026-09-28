import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'

import { pluralize } from '../../src/lib/pluralize'
import { kgToDisplayWeight } from '../../src/shared/weightUnits'
import {
  PROGRESS_MUSCLE_LABELS, aggregateActivityHeatmap, aggregateMuscleBalance, aggregatePeriodComparison,
  aggregateStrengthProgression, aggregateWeeklyVolume, formatProgressVolume,
  type RecordSummary,
} from '../../src/shared/progress'
import ActiveWorkoutReturnBar from '../src/ActiveWorkoutReturnBar'
import HistoryHeader from '../src/HistoryHeader'
import { ActivityCalendar, ActivityCalendarScale, MuscleBars, StrengthChart, WeeklyVolumeChart } from '../src/ProgressCharts'
import { readProgressRecords, readProgressSessions, readRecentProgressWorkouts, retryProgressMaterialization } from '../src/firebase'
import { loadProgressData, mergeProgressSnapshot, startProgressRead, type ProgressSnapshot } from '../src/progressData'
import { useActiveRuntime, useAuthRuntime } from '../src/runtime'

const ranges = [{ label: '30 days', days: 30 }, { label: '90 days', days: 90 }, { label: 'Year', days: 365 }]
const colors = { background: '#111012', text: '#f4f1f2', muted: '#a09aa0', accent: '#ff7182', line: 'rgba(244,241,242,0.12)' }
const formatDate = (timestamp: number) => new Date(timestamp).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
const formatCalendarDate = (date: string) => formatDate(Date.parse(`${date}T12:00:00`))
const formatDelta = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(0)}% vs previous`

export default function ProgressScreen() {
  const { user } = useAuthRuntime()
  if (!user) return <SafeAreaView edges={['top']} style={styles.screen}><StatusBar style="light" /><Text style={styles.muted}>Restoring sign-in…</Text></SafeAreaView>
  return <ProgressContent key={user.uid} uid={user.uid} />
}

function ProgressContent({ uid }: { uid: string }) {
  const router = useRouter()
  const active = useActiveRuntime()
  const units = active.state.units
  const { width } = useWindowDimensions()
  const [rangeDays, setRangeDays] = useState(90)
  const [attempt, setAttempt] = useState(0)
  const [loading, setLoading] = useState(true)
  const [snapshot, setSnapshot] = useState<ProgressSnapshot | null>(null)
  const [strengthKey, setStrengthKey] = useState<string | null>(null)
  const [calendarDate, setCalendarDate] = useState<string | null>(null)
  const [picker, setPicker] = useState<'strength' | 'calendar' | null>(null)
  const [recordsPage, setRecordsPage] = useState<number | null>(null)

  useFocusEffect(useCallback(() => {
    setLoading(true)
    return startProgressRead(() => loadProgressData(uid, rangeDays, {
      recent: readRecentProgressWorkouts, retryMaterialization: retryProgressMaterialization,
      sessions: readProgressSessions, records: readProgressRecords,
    }), (result) => setSnapshot((previous) => mergeProgressSnapshot(previous, result, rangeDays)),
    () => setSnapshot((previous) => ({ sessions: previous?.sessions ?? null, records: previous?.records ?? null,
      sessionsError: true, recordsError: true, freshnessUncertain: true })), () => setLoading(false))
  }, [uid, rangeDays, attempt]))

  const coverage = (snapshot?.sessions?.rangeDays ?? 0) >= rangeDays
  const sessions = coverage ? snapshot?.sessions?.sessions ?? [] : []
  const fetchedAt = coverage ? snapshot?.sessions?.fetchedAt ?? 0 : 0
  const records = snapshot?.records?.records ?? []
  const currentSessions = useMemo(() => sessions.filter((session) => session.finishedAt >= fetchedAt - rangeDays * 86_400_000), [sessions, fetchedAt, rangeDays])
  const weekly = useMemo(() => aggregateWeeklyVolume(currentSessions, rangeDays === 30 ? 5 : rangeDays === 90 ? 13 : 53, fetchedAt), [currentSessions, rangeDays, fetchedAt])
  const muscles = useMemo(() => aggregateMuscleBalance(currentSessions), [currentSessions])
  const comparison = useMemo(() => aggregatePeriodComparison(sessions, rangeDays, fetchedAt), [sessions, rangeDays, fetchedAt])
  const strength = useMemo(() => aggregateStrengthProgression(currentSessions), [currentSessions])
  const selectedStrengthKey = strength.series.some((series) => series.key === strengthKey) ? strengthKey : strength.series[0]?.key ?? null
  const selectedStrength = strength.series.find((series) => series.key === selectedStrengthKey)
  const strengthPoints = selectedStrengthKey ? strength.data.filter((point) => Number(point[selectedStrengthKey] ?? 0) > 0) : []
  const strengthValues = strengthPoints.map((point) => Number(point[selectedStrengthKey!] ?? 0))
  const strengthDelta = (strengthValues.at(-1) ?? 0) - (strengthValues[0] ?? 0)
  const heatmap = useMemo(() => aggregateActivityHeatmap(currentSessions, 12, fetchedAt), [currentSessions, fetchedAt])
  const activeDays = heatmap.filter((cell) => cell.date && cell.volume > 0).sort((a, b) => b.date.localeCompare(a.date))
  const selectedDate = activeDays.some((cell) => cell.date === calendarDate) ? calendarDate : activeDays[0]?.date ?? null
  const selectedDay = activeDays.find((cell) => cell.date === selectedDate)
  const exerciseNames = new Map<string, number>()
  strength.series.forEach((series) => exerciseNames.set(series.exerciseName, (exerciseNames.get(series.exerciseName) ?? 0) + 1))
  const totalVolume = currentSessions.reduce((sum, session) => sum + session.totalVolume, 0)
  const uniqueWorkouts = new Set(currentSessions.map((session) => session.workoutId)).size
  const uniqueExercises = new Set(currentSessions.map((session) => `${session.exerciseSource}:${session.exerciseId}`)).size
  const topMuscle = muscles[0]
  const topRecord = records[0]
  const hasPrevious = comparison.previousSessions > 0
  const rangeEmpty = coverage && currentSessions.length === 0 && !(sessions.length === 0 && records.length === 0 && !!snapshot?.records && !snapshot.sessionsError && !snapshot.recordsError)
  const empty = coverage && !rangeEmpty && sessions.length === 0 && records.length === 0 && !!snapshot?.records && !snapshot.sessionsError && !snapshot.recordsError
  const remainingRecords = records.slice(1)
  const pageCount = Math.max(1, Math.ceil(remainingRecords.length / 20))
  const page = Math.min(recordsPage ?? 0, pageCount - 1)
  const visibleRecords = remainingRecords.slice(recordsPage === null ? 0 : page * 20, recordsPage === null ? 5 : page * 20 + 20)
  const notices = [
    ...(snapshot?.freshnessUncertain ? ['Could not confirm data freshness. Recent workouts may not be visible yet.'] : []),
    ...(snapshot?.sessionsError ? ['Could not refresh workout data.'] : []),
    ...(snapshot?.recordsError ? ['Could not refresh all-time records.'] : []),
    ...(coverage && snapshot?.sessions?.truncated ? ['Workout analytics include the 5,000 most recent entries.'] : []),
    ...(snapshot?.records?.truncated ? ['The record list is limited to 1,000 entries.'] : []),
  ]
  const retryable = !!(snapshot?.freshnessUncertain || snapshot?.sessionsError || snapshot?.recordsError)
  const chartWidth = Math.max(280, width - 58)
  const navigateHistory = () => router.navigate('/history')
  const heatmapPeak = activeDays.reduce<(typeof activeDays)[number] | null>((best, cell) => !best || cell.volume > best.volume ? cell : best, null)

  return <SafeAreaView edges={['top']} style={styles.screen}>
    <StatusBar style="light" />
    <HistoryHeader />
    <ActiveWorkoutReturnBar />
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>Progress</Text>
        <Pressable accessibilityRole="button" onPress={navigateHistory} style={styles.historyButton}><Text style={[styles.link, styles.historyLink]}>View history</Text></Pressable>
        {!coverage && <Text style={styles.subtitle}>{loading ? 'Loading progress' : 'Workout data is temporarily unavailable.'}</Text>}
        {coverage && !uniqueWorkouts && <Text style={styles.subtitle}>No workouts in this date range.</Text>}
        <View accessibilityRole="radiogroup" accessibilityLabel="Date range" style={styles.ranges}>{ranges.map(({ label, days }) => <Pressable key={days} accessibilityRole="radio" accessibilityState={{ selected: rangeDays === days }} onPress={() => setRangeDays(days)} style={[styles.rangeButton, rangeDays === days && styles.rangeActive]}><Text style={[styles.rangeText, rangeDays === days && styles.rangeTextActive]}>{label}</Text></Pressable>)}</View>
      </View>

      {loading && !snapshot && <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={styles.muted}>Loading progress…</Text></View>}
      {notices.length > 0 && <View accessibilityRole="alert" style={styles.notice}><View style={styles.noticeText}><Text style={styles.noticeTitle}>{retryable ? (snapshot?.sessions || snapshot?.records ? 'Data needs refreshing' : 'Could not load data') : 'Data range has been limited'}</Text>{notices.map((notice) => <Text key={notice} style={styles.noticeCopy}>{notice}</Text>)}</View>{retryable && <Pressable accessibilityRole="button" disabled={loading} onPress={() => setAttempt((value) => value + 1)} style={styles.retry}><Text style={styles.link}>{loading ? 'Refreshing…' : 'Try again'}</Text></Pressable>}</View>}

      {coverage && !rangeEmpty && !empty && <View accessibilityLabel={`Summary: ${rangeDays} days`} style={styles.summary}>
        <View style={[styles.summaryCell, styles.volumeCell]}><Text style={styles.volumeLabel}>Volume</Text><View style={styles.volumeValue}><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.volumeAmount}>{kgToDisplayWeight(totalVolume, units).toLocaleString('en-US')}</Text><Text style={styles.volumeUnit}>{units}</Text></View><Text style={styles.volumeMeta}>Last {rangeDays} days</Text>{hasPrevious && <Text style={[styles.volumeDelta, styles.delta, comparison.volumeDelta < 0 && styles.down]}>{formatDelta(comparison.volumeDelta)}</Text>}</View>
        <SummaryCell label="Sessions" value={String(uniqueWorkouts)} meta={hasPrevious ? formatDelta(comparison.sessionsDelta) : 'in range'} delta={hasPrevious ? comparison.sessionsDelta : null} />
        <SummaryCell label="Avg. / session" value={formatProgressVolume(comparison.currentAvgVolume, units)} meta={hasPrevious ? formatDelta(comparison.avgVolumeDelta) : 'in range'} delta={hasPrevious ? comparison.avgVolumeDelta : null} />
        <SummaryCell label="Exercises" value={String(uniqueExercises)} meta="in range" />
        <SummaryCell label="Records" value={snapshot?.records ? String(records.length) : '—'} meta={snapshot?.records ? topRecord?.exerciseName ?? 'no records' : 'unavailable'} />
        <SummaryCell label="Muscle group" value={topMuscle ? PROGRESS_MUSCLE_LABELS[topMuscle.muscle] ?? topMuscle.muscle : 'None'} meta={topMuscle ? `${topMuscle.count} ${pluralize(topMuscle.count, 'entry', 'entries')}` : 'no data'} />
      </View>}

      {coverage && currentSessions.length > 0 && <View style={styles.analysis}>
        <View style={styles.panel}><View style={styles.panelHead}><Text accessibilityRole="header" style={styles.panelTitle}>Weekly volume</Text><Text style={styles.panelBadge}>{rangeDays === 30 ? '5' : rangeDays === 90 ? '13' : '53'} weeks</Text></View><WeeklyVolumeChart points={weekly} units={units} width={chartWidth} /></View>
        <View style={styles.panel}>
          <View style={styles.panelHead}><Text accessibilityRole="header" style={styles.panelTitle}>Weight progression</Text></View>
          {selectedStrength && <View style={styles.pickerGroup}>
            <Text style={styles.selectHint}>Exercise</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Chart exercise" onPress={() => setPicker('strength')} style={styles.select}>
              <Text numberOfLines={1} style={styles.selectValue}>{selectedStrength.exerciseName}{(exerciseNames.get(selectedStrength.exerciseName) ?? 0) > 1 ? ` · ${selectedStrength.key.startsWith('user:') ? 'mine' : 'shared'}` : ''}</Text>
              <Text style={styles.chevron}>⌄</Text>
            </Pressable>
          </View>}
          {!selectedStrength ? <Text style={styles.muted}>No recorded weights above 0 {units} in this range. Add a set weight to see progression.</Text>
            : strengthPoints.length < 3 ? <><Text style={styles.muted}>Chart needs {3 - strengthPoints.length} {pluralize(3 - strengthPoints.length, 'day', 'days')} with recorded weight.</Text><View accessibilityLabel={`${strengthPoints.length} of 3 days for the chart`} style={styles.markers}>{[0, 1, 2].map((index) => <View key={index} style={[styles.marker, index < strengthPoints.length && styles.markerActive]} />)}</View></>
              : <><View style={styles.strengthInsight}><Text style={styles.strengthLatest}>Latest {kgToDisplayWeight(strengthValues.at(-1) ?? 0, units)} {units}</Text><Text style={styles.strengthDelta}>{strengthDelta === 0 ? 'No change from the first in this range' : `${strengthDelta > 0 ? '+' : ''}${kgToDisplayWeight(strengthDelta, units)} ${units} compared with the first in this range}`} · max. {kgToDisplayWeight(Math.max(...strengthValues), units)} {units}</Text></View><StrengthChart points={strengthPoints} keyName={selectedStrengthKey!} units={units} width={chartWidth} /></>}
        </View>
        {muscles.length > 0 && <View style={styles.panel}><View style={styles.panelHead}><Text accessibilityRole="header" style={styles.panelTitle}>Muscle groups</Text></View><MuscleBars points={muscles} /></View>}
        <View style={[styles.panel, styles.lastPanel]}>
          <View style={styles.panelHead}><Text accessibilityRole="header" style={styles.panelTitle}>Calendar</Text></View>
          <ActivityCalendar cells={heatmap} selectedDate={selectedDate} onSelect={setCalendarDate} units={units} />
          {heatmapPeak && <Text style={styles.calendarSummary}>{activeDays.length} {pluralize(activeDays.length, 'active day', 'active days')} · strongest day {formatCalendarDate(heatmapPeak.date)} · {formatProgressVolume(heatmapPeak.volume, units)}</Text>}
          {activeDays.length > 0 && <View style={styles.dayInspector}>
            <View style={styles.dayPickerGroup}>
              <Text style={styles.selectHint}>View day</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="View calendar day" onPress={() => setPicker('calendar')} style={styles.daySelect}><Text style={styles.selectValue}>{selectedDate ? formatCalendarDate(selectedDate) : ''}</Text><Text style={styles.chevron}>⌄</Text></Pressable>
            </View>
            <Text accessibilityLiveRegion="polite" style={styles.dayValue}>{selectedDay ? `${formatCalendarDate(selectedDay.date)} · ${formatProgressVolume(selectedDay.volume, units)}` : ''}</Text>
          </View>}
          <ActivityCalendarScale />
        </View>
      </View>}

      {rangeEmpty && <View style={styles.empty}><Text style={styles.emptyTitle}>No workouts in this date range</Text><Text style={styles.muted}>Earlier sessions and records are still saved.</Text>{rangeDays < 365 && <Pressable accessibilityRole="button" onPress={() => setRangeDays(365)} style={styles.emptyAction}><Text style={styles.link}>Show year</Text></Pressable>}</View>}
      {records.length > 0 && <View style={styles.records}><Text accessibilityRole="header" style={styles.recordsTitle}>All-time records</Text><RecordFeature record={records[0]!} units={units} />{remainingRecords.length > 0 && <View style={styles.ledger}><View style={styles.ledgerHead}><Text style={styles.ledgerHeadText}>More records</Text><Text style={styles.ledgerHeadText}>Result</Text></View>{visibleRecords.map((record) => <RecordRow key={record.id} record={record} units={units} />)}{recordsPage !== null && pageCount > 1 && <View style={styles.pager}><Pressable accessibilityRole="button" disabled={page === 0} onPress={() => setRecordsPage(page - 1)} style={styles.pageAction}><Text style={[styles.link, page === 0 && styles.disabled]}>Previous</Text></Pressable><Text accessibilityLiveRegion="polite" style={styles.muted}>Page {page + 1} of {pageCount}</Text><Pressable accessibilityRole="button" disabled={page === pageCount - 1} onPress={() => setRecordsPage(page + 1)} style={styles.pageAction}><Text style={[styles.link, page === pageCount - 1 && styles.disabled]}>Next</Text></Pressable></View>}{remainingRecords.length > 5 && <Pressable accessibilityRole="button" accessibilityState={{ expanded: recordsPage !== null }} onPress={() => setRecordsPage(recordsPage === null ? 0 : null)} style={styles.showAll}><Text style={styles.link}>{recordsPage === null ? `Show all (${remainingRecords.length})` : 'Show less'}</Text></Pressable>}</View>}</View>}
      {empty && <View style={styles.empty}><Text style={styles.emptyTitle}>No data</Text><Text style={styles.muted}>Complete a few workouts to see charts and records.</Text></View>}
    </ScrollView>
    <ChoiceModal visible={picker === 'strength'} title="Exercise" options={strength.series.map((series) => ({ key: series.key, label: `${series.exerciseName}${(exerciseNames.get(series.exerciseName) ?? 0) > 1 ? ` · ${series.key.startsWith('user:') ? 'mine' : 'shared'}` : ''}` }))} selected={selectedStrengthKey} onSelect={(key) => { setStrengthKey(key); setPicker(null) }} onClose={() => setPicker(null)} />
    <ChoiceModal visible={picker === 'calendar'} title="View day" options={activeDays.map((day) => ({ key: day.date, label: `${formatCalendarDate(day.date)} · ${formatProgressVolume(day.volume, units)}` }))} selected={selectedDate} onSelect={(date) => { setCalendarDate(date); setPicker(null) }} onClose={() => setPicker(null)} />
  </SafeAreaView>
}

function SummaryCell({ label, value, meta, delta = null }: { label: string; value: string; meta: string; delta?: number | null }) {
  return <View accessibilityLabel={`${label}: ${value}, ${meta}`} style={[styles.summaryCell, (label === 'Avg. / session' || label === 'Records') && styles.summaryLeft]}><Text style={styles.summaryLabel}>{label}</Text><Text numberOfLines={1} adjustsFontSizeToFit style={styles.summaryValue}>{value}</Text><Text numberOfLines={1} style={[styles.summaryMeta, delta !== null && styles.delta, delta !== null && delta < 0 && styles.down]}>{meta}</Text></View>
}

function RecordFeature({ record, units }: { record: RecordSummary; units: 'kg' | 'lbs' }) {
  return <View accessibilityLabel={`Best record: ${record.exerciseName}, ${kgToDisplayWeight(record.maxWeight, units)} ${units} for ${record.maxReps} reps`} style={styles.feature}><Text style={styles.recordDate}>{formatDate(record.lastPerformedAt)}</Text><View style={styles.featureMain}><Text numberOfLines={2} style={styles.featureName}>{record.exerciseName}</Text><View style={styles.featureResult}><Text numberOfLines={1} adjustsFontSizeToFit style={styles.featureWeight}>{kgToDisplayWeight(record.maxWeight, units)} <Text style={styles.featureUnit}>{units}</Text></Text><Text style={styles.recordDate}>× {record.maxReps}</Text></View></View><Text style={styles.recordDate}>{record.totalSessions} {pluralize(record.totalSessions, 'session', 'sessions')}</Text></View>
}

function RecordRow({ record, units }: { record: RecordSummary; units: 'kg' | 'lbs' }) {
  return <View accessibilityLabel={`${record.exerciseName}: ${kgToDisplayWeight(record.maxWeight, units)} ${units} for ${record.maxReps} reps`} style={styles.ledgerRow}><View style={styles.recordCopy}><Text numberOfLines={2} style={styles.recordName}>{record.exerciseName}</Text><Text style={styles.recordDate}>{formatDate(record.lastPerformedAt)} · {record.totalSessions} {pluralize(record.totalSessions, 'session', 'sessions')}</Text></View><Text style={styles.rowResult}>{kgToDisplayWeight(record.maxWeight, units)} {units} <Text style={styles.recordDate}>× {record.maxReps}</Text></Text></View>
}

function ChoiceModal({ visible, title, options, selected, onSelect, onClose }: { visible: boolean; title: string; options: Array<{ key: string; label: string }>; selected: string | null; onSelect: (key: string) => void; onClose: () => void }) {
  return <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose} statusBarTranslucent><View style={styles.modalShade}><View style={styles.modal}><Text accessibilityRole="header" style={styles.modalTitle}>{title}</Text><ScrollView style={styles.modalList}>{options.map((option) => <Pressable key={option.key} accessibilityRole="button" accessibilityState={{ selected: option.key === selected }} onPress={() => onSelect(option.key)} style={styles.modalOption}><Text numberOfLines={2} style={[styles.modalOptionText, option.key === selected && styles.link]}>{option.label}</Text></Pressable>)}</ScrollView><Pressable accessibilityRole="button" onPress={onClose} style={styles.modalClose}><Text style={styles.link}>Cancel</Text></Pressable></View></View></Modal>
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 44, backgroundColor: colors.background, experimental_backgroundImage: 'linear-gradient(115deg, rgba(240,67,90,0.055) 0%, transparent 26%, transparent 68%, rgba(143,184,160,0.065) 100%), linear-gradient(180deg, #0b0a0c 0%, #111012 42%, #0d0c0e 100%)' },
  heading: { gap: 6, paddingBottom: 34 }, title: { color: '#fff', fontFamily: 'ArchivoHeading', fontSize: 42, lineHeight: 44 }, historyButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }, link: { color: colors.accent, fontFamily: 'InstrumentSans_700Bold', fontSize: 13 }, historyLink: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 14 }, subtitle: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, lineHeight: 21 }, muted: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, lineHeight: 20 },
  ranges: { flexDirection: 'row', width: '100%', borderColor: 'rgba(244,241,242,0.14)', borderWidth: 1, borderRadius: 8, overflow: 'hidden', marginTop: 6, backgroundColor: 'rgba(9,8,10,0.26)' }, rangeButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRightColor: 'rgba(244,241,242,0.1)', borderRightWidth: 1 }, rangeActive: { backgroundColor: 'rgba(240,67,90,0.14)' }, rangeText: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 12 }, rangeTextActive: { color: colors.accent },
  loading: { paddingVertical: 50, alignItems: 'center', gap: 12 }, notice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderColor: 'rgba(240,67,90,0.25)', borderWidth: 1, borderRadius: 8, padding: 12, backgroundColor: 'rgba(240,67,90,0.06)', marginBottom: 14 }, noticeText: { flex: 1 }, noticeTitle: { color: colors.text, fontFamily: 'InstrumentSans_700Bold', fontSize: 13 }, noticeCopy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 11, lineHeight: 16, marginTop: 4 }, retry: { minHeight: 44, justifyContent: 'center' },
  summary: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: 8, overflow: 'hidden', backgroundColor: '#211f23', marginBottom: 16 }, summaryCell: { width: '50%', minHeight: 88, justifyContent: 'center', padding: 12, borderBottomColor: 'rgba(244,241,242,0.08)', borderBottomWidth: 1 }, summaryLeft: { borderRightColor: 'rgba(244,241,242,0.08)', borderRightWidth: 1 }, volumeCell: { borderRightColor: 'rgba(244,241,242,0.08)', borderRightWidth: 1 }, summaryLabel: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 11 }, summaryValue: { color: colors.text, fontFamily: 'InstrumentSans_700Bold', fontSize: 17, marginTop: 5 }, volumeLabel: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 12, lineHeight: 18 }, volumeValue: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 4, marginTop: 5.6 }, volumeAmount: { color: '#fff', fontFamily: 'ArchivoHeading', fontSize: 37.6, lineHeight: 58, flexShrink: 1 }, volumeUnit: { color: colors.muted, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 15.8, lineHeight: 34.6 }, volumeMeta: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13.1, lineHeight: 19.7, marginTop: 8 }, volumeDelta: { fontFamily: 'InstrumentSans_400Regular', fontSize: 13.1, lineHeight: 19.7, marginTop: 8 }, summaryMeta: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 11, marginTop: 5 }, delta: { color: '#8fb8a0' }, down: { color: '#ff8796' },
  analysis: { borderTopColor: colors.line, borderTopWidth: 1, borderBottomColor: colors.line, borderBottomWidth: 1, marginBottom: 18 }, panel: { paddingVertical: 13, paddingHorizontal: 13, borderBottomColor: 'rgba(244,241,242,0.09)', borderBottomWidth: 1 }, lastPanel: { borderBottomWidth: 0 }, panelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12 }, panelTitle: { color: '#fff', fontFamily: 'ArchivoHeading', fontSize: 20, lineHeight: 22 }, panelBadge: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 11, paddingTop: 4 }, pickerGroup: { gap: 5, marginBottom: 14 }, select: { minHeight: 44, borderColor: 'rgba(244,241,242,0.2)', borderWidth: 1, borderRadius: 6, backgroundColor: '#151316', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, selectHint: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 12 }, selectValue: { color: colors.text, fontFamily: 'InstrumentSans_500Medium', fontSize: 13, flexShrink: 1 }, chevron: { color: colors.muted, fontSize: 18 }, strengthLatest: { color: '#fff', fontFamily: 'ArchivoHeading', fontSize: 18.5 }, strengthDelta: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 11, lineHeight: 17, marginTop: 8 }, markers: { flexDirection: 'row', gap: 8, marginTop: 14 }, marker: { flex: 1, height: 8, backgroundColor: '#29272b', borderRadius: 5 }, markerActive: { backgroundColor: '#f0435a' }, calendarSummary: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 11, lineHeight: 16, marginTop: 12 }, dayInspector: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 12 }, dayPickerGroup: { gap: 5, minWidth: 86 }, daySelect: { minHeight: 44, borderColor: 'rgba(244,241,242,0.2)', borderWidth: 1, borderRadius: 6, backgroundColor: '#151316', paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, dayValue: { flex: 1, color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 11, lineHeight: 16, textAlign: 'right', marginBottom: 10 },
  strengthInsight: { borderTopColor: colors.line, borderTopWidth: 1, borderBottomColor: colors.line, borderBottomWidth: 1, paddingTop: 8, paddingBottom: 2 },
  records: { marginTop: 8 }, recordsTitle: { color: '#fff', fontFamily: 'ArchivoHeading', fontSize: 20, marginBottom: 13 }, feature: { borderTopColor: colors.line, borderTopWidth: 1, borderBottomColor: colors.line, borderBottomWidth: 1, paddingVertical: 14 }, recordDate: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 11 }, featureMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10, marginVertical: 11 }, featureName: { color: '#fff', fontFamily: 'InstrumentSans_700Bold', fontSize: 17, flex: 1 }, featureResult: { alignItems: 'flex-end', maxWidth: '47%' }, featureWeight: { color: '#fff', fontFamily: 'ArchivoHeading', fontSize: 27 }, featureUnit: { color: colors.muted, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 12 }, ledger: { marginTop: 16, borderTopColor: colors.line, borderTopWidth: 1, borderBottomColor: colors.line, borderBottomWidth: 1 }, ledgerHead: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomColor: colors.line, borderBottomWidth: 1 }, ledgerHeadText: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 10 }, ledgerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 13, borderBottomColor: 'rgba(244,241,242,0.07)', borderBottomWidth: 1 }, recordCopy: { flex: 1, minWidth: 0, gap: 4 }, recordName: { color: colors.text, fontFamily: 'InstrumentSans_700Bold', fontSize: 13 }, rowResult: { color: colors.text, fontFamily: 'InstrumentSans_700Bold', fontSize: 13, maxWidth: '45%' }, pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 8 }, pageAction: { minHeight: 44, justifyContent: 'center' }, disabled: { opacity: 0.4 }, showAll: { alignItems: 'center', justifyContent: 'center', minHeight: 44, marginVertical: 8, backgroundColor: '#211f23', borderRadius: 8 },
  empty: { gap: 8, paddingVertical: 22, borderTopColor: colors.line, borderTopWidth: 1, borderBottomColor: colors.line, borderBottomWidth: 1, marginBottom: 15 }, emptyTitle: { color: '#fff', fontFamily: 'InstrumentSans_700Bold', fontSize: 16 }, emptyAction: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' },
  modalShade: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.7)', padding: 22 }, modal: { maxHeight: '70%', backgroundColor: '#211f23', borderRadius: 12, borderColor: colors.line, borderWidth: 1, padding: 16 }, modalTitle: { color: '#fff', fontFamily: 'ArchivoHeading', fontSize: 24, marginBottom: 12 }, modalList: { flexGrow: 0 }, modalOption: { minHeight: 49, justifyContent: 'center', borderBottomColor: colors.line, borderBottomWidth: 1 }, modalOptionText: { color: colors.text, fontFamily: 'InstrumentSans_500Medium', fontSize: 14 }, modalClose: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-end', marginTop: 8 },
})
