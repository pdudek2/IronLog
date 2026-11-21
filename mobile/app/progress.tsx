import BottomNavigation from '../src/BottomNavigation'
import { useCallback, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'

import { pluralize } from '../../src/lib/pluralize'
import { formatRoundedVolume, kgToDisplayWeight } from '../../src/shared/weightUnits'
import {
  aggregateStrengthProgression, defaultStrengthKey, formatBestSet, formatCountChange, formatPercentChange, formatSetChange,
  previousPeriodLabel, strengthDeltaLabel, summarizeAllExercises, type ProgressSessionLite,
} from '../../src/shared/progress'
import HistoryHeader from '../src/HistoryHeader'
import { MuscleBars, StrengthChart, WeeklyVolumeChart } from '../src/ProgressCharts'
import { readProgressRecords, readProgressSessions, readRecentProgressWorkouts, retryProgressMaterialization } from '../src/firebase'
import { loadProgressData, mergeProgressSnapshot, recallProgress, rememberProgress, startProgressRead, type ProgressSnapshot } from '../src/progressData'
import { readGeneration } from '../src/scopedRead'
import { useActiveRuntime, useAuthRuntime } from '../src/runtime'
import { colors, pageTitle } from '../src/theme'
import { Icon } from '../src/icons'

const noSessions: ProgressSessionLite[] = []
const ranges = [{ label: '30 days', days: 30 }, { label: '90 days', days: 90 }, { label: 'Year', days: 365 }]

export default function ProgressScreen() {
  const { user } = useAuthRuntime()
  if (!user) return <SafeAreaView edges={['top']} style={styles.screen}><StatusBar style="light" /><Text style={styles.muted}>Restoring sign-in…</Text></SafeAreaView>
  return <ProgressContent key={user.uid} uid={user.uid} />
}

function ProgressContent({ uid }: { uid: string }) {
  const active = useActiveRuntime()
  const units = active.state.units
  const { width } = useWindowDimensions()
  const [rangeDays, setRangeDays] = useState(90)
  const [attempt, setAttempt] = useState(0)
  const [loading, setLoading] = useState(true)
  const [snapshot, setSnapshot] = useState<ProgressSnapshot | null>(() => recallProgress(uid))
  const [strengthKey, setStrengthKey] = useState<string | null>(null)
  const [inspected, setInspected] = useState<{ key: string; index: number } | null>(null)
  const [picker, setPicker] = useState<'strength' | 'calendar' | null>(null)
  const scroll = useRef<ScrollView>(null)
  const chartY = useRef({ analysis: 0, panel: 0 })

  useFocusEffect(useCallback(() => {
    setLoading(true)
    const since = readGeneration()
    return startProgressRead(() => loadProgressData(uid, rangeDays, {
      recent: readRecentProgressWorkouts, retryMaterialization: retryProgressMaterialization,
      sessions: readProgressSessions, records: readProgressRecords,
    }), (result) => setSnapshot((previous) => {
      const next = mergeProgressSnapshot(previous, result, rangeDays)
      rememberProgress(uid, next, since)
      return next
    }),
    () => setSnapshot((previous) => ({ sessions: previous?.sessions ?? null, records: previous?.records ?? null,
      sessionsError: true, recordsError: true, freshnessUncertain: true })), () => setLoading(false))
  }, [uid, rangeDays, attempt]))

  const coverage = (snapshot?.sessions?.rangeDays ?? 0) >= rangeDays
  const sessions = coverage ? snapshot?.sessions?.sessions ?? noSessions : noSessions
  const fetchedAt = coverage ? snapshot?.sessions?.fetchedAt ?? 0 : 0
  const records = snapshot?.records?.records ?? []
  const currentSessions = useMemo(() => sessions.filter((session) => session.finishedAt >= fetchedAt - rangeDays * 86_400_000), [sessions, fetchedAt, rangeDays])
  const summary = useMemo(() => summarizeAllExercises(sessions, rangeDays, fetchedAt), [sessions, rangeDays, fetchedAt])
  const strength = useMemo(() => aggregateStrengthProgression(currentSessions), [currentSessions])
  const chartable = new Set(strength.series.map((series) => series.key))
  const selectedStrengthKey = strengthKey && chartable.has(strengthKey) ? strengthKey : defaultStrengthKey(strength.series)
  const selectedStrength = strength.series.find((series) => series.key === selectedStrengthKey)
  const strengthPoints = selectedStrengthKey ? strength.data.filter((point) => Number(point[selectedStrengthKey] ?? 0) > 0) : []
  const strengthValues = strengthPoints.map((point) => Number(point[selectedStrengthKey!] ?? 0))
  const inspectedIndex = inspected?.key === selectedStrengthKey && inspected.index < strengthValues.length ? inspected.index : null
  const shownStrength = strengthValues[inspectedIndex ?? strengthValues.length - 1] ?? 0
  const exerciseNames = new Map<string, number>()
  strength.series.forEach((series) => exerciseNames.set(series.exerciseName, (exerciseNames.get(series.exerciseName) ?? 0) + 1))
  const rangeEmpty = coverage && currentSessions.length === 0 && !(sessions.length === 0 && records.length === 0 && !!snapshot?.records && !snapshot.sessionsError && !snapshot.recordsError)
  const empty = coverage && !rangeEmpty && sessions.length === 0 && records.length === 0 && !!snapshot?.records && !snapshot.sessionsError && !snapshot.recordsError
  // Records only decide whether an empty range means an empty account.
  const sessionsStale = !!(snapshot?.sessionsError || (snapshot?.recordsError && sessions.length === 0))
  const retryable = !!snapshot?.freshnessUncertain || sessionsStale
  const nothingLoaded = !snapshot?.sessions && !snapshot?.records
  // With nothing loaded one connection message says it all; partial data lists what is stale.
  const notices = retryable && nothingLoaded ? ['Check your connection and try again.'] : [
    ...(snapshot?.freshnessUncertain ? ['Could not confirm data freshness. Recent workouts may not be visible yet.'] : []),
    ...(sessionsStale ? ['Could not refresh workout data.'] : []),
    ...(coverage && snapshot?.sessions?.truncated ? ['Workout analytics include the 5,000 most recent entries.'] : []),
  ]
  const headlineVolume = summary.averageVolume ?? summary.weeks.at(-1)?.volume ?? 0
  const chartExercise = (key: string) => {
    setStrengthKey(key)
    scroll.current?.scrollTo({ y: Math.max(0, chartY.current.analysis + chartY.current.panel - 12) })
  }
  const chartWidth = Math.max(280, width - 58)

  return <SafeAreaView edges={['top']} style={styles.screen}>
    <StatusBar style="light" />
    <HistoryHeader />
    <ScrollView ref={scroll} contentContainerStyle={[styles.content, { paddingBottom: 44 }]} keyboardShouldPersistTaps="handled">
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>Progress</Text>
        {/* Loading shows below the range switch, so the switch does not move when it ends. */}
        {!coverage && !notices.length && !loading && <Text style={styles.subtitle}>Workout data is temporarily unavailable.</Text>}
        <View accessibilityRole="radiogroup" accessibilityLabel="Date range" style={styles.ranges}>{ranges.map(({ label, days }) => <Pressable key={days} accessibilityRole="radio" accessibilityState={{ selected: rangeDays === days }} onPress={() => setRangeDays(days)} style={[styles.rangeButton, rangeDays === days && styles.rangeActive]}><Text style={[styles.rangeText, rangeDays === days && styles.rangeTextActive]}>{label}</Text></Pressable>)}</View>
      </View>

      {loading && !coverage && <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={styles.muted}>Loading progress…</Text></View>}
      {notices.length > 0 && <View accessibilityRole="alert" style={styles.notice}><View style={styles.noticeText}><Text style={styles.noticeTitle}>{retryable ? (nothingLoaded ? 'Could not load data' : 'Data needs refreshing') : 'Data range has been limited'}</Text>{notices.map((notice) => <Text key={notice} style={styles.noticeCopy}>{notice}</Text>)}</View>{retryable && <Pressable accessibilityRole="button" disabled={loading} onPress={() => setAttempt((value) => value + 1)} style={styles.retry}><Text style={styles.link}>{loading ? 'Refreshing…' : 'Try again'}</Text></Pressable>}</View>}


      {coverage && currentSessions.length > 0 && <View onLayout={(event) => { chartY.current.analysis = event.nativeEvent.layout.y }} style={styles.analysis}>
        <View accessibilityLabel="All exercises">
          <View style={styles.heroRow}>
            <Text accessibilityRole="header" style={styles.heroLabel}><Text style={styles.heroStrong}>All exercises</Text> · {summary.averageVolume === null ? 'this week so far' : 'average of full weeks'}</Text>
            <Text style={styles.heroLabel}>Workouts</Text>
          </View>
          <View style={styles.heroRow}>
            <Text numberOfLines={1} style={styles.heroValue}>{formatRoundedVolume(headlineVolume, units)}<Text style={styles.heroUnit}> {units}{summary.averageVolume === null ? '' : ' / week'}</Text></Text>
            <Text style={styles.heroCount}>{summary.workouts}</Text>
          </View>
          {summary.comparable && <View style={[styles.heroRow, styles.heroDeltaRow]}>
            <Text style={styles.heroLabel}>{summary.averageDelta !== null && <><Text style={styles.heroStrong}>{formatPercentChange(summary.averageDelta)}</Text> vs {previousPeriodLabel(rangeDays)}</>}</Text>
            <Text style={[styles.heroLabel, styles.heroStrong]}>{formatCountChange(summary.workouts - summary.previousWorkouts)}</Text>
          </View>}
          <View style={styles.weekly}><WeeklyVolumeChart weeks={summary.weeks} average={summary.averageVolume} units={units} width={chartWidth} /></View>
        </View>
        {summary.muscles.length > 0 && <View>
          <View style={styles.panelHead}><Text accessibilityRole="header" style={styles.panelTitle}>Sets per muscle group</Text><Text style={styles.panelBadge}>{summary.muscleBasis === 'average' ? 'avg / week' : 'this week'}</Text></View>
          <MuscleBars points={summary.muscles} />
          <Text style={styles.note}>Assisting muscles count half.</Text>
        </View>}
        <View>
          <View style={styles.panelHead}><Text accessibilityRole="header" style={styles.panelTitle}>Exercises</Text><Text style={styles.panelBadge}>best set · vs {previousPeriodLabel(rangeDays)}</Text></View>
          {summary.exercises.map((row) => {
            const change = formatSetChange(row.change, units)
            const label = `${row.exerciseName}, best set ${formatBestSet(row.best, units)}${change ? `, ${change}` : ''}`
            const cells = <><Text numberOfLines={1} style={styles.exerciseName}>{row.exerciseName}</Text><Text style={styles.exerciseBest}>{formatBestSet(row.best, units)}</Text><Text numberOfLines={1} style={styles.exerciseChange}>{change}</Text></>
            return chartable.has(row.key)
              ? <Pressable key={row.key} accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Shows this exercise in the weight chart" onPress={() => chartExercise(row.key)} style={styles.exerciseRow}>{cells}<Icon name="chevron-right" size={16} color={colors.mutedSoft} /></Pressable>
              : <View key={row.key} accessible accessibilityLabel={label} style={styles.exerciseRow}>{cells}<View style={styles.chevronSpace} /></View>
          })}
        </View>
        <View onLayout={(event) => { chartY.current.panel = event.nativeEvent.layout.y }} style={styles.panel}>
          {selectedStrength && <View style={styles.pickerGroup}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Chart exercise, ${selectedStrength.exerciseName}`} onPress={() => setPicker('strength')} style={styles.select}>
              <Text numberOfLines={1} style={styles.selectValue}>{selectedStrength.exerciseName}{(exerciseNames.get(selectedStrength.exerciseName) ?? 0) > 1 ? ` · ${selectedStrength.key.startsWith('user:') ? 'mine' : 'shared'}` : ''}</Text>
              <Icon name="chevron-down" />
            </Pressable>
          </View>}
          {!selectedStrength ? <Text style={styles.muted}>No recorded weights above 0 {units} in this range. Add a set weight to see progression.</Text>
            : strengthPoints.length < 3 ? <><Text style={styles.muted}>Chart needs {3 - strengthPoints.length} more {pluralize(3 - strengthPoints.length, 'day', 'days')} with recorded weight.</Text><View accessibilityLabel={`${strengthPoints.length} of 3 days for the chart`} style={styles.markers}>{[0, 1, 2].map((index) => <View key={index} style={[styles.marker, index < strengthPoints.length && styles.markerActive]} />)}</View></>
              : <><View style={styles.strengthInsight}><Text accessibilityLiveRegion="polite" style={styles.strengthLatest}>{inspectedIndex === null ? 'Latest' : `${strengthPoints[inspectedIndex]?.date} ·`} {kgToDisplayWeight(shownStrength, units)} {units}</Text><Text style={styles.strengthDelta}>{strengthDeltaLabel(strengthValues[0] ?? 0, shownStrength, strengthPoints[0]?.date ?? '', units)} · max. {kgToDisplayWeight(Math.max(...strengthValues), units)} {units}</Text></View><StrengthChart points={strengthPoints} keyName={selectedStrengthKey!} units={units} width={chartWidth} onInspect={(index) => setInspected({ key: selectedStrengthKey!, index })} /></>}
        </View>
      </View>}

      {rangeEmpty && <View style={styles.empty}><Text style={styles.emptyTitle}>No workouts in this date range</Text><Text style={styles.muted}>Earlier workouts are still saved.</Text>{rangeDays < 365 && <Pressable accessibilityRole="button" onPress={() => setRangeDays(365)} style={styles.emptyAction}><Text style={styles.link}>Show year</Text></Pressable>}</View>}
      {empty && <View style={styles.empty}><Text style={styles.emptyTitle}>No data</Text><Text style={styles.muted}>Complete a few workouts to see your progress.</Text></View>}
    </ScrollView>
    <ChoiceModal visible={picker === 'strength'} title="Exercise" options={strength.series.map((series) => ({ key: series.key, label: `${series.exerciseName}${(exerciseNames.get(series.exerciseName) ?? 0) > 1 ? ` · ${series.key.startsWith('user:') ? 'mine' : 'shared'}` : ''}` }))} selected={selectedStrengthKey} onSelect={(key) => { setStrengthKey(key); setPicker(null) }} onClose={() => setPicker(null)} />
  <BottomNavigation />
  </SafeAreaView>
}

function ChoiceModal({ visible, title, options, selected, onSelect, onClose }: { visible: boolean; title: string; options: Array<{ key: string; label: string }>; selected: string | null; onSelect: (key: string) => void; onClose: () => void }) {
  return <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose} statusBarTranslucent><View style={styles.modalShade}><View style={styles.modal}><Text accessibilityRole="header" style={styles.modalTitle}>{title}</Text><ScrollView style={styles.modalList}>{options.map((option) => <Pressable key={option.key} accessibilityRole="button" accessibilityState={{ selected: option.key === selected }} onPress={() => onSelect(option.key)} style={styles.modalOption}><Text numberOfLines={2} style={[styles.modalOptionText, option.key === selected && styles.link]}>{option.label}</Text></Pressable>)}</ScrollView><Pressable accessibilityRole="button" onPress={onClose} style={styles.modalClose}><Text style={styles.link}>Cancel</Text></Pressable></View></View></Modal>
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 44 },
  heading: { gap: 12, paddingBottom: 20 }, title: pageTitle, link: { color: colors.accentText, fontFamily: 'InstrumentSans_700Bold', fontSize: 13 }, subtitle: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, lineHeight: 21 }, muted: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, lineHeight: 20 },
  ranges: { flexDirection: 'row', gap: 2, padding: 3, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.035)' }, rangeButton: { flex: 1, minHeight: 44, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderRadius: 9 }, rangeActive: { backgroundColor: colors.choiceSelected }, rangeText: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 13 }, rangeTextActive: { color: colors.text },
  loading: { paddingVertical: 50, alignItems: 'center', gap: 12 }, notice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderColor: 'rgba(244, 238, 232, 0.15)', borderWidth: 1, borderRadius: 8, padding: 12, backgroundColor: 'rgba(244, 238, 232, 0.036)', marginBottom: 14 }, noticeText: { flex: 1 }, noticeTitle: { color: colors.text, fontFamily: 'InstrumentSans_700Bold', fontSize: 13 }, noticeCopy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 11, lineHeight: 16, marginTop: 4 }, retry: { minHeight: 44, justifyContent: 'center' },
  analysis: { gap: 24, marginBottom: 24 }, panel: { }, panelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', minHeight: 28, marginBottom: 4, gap: 12 }, panelTitle: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 17, letterSpacing: -0.2 }, panelBadge: { flexShrink: 1, color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, textAlign: 'right' },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }, heroDeltaRow: { marginTop: 4 }, heroLabel: { flexShrink: 1, color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, lineHeight: 20 }, heroStrong: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold' },
  heroValue: { flexShrink: 1, color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 40, lineHeight: 44, letterSpacing: -1.3, fontVariant: ['tabular-nums'] }, heroUnit: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 18, letterSpacing: 0 }, heroCount: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 26, lineHeight: 44, letterSpacing: -0.4, fontVariant: ['tabular-nums'] }, weekly: { marginTop: 4 },
  note: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, lineHeight: 22, marginTop: 4 },
  exerciseRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }, exerciseName: { flex: 1, color: colors.text, fontFamily: 'InstrumentSans_400Regular', fontSize: 15 }, exerciseBest: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 15, textAlign: 'right', fontVariant: ['tabular-nums'] }, exerciseChange: { width: 68, color: colors.text, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, textAlign: 'right', fontVariant: ['tabular-nums'] }, chevronSpace: { width: 16 },
  pickerGroup: { marginBottom: 2 }, select: { minHeight: 44, alignSelf: 'flex-start', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6 }, selectValue: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 16, flexShrink: 1 }, strengthLatest: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 36, letterSpacing: -0.94, lineHeight: 40, fontVariant: ['tabular-nums'] }, strengthDelta: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, lineHeight: 18, marginTop: 2 }, markers: { flexDirection: 'row', gap: 8, marginTop: 14 }, marker: { flex: 1, height: 8, backgroundColor: '#2c2623', borderRadius: 5 }, markerActive: { backgroundColor: colors.accent },
  strengthInsight: { paddingBottom: 4 },
  empty: { gap: 8, paddingVertical: 22, marginBottom: 15 }, emptyTitle: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 16 }, emptyAction: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' },
  modalShade: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.7)', padding: 22 }, modal: { maxHeight: '70%', backgroundColor: colors.surfaceRaised, borderRadius: 12, borderColor: colors.line, borderWidth: 1, padding: 16 }, modalTitle: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 24, marginBottom: 12 }, modalList: { flexGrow: 0 }, modalOption: { minHeight: 49, justifyContent: 'center', borderBottomColor: colors.line, borderBottomWidth: 1 }, modalOptionText: { color: colors.text, fontFamily: 'InstrumentSans_500Medium', fontSize: 14 }, modalClose: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-end', marginTop: 8 },
})
