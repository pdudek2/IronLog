import BottomNavigation, { useBottomNavigation } from '../src/BottomNavigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import { TrainCheckIn, TrainTime } from '../src/TrainToday'
import { useReadinessRuntime } from '../src/readinessRuntime'
import { buildNextSessionRecommendation, type NextSessionRecommendation } from '../../src/shared/nextSessionRecommendation'
import type { CompressionProposal } from '../../src/shared/compressionRecord'
import { planDayId } from '../../src/shared/planDay'
import { recommendationHistory, todayLaunch } from '../src/readiness'
import { showDialog } from '../src/dialog'
import type { ExerciseMetadata } from '../src/scopedRead'

import { TrainCoverMedia } from '../src/TrainCoverMedia'
import { deriveWorkout } from '../src/history'
import { latestRecord, recordLine } from '../../src/shared/workoutMoments'
import { weekdayLabel } from '../../src/shared/week'
import { pluralize } from '../../src/lib/pluralize'
import { workoutTitle } from '../../src/lib/workoutCopy'
import { formatCompactVolume, kgStringToDisplayWeight } from '../../src/shared/weightUnits'
import { workoutCover } from '../../src/shared/workoutCover'
import { readExerciseMetadata, readHome, readTemplateBestSet, readTemplates, recordPlanSkip } from '../src/firebase'
import { exerciseSummary, templateStartWeight } from '../../src/shared/workoutDisplay'
import { canShowHomeSummary, deriveHome, getGreeting } from '../src/home'
import { publishStreak } from '../src/streak'
import { calcStreak } from '../../src/shared/streak'
import { readStateForKey, startRead, type ReadState } from '../src/scopedRead'
import { useActiveRuntime, useAuthRuntime, useOptionalClosureRuntime } from '../src/runtime'
import { ResumeButton } from '../src/ActiveWorkoutReturnBar'
import HistoryHeader from '../src/HistoryHeader'
import { useOptionalLaunchRuntime } from '../src/launchRuntime'
import { nextPlanWorkout, selectedWorkout, validateTemplateLaunch, type BestSet, type TemplateExercise, type WorkoutSelection, type WorkoutTemplate } from '../src/workoutLaunch'
import { colors, primaryGradient } from '../src/theme'
import { Icon } from '../src/icons'
import { PastePlanSheet } from '../src/PastePlanSheet'
import { useStarterPlan } from '../src/useStarterPlan'

type HomeData = Awaited<ReturnType<typeof readHome>>['data']
type TemplateData = WorkoutTemplate[]
// The time chosen today belongs to the day on screen; another day starts from Usual.
type TodayChoice = { key: string; budgetMin: number | null; straight: boolean; proposals: CompressionProposal[] }

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
  const [startBest, setStartBest] = useState<{ day: WorkoutTemplate['days'][number]; best: Map<string, BestSet | null> } | null>(null)
  const [selection, setSelection] = useState<{ uid: string; target: WorkoutSelection | null; unavailable: boolean } | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerDraft, setPickerDraft] = useState<WorkoutSelection | null>(null)
  const insets = useSafeAreaInsets()
  // With the tab bar scrolled away the bar sits on the screen edge, under the gesture area.
  const startBarInset = navigation.hidden ? { paddingBottom: Math.max(2, insets.bottom + 8) } : null
  const dockInset = navigation.hidden ? { marginBottom: Math.max(2, insets.bottom + 8) } : null
  const [picked, setPicked] = useState(false)
  // The queue needs plans and recent workouts, which load separately; a day the user picked stays.
  const pickedRef = useRef(false)
  const planDataRef = useRef<{ uid: string; templates: WorkoutTemplate[] | null; workouts: HomeData['workouts'] | null }>({ uid: '', templates: null, workouts: null })
  const [weekOpen, setWeekOpen] = useState(false)
  const [todayChoice, setTodayChoice] = useState<TodayChoice | null>(null)
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [skipping, setSkipping] = useState(false)
  const [pasting, setPasting] = useState(false)
  const starter = useStarterPlan(uid ?? '', () => setTemplatesAttempt((value) => value + 1))
  const [userExercises, setUserExercises] = useState<{ uid: string; meta: Map<string, ExerciseMetadata> } | null>(null)
  const key = `home:${uid ?? ''}`
  const completion = completed ? `${completed.action}:${completed.action === 'finish' ? completed.workoutId : completed.sessionId}` : ''

  useFocusEffect(useCallback(() => {
    if (!uid) return
    setNow(new Date())
    readiness?.controller.refreshDay()
    return startRead(() => readHome(uid), (state) => {
      setResult({ key, state })
      if (state.status !== 'ready') return
      const plans = planDataRef.current
      planDataRef.current = { uid, templates: plans.uid === uid ? plans.templates : null, workouts: state.data.workouts }
      const templates = planDataRef.current.templates
      if (templates && !pickedRef.current) setSelection((current) => current?.uid === uid && !current.unavailable
        ? { ...current, target: nextPlanWorkout(templates, state.data.workouts) }
        : current)
    })
  }, [uid, key, attempt, completion, readiness?.controller]))

  useFocusEffect(useCallback(() => {
    if (!uid || active.state.status !== 'empty') return
    return startRead(() => readTemplates(uid), (state) => {
      setTemplatesResult({ key: uid, state })
      if (state.status !== 'ready') return
      const plans = planDataRef.current
      planDataRef.current = { uid, templates: state.data, workouts: plans.uid === uid ? plans.workouts : null }
      setSelection((current) => {
        if (current?.uid === uid && current.unavailable) return current
        if (current?.uid === uid && pickedRef.current && selectedWorkout(state.data, current.target)) return current
        return { uid, target: nextPlanWorkout(state.data, planDataRef.current.workouts ?? []), unavailable: false }
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
  const pickerDraftDay = pickerDraft ? templates.find((template) => template.id === pickerDraft.templateId)?.days[pickerDraft.dayIndex] : undefined
  // A new account has nothing to start from a plan, so an empty workout is the main action.
  const noPlans = templatesState.status === 'ready' && !templatesState.fromCache && templates.length === 0
  const chosen = selection?.uid === uid && !selection.unavailable ? selectedWorkout(templates, selection.target) : null
  const chosenTemplate = chosen?.template
  const chosenDay = chosen?.day
  useEffect(() => {
    if (!uid || !chosenTemplate || !chosenDay) return
    let current = true
    void Promise.all(chosenDay.exercises.map(async ({ exerciseId, exerciseSource }) => (
      [`${exerciseSource}:${exerciseId}`, await readTemplateBestSet(uid, exerciseId, exerciseSource).catch(() => null)] as const
    ))).then((entries) => { if (current) setStartBest({ day: chosenDay, best: new Map(entries) }) })
    return () => { current = false }
  }, [uid, chosenTemplate, chosenDay])
  const chosenBest = startBest?.day === chosenDay ? startBest?.best : null
  const startWeightOf = (exercise: TemplateExercise) => chosenBest
    ? templateStartWeight(exercise, chosenBest.get(`${exercise.exerciseSource}:${exercise.exerciseId}`))
    : 0
  const canOfferStart = active.state.status === 'empty' && closure?.closure.status === 'ready'
  // Start waits for recent workouts too, so the queued day does not replace the first one on screen.
  const plansPending = active.state.status === 'loading' || (canOfferStart && (templatesState.status === 'loading' || state.status === 'loading'))
  // Picking a workout means the next session matters more than the finished week.
  const weekClosed = Boolean(summary) && !plansPending && canOfferStart && !picked && (summary?.weeklyDone ?? 0) >= goal
  const coverName = active.state.status === 'ready' ? workoutCover(active.state.session.label) : weekClosed ? 'week' : workoutCover(chosen?.day.name ?? chosen?.template.name)
  const record = data ? latestRecord(data.workouts, now.getTime()) : null
  const launchState = launch?.state.status ?? 'loading'
  const starting = launchState === 'starting'
  const readinessEntry = readiness?.state.status === 'ready' ? readiness.state.entry : null
  useEffect(() => {
    if (!uid) return
    let current = true
    void readExerciseMetadata(uid).then(({ data: list }) => { if (current) setUserExercises({ uid, meta: new Map(list.map((exercise) => [`user:${exercise.id}`, exercise])) }) }, () => {})
    return () => { current = false }
  }, [uid])
  const target = selection?.target
  const choiceKey = chosen && target ? `${chosen.template.id}:${target.dayIndex}` : ''
  const choice: TodayChoice = todayChoice?.key === choiceKey ? todayChoice : { key: choiceKey, budgetMin: null, straight: false, proposals: [] }
  const planToday = (budgetMin: number | null, straight: boolean) => {
    if (active.state.status !== 'empty' || !chosen || !target || !data || state.status !== 'ready' || state.fromCache
      || templatesState.status !== 'ready' || templatesState.fromCache) return null
    try {
      const next = buildNextSessionRecommendation(chosen.template, target.dayIndex, readinessEntry, recommendationHistory(data.workouts), Date.now(), units, {
        budgetMin, straight, templateId: chosen.template.id, planDayId: planDayId(chosen.day, target.dayIndex),
        userExercises: userExercises?.uid === uid ? userExercises.meta : undefined,
      })
      validateTemplateLaunch(chosen.template, target.dayIndex, { items: next.launch })
      return next
    } catch { return null }
  }
  const todayPlan = planToday(choice.budgetMin, choice.straight)
  const launchToday = todayLaunch(todayPlan, readinessEntry !== null, choice)
  const chooseTime = (budgetMin: number | null, straight: boolean) => {
    const mode: CompressionProposal['mode'] = budgetMin === null ? 'usual' : planToday(budgetMin, straight)?.record?.mode ?? 'usual'
    setTodayChoice({ key: choice.key, budgetMin, straight, proposals: [...choice.proposals, { budgetMin, mode }].slice(-12) })
  }
  const skipToday = async () => {
    if (!uid || !chosen || !target || skipping) return
    const { key } = choice
    setSkipping(true)
    try {
      await recordPlanSkip(uid, chosen.template.id, planDayId(chosen.day, target.dayIndex))
      setTodayChoice({ key, budgetMin: null, straight: false, proposals: [] })
      showDialog('Skipped today', `${chosen.day.name} stays next.`)
    } catch {
      showDialog('Could not skip today', 'Try again.')
    } finally { setSkipping(false) }
  }
  const startToday = () => {
    readiness?.controller.refreshDay()
    // A check-in from before midnight does not describe today.
    if (!chosen || !target || (readinessEntry && readinessEntry.date !== readiness?.controller.state.date)) return
    void launch?.start({ kind: 'template', selection: target, snapshot: chosen.template, ...(launchToday ? { launch: launchToday } : {}) })
  }

  // Today's choices belong to a plan day on screen, not to a closed week.
  const today = canOfferStart && chosen ? todayPlan : null
  const openExercise = (exercise: TemplateExercise) => router.push({ pathname: '/exercises/[source]/[id]', params: { source: exercise.exerciseSource, id: exercise.exerciseId } })

  useEffect(() => { setNow(new Date()) }, [readiness?.state.date])

  useEffect(() => {
    if (launchState !== 'unavailable' || !uid) return
    setSelection({ uid, target: null, unavailable: true })
    setTemplatesAttempt((value) => value + 1)
  }, [launchState, uid])

  const trainLinks = <View style={styles.links}>
      <Pressable accessibilityRole="button" onPress={() => router.navigate('/templates')} style={styles.link}><Text style={styles.linkText}>Plans</Text></Pressable>
      {canOfferStart && templatesState.status === 'ready' && templates.some((template) => template.days.some((day) => day.exercises.length > 0)) && <Pressable accessibilityRole="button" disabled={starting} onPress={() => { setPickerDraft(selection?.target ?? null); setPickerOpen(true) }} style={styles.link}><Text style={styles.linkText}>Change workout</Text></Pressable>}
      {canOfferStart && <Pressable accessibilityRole="button" disabled={starting || (launchState !== 'ready' && launchState !== 'unavailable')} onPress={() => void launch?.start({ kind: 'empty' })} style={styles.link}><Text style={styles.linkText}>{noPlans ? 'Start empty workout' : 'Empty workout'}</Text></Pressable>}
    </View>

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
          {weekClosed && [...(summary?.weekly ?? [])].reverse().map((workout) => <Pressable key={workout.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/workout/[workoutId]', params: { workoutId: workout.id, from: 'train' } })} style={styles.exercise}>
            <Text numberOfLines={1} style={styles.exerciseName}>{weekdayLabel(workout.startedAt)} · {workoutTitle(workout)}</Text>
            <Text style={styles.exerciseMeta}>{formatCompactVolume(deriveWorkout(workout, new Map()).totalVolume, units)}</Text>
            <Icon name="chevron-right" size={16} />
          </Pressable>)}
          {!weekClosed && chosen && todayPlan && (todayPlan.record || readinessEntry) ? <TodayExercises today={todayPlan} exercises={chosen.day.exercises} checkedIn={readinessEntry !== null} startWeightOf={startWeightOf} units={units} onOpen={openExercise} />
            : !weekClosed && chosen && chosen.day.exercises.map((exercise, index) => <Pressable key={`${exercise.exerciseSource}:${exercise.exerciseId}:${index}`} accessibilityRole="button" onPress={() => openExercise(exercise)} style={styles.exercise}>
            <Text numberOfLines={1} style={styles.exerciseName}>{exercise.name}</Text>
            <Text style={styles.exerciseMeta}>{exercise.sets} × {exercise.targetReps}{startWeightOf(exercise) > 0 && <> · <Text style={styles.exerciseWeight}>{kgStringToDisplayWeight(String(startWeightOf(exercise)), units)} {units}</Text></>}</Text>
            <Icon name="chevron-right" size={16} />
          </Pressable>)}
          {canOfferStart && !chosen && !plansPending && <View style={styles.planEmpty}><Text style={styles.planEmptyTitle}>{templatesState.status === 'loading' ? 'Loading plans…' : templatesState.status === 'error' ? 'Plans unavailable' : selection?.uid === uid && selection.unavailable ? 'Workout no longer available' : templatesState.fromCache && templates.length === 0 ? 'Could not confirm saved plans' : templates.length === 0 ? 'No plans yet' : 'No workouts in your plans'}</Text><Text style={styles.planEmptyCopy}>{selection?.uid === uid && selection.unavailable ? 'Choose another workout before starting.' : noPlans ? 'Paste the plan you already follow, or start from ours.' : 'You can still start an empty workout.'}</Text></View>}
          {canOfferStart && templatesState.status === 'error' && <Pressable accessibilityRole="button" onPress={() => setTemplatesAttempt((value) => value + 1)} style={styles.retry}><Text style={styles.actionText}>Retry plans</Text></Pressable>}
          {canOfferStart && templatesState.status === 'ready' && templatesState.fromCache && <Text style={styles.planEmptyCopy}>Showing plans saved on this device. Starting requires a connection.</Text>}
        </View>
        {active.state.status !== 'ready' && trainLinks}
        {canOfferStart && <View>
            {launchState === 'loading' && <Text style={styles.planEmptyCopy}>Checking workout start…</Text>}
            {(launchState === 'retry' || launchState === 'unavailable' || launchState === 'corrupt') && <View accessibilityRole="alert" style={styles.launchFeedback}><Text style={styles.planEmptyCopy}>{launch?.state.message ?? 'Could not start workout.'}</Text>{launchState !== 'corrupt' && <Pressable accessibilityRole="button" onPress={() => { if (launchState === 'unavailable') { launch?.dismissUnavailable(); setSelection({ uid: uid!, target: null, unavailable: true }); setTemplatesAttempt((value) => value + 1) } else void launch?.retry() }} style={styles.retry}><Text style={styles.actionText}>Try again</Text></Pressable>}</View>}
        </View>}
        {showSummary && summary && <View style={styles.week}>
          <View style={styles.weekHead}><Text accessibilityRole="header" style={styles.weekTitle}>This week</Text><Text style={styles.weekMeta}>{summary.weeklyDone} of {goal}{summary.weeklyVolume > 0 ? ` · ${formatCompactVolume(summary.weeklyVolume, units)}` : ''}</Text></View>
          <View accessibilityLabel="Days of the current week" style={styles.days}>{summary.days.map((day) => <View key={day.label} style={[styles.day, day.workouts > 0 && styles.dayDone, day.isToday && styles.dayToday]}><Text style={[styles.dayLabel, (day.workouts > 0 || day.isToday) && styles.dayLabelOn]}>{day.label.charAt(0)}</Text></View>)}</View>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: weekOpen }} onPress={() => setWeekOpen((open) => !open)} style={styles.weekLink}><Text style={styles.weekLinkText}>Week details</Text><Icon name={weekOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.text} /></Pressable>
          {weekOpen && <View style={styles.signals}>{[
            ['Schedule', `${summary.activeDays}/7 days`, `${summary.sessionsDelta > 0 ? '+' : ''}${summary.sessionsDelta === 0 ? 'No change' : summary.sessionsDelta} compared with last week`],
            ['Strong day', summary.peakDay?.volume ? summary.peakDay.label : 'None', summary.peakDay?.volume ? `${formatCompactVolume(summary.peakDay.volume, units)} • ${summary.peakDay.sets} ${pluralize(summary.peakDay.sets, 'set', 'sets')}` : 'No workouts this week'],
            ['Average session', summary.averageMinutes ? `${summary.averageMinutes} min` : '—', summary.averageVolume ? `${formatCompactVolume(summary.averageVolume, units)} per workout` : 'No average this week'],
            ['Volume', formatCompactVolume(summary.weeklyVolume, units), summary.volumeDelta === null ? 'No change data yet' : `${summary.volumeDelta >= 0 ? '+' : ''}${summary.volumeDelta}% vs last week`],
          ].map(([label, value, copy]) => <View key={label} style={styles.signal}><Text style={styles.signalLabel}>{label}</Text><Text style={styles.signalValue}>{value}</Text><Text style={styles.signalCopy}>{copy}</Text></View>)}</View>}
        </View>}
      </>}
    </ScrollView>
    {data && active.state.status === 'ready' && <View style={[styles.startBar, startBarInset]}><ResumeButton />{trainLinks}</View>}
    {data && (canOfferStart || plansPending) && <View accessibilityLabel="Today" style={[styles.dock, !today && !readiness && styles.dockBare, dockInset]}>
      {/* The check-in stays without a plan day too: Coach reads it. */}
      {readiness && <TrainCheckIn state={readiness.state} controller={readiness.controller} open={checkInOpen} onToggle={() => setCheckInOpen((open) => !open)} />}
      {/* While the check-in is open the time row and today's line step aside; Start stays. */}
      {today && chosen && !checkInOpen && <TrainTime today={today} plannedSets={chosen.day.exercises.reduce((sum, exercise) => sum + exercise.sets, 0)}
        budgetMin={choice.budgetMin} straight={choice.straight}
        onBudget={(budgetMin) => chooseTime(budgetMin, budgetMin === null ? false : choice.straight)} onStraight={(straight) => chooseTime(choice.budgetMin, straight)} />}
      <View style={styles.dockActions}>
        {plansPending ? <View style={styles.startPending} /> : chosen ? <>
          {today && choice.budgetMin !== null && !today.compression.fits && <Pressable accessibilityRole="button" disabled={skipping} onPress={() => void skipToday()} style={[styles.skip, skipping && styles.disabled]}><Text style={styles.skipText}>{skipping ? 'Skipping…' : 'Skip today'}</Text></Pressable>}
          <Pressable accessibilityRole="button" disabled={starting || launchState !== 'ready'} onPress={startToday} style={[styles.start, styles.dockStart, starting && styles.disabled]}><Text style={styles.startText}>{starting ? 'Starting…' : `Start ${chosen.day.name}`}</Text></Pressable>
        </>
          : noPlans ? <View style={styles.firstPlan}>
            <Pressable accessibilityRole="button" onPress={() => setPasting(true)} style={styles.start}><Text style={styles.startText}>Paste a plan</Text></Pressable>
            <View style={styles.firstPlanRow}>
              <Pressable accessibilityRole="button" disabled={starter.saving} onPress={() => void starter.create()} style={[styles.skip, styles.firstPlanQuiet, starter.saving && styles.disabled]}><Text style={styles.skipText}>{starter.saving ? 'Adding…' : 'Use the starter plan'}</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => router.navigate('/templates/new')} style={[styles.skip, styles.firstPlanQuiet]}><Text style={styles.skipText}>Build a plan</Text></Pressable>
            </View>
            {starter.error && <Text accessibilityRole="alert" style={styles.planEmptyCopy}>{starter.error}</Text>}
          </View>
          : <Pressable accessibilityRole="button" disabled={starting || (launchState !== 'ready' && launchState !== 'unavailable')} onPress={() => void launch?.start({ kind: 'empty' })} style={[styles.start, styles.dockStart, starting && styles.disabled]}><Text style={styles.startText}>{starting ? 'Starting…' : 'Start empty workout'}</Text></Pressable>}
      </View>
    </View>}
    {pasting && uid && <PastePlanSheet uid={uid} onClose={() => setPasting(false)} />}
    <Modal animationType="fade" transparent visible={pickerOpen && canOfferStart && templatesState.status === 'ready'} onRequestClose={() => setPickerOpen(false)}>
      <View style={styles.pickerOverlay}><View accessibilityLabel="Choose a workout" style={styles.pickerDialog}>
        <View style={styles.pickerHead}><Text accessibilityRole="header" style={styles.pickerTitle}>Choose a workout</Text><Pressable accessibilityRole="button" accessibilityLabel="Close workout picker" onPress={() => setPickerOpen(false)} style={styles.pickerClose}><Icon name="close" size={18} color={colors.muted} /></Pressable></View>
        <ScrollView style={styles.pickerPlans}>{templates.map((template) => <View key={template.id} style={styles.pickerPlan}><Text accessibilityRole="header" style={styles.pickerPlanTitle}>{template.name}</Text>{template.days.map((day, index) => { const enabled = day.exercises.length > 0; const selected = pickerDraft?.templateId === template.id && pickerDraft.dayIndex === index; return <Pressable key={`${template.id}:${index}`} accessibilityRole="button" accessibilityLabel={enabled ? `Select ${day.name} from plan ${template.name}` : `${day.name} from plan ${template.name}, no exercises`} accessibilityState={{ selected, disabled: !enabled }} disabled={!enabled} onPress={() => setPickerDraft({ templateId: template.id, dayIndex: index })} style={[styles.pickerDay, selected && styles.pickerDaySelected, !enabled && styles.disabled]}><View style={styles.pickerDayCopy}><Text style={styles.pickerDayName}>{day.name}</Text><Text numberOfLines={1} style={styles.pickerDayMeta}>{enabled ? exerciseSummary(day.exercises.map((exercise) => exercise.name)) : 'No exercises'}</Text></View>{selected && <Icon name="check" size={16} color={colors.textStrong} />}</Pressable> })}</View>)}</ScrollView>
        <View style={[styles.pickerActions, { paddingBottom: Math.max(20, insets.bottom + 12) }]}><Pressable accessibilityRole="button" disabled={!pickerDraft} onPress={() => { if (pickerDraft && uid) { launch?.dismissUnavailable(); setSelection({ uid, target: pickerDraft, unavailable: false }); setPicked(true); pickedRef.current = true; setPickerOpen(false) } }} style={[styles.pickerChoose, !pickerDraft && styles.disabled]}><Text style={styles.pickerChooseText}>{pickerDraftDay ? `Choose ${pickerDraftDay.name}` : 'Choose workout'}</Text></Pressable></View>
      </View></View>
    </Modal>
  <BottomNavigation {...navigation} />
  </SafeAreaView>
}

// Today's day in session order: pairs and circuits as one block, dropped exercises at the end.
function TodayExercises({ today, exercises, checkedIn, startWeightOf, units, onOpen }: {
  today: NextSessionRecommendation; exercises: TemplateExercise[]
  // After a check-in the start takes the progression's weights; otherwise the usual day's.
  checkedIn: boolean; startWeightOf: (exercise: TemplateExercise) => number; units: 'kg' | 'lbs'; onOpen: (exercise: TemplateExercise) => void
}) {
  const row = (index: number, sets: number) => {
    const exercise = exercises[index]!
    const skipped = sets === 0
    const planned = checkedIn ? today.exercises[index]! : { reps: exercise.targetReps, weight: startWeightOf(exercise) }
    return <Pressable key={`${skipped ? 'skipped:' : ''}${exercise.exerciseSource}:${exercise.exerciseId}:${index}`} accessibilityRole="button" accessibilityLabel={skipped ? `${exercise.name}, skipped today` : undefined} onPress={() => onOpen(exercise)} style={styles.exercise}>
      <Text numberOfLines={1} style={[styles.exerciseName, skipped && styles.skippedName]}>{exercise.name}</Text>
      {skipped ? <Text style={[styles.exerciseMeta, styles.skipped]}>Skipped today</Text>
        : <Text style={styles.exerciseMeta}>{sets} × {planned.reps}{planned.weight > 0 && <> · <Text style={styles.exerciseWeight}>{kgStringToDisplayWeight(String(planned.weight), units)} {units}</Text></>}</Text>}
      <Icon name="chevron-right" size={16} />
    </Pressable>
  }
  return <>
    {today.compression.blocks.map((block) => {
      const live = block.items.filter((item) => item.sets > 0)
      if (!live.length) return null
      if (live.length === 1) return row(live[0]!.index, live[0]!.sets)
      const rounds = Math.max(...live.map((item) => item.sets))
      return <View key={`group:${block.group ?? live[0]!.index}`} style={styles.group}>
        <Text style={styles.groupLabel}>{live.length === 2 ? 'Superset' : 'Circuit'} · {rounds} {rounds === 1 ? 'round' : 'rounds'}</Text>
        {live.map((item) => row(item.index, item.sets))}
      </View>
    })}
    {exercises.map((_, index) => today.compression.sets[index] === 0 ? row(index, 0) : null)}
  </>
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
  plan: { gap: 4, marginTop: 18 }, exercise: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 48 },
  exerciseName: { flex: 1, color: colors.text, fontFamily: 'InstrumentSans_400Regular', fontSize: 15 }, exerciseMeta: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, fontVariant: ['tabular-nums'] }, exerciseWeight: { color: colors.text, fontFamily: 'InstrumentSans_500Medium' },
  planPending: { height: 216 }, startPending: { height: 52 },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 24 }, link: { minHeight: 44, justifyContent: 'center' }, weekLink: { alignItems: 'center', columnGap: 4, flexDirection: 'row', minHeight: 44 }, linkText: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 13 }, weekLinkText: { color: colors.text, fontFamily: 'InstrumentSans_500Medium', fontSize: 14 },
  planEmpty: { gap: 4, paddingVertical: 8 }, planEmptyTitle: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 14 },
  planEmptyCopy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12.5, lineHeight: 18 },
  launchFeedback: { gap: 4 }, disabled: { opacity: 0.65 },
  dock: { gap: 8, marginHorizontal: 10, marginTop: 10, marginBottom: 2, paddingTop: 6, paddingHorizontal: 12, paddingBottom: 12, borderRadius: 22, backgroundColor: colors.surfaceHigh, experimental_backgroundImage: `linear-gradient(180deg, ${colors.surfaceHigh}, ${colors.surfaceRaised})`, boxShadow: '0 -18px 40px -14px rgba(0, 0, 0, 0.7), 0 10px 24px -12px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.07)' },
  dockBare: { paddingTop: 12 }, dockActions: { flexDirection: 'row', gap: 8, marginTop: 4 }, dockStart: { flex: 1 }, firstPlan: { flex: 1, gap: 8 }, firstPlanRow: { flexDirection: 'row', gap: 8 }, firstPlanQuiet: { flexGrow: 1, flexBasis: 0 },
  skip: { flexGrow: 0, flexShrink: 1, flexBasis: 136, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: 'rgba(255, 255, 255, 0.09)', boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }, skipText: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 16 },
  group: { marginLeft: 2, paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: colors.lineStrong }, groupLabel: { marginTop: 6, color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, lineHeight: 20 },
  skipped: { color: colors.mutedSoft }, skippedName: { color: colors.mutedSoft, textDecorationLine: 'line-through', textDecorationColor: colors.mutedSoft },
  startBar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2 }, start: { height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: colors.primaryEnd, experimental_backgroundImage: primaryGradient, boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.5), 0 2px 8px rgba(0, 0, 0, 0.35)' }, startText: { color: colors.onPrimary, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 16 },
  week: { paddingTop: 18, paddingBottom: 26 }, weekHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }, weekTitle: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 16 }, weekMeta: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, fontVariant: ['tabular-nums'] },
  days: { flexDirection: 'row', gap: 6, marginTop: 10 }, day: { flex: 1, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 10 }, dayDone: { backgroundColor: colors.choiceSelected }, dayToday: { borderColor: colors.text, borderWidth: 1.5 },
  dayLabel: { color: colors.mutedSoft, fontFamily: 'InstrumentSans_500Medium', fontSize: 13 }, dayLabelOn: { color: colors.text },
  signals: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 }, signal: { width: '50%', paddingRight: 12 }, signalLabel: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13 }, signalValue: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 18, fontVariant: ['tabular-nums'] }, signalCopy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, lineHeight: 16 },
  planMeta: { color: colors.muted, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 11.5 }, changeText: { color: colors.textStrong, fontFamily: 'InstrumentSans_500Medium', fontSize: 12.5 }, planPrimaryText: { color: colors.onPrimary, fontFamily: 'InstrumentSans_700Bold', fontSize: 12.5 },
  pickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(13, 11, 10, 0.6)' },
  pickerDialog: { maxHeight: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surfaceRaised, experimental_backgroundImage: `linear-gradient(180deg, ${colors.surfaceHigh}, ${colors.surfaceRaised})`, boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08)' },
  pickerHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  pickerTitle: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 19, lineHeight: 25, letterSpacing: -0.2 },
  pickerClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: -10, marginRight: -10 },
  pickerPlans: { paddingHorizontal: 20 }, pickerPlan: { paddingVertical: 8, gap: 2 },
  pickerPlanTitle: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 13, marginBottom: 4 },
  pickerDay: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, marginHorizontal: -10, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10 },
  pickerDaySelected: { backgroundColor: 'rgba(255, 255, 255, 0.08)' },
  pickerDayCopy: { flex: 1, minWidth: 0 },
  pickerDayName: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 16, lineHeight: 21 },
  pickerDayMeta: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, lineHeight: 18 },
  pickerActions: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 },
  pickerChooseText: { color: colors.onPrimary, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 16 },
  pickerChoose: { alignItems: 'center', justifyContent: 'center', minHeight: 52, borderRadius: 15, backgroundColor: colors.primaryEnd, boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.5), 0 2px 8px rgba(0, 0, 0, 0.35)', experimental_backgroundImage: primaryGradient },
})
