import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'

import grainTexture from '../assets/grain.png'
import { pluralize } from '../../src/lib/pluralize'
import { workoutTitle } from '../../src/lib/workoutCopy'
import { formatCompactVolume } from '../../src/shared/weightUnits'
import { readHome } from '../src/firebase'
import { deriveWorkout, formatExercisePreview, formatWorkoutDuration } from '../src/history'
import { canShowHomeSummary, deriveHome, formatWeekRange, getGreeting } from '../src/home'
import { readStateForKey, startRead, type ReadState } from '../src/scopedRead'
import { useActiveRuntime, useAuthRuntime, useOptionalClosureRuntime } from '../src/runtime'
import ActiveWorkoutReturnBar from '../src/ActiveWorkoutReturnBar'
import HistoryHeader from '../src/HistoryHeader'

type HomeData = Awaited<ReturnType<typeof readHome>>['data']
const colors = {
  background: '#111012', surface: '#1a191c', text: '#f4f1f2', strong: '#fff', muted: '#a09aa0',
  mutedSoft: '#8f8990', accent: '#f0435a', accentText: '#ff7182', line: 'rgba(244,241,242,0.12)',
}

export default function DashboardScreen() {
  const { user } = useAuthRuntime()
  const active = useActiveRuntime()
  const completed = useOptionalClosureRuntime()?.completed
  const router = useRouter()
  const { width } = useWindowDimensions()
  const uid = user?.uid ?? null
  const [result, setResult] = useState<{ key: string; state: ReadState<HomeData> } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [now, setNow] = useState(() => new Date())
  const key = `home:${uid ?? ''}`
  const completion = completed ? `${completed.action}:${completed.action === 'finish' ? completed.workoutId : completed.sessionId}` : ''

  useFocusEffect(useCallback(() => {
    if (!uid) return
    setNow(new Date())
    return startRead(() => readHome(uid), (state) => setResult({ key, state }))
  }, [uid, key, attempt, completion]))

  const state = readStateForKey(key, result)
  const data = state.status === 'ready' ? state.data : null
  const showSummary = canShowHomeSummary(state)
  const summary = useMemo(() => data && showSummary ? deriveHome(data.workouts, now) : null, [data, now, showSummary])
  const retry = () => setAttempt((value) => value + 1)
  const confirmedEmpty = state.status === 'ready' && !state.fromCache && data?.workouts.length === 0
  const cacheEmpty = state.status === 'ready' && state.fromCache && data?.workouts.length === 0
  const recent = summary?.recent ?? []
  const goal = data?.profile.weeklyGoal ?? 3
  const units = data?.profile.units ?? 'kg'
  const remaining = Math.max(goal - (summary?.weeklyDone ?? 0), 0)
  const peak = summary?.peakDay
  const maxVolume = Math.max(...(summary?.days.map((day) => day.volume) ?? []), 1)

  if (!user) return <SafeAreaView edges={['top']} style={styles.screen}><StatusBar style="light" /><Text style={styles.muted}>Restoring sign-in…</Text></SafeAreaView>

  return <SafeAreaView edges={['top']} style={styles.screen}>
    <StatusBar style="light" />
    <HistoryHeader />
    <ActiveWorkoutReturnBar />
    <ScrollView contentContainerStyle={styles.content}>
      <View pointerEvents="none" style={styles.grain}><Image accessibilityElementsHidden resizeMode="repeat" source={grainTexture} style={styles.grainImage} /></View>
      {state.status === 'loading' && <View style={styles.notice}><ActivityIndicator color={colors.accent} /><Text style={styles.muted}>Loading dashboard…</Text></View>}
      {state.status === 'error' && <View accessibilityRole="alert" style={styles.notice}>
        <Text style={styles.noticeTitle}>Could not load the dashboard</Text>
        <Text style={styles.muted}>Could not load data. Try again.</Text>
        <Pressable accessibilityRole="button" onPress={retry} style={styles.retry}><Text style={styles.actionText}>Try again</Text></Pressable>
      </View>}
      {data && <>
        {state.status === 'ready' && state.fromCache && <View accessibilityRole="alert" style={styles.cacheRow}>
          <Text style={styles.muted}>{cacheEmpty ? 'Could not confirm your saved workouts. This device has no copy to check offline.' : 'Showing data saved on this device.'}</Text>
          <Pressable accessibilityRole="button" onPress={retry} style={styles.retry}><Text style={styles.actionText}>Try again</Text></Pressable>
        </View>}
        <View style={styles.hero}>
          <Text style={styles.date}>{now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
          <Text style={styles.greeting}>{getGreeting(now)},</Text>
          <Text accessibilityRole="header" style={styles.name}>{data.profile.displayName}</Text>
          {active.state.status === 'empty' && recent[0] && <Text style={styles.last}>Last: {workoutTitle(recent[0])} · {new Date(recent[0].startedAt).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}</Text>}
        </View>
        {showSummary && <View style={styles.week}>
          <View style={styles.sectionHead}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>This week</Text>
            <View style={styles.range}><Text style={styles.rangeDate}>{summary && formatWeekRange(summary.dates)}</Text><Text style={styles.mutedSmall}>{summary?.volumeDelta === null ? 'no comparison' : `${summary?.volumeDelta && summary.volumeDelta >= 0 ? '+' : ''}${summary?.volumeDelta}% vs last week`}</Text></View>
          </View>
          {summary?.weeklyDone === 0 ? <View style={styles.weekEmpty}>
            <View style={styles.emptySummary}><View style={styles.flex}><Text style={styles.statLabel}>Weekly goal</Text><Text style={styles.muted}>{remaining} {pluralize(remaining, 'session', 'sessions')} to reach your goal.</Text></View><Text style={styles.goalCount}>0/{goal}</Text></View>
            <View style={styles.emptyDays}>{summary.days.map((day) => <View key={day.label} style={[styles.emptyDay, day.isToday && styles.todayDay]}><Text style={[styles.dayLabel, day.isToday && styles.todayLabel]}>{day.label}</Text><Text style={styles.dayValue}>{day.date.getDate()}</Text></View>)}</View>
          </View> : summary && <>
            <View style={styles.chart}>
              <View style={styles.chartHead}><View><Text style={styles.statLabel}>Weekly volume</Text><Text style={styles.volume}>{formatCompactVolume(summary.weeklyVolume, units)}</Text></View><View><Text style={styles.count}>{summary.weeklyDone}/{goal}</Text><Text style={styles.mutedSmall}>sessions / goal</Text></View></View>
              <View style={styles.bars}>{summary.days.map((day) => <View key={day.label} style={styles.barCell}><View style={styles.barTrack}><View style={[styles.barFill, { height: `${day.volume > 0 ? Math.max(18, Math.round(day.volume / maxVolume * 100)) : 8}%`, backgroundColor: day.volume > 0 ? undefined : 'rgba(255,255,255,0.035)', experimental_backgroundImage: day.isToday ? 'linear-gradient(180deg, rgba(240, 67, 90, 0.96) 0%, rgba(240, 67, 90, 0.2) 100%)' : day.volume > 0 ? 'linear-gradient(180deg, rgba(143, 184, 160, 0.9) 0%, rgba(143, 184, 160, 0.16) 100%)' : undefined }]} /></View><Text style={[styles.dayLabel, day.isToday && styles.todayLabel]}>{day.label}</Text><Text style={styles.barValue}>{day.volume > 0 ? formatCompactVolume(day.volume, units).replace(` ${units}`, '') : '—'}</Text></View>)}</View>
            </View>
            <View style={styles.signals}>
              {[
                ['Weekly goal', `${summary.weeklyDone}/${goal}`, summary.weeklyDone >= goal ? 'Goal reached.' : `${remaining} ${pluralize(remaining, 'session', 'sessions')} to reach this week’s goal.`],
                ['Schedule', `${summary.activeDays}/7 days`, `${summary.sessionsDelta > 0 ? '+' : ''}${summary.sessionsDelta === 0 ? 'No change' : summary.sessionsDelta} compared with last week`],
                ['Strong day', peak?.volume ? peak.label : 'None', peak?.volume ? `${formatCompactVolume(peak.volume, units)} • ${peak.sets} ${pluralize(peak.sets, 'set', 'sets')}` : 'No workouts this week'],
                ['Average session', summary.averageMinutes ? `${summary.averageMinutes} min` : '—', summary.averageVolume ? `${formatCompactVolume(summary.averageVolume, units)} per workout` : 'No average this week'],
              ].map(([label, value, copy]) => <View key={label} style={styles.signal}><Text style={styles.statLabel}>{label}</Text><Text style={styles.signalValue}>{value}</Text>{width > 520 && <Text style={styles.mutedSmall}>{copy}</Text>}</View>)}
            </View>
          </>}
        </View>}
        <View style={styles.history}>
          <View style={styles.sectionHead}><Text accessibilityRole="header" style={styles.sectionTitle}>{recent.length ? 'Recent workouts' : 'History'}</Text><Pressable accessibilityRole="button" onPress={() => router.navigate('/history')} style={styles.historyLink}><Text style={styles.actionText}>View history</Text><Chevron /></Pressable></View>
          {confirmedEmpty && <Text style={styles.emptyCopy}>Your first saved workout will appear here.</Text>}
          {recent.map((workout) => {
            const metrics = deriveWorkout(workout, new Map())
            return <Pressable key={workout.id} accessibilityRole="button" accessibilityLabel={`Open workout ${workoutTitle(workout)}`} onPress={() => router.push({ pathname: '/workout/[workoutId]', params: { workoutId: workout.id } })} style={styles.workoutRow}>
              <Text style={styles.setCount}>{metrics.totalSets} {pluralize(metrics.totalSets, 'set', 'sets')}</Text>
              <Text numberOfLines={2} style={styles.workoutName}>{workoutTitle(workout)}</Text>
              <Text style={styles.mutedSmall}>{new Date(workout.startedAt).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
              {!workout.materialized && <Text style={styles.pending}>Workout saved. Stats are still processing.</Text>}
              {workoutTitle(workout) !== workout.exercises.map((exercise) => exercise.name.trim()).join(' + ') && <Text numberOfLines={2} style={styles.exercisePreview}>{formatExercisePreview(workout.exercises.map((exercise) => exercise.name))}</Text>}
              <View style={styles.metrics}><Metric label="Volume" value={formatCompactVolume(metrics.totalVolume, units)} /><Metric label="Exercises" value={String(workout.exercises.length)} /><Metric label="Time" value={formatWorkoutDuration(workout.startedAt, workout.finishedAt)} /></View>
            </Pressable>
          })}
        </View>
      </>}
    </ScrollView>
  </SafeAreaView>
}

function Chevron() { return <Svg accessibilityElementsHidden height={15} width={15} viewBox="0 0 24 24"><Path d="m9 18 6-6-6-6" fill="none" stroke={colors.accentText} strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" /></Svg> }
function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.metric}><Text style={styles.statLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View> }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 28, experimental_backgroundImage: 'linear-gradient(115deg, rgba(240, 67, 90, 0.055) 0%, transparent 26%, transparent 68%, rgba(143, 184, 160, 0.065) 100%), linear-gradient(180deg, #0b0a0c 0%, #111012 42%, #0d0c0e 100%)' }, flex: { flex: 1 },
  grain: { ...StyleSheet.absoluteFill, opacity: 0.024 }, grainImage: { width: '100%', height: '100%' },
  notice: { alignItems: 'flex-start', gap: 12, paddingVertical: 32 }, noticeTitle: { color: colors.strong, fontFamily: 'InstrumentSans_700Bold', fontSize: 17 },
  muted: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, lineHeight: 19 }, mutedSmall: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 11.5, lineHeight: 16 },
  retry: { minHeight: 44, justifyContent: 'center' }, actionText: { color: colors.accentText, fontFamily: 'InstrumentSans_700Bold', fontSize: 13 },
  cacheRow: { alignItems: 'flex-start', gap: 4, paddingTop: 10 },
  hero: { borderBottomColor: colors.line, borderBottomWidth: 1, paddingTop: 8, paddingBottom: 24 },
  date: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 11.5, marginBottom: 12 },
  greeting: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 16, marginBottom: 7 },
  name: { color: colors.strong, fontFamily: 'ArchivoHeading', fontSize: 32, lineHeight: 35 },
  last: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, lineHeight: 20, marginTop: 12 },
  week: { paddingVertical: 26 }, sectionHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 18 },
  sectionTitle: { color: colors.strong, fontFamily: 'ArchivoHeading', fontSize: 22, lineHeight: 25 }, range: { alignItems: 'flex-end' }, rangeDate: { color: colors.strong, fontFamily: 'InstrumentSans_700Bold', fontSize: 14 },
  weekEmpty: { gap: 14 }, emptySummary: { flexDirection: 'row', gap: 16 }, statLabel: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 11.5 },
  goalCount: { color: colors.strong, fontFamily: 'ArchivoHeading', fontSize: 26 }, emptyDays: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 14, overflow: 'hidden' },
  emptyDay: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 12 }, todayDay: { backgroundColor: 'rgba(240,67,90,0.12)' }, dayLabel: { color: colors.mutedSoft, fontFamily: 'InstrumentSans_700Bold', fontSize: 10.5 }, todayLabel: { color: colors.accentText }, dayValue: { color: colors.muted, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 11 },
  chart: { backgroundColor: colors.surface, borderRadius: 8, padding: 16 }, chartHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10, marginBottom: 18 },
  volume: { color: colors.strong, fontFamily: 'ArchivoHeading', fontSize: 34, lineHeight: 37, marginTop: 7 }, count: { color: colors.strong, fontFamily: 'InstrumentSans_700Bold', fontSize: 15, textAlign: 'right' },
  bars: { flexDirection: 'row', gap: 5, height: 152, paddingTop: 8 }, barCell: { flex: 1, alignItems: 'center', gap: 6 }, barTrack: { flex: 1, width: '100%', backgroundColor: 'rgba(255,255,255,0.025)', borderRadius: 5.6, justifyContent: 'flex-end', overflow: 'hidden' }, barFill: { width: '100%', borderTopLeftRadius: 5.6, borderTopRightRadius: 5.6 }, barValue: { color: colors.mutedSoft, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 10.5 },
  signals: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 }, signal: { width: '50%', paddingVertical: 10, paddingRight: 8 }, signalValue: { color: colors.strong, fontFamily: 'InstrumentSans_700Bold', fontSize: 15, marginTop: 3, marginBottom: 3 },
  history: { borderTopColor: colors.line, borderTopWidth: 1, paddingTop: 26 }, historyLink: { alignItems: 'center', flexDirection: 'row', gap: 3, minHeight: 44 }, emptyCopy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, paddingVertical: 14 },
  workoutRow: { borderTopColor: colors.line, borderTopWidth: 1, paddingVertical: 16 }, setCount: { color: colors.muted, fontFamily: 'SplineSansMono_600SemiBold', fontSize: 12 }, workoutName: { color: colors.strong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 18, marginTop: 8, marginBottom: 8 }, pending: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 12, marginTop: 8 }, exercisePreview: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, lineHeight: 17, marginTop: 10 },
  metrics: { flexDirection: 'row', marginTop: 12 }, metric: { flex: 1, paddingVertical: 8 }, metricValue: { color: colors.strong, fontFamily: 'InstrumentSans_700Bold', fontSize: 15, marginTop: 5 },
})
