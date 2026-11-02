import BottomNavigation, { useBottomNavigation } from '../src/BottomNavigation'
import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'

import { pluralize } from '../../src/lib/pluralize'
import { kgToDisplayWeight } from '../../src/shared/weightUnits'
import {
  PROGRESS_MUSCLE_LABELS, aggregateMuscleBalance, aggregatePeriodComparison,
  aggregateStrengthProgression, aggregateWeeklyVolume, formatProgressVolume, strengthDeltaLabel,
  type RecordSummary,
} from '../../src/shared/progress'
import HistoryHeader from '../src/HistoryHeader'
import { MuscleBars, StrengthChart, WeeklyVolumeChart } from '../src/ProgressCharts'
import { readProgressRecords, readProgressSessions, readRecentProgressWorkouts, retryProgressMaterialization } from '../src/firebase'
import { loadProgressData, mergeProgressSnapshot, startProgressRead, type ProgressSnapshot } from '../src/progressData'
import { useActiveRuntime, useAuthRuntime } from '../src/runtime'
import { colors, pageTitle } from '../src/theme'
import { Icon } from '../src/icons'

const ranges = [{ label: '30 days', days: 30 }, { label: '90 days', days: 90 }, { label: 'Year', days: 365 }]
const formatDate = (timestamp: number) => new Date(timestamp).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
const formatDelta = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(0)}% vs previous`

export default function ProgressScreen() {
  const { user } = useAuthRuntime()
  if (!user) return <SafeAreaView edges={['top']} style={styles.screen}><StatusBar style="light" /><Text style={styles.muted}>Restoring sign-in…</Text></SafeAreaView>
  return <ProgressContent key={user.uid} uid={user.uid} />
}

function ProgressContent({ uid }: { uid: string }) {
  const navigation = useBottomNavigation()
  const active = useActiveRuntime()
  const units = active.state.units
  const { width } = useWindowDimensions()
  const [rangeDays, setRangeDays] = useState(90)
  const [moreStats, setMoreStats] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [loading, setLoading] = useState(true)
  const [snapshot, setSnapshot] = useState<ProgressSnapshot | null>(null)
  const [strengthKey, setStrengthKey] = useState<string | null>(null)
  const [inspected, setInspected] = useState<{ key: string; index: number } | null>(null)
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
  const inspectedIndex = inspected?.key === selectedStrengthKey && inspected.index < strengthValues.length ? inspected.index : null
  const shownStrength = strengthValues[inspectedIndex ?? strengthValues.length - 1] ?? 0
  const exerciseNames = new Map<string, number>()
  strength.series.forEach((series) => exerciseNames.set(series.exerciseName, (exerciseNames.get(series.exerciseName) ?? 0) + 1))
  const totalVolume = currentSessions.reduce((sum, session) => sum + session.totalVolume, 0)
  const uniqueWorkouts = new Set(currentSessions.map((session) => session.workoutId)).size
  const uniqueExercises = new Set(currentSessions.map((session) => `${session.exerciseSource}:${session.exerciseId}`)).size
  const topMuscle = muscles[0]
  const hasPrevious = comparison.previousSessions > 0
  const rangeEmpty = coverage && currentSessions.length === 0 && !(sessions.length === 0 && records.length === 0 && !!snapshot?.records && !snapshot.sessionsError && !snapshot.recordsError)
  const empty = coverage && !rangeEmpty && sessions.length === 0 && records.length === 0 && !!snapshot?.records && !snapshot.sessionsError && !snapshot.recordsError
  const remainingRecords = records.slice(1)
  const pageCount = Math.max(1, Math.ceil(remainingRecords.length / 20))
  const page = Math.min(recordsPage ?? 0, pageCount - 1)
  const visibleRecords = remainingRecords.slice(recordsPage === null ? 0 : page * 20, recordsPage === null ? 5 : page * 20 + 20)
  const retryable = !!(snapshot?.freshnessUncertain || snapshot?.sessionsError || snapshot?.recordsError)
  const nothingLoaded = !snapshot?.sessions && !snapshot?.records
  // With nothing loaded one connection message says it all; partial data lists what is stale.
  const notices = retryable && nothingLoaded ? ['Check your connection and try again.'] : [
    ...(snapshot?.freshnessUncertain ? ['Could not confirm data freshness. Recent workouts may not be visible yet.'] : []),
    ...(snapshot?.sessionsError ? ['Could not refresh workout data.'] : []),
    ...(snapshot?.recordsError ? ['Could not refresh all-time records.'] : []),
    ...(coverage && snapshot?.sessions?.truncated ? ['Workout analytics include the 5,000 most recent entries.'] : []),
    ...(snapshot?.records?.truncated ? ['The record list is limited to 1,000 entries.'] : []),
  ]
  const chartWidth = Math.max(280, width - 58)

  return <SafeAreaView onFocus={navigation.onFocus} onBlur={navigation.onBlur} edges={['top']} style={styles.screen}>
    <StatusBar style="light" />
    <HistoryHeader />
    <ScrollView onScroll={navigation.onScroll} scrollEventThrottle={16} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>Progress</Text>
        {!coverage && !notices.length && <Text style={styles.subtitle}>{loading ? 'Loading progress' : 'Workout data is temporarily unavailable.'}</Text>}
        <View accessibilityRole="radiogroup" accessibilityLabel="Date range" style={styles.ranges}>{ranges.map(({ label, days }) => <Pressable key={days} accessibilityRole="radio" accessibilityState={{ selected: rangeDays === days }} onPress={() => setRangeDays(days)} style={[styles.rangeButton, rangeDays === days && styles.rangeActive]}><Text style={[styles.rangeText, rangeDays === days && styles.rangeTextActive]}>{label}</Text></Pressable>)}</View>
      </View>

      {loading && !snapshot && <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={styles.muted}>Loading progress…</Text></View>}
      {notices.length > 0 && <View accessibilityRole="alert" style={styles.notice}><View style={styles.noticeText}><Text style={styles.noticeTitle}>{retryable ? (nothingLoaded ? 'Could not load data' : 'Data needs refreshing') : 'Data range has been limited'}</Text>{notices.map((notice) => <Text key={notice} style={styles.noticeCopy}>{notice}</Text>)}</View>{retryable && <Pressable accessibilityRole="button" disabled={loading} onPress={() => setAttempt((value) => value + 1)} style={styles.retry}><Text style={styles.link}>{loading ? 'Refreshing…' : 'Try again'}</Text></Pressable>}</View>}

      {coverage && !rangeEmpty && !empty && <View accessibilityLabel={`Summary: ${rangeDays} days`} style={styles.summary}>
        <View style={styles.summaryCell}><View style={styles.volumeValue}><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.volumeAmount}>{kgToDisplayWeight(totalVolume, units).toLocaleString('en-US')}</Text><Text style={styles.volumeUnit}>{units}</Text></View><Text style={styles.volumeLabel}>Volume</Text>{hasPrevious && <Text style={[styles.volumeDelta, styles.delta, comparison.volumeDelta < 0 && styles.down]}>{formatDelta(comparison.volumeDelta)}</Text>}</View>
        <SummaryCell label="Sessions" value={String(uniqueWorkouts)} meta={hasPrevious ? formatDelta(comparison.sessionsDelta) : 'in range'} delta={hasPrevious ? comparison.sessionsDelta : null} />
        <SummaryCell label="Records" value={snapshot?.records ? String(records.length) : '—'} meta="in range" />
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: moreStats }} onPress={() => setMoreStats(!moreStats)} style={styles.moreStats}><Text style={styles.moreStatsText}>{moreStats ? 'Less stats' : 'More stats'}</Text></Pressable>
        {moreStats && <>
          <SummaryCell label="Avg. / session" value={formatProgressVolume(comparison.currentAvgVolume, units)} meta={hasPrevious ? formatDelta(comparison.avgVolumeDelta) : 'in range'} delta={hasPrevious ? comparison.avgVolumeDelta : null} />
          <SummaryCell label="Exercises" value={String(uniqueExercises)} meta="in range" />
          <SummaryCell label="Muscle group" value={topMuscle ? PROGRESS_MUSCLE_LABELS[topMuscle.muscle] ?? topMuscle.muscle : 'None'} meta={topMuscle ? `${topMuscle.count} ${pluralize(topMuscle.count, 'entry', 'entries')}` : 'no data'} />
        </>}
      </View>}

      {coverage && currentSessions.length > 0 && <View style={styles.analysis}>
        <View style={styles.panel}>
          {selectedStrength && <View style={styles.pickerGroup}>
            <Pressable accessibilityRole="button" accessibilityLabel="Chart exercise" onPress={() => setPicker('strength')} style={styles.select}>
              <Text numberOfLines={1} style={styles.selectValue}>{selectedStrength.exerciseName}{(exerciseNames.get(selectedStrength.exerciseName) ?? 0) > 1 ? ` · ${selectedStrength.key.startsWith('user:') ? 'mine' : 'shared'}` : ''}</Text>
              <Icon name="chevron-down" />
            </Pressable>
          </View>}
          {!selectedStrength ? <Text style={styles.muted}>No recorded weights above 0 {units} in this range. Add a set weight to see progression.</Text>
            : strengthPoints.length < 3 ? <><Text style={styles.muted}>Chart needs {3 - strengthPoints.length} more {pluralize(3 - strengthPoints.length, 'day', 'days')} with recorded weight.</Text><View accessibilityLabel={`${strengthPoints.length} of 3 days for the chart`} style={styles.markers}>{[0, 1, 2].map((index) => <View key={index} style={[styles.marker, index < strengthPoints.length && styles.markerActive]} />)}</View></>
              : <><View style={styles.strengthInsight}><Text accessibilityLiveRegion="polite" style={styles.strengthLatest}>{inspectedIndex === null ? 'Latest' : `${strengthPoints[inspectedIndex]?.date} ·`} {kgToDisplayWeight(shownStrength, units)} {units}</Text><Text style={styles.strengthDelta}>{strengthDeltaLabel(strengthValues[0] ?? 0, shownStrength, strengthPoints[0]?.date ?? '', units)} · max. {kgToDisplayWeight(Math.max(...strengthValues), units)} {units}</Text></View><StrengthChart points={strengthPoints} keyName={selectedStrengthKey!} units={units} width={chartWidth} onInspect={(index) => setInspected({ key: selectedStrengthKey!, index })} /></>}
        </View>
        <View style={styles.panel}><View style={styles.panelHead}><Text accessibilityRole="header" style={styles.panelTitle}>Weekly volume</Text><Text style={styles.panelBadge}>{rangeDays === 30 ? '5' : rangeDays === 90 ? '13' : '53'} weeks</Text></View><WeeklyVolumeChart points={weekly} units={units} width={chartWidth} /></View>
        {muscles.length > 0 && <View style={styles.panel}><View style={styles.panelHead}><Text accessibilityRole="header" style={styles.panelTitle}>Muscle groups</Text></View><MuscleBars points={muscles} /></View>}
      </View>}

      {rangeEmpty && <View style={styles.empty}><Text style={styles.emptyTitle}>No workouts in this date range</Text><Text style={styles.muted}>Earlier sessions and records are still saved.</Text>{rangeDays < 365 && <Pressable accessibilityRole="button" onPress={() => setRangeDays(365)} style={styles.emptyAction}><Text style={styles.link}>Show year</Text></Pressable>}</View>}
      {records.length > 0 && <View style={styles.records}><Text accessibilityRole="header" style={styles.recordsTitle}>All-time records</Text><RecordFeature record={records[0]!} units={units} />{remainingRecords.length > 0 && <View style={styles.ledger}>{visibleRecords.map((record) => <RecordRow key={record.id} record={record} units={units} />)}{recordsPage !== null && pageCount > 1 && <View style={styles.pager}><Pressable accessibilityRole="button" disabled={page === 0} onPress={() => setRecordsPage(page - 1)} style={styles.pageAction}><Text style={[styles.link, page === 0 && styles.disabled]}>Previous</Text></Pressable><Text accessibilityLiveRegion="polite" style={styles.muted}>Page {page + 1} of {pageCount}</Text><Pressable accessibilityRole="button" disabled={page === pageCount - 1} onPress={() => setRecordsPage(page + 1)} style={styles.pageAction}><Text style={[styles.link, page === pageCount - 1 && styles.disabled]}>Next</Text></Pressable></View>}{remainingRecords.length > 5 && <Pressable accessibilityRole="button" accessibilityState={{ expanded: recordsPage !== null }} onPress={() => setRecordsPage(recordsPage === null ? 0 : null)} style={styles.showAll}><Text style={styles.link}>{recordsPage === null ? `Show all (${remainingRecords.length})` : 'Show less'}</Text></Pressable>}</View>}</View>}
      {empty && <View style={styles.empty}><Text style={styles.emptyTitle}>No data</Text><Text style={styles.muted}>Complete a few workouts to see charts and records.</Text></View>}
    </ScrollView>
    <ChoiceModal visible={picker === 'strength'} title="Exercise" options={strength.series.map((series) => ({ key: series.key, label: `${series.exerciseName}${(exerciseNames.get(series.exerciseName) ?? 0) > 1 ? ` · ${series.key.startsWith('user:') ? 'mine' : 'shared'}` : ''}` }))} selected={selectedStrengthKey} onSelect={(key) => { setStrengthKey(key); setPicker(null) }} onClose={() => setPicker(null)} />
  <BottomNavigation {...navigation} />
  </SafeAreaView>
}

function SummaryCell({ label, value, meta, delta = null }: { label: string; value: string; meta: string; delta?: number | null }) {
  return <View accessibilityLabel={`${label}: ${value}, ${meta}`} style={styles.summaryCell}><Text numberOfLines={1} adjustsFontSizeToFit style={styles.summaryValue}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text>{(delta !== null || meta !== 'in range') && <Text numberOfLines={1} style={styles.summaryMeta}>{meta}</Text>}</View>
}

function RecordFeature({ record, units }: { record: RecordSummary; units: 'kg' | 'lbs' }) {
  return <View accessibilityLabel={`Best record: ${record.exerciseName}, ${kgToDisplayWeight(record.maxWeight, units)} ${units} for ${record.maxReps} reps`} style={styles.feature}><View style={styles.recordCopy}><Text numberOfLines={1} style={styles.featureName}>{record.exerciseName}</Text><Text style={styles.recordDate}>{formatDate(record.lastPerformedAt)}</Text></View><View style={styles.featureResult}><Text numberOfLines={1} style={styles.featureWeight}>{kgToDisplayWeight(record.maxWeight, units)} <Text style={styles.featureUnit}>{units}</Text> <Text style={styles.recordDate}>× {record.maxReps}</Text></Text></View></View>
}

function RecordRow({ record, units }: { record: RecordSummary; units: 'kg' | 'lbs' }) {
  return <View accessibilityLabel={`${record.exerciseName}: ${kgToDisplayWeight(record.maxWeight, units)} ${units} for ${record.maxReps} reps`} style={styles.ledgerRow}><View style={styles.recordCopy}><Text numberOfLines={2} style={styles.recordName}>{record.exerciseName}</Text><Text style={styles.recordDate}>{formatDate(record.lastPerformedAt)} · {record.totalSessions} {pluralize(record.totalSessions, 'session', 'sessions')}</Text></View><Text style={styles.rowResult}>{kgToDisplayWeight(record.maxWeight, units)} {units} <Text style={styles.recordDate}>× {record.maxReps}</Text></Text></View>
}

function ChoiceModal({ visible, title, options, selected, onSelect, onClose }: { visible: boolean; title: string; options: Array<{ key: string; label: string }>; selected: string | null; onSelect: (key: string) => void; onClose: () => void }) {
  return <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose} statusBarTranslucent><View style={styles.modalShade}><View style={styles.modal}><Text accessibilityRole="header" style={styles.modalTitle}>{title}</Text><ScrollView style={styles.modalList}>{options.map((option) => <Pressable key={option.key} accessibilityRole="button" accessibilityState={{ selected: option.key === selected }} onPress={() => onSelect(option.key)} style={styles.modalOption}><Text numberOfLines={2} style={[styles.modalOptionText, option.key === selected && styles.link]}>{option.label}</Text></Pressable>)}</ScrollView><Pressable accessibilityRole="button" onPress={onClose} style={styles.modalClose}><Text style={styles.link}>Cancel</Text></Pressable></View></View></Modal>
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 44 },
  heading: { gap: 12, paddingBottom: 20 }, title: pageTitle, link: { color: colors.accentText, fontFamily: 'InstrumentSans_700Bold', fontSize: 13 }, subtitle: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, lineHeight: 21 }, muted: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, lineHeight: 20 },
  ranges: { flexDirection: 'row', alignSelf: 'flex-start', gap: 2, padding: 3, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.035)' }, rangeButton: { minHeight: 44, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderRadius: 9 }, rangeActive: { backgroundColor: colors.choiceSelected }, rangeText: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 13 }, rangeTextActive: { color: colors.text },
  loading: { paddingVertical: 50, alignItems: 'center', gap: 12 }, notice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderColor: 'rgba(244, 238, 232, 0.15)', borderWidth: 1, borderRadius: 8, padding: 12, backgroundColor: 'rgba(244, 238, 232, 0.036)', marginBottom: 14 }, noticeText: { flex: 1 }, noticeTitle: { color: colors.text, fontFamily: 'InstrumentSans_700Bold', fontSize: 13 }, noticeCopy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 11, lineHeight: 16, marginTop: 4 }, retry: { minHeight: 44, justifyContent: 'center' },
  summary: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, marginBottom: 16 }, summaryCell: { width: '33.33%', paddingRight: 12 }, summaryLabel: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13 }, summaryValue: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 20, lineHeight: 25, fontVariant: ['tabular-nums'] }, volumeLabel: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13 }, volumeValue: { flexDirection: 'row', alignItems: 'baseline', columnGap: 3 }, volumeAmount: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 20, lineHeight: 25, flexShrink: 1, fontVariant: ['tabular-nums'] }, volumeUnit: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13 }, volumeDelta: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12 }, summaryMeta: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12 }, delta: { color: colors.muted }, down: { color: colors.muted },
  analysis: { gap: 28, marginBottom: 24 }, panel: { }, lastPanel: { }, panelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, gap: 12 }, panelTitle: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 16, lineHeight: 21 }, panelBadge: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13 }, pickerGroup: { gap: 5, marginBottom: 14 }, select: { minHeight: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.035)', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, selectHint: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13 }, selectValue: { color: colors.text, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, flexShrink: 1 }, strengthLatest: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 30, letterSpacing: -0.78, lineHeight: 34, fontVariant: ['tabular-nums'] }, strengthDelta: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, lineHeight: 18, marginTop: 2 }, markers: { flexDirection: 'row', gap: 8, marginTop: 14 }, marker: { flex: 1, height: 8, backgroundColor: '#2c2623', borderRadius: 5 }, markerActive: { backgroundColor: colors.accent }, calendarSummary: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, lineHeight: 18, marginTop: 12 }, dayInspector: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 12 }, dayPickerGroup: { gap: 5, minWidth: 86 }, daySelect: { minHeight: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.035)', paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, dayValue: { flex: 1, color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, lineHeight: 18, textAlign: 'right', marginBottom: 12 },
  strengthInsight: { paddingBottom: 4 },
  moreStats: { justifyContent: 'center', minHeight: 44, width: '100%' }, moreStatsText: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14 },
  records: { marginTop: 0 }, recordsTitle: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 16, marginBottom: 4 }, feature: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, recordDate: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13 }, featureName: { color: colors.text, fontFamily: 'InstrumentSans_500Medium', fontSize: 15 }, featureResult: { alignItems: 'flex-end' }, featureWeight: { color: colors.text, fontFamily: 'InstrumentSans_500Medium', fontSize: 15, fontVariant: ['tabular-nums'] }, featureUnit: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13 }, ledger: { gap: 2 }, ledgerRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, recordCopy: { flex: 1, minWidth: 0 }, recordName: { color: colors.text, fontFamily: 'InstrumentSans_500Medium', fontSize: 15 }, rowResult: { color: colors.text, fontFamily: 'InstrumentSans_500Medium', fontSize: 15, maxWidth: '45%', fontVariant: ['tabular-nums'] }, pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 8 }, pageAction: { minHeight: 44, justifyContent: 'center' }, disabled: { opacity: 0.4 }, showAll: { alignItems: 'center', justifyContent: 'center', minHeight: 44, marginVertical: 8, backgroundColor: colors.surfaceRaised, borderRadius: 8 },
  empty: { gap: 8, paddingVertical: 22, marginBottom: 15 }, emptyTitle: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 16 }, emptyAction: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' },
  modalShade: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.7)', padding: 22 }, modal: { maxHeight: '70%', backgroundColor: colors.surfaceRaised, borderRadius: 12, borderColor: colors.line, borderWidth: 1, padding: 16 }, modalTitle: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 24, marginBottom: 12 }, modalList: { flexGrow: 0 }, modalOption: { minHeight: 49, justifyContent: 'center', borderBottomColor: colors.line, borderBottomWidth: 1 }, modalOptionText: { color: colors.text, fontFamily: 'InstrumentSans_500Medium', fontSize: 14 }, modalClose: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-end', marginTop: 8 },
})
