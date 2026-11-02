import BottomNavigation, { useBottomNavigation } from '../src/BottomNavigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'

import ReadinessHome from '../src/ReadinessHome'
import { useReadinessRuntime } from '../src/readinessRuntime'
import { buildNextSessionRecommendation } from '../../src/shared/nextSessionRecommendation'
import { recommendationHistory } from '../src/readiness'

import { TrainCoverMedia } from '../src/TrainCoverMedia'
import { deriveWorkout } from '../src/history'
import { latestRecord, recordLine } from '../../src/shared/workoutMoments'
import { weekdayLabel } from '../../src/shared/week'
import { pluralize } from '../../src/lib/pluralize'
import { workoutTitle } from '../../src/lib/workoutCopy'
import { formatCompactVolume, kgStringToDisplayWeight } from '../../src/shared/weightUnits'
import { workoutCover } from '../../src/shared/workoutCover'
import { readHome, readTemplates } from '../src/firebase'
import { canShowHomeSummary, deriveHome, getGreeting } from '../src/home'
import { publishStreak } from '../src/streak'
import { calcStreak } from '../../src/shared/streak'
import { readStateForKey, startRead, type ReadState } from '../src/scopedRead'
import { useActiveRuntime, useAuthRuntime, useOptionalClosureRuntime } from '../src/runtime'
import { ResumeButton } from '../src/ActiveWorkoutReturnBar'
import HistoryHeader from '../src/HistoryHeader'
import { useOptionalLaunchRuntime } from '../src/launchRuntime'
import { firstLaunchableWorkout, selectedWorkout, validateTemplateOverrides, type WorkoutSelection, type WorkoutTemplate } from '../src/workoutLaunch'
import { colors, primaryGradient } from '../src/theme'
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
  const uid = user?.uid ?? null
  const [result, setResult] = useState<{ key: string; state: ReadState<HomeData> } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [now, setNow] = useState(() => new Date())
  const [templatesResult, setTemplatesResult] = useState<{ key: string; state: ReadState<TemplateData> } | null>(null)
  const [templatesAttempt, setTemplatesAttempt] = useState(0)
  const [selection, setSelection] = useState<{ uid: string; target: WorkoutSelection | null; unavailable: boolean } | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerDraft, setPickerDraft] = useState<WorkoutSelection | null>(null)
  const [picked, setPicked] = useState(false)
  const [weekOpen, setWeekOpen] = useState(false)
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
  const cacheEmpty = state.status === 'ready' && state.fromCache && data?.workouts.length === 0
  const recent = summary?.recent ?? []
  const goal = data?.profile.weeklyGoal ?? 3
  const units = data?.profile.units ?? 'kg'
  const templatesState = readStateForKey(uid ?? '', templatesResult)
  const templates = templatesState.status === 'ready' ? templatesState.data : []
  // A new account has nothing to start from a plan, so an empty workout is the main action.
  const noPlans = templatesState.status === 'ready' && !templatesState.fromCache && templates.length === 0
  const chosen = selection?.uid === uid && !selection.unavailable ? selectedWorkout(templates, selection.target) : null
  const canOfferStart = active.state.status === 'empty' && closure?.closure.status === 'ready'
  const plansPending = active.state.status === 'loading' || (canOfferStart && templatesState.status === 'loading')
  // Picking a workout means the next session matters more than the finished week.
  const weekClosed = Boolean(summary) && !plansPending && canOfferStart && !picked && (summary?.weeklyDone ?? 0) >= goal
  const coverName = active.state.status === 'ready' ? workoutCover(active.state.session.label) : weekClosed ? 'week' : workoutCover(chosen?.day.name ?? chosen?.template.name)
  const record = data ? latestRecord(data.workouts, now.getTime()) : null
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
    <ScrollView onScroll={navigation.onScroll} scrollEventThrottle={16} contentContainerStyle={styles.content}>
      {state.status === 'loading' && <View style={styles.notice}><ActivityIndicator color={colors.accent} /><Text style={styles.muted}>Loading dashboard…</Text></View>}
      {state.status === 'error' && <View accessibilityRole="alert" style={styles.notice}>
        <Text style={styles.noticeTitle}>Could not load the dashboard</Text>
        <Text style={styles.muted}>Could not load data. Try again.</Text>
        <Pressable accessibilityRole="button" onPress={retry} style={styles.retry}><Text style={styles.actionText}>Try again</Text></Pressable>
      </View>}
      {data && <>
        <View style={styles.cover}>
          {!plansPending && <TrainCoverMedia key={coverName} cover={coverName} />}
          <View pointerEvents="none" style={styles.coverFade} />
          <View style={styles.coverCopy}>
            <Text style={styles.coverMeta}>{now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
            <Text accessibilityRole="header" style={styles.coverTitle}>{plansPending ? ' ' : active.state.status === 'ready' ? active.state.session.label?.trim() || 'Workout' : weekClosed ? 'Week done' : chosen?.day.name ?? `${getGreeting(now)}, ${data.profile.displayName}`}</Text>
            {plansPending ? <Text style={styles.coverMeta}> </Text> : weekClosed ? <Text style={styles.coverMeta}>{summary?.weeklyDone} of {goal} workouts · {formatCompactVolume(summary?.weeklyVolume ?? 0, units)}</Text> : chosen ? <Text style={styles.coverMeta}>{chosen.template.name} · Day {(selection?.target?.dayIndex ?? 0) + 1} of {chosen.template.days.length}</Text>
              : active.state.status === 'empty' && recent[0] && <Text style={styles.coverMeta}>Last: {workoutTitle(recent[0])} · {new Date(recent[0].startedAt).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}</Text>}
          </View>
          {record && <View pointerEvents="none" style={styles.coverSeam} />}
        </View>
        {state.status === 'ready' && state.fromCache && <View accessibilityRole="alert" style={styles.cacheRow}>
          <Text style={styles.muted}>{cacheEmpty ? 'Could not confirm your saved workouts. This device has no copy to check offline.' : 'Showing data saved on this device.'}</Text>
          <Pressable accessibilityRole="button" onPress={retry} style={styles.retry}><Text style={styles.actionText}>Try again</Text></Pressable>
        </View>}
        <View style={styles.plan}>
          {record && <Text style={styles.record}>{recordLine(record, now, (kg) => `${kgStringToDisplayWeight(String(kg), units)} ${units}`)}</Text>}
          {plansPending && <View style={styles.planPending} />}
          {weekClosed && [...(summary?.weekly ?? [])].reverse().map((workout) => <Pressable key={workout.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/workout/[workoutId]', params: { workoutId: workout.id } })} style={styles.exercise}>
            <Text numberOfLines={1} style={styles.exerciseName}>{weekdayLabel(workout.startedAt)} · {workoutTitle(workout)}</Text>
            <Text style={styles.exerciseMeta}>{formatCompactVolume(deriveWorkout(workout, new Map()).totalVolume, units)}</Text>
          </Pressable>)}
          {!weekClosed && chosen && !recommendation && chosen.day.exercises.map((exercise, index) => <Pressable key={`${exercise.exerciseSource}:${exercise.exerciseId}:${index}`} accessibilityRole="button" onPress={() => router.push({ pathname: '/exercises/[source]/[id]', params: { source: exercise.exerciseSource, id: exercise.exerciseId } })} style={styles.exercise}>
            <Text numberOfLines={1} style={styles.exerciseName}>{exercise.name}</Text>
            <Text style={styles.exerciseMeta}>{exercise.sets} × {exercise.targetReps}{exercise.targetWeight > 0 && <> · <Text style={styles.exerciseWeight}>{kgStringToDisplayWeight(String(exercise.targetWeight), units)} {units}</Text></>}</Text>
          </Pressable>)}
          {canOfferStart && !chosen && !plansPending && <View style={styles.planEmpty}><Text style={styles.planEmptyTitle}>{templatesState.status === 'loading' ? 'Loading plans…' : templatesState.status === 'error' ? 'Plans unavailable' : selection?.uid === uid && selection.unavailable ? 'Workout no longer available' : templatesState.fromCache && templates.length === 0 ? 'Could not confirm saved plans' : templates.length === 0 ? 'No plans yet' : 'No workouts in your plans'}</Text><Text style={styles.planEmptyCopy}>{selection?.uid === uid && selection.unavailable ? 'Choose another workout before starting.' : 'You can still start an empty workout.'}</Text></View>}
          {canOfferStart && templatesState.status === 'error' && <Pressable accessibilityRole="button" onPress={() => setTemplatesAttempt((value) => value + 1)} style={styles.retry}><Text style={styles.actionText}>Retry plans</Text></Pressable>}
          {canOfferStart && templatesState.status === 'ready' && templatesState.fromCache && <Text style={styles.planEmptyCopy}>Showing plans saved on this device. Starting requires a connection.</Text>}
          <View style={styles.links}>
            <Pressable accessibilityRole="button" onPress={() => router.navigate('/templates')} style={styles.link}><Text style={styles.linkText}>Plans</Text></Pressable>
            {canOfferStart && templatesState.status === 'ready' && templates.some((template) => template.days.some((day) => day.exercises.length > 0)) && <Pressable accessibilityRole="button" disabled={starting} onPress={() => { setPickerDraft(selection?.target ?? null); setPickerOpen(true) }} style={styles.link}><Text style={styles.linkText}>Change workout</Text></Pressable>}
            {canOfferStart && !noPlans && <Pressable accessibilityRole="button" disabled={starting || (launchState !== 'ready' && launchState !== 'unavailable')} onPress={() => void launch?.start({ kind: 'empty' })} style={styles.link}><Text style={styles.linkText}>Empty workout</Text></Pressable>}
          </View>
        </View>
        {canOfferStart && <View>
            {launchState === 'loading' && <Text style={styles.planEmptyCopy}>Checking workout start…</Text>}
            {(launchState === 'retry' || launchState === 'unavailable' || launchState === 'corrupt') && <View accessibilityRole="alert" style={styles.launchFeedback}><Text style={styles.planEmptyCopy}>{launch?.state.message ?? 'Could not start workout.'}</Text>{launchState !== 'corrupt' && <Pressable accessibilityRole="button" onPress={() => { if (launchState === 'unavailable') { launch?.dismissUnavailable(); setSelection({ uid: uid!, target: null, unavailable: true }); setTemplatesAttempt((value) => value + 1) } else void launch?.retry() }} style={styles.retry}><Text style={styles.actionText}>Try again</Text></Pressable>}</View>}
        </View>}
        {showSummary && summary && <View style={styles.week}>
          <View style={styles.weekHead}><Text accessibilityRole="header" style={styles.weekTitle}>This week</Text><Text style={styles.weekMeta}>{summary.weeklyDone} of {goal}{summary.weeklyVolume > 0 ? ` · ${formatCompactVolume(summary.weeklyVolume, units)}` : ''}</Text></View>
          <View accessibilityLabel="Days of the current week" style={styles.days}>{summary.days.map((day) => <View key={day.label} style={[styles.day, day.workouts > 0 && styles.dayDone, day.isToday && styles.dayToday]}><Text style={[styles.dayLabel, (day.workouts > 0 || day.isToday) && styles.dayLabelOn]}>{day.label.charAt(0)}</Text></View>)}</View>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: weekOpen }} onPress={() => setWeekOpen((open) => !open)} style={styles.link}><Text style={styles.linkText}>Week details</Text></Pressable>
          {weekOpen && <View style={styles.signals}>{[
            ['Schedule', `${summary.activeDays}/7 days`, `${summary.sessionsDelta > 0 ? '+' : ''}${summary.sessionsDelta === 0 ? 'No change' : summary.sessionsDelta} compared with last week`],
            ['Strong day', summary.peakDay?.volume ? summary.peakDay.label : 'None', summary.peakDay?.volume ? `${formatCompactVolume(summary.peakDay.volume, units)} • ${summary.peakDay.sets} ${pluralize(summary.peakDay.sets, 'set', 'sets')}` : 'No workouts this week'],
            ['Average session', summary.averageMinutes ? `${summary.averageMinutes} min` : '—', summary.averageVolume ? `${formatCompactVolume(summary.averageVolume, units)} per workout` : 'No average this week'],
            ['Volume', formatCompactVolume(summary.weeklyVolume, units), summary.volumeDelta === null ? 'No change data yet' : `${summary.volumeDelta >= 0 ? '+' : ''}${summary.volumeDelta}% vs last week`],
          ].map(([label, value, copy]) => <View key={label} style={styles.signal}><Text style={styles.signalLabel}>{label}</Text><Text style={styles.signalValue}>{value}</Text><Text style={styles.signalCopy}>{copy}</Text></View>)}</View>}
        </View>}
        {active.state.status === 'empty' && readiness && <ReadinessHome state={readiness.state} controller={readiness.controller}
          recommendation={recommendation} templateName={chosen?.template.name ?? ''} units={units}
          starting={starting} canStart={canOfferStart && launchState === 'ready'} onStart={startRecommended}
          onChange={() => { setPickerDraft(selection?.target ?? null); setPickerOpen(true) }}
          onEdit={() => { if (chosen) router.push({ pathname: '/templates/[id]/edit', params: { id: chosen.template.id } }) }}
          prerequisiteMessage={readinessEntry && chosen && !recommendation ? state.status === 'loading' || templatesState.status === 'loading' ? 'Loading recommendation…' : 'Could not confirm recommendation data. You can still start the selected workout.' : null}
          onRetry={() => { retry(); setTemplatesAttempt(value => value + 1) }} />}
      </>}
    </ScrollView>
    {data && active.state.status === 'ready' && <View style={styles.startBar}><ResumeButton /></View>}
    {data && (canOfferStart || plansPending) && !recommendation && <View style={styles.startBar}>
      {plansPending ? <View style={styles.startPending} /> : chosen
        ? <Pressable accessibilityRole="button" disabled={starting || launchState !== 'ready'} onPress={() => selection?.target && void launch?.start({ kind: 'template', selection: selection.target, snapshot: chosen.template })} style={[styles.start, starting && styles.disabled]}><Text style={styles.startText}>{starting ? 'Starting…' : `Start ${chosen.day.name}`}</Text></Pressable>
        : <Pressable accessibilityRole="button" disabled={starting || (launchState !== 'ready' && launchState !== 'unavailable')} onPress={() => void launch?.start({ kind: 'empty' })} style={[styles.start, starting && styles.disabled]}><Text style={styles.startText}>{starting ? 'Starting…' : 'Start empty workout'}</Text></Pressable>}
    </View>}
    <Modal animationType="fade" transparent visible={pickerOpen && canOfferStart && templatesState.status === 'ready'} onRequestClose={() => setPickerOpen(false)}>
      <View style={styles.pickerOverlay}><View accessibilityLabel="Choose a workout" style={styles.pickerDialog}>
        <View style={styles.pickerHead}><View><Text style={styles.planMeta}>From your plans</Text><Text accessibilityRole="header" style={styles.pickerTitle}>Choose a workout</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close workout picker" onPress={() => setPickerOpen(false)} style={styles.pickerClose}><Icon name="close" size={18} color={colors.textStrong} /></Pressable></View>
        <ScrollView style={styles.pickerPlans}>{templates.map((template) => <View key={template.id} style={styles.pickerPlan}><Text accessibilityRole="header" style={styles.pickerPlanTitle}>{template.name}</Text>{template.days.map((day, index) => { const enabled = day.exercises.length > 0; const selected = pickerDraft?.templateId === template.id && pickerDraft.dayIndex === index; return <Pressable key={`${template.id}:${index}`} accessibilityRole="button" accessibilityLabel={enabled ? `Select ${day.name} from plan ${template.name}` : `${day.name} from plan ${template.name}, no exercises`} accessibilityState={{ selected, disabled: !enabled }} disabled={!enabled} onPress={() => setPickerDraft({ templateId: template.id, dayIndex: index })} style={[styles.pickerDay, selected && styles.pickerDaySelected, !enabled && styles.disabled]}><Text style={styles.pickerDayName}>{day.name}</Text><Text style={styles.planMeta}>{enabled ? `${day.exercises.length} ${pluralize(day.exercises.length, 'exercise', 'exercises')}` : 'No exercises'}</Text></Pressable> })}</View>)}</ScrollView>
        <View style={styles.pickerActions}><Pressable accessibilityRole="button" onPress={() => setPickerOpen(false)} style={styles.pickerCancel}><Text style={styles.changeText}>Cancel</Text></Pressable><Pressable accessibilityRole="button" disabled={!pickerDraft} onPress={() => { if (pickerDraft && uid) { launch?.dismissUnavailable(); setSelection({ uid, target: pickerDraft, unavailable: false }); setPicked(true); setPickerOpen(false) } }} style={[styles.pickerChoose, !pickerDraft && styles.disabled]}><Text style={styles.planPrimaryText}>Choose workout</Text></Pressable></View>
      </View></View>
    </Modal>
  <BottomNavigation {...navigation} />
  </SafeAreaView>
}


const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { flexGrow: 1, paddingTop: 26.4, paddingHorizontal: 16, paddingBottom: 28 },
  notice: { alignItems: 'flex-start', gap: 12, paddingVertical: 32 }, noticeTitle: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 17 },
  muted: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, lineHeight: 19 },
  retry: { minHeight: 44, justifyContent: 'center' }, actionText: { color: colors.accentText, fontFamily: 'InstrumentSans_700Bold', fontSize: 13 },
  cacheRow: { alignItems: 'flex-start', gap: 4, paddingTop: 14 },
  cover: { height: 248, marginTop: -26.4, marginHorizontal: -16, overflow: 'hidden' },
  coverSeam: { position: 'absolute', left: 16, right: 16, bottom: 0, height: 2.5, backgroundColor: colors.seam },
  record: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14, marginBottom: 4 },
  coverFade: { ...StyleSheet.absoluteFill, experimental_backgroundImage: `linear-gradient(180deg, transparent 40%, ${colors.background}b8 72%, ${colors.background} 100%)` },
  coverCopy: { position: 'absolute', left: 16, right: 16, bottom: 4 }, coverMeta: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, lineHeight: 20 },
  coverTitle: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 36, lineHeight: 40, letterSpacing: -1 },
  plan: { gap: 4, marginTop: 18 }, exercise: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 40 },
  exerciseName: { flex: 1, color: colors.text, fontFamily: 'InstrumentSans_400Regular', fontSize: 15 }, exerciseMeta: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, fontVariant: ['tabular-nums'] }, exerciseWeight: { color: colors.text, fontFamily: 'InstrumentSans_500Medium' },
  planPending: { height: 216 }, startPending: { height: 52 },
  links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 20 }, link: { minHeight: 44, justifyContent: 'center' }, linkText: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 14 },
  planEmpty: { gap: 4, paddingVertical: 8 }, planEmptyTitle: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 14 },
  planEmptyCopy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12.5, lineHeight: 18 },
  launchFeedback: { gap: 4 }, disabled: { opacity: 0.65 },
  startBar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2 }, start: { height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: colors.primaryEnd, experimental_backgroundImage: primaryGradient, boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.5), 0 2px 8px rgba(0, 0, 0, 0.35)' }, startText: { color: colors.onPrimary, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 16 },
  week: { paddingTop: 18, paddingBottom: 26 }, weekHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }, weekTitle: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 16 }, weekMeta: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, fontVariant: ['tabular-nums'] },
  days: { flexDirection: 'row', gap: 6, marginTop: 10 }, day: { flex: 1, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 10 }, dayDone: { backgroundColor: colors.choiceSelected }, dayToday: { borderColor: colors.text, borderWidth: 1.5 },
  dayLabel: { color: colors.mutedSoft, fontFamily: 'InstrumentSans_500Medium', fontSize: 13 }, dayLabelOn: { color: colors.text },
  signals: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 }, signal: { width: '50%', paddingRight: 12 }, signalLabel: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13 }, signalValue: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 18, fontVariant: ['tabular-nums'] }, signalCopy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, lineHeight: 16 },
  planMeta: { color: colors.muted, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 11.5 }, changeText: { color: colors.textStrong, fontFamily: 'InstrumentSans_500Medium', fontSize: 12.5 }, planPrimaryText: { color: colors.onPrimary, fontFamily: 'InstrumentSans_700Bold', fontSize: 12.5 },
  pickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(13, 11, 10,0.82)' },
  pickerDialog: { maxHeight: '88%', backgroundColor: colors.surfaceRaised },
  pickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: 16, borderBottomWidth: 1, borderBottomColor: colors.line },
  pickerTitle: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 23, marginTop: 3 },
  pickerClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pickerPlans: { paddingHorizontal: 16 }, pickerPlan: { paddingVertical: 16, borderBottomColor: colors.line, borderBottomWidth: 1, gap: 7 },
  pickerPlanTitle: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 14, marginBottom: 3 },
  pickerDay: { minHeight: 52, borderColor: colors.line, borderWidth: 1, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, gap: 2 },
  pickerDaySelected: { borderColor: 'rgba(244, 238, 232, 0.33)', backgroundColor: 'rgba(244, 238, 232,0.075)' },
  pickerDayName: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 14 },
  pickerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: 16, borderTopColor: colors.line, borderTopWidth: 1 },
  pickerCancel: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  pickerChoose: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: 8, backgroundColor: colors.primaryEnd, boxShadow: '0 6px 8px rgba(244, 238, 232, 0.108), inset 0 1px 0 rgba(255, 255, 255, 0.18)', experimental_backgroundImage: primaryGradient },
})
