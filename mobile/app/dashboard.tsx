import BottomNavigation, { useBottomNavigation } from '../src/BottomNavigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'

import ReadinessHome from '../src/ReadinessHome'
import { useReadinessRuntime } from '../src/readinessRuntime'
import { buildNextSessionRecommendation } from '../../src/shared/nextSessionRecommendation'
import { recommendationHistory } from '../src/readiness'

import grainTexture from '../assets/grain.png'
import { pluralize } from '../../src/lib/pluralize'
import { workoutTitle } from '../../src/lib/workoutCopy'
import { formatCompactVolume } from '../../src/shared/weightUnits'
import { readHome, readTemplates } from '../src/firebase'
import { deriveWorkout, formatExercisePreview, formatWorkoutDuration } from '../src/history'
import { canShowHomeSummary, deriveHome, formatWeekRange, getGreeting } from '../src/home'
import { publishStreak } from '../src/streak'
import { calcStreak } from '../../src/shared/streak'
import { readStateForKey, startRead, type ReadState } from '../src/scopedRead'
import { useActiveRuntime, useAuthRuntime, useOptionalClosureRuntime } from '../src/runtime'
import ActiveWorkoutReturnBar from '../src/ActiveWorkoutReturnBar'
import HistoryHeader from '../src/HistoryHeader'
import { useOptionalLaunchRuntime } from '../src/launchRuntime'
import { firstLaunchableWorkout, selectedWorkout, validateTemplateOverrides, type WorkoutSelection, type WorkoutTemplate } from '../src/workoutLaunch'
import { colors, pageBackground, primaryGradient } from '../src/theme'
import { Icon } from '../src/icons'

type HomeData = Awaited<ReturnType<typeof readHome>>['data']
type TemplateData = WorkoutTemplate[]

export default function DashboardScreen() {
  const { user } = useAuthRuntime()
  const active = useActiveRuntime()
  const closure = useOptionalClosureRuntime()
  const completed = closure?.completed
  const launch = useOptionalLaunchRuntime()
  const readiness = useReadinessRuntime()
  const router = useRouter()
  const navigation = useBottomNavigation()
  const { width } = useWindowDimensions()
  const uid = user?.uid ?? null
  const [result, setResult] = useState<{ key: string; state: ReadState<HomeData> } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [now, setNow] = useState(() => new Date())
  const [templatesResult, setTemplatesResult] = useState<{ key: string; state: ReadState<TemplateData> } | null>(null)
  const [templatesAttempt, setTemplatesAttempt] = useState(0)
  const [selection, setSelection] = useState<{ uid: string; target: WorkoutSelection | null; unavailable: boolean } | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerDraft, setPickerDraft] = useState<WorkoutSelection | null>(null)
  const key = `home:${uid ?? ''}`
  const completion = completed ? `${completed.action}:${completed.action === 'finish' ? completed.workoutId : completed.sessionId}` : ''

  useFocusEffect(useCallback(() => {
    if (!uid) return
    setNow(new Date())
    readiness?.controller.refreshDay()
    return startRead(() => readHome(uid), (state) => setResult({ key, state }))
  }, [uid, key, attempt, completion, readiness?.controller]))

  useFocusEffect(useCallback(() => {
    if (!uid || active.state.status !== 'empty') return
    return startRead(() => readTemplates(uid), (state) => {
      setTemplatesResult({ key: uid, state })
      if (state.status === 'ready') setSelection((current) => {
        if (current?.uid === uid && current.unavailable) return current
        if (current?.uid === uid && selectedWorkout(state.data, current.target)) return current
        return { uid, target: firstLaunchableWorkout(state.data), unavailable: false }
      })
    })
  }, [uid, active.state.status, templatesAttempt]))

  const state = readStateForKey(key, result)
  const data = state.status === 'ready' ? state.data : null
  const showSummary = canShowHomeSummary(state)
  const summary = useMemo(() => data && showSummary ? deriveHome(data.workouts, now) : null, [data, now, showSummary])
  useEffect(() => { if (uid && data && showSummary) publishStreak(uid, calcStreak(data.workouts)) }, [uid, data, showSummary])
  const retry = () => setAttempt((value) => value + 1)
  const confirmedEmpty = state.status === 'ready' && !state.fromCache && data?.workouts.length === 0
  const cacheEmpty = state.status === 'ready' && state.fromCache && data?.workouts.length === 0
  const recent = summary?.recent ?? []
  const goal = data?.profile.weeklyGoal ?? 3
  const units = data?.profile.units ?? 'kg'
  const remaining = Math.max(goal - (summary?.weeklyDone ?? 0), 0)
  const peak = summary?.peakDay
  const maxVolume = Math.max(...(summary?.days.map((day) => day.volume) ?? []), 1)
  const templatesState = readStateForKey(uid ?? '', templatesResult)
  const templates = templatesState.status === 'ready' ? templatesState.data : []
  const chosen = selection?.uid === uid && !selection.unavailable ? selectedWorkout(templates, selection.target) : null
  const canOfferStart = active.state.status === 'empty' && closure?.closure.status === 'ready'
  const launchState = launch?.state.status ?? 'loading'
  const starting = launchState === 'starting'
  const readinessEntry = readiness?.state.status === 'ready' ? readiness.state.entry : null
  const recommendation = useMemo(() => {
    if (active.state.status !== 'empty' || !chosen || !readinessEntry || state.status !== 'ready' || state.fromCache
      || templatesState.status !== 'ready' || templatesState.fromCache || !selection?.target || !data) return null
    try {
      const next = buildNextSessionRecommendation(chosen.template, selection.target.dayIndex, readinessEntry, recommendationHistory(data.workouts), Date.now())
      validateTemplateOverrides(chosen.template, selection.target.dayIndex, next.overrides)
      return next
    } catch { return null }
  }, [active.state.status, chosen, readinessEntry, state, templatesState, selection, data, now])
  const startRecommended = () => {
    readiness?.controller.refreshDay()
    if (!recommendation || !chosen || !selection?.target || readinessEntry?.date !== readiness?.controller.state.date) return
    void launch?.start({ kind: 'template', selection: selection.target, snapshot: chosen.template, overrides: recommendation.overrides })
  }

  useEffect(() => { setNow(new Date()) }, [readiness?.state.date])

  useEffect(() => {
    if (launchState !== 'unavailable' || !uid) return
    setSelection({ uid, target: null, unavailable: true })
    setTemplatesAttempt((value) => value + 1)
  }, [launchState, uid])

  if (!user) return <SafeAreaView edges={['top']} style={styles.screen}><StatusBar style="light" /><Text style={styles.muted}>Restoring sign-in…</Text></SafeAreaView>

  return <SafeAreaView onFocus={navigation.onFocus} onBlur={navigation.onBlur} edges={['top']} style={styles.screen}>
    <StatusBar style="light" />
    <HistoryHeader />
    <ActiveWorkoutReturnBar />
    <ScrollView onScroll={navigation.onScroll} scrollEventThrottle={16} contentContainerStyle={styles.content}>
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
        {!recommendation && <View style={styles.hero}>
          <Text style={styles.date}>{now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
          <Text style={styles.greeting}>{getGreeting(now)},</Text>
          <Text accessibilityRole="header" style={styles.name}>{data.profile.displayName}</Text>
          {active.state.status === 'empty' && recent[0] && <Text style={styles.last}>Last: {workoutTitle(recent[0])} · {new Date(recent[0].startedAt).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}</Text>}
          {canOfferStart && <View style={styles.startStack}>
            {chosen ? <View style={styles.planCard}>
              <View style={styles.planCopy}><Text style={styles.planMeta}>From your plans · {chosen.template.name}</Text><Text style={styles.planDay}>{chosen.day.name}</Text><Text style={styles.planMeta}>{chosen.day.exercises.length} {pluralize(chosen.day.exercises.length, 'exercise', 'exercises')}</Text></View>
              <View style={styles.planActions}>
                <Pressable accessibilityRole="button" disabled={starting || launchState !== 'ready'} onPress={() => selection?.target && void launch?.start({ kind: 'template', selection: selection.target, snapshot: chosen.template })} style={[styles.planPrimary, starting && styles.disabled]}><Text style={styles.planPrimaryText}>{starting ? 'Starting…' : 'Start workout'}</Text><PlayIcon /></Pressable>
                <Pressable accessibilityRole="button" disabled={starting} onPress={() => { setPickerDraft(selection?.target ?? null); setPickerOpen(true) }} style={styles.changeButton}><Text style={styles.changeText}>Change workout</Text></Pressable>
              </View>
            </View> : !chosen ? <View style={styles.planEmpty}><Text style={styles.planEmptyTitle}>{templatesState.status === 'loading' ? 'Loading plans…' : templatesState.status === 'error' ? 'Plans unavailable' : selection?.uid === uid && selection.unavailable ? 'Workout no longer available' : templatesState.fromCache && templates.length === 0 ? 'Could not confirm saved plans' : templates.length === 0 ? 'No plans yet' : 'No workouts in your plans'}</Text><Text style={styles.planEmptyCopy}>{selection?.uid === uid && selection.unavailable ? 'Choose another workout before starting.' : 'You can still start an empty workout.'}</Text>{templatesState.status === 'ready' && templates.some((template) => template.days.some((day) => day.exercises.length > 0)) && <Pressable accessibilityRole="button" onPress={() => { setPickerDraft(selection?.target ?? null); setPickerOpen(true) }} style={styles.changeButton}><Text style={styles.changeText}>Change workout</Text></Pressable>}</View> : null}
            {templatesState.status === 'error' && <Pressable accessibilityRole="button" onPress={() => setTemplatesAttempt((value) => value + 1)} style={styles.retry}><Text style={styles.actionText}>Retry plans</Text></Pressable>}
            {templatesState.status === 'ready' && templatesState.fromCache && <Text style={styles.planEmptyCopy}>Showing plans saved on this device. Starting requires a connection.</Text>}
            <Pressable accessibilityRole="button" disabled={starting || (launchState !== 'ready' && launchState !== 'unavailable')} onPress={() => void launch?.start({ kind: 'empty' })} style={[styles.emptyStart, starting && styles.disabled]}><Icon name="plus" size={15} /><Text style={styles.emptyStartText}>Start empty workout</Text></Pressable>
          </View>}
        </View>}
        {canOfferStart && <View>
            {launchState === 'loading' && <Text style={styles.planEmptyCopy}>Checking workout start…</Text>}
            {(launchState === 'retry' || launchState === 'unavailable' || launchState === 'corrupt') && <View accessibilityRole="alert" style={styles.launchFeedback}><Text style={styles.planEmptyCopy}>{launch?.state.message ?? 'Could not start workout.'}</Text>{launchState !== 'corrupt' && <Pressable accessibilityRole="button" onPress={() => { if (launchState === 'unavailable') { launch?.dismissUnavailable(); setSelection({ uid: uid!, target: null, unavailable: true }); setTemplatesAttempt((value) => value + 1) } else void launch?.retry() }} style={styles.retry}><Text style={styles.actionText}>Try again</Text></Pressable>}</View>}
        </View>}
        {active.state.status === 'empty' && readiness && <ReadinessHome state={readiness.state} controller={readiness.controller}
          recommendation={recommendation} templateName={chosen?.template.name ?? ''} units={units}
          starting={starting} canStart={canOfferStart && launchState === 'ready'} onStart={startRecommended}
          onChange={() => { setPickerDraft(selection?.target ?? null); setPickerOpen(true) }}
          onEdit={() => { if (chosen) router.push({ pathname: '/templates/[id]/edit', params: { id: chosen.template.id } }) }}
          prerequisiteMessage={readinessEntry && chosen && !recommendation ? state.status === 'loading' || templatesState.status === 'loading' ? 'Loading recommendation…' : 'Could not confirm recommendation data. You can still start the selected workout.' : null}
          onRetry={() => { retry(); setTemplatesAttempt(value => value + 1) }} />}
        {showSummary && <View style={styles.week}>
          <View style={styles.sectionHead}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>This week</Text>
            <View style={styles.range}><Text style={styles.rangeDate}>{summary && formatWeekRange(summary.dates)}</Text>{summary && summary.volumeDelta !== null && <Text style={styles.mutedSmall}>{`${summary.volumeDelta >= 0 ? '+' : ''}${summary.volumeDelta}% vs last week`}</Text>}</View>
          </View>
          {summary?.weeklyDone === 0 ? <View style={styles.weekEmpty}>
            <View style={styles.emptySummary}><View style={styles.flex}><Text style={styles.statLabel}>Weekly goal</Text><Text style={styles.muted}>{remaining} {pluralize(remaining, 'session', 'sessions')} to reach your goal.</Text></View><Text style={styles.goalCount}>0/{goal}</Text></View>
            <View style={styles.emptyDays}>{summary.days.map((day) => <View key={day.label} style={[styles.emptyDay, day.isToday && styles.todayDay]}><Text style={[styles.emptyDayLabel, day.isToday && styles.todayLabel]}>{day.label}</Text><Text style={[styles.dayValue, day.isToday && styles.todayLabel]}>{day.date.getDate()}</Text></View>)}</View>
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
          <View style={[styles.sectionHead, styles.historyHead]}><Text accessibilityRole="header" style={styles.sectionTitle}>Recent workouts</Text><Pressable accessibilityRole="button" onPress={() => router.navigate('/history')} style={styles.historyLink}><Text style={styles.historyLinkText}>View history</Text><Chevron /></Pressable></View>
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
    <Modal animationType="fade" transparent visible={pickerOpen && canOfferStart && templatesState.status === 'ready'} onRequestClose={() => setPickerOpen(false)}>
      <View style={styles.pickerOverlay}><View accessibilityLabel="Choose a workout" style={styles.pickerDialog}>
        <View style={styles.pickerHead}><View><Text style={styles.planMeta}>From your plans</Text><Text accessibilityRole="header" style={styles.pickerTitle}>Choose a workout</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close workout picker" onPress={() => setPickerOpen(false)} style={styles.pickerClose}><Icon name="close" size={18} color={colors.textStrong} /></Pressable></View>
        <ScrollView style={styles.pickerPlans}>{templates.map((template) => <View key={template.id} style={styles.pickerPlan}><Text accessibilityRole="header" style={styles.pickerPlanTitle}>{template.name}</Text>{template.days.map((day, index) => { const enabled = day.exercises.length > 0; const selected = pickerDraft?.templateId === template.id && pickerDraft.dayIndex === index; return <Pressable key={`${template.id}:${index}`} accessibilityRole="button" accessibilityLabel={enabled ? `Select ${day.name} from plan ${template.name}` : `${day.name} from plan ${template.name}, no exercises`} accessibilityState={{ selected, disabled: !enabled }} disabled={!enabled} onPress={() => setPickerDraft({ templateId: template.id, dayIndex: index })} style={[styles.pickerDay, selected && styles.pickerDaySelected, !enabled && styles.disabled]}><Text style={styles.pickerDayName}>{day.name}</Text><Text style={styles.planMeta}>{enabled ? `${day.exercises.length} ${pluralize(day.exercises.length, 'exercise', 'exercises')}` : 'No exercises'}</Text></Pressable> })}</View>)}</ScrollView>
        <View style={styles.pickerActions}><Pressable accessibilityRole="button" onPress={() => setPickerOpen(false)} style={styles.pickerCancel}><Text style={styles.changeText}>Cancel</Text></Pressable><Pressable accessibilityRole="button" disabled={!pickerDraft} onPress={() => { if (pickerDraft && uid) { launch?.dismissUnavailable(); setSelection({ uid, target: pickerDraft, unavailable: false }); setPickerOpen(false) } }} style={[styles.pickerChoose, !pickerDraft && styles.disabled]}><Text style={styles.planPrimaryText}>Choose workout</Text></Pressable></View>
      </View></View>
    </Modal>
  <BottomNavigation {...navigation} />
  </SafeAreaView>
}

function Chevron() { return <Svg accessibilityElementsHidden height={15} width={15} viewBox="0 0 24 24"><Path d="m9 18 6-6-6-6" fill="none" stroke={colors.muted} strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" /></Svg> }
function PlayIcon() { return <Svg accessibilityElementsHidden height={15} width={15} viewBox="0 0 24 24"><Path d="m8 5 11 7-11 7z" fill="none" stroke={colors.textStrong} strokeWidth={2.3} strokeLinejoin="round" /></Svg> }
function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.metric}><Text style={styles.statLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View> }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { flexGrow: 1, paddingTop: 26.4, paddingHorizontal: 16, paddingBottom: 28, experimental_backgroundImage: pageBackground }, flex: { flex: 1 },
  grain: { ...StyleSheet.absoluteFill, opacity: 0.024 }, grainImage: { width: '100%', height: '100%' },
  notice: { alignItems: 'flex-start', gap: 12, paddingVertical: 32 }, noticeTitle: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 17 },
  muted: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, lineHeight: 19 }, mutedSmall: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 11.5, lineHeight: 16 },
  retry: { minHeight: 44, justifyContent: 'center' }, actionText: { color: colors.accentText, fontFamily: 'InstrumentSans_700Bold', fontSize: 13 },
  cacheRow: { alignItems: 'flex-start', gap: 4, paddingTop: 10 },
  hero: { borderBottomColor: colors.line, borderBottomWidth: 1, paddingTop: 8, paddingBottom: 24 },
  date: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 12, marginBottom: 12 },
  greeting: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 16, marginBottom: 7 },
  name: { color: colors.textStrong, fontFamily: 'ArchivoHeading', fontSize: 32, lineHeight: 35 },
  last: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, lineHeight: 20, marginTop: 12 },
  startStack: { gap: 12, marginTop: 24 },
  planCard: { minHeight: 88, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, gap: 16, backgroundColor: colors.surfaceRaised, experimental_backgroundImage: 'linear-gradient(135deg, rgba(240, 67, 90, 0.14), transparent 62%)' },
  planCopy: { gap: 2 }, planMeta: { color: colors.muted, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 11.5 },
  planDay: { color: colors.textStrong, fontFamily: 'ArchivoHeading', fontSize: 20, lineHeight: 22, marginVertical: 2 },
  planActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  planPrimary: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 8, paddingHorizontal: 12, backgroundColor: colors.primaryEnd, boxShadow: '0 6px 8px rgba(240, 67, 90, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.18)', experimental_backgroundImage: primaryGradient },
  planPrimaryText: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 12.5 },
  changeButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  changeText: { color: colors.textStrong, fontFamily: 'InstrumentSans_500Medium', fontSize: 12.5 },
  planEmpty: { borderRadius: 14, backgroundColor: colors.surfaceRaised, gap: 4, paddingHorizontal: 16, paddingVertical: 14 },
  planEmptyTitle: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 14 },
  planEmptyCopy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12.5, lineHeight: 18 },
  emptyStart: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', paddingHorizontal: 6 },
  emptyStartText: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 13 },
  launchFeedback: { gap: 4 }, disabled: { opacity: 0.65 },
  week: { paddingVertical: 26 }, sectionHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 18 }, historyHead: { alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, marginBottom: 16 },
  sectionTitle: { color: colors.textStrong, fontFamily: 'ArchivoHeading', fontSize: 24, lineHeight: 26.4 }, range: { alignItems: 'flex-end' }, rangeDate: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 14 },
  weekEmpty: { gap: 14 }, emptySummary: { flexDirection: 'row', gap: 16 }, statLabel: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 11.5 },
  goalCount: { color: colors.textStrong, fontFamily: 'ArchivoHeading', fontSize: 26 }, emptyDays: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.035)', borderRadius: 14, overflow: 'hidden' },
  emptyDay: { flex: 1, alignItems: 'center', gap: 2.88, paddingVertical: 10.4 }, todayDay: { backgroundColor: 'rgba(244,241,242,0.075)', borderRadius: 8 }, emptyDayLabel: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 12, lineHeight: 18 }, dayLabel: { color: colors.mutedSoft, fontFamily: 'InstrumentSans_700Bold', fontSize: 11 }, todayLabel: { color: colors.accentText }, dayValue: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, lineHeight: 18 },
  chart: { backgroundColor: colors.surface, borderRadius: 8, padding: 16 }, chartHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10, marginBottom: 18 },
  volume: { color: colors.textStrong, fontFamily: 'ArchivoHeading', fontSize: 34, lineHeight: 37, marginTop: 7 }, count: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 15, textAlign: 'right' },
  bars: { flexDirection: 'row', gap: 5, height: 162.8, paddingTop: 8 }, barCell: { flex: 1, alignItems: 'center', gap: 6.72 }, barTrack: { height: 108.8, width: '100%', backgroundColor: 'rgba(255,255,255,0.025)', borderRadius: 5.6, justifyContent: 'flex-end', overflow: 'hidden' }, barFill: { width: '100%', borderTopLeftRadius: 5.6, borderTopRightRadius: 5.6 }, barValue: { color: colors.mutedSoft, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 11 },
  signals: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 }, signal: { width: '50%', paddingVertical: 10, paddingRight: 8 }, signalValue: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 15, marginTop: 3, marginBottom: 3 },
  history: { borderTopColor: colors.line, borderTopWidth: 1, paddingTop: 26 }, historyLink: { alignItems: 'center', flexDirection: 'row', gap: 5.6, minHeight: 44, paddingHorizontal: 12 }, historyLinkText: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 14 }, emptyCopy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, paddingVertical: 14 },
  workoutRow: { borderTopColor: colors.line, borderTopWidth: 1, paddingVertical: 16 }, setCount: { color: colors.muted, fontFamily: 'SplineSansMono_600SemiBold', fontSize: 12 }, workoutName: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 18, marginTop: 8, marginBottom: 8 }, pending: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 12, marginTop: 8 }, exercisePreview: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, lineHeight: 17, marginTop: 10 },
  metrics: { flexDirection: 'row', marginTop: 12 }, metric: { flex: 1, paddingVertical: 8 }, metricValue: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 15, marginTop: 5 },
  pickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(11,10,12,0.82)' },
  pickerDialog: { maxHeight: '88%', backgroundColor: colors.surfaceRaised },
  pickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: 16, borderBottomWidth: 1, borderBottomColor: colors.line },
  pickerTitle: { color: colors.textStrong, fontFamily: 'ArchivoHeading', fontSize: 23, marginTop: 3 },
  pickerClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pickerPlans: { paddingHorizontal: 16 }, pickerPlan: { paddingVertical: 16, borderBottomColor: colors.line, borderBottomWidth: 1, gap: 7 },
  pickerPlanTitle: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 14, marginBottom: 3 },
  pickerDay: { minHeight: 52, borderColor: colors.line, borderWidth: 1, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, gap: 2 },
  pickerDaySelected: { borderColor: 'rgba(240,67,90,0.55)', backgroundColor: 'rgba(244,241,242,0.075)' },
  pickerDayName: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 14 },
  pickerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: 16, borderTopColor: colors.line, borderTopWidth: 1 },
  pickerCancel: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  pickerChoose: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: 8, backgroundColor: colors.primaryEnd, boxShadow: '0 6px 8px rgba(240, 67, 90, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.18)', experimental_backgroundImage: primaryGradient },
})
