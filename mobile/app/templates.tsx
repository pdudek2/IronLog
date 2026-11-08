import BottomNavigation, { useBottomNavigation } from '../src/BottomNavigation'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'

import { pluralize } from '../../src/lib/pluralize'
import HistoryHeader from '../src/HistoryHeader'
import { deletePlanIfUnchanged, readTemplateFromServer, readTemplates } from '../src/firebase'
import { inspectPlanForDelete, reconcilePlanAction, type PlanAction } from '../src/planDeleteFlow'
import { templateFingerprint } from '../../src/shared/templateFingerprint'
import { useLaunchRuntime } from '../src/launchRuntime'
import { useActiveRuntime, useAuthRuntime, useClosureRuntime } from '../src/runtime'
import { readStateForKey, startRead, type ReadState } from '../src/scopedRead'
import type { WorkoutTemplate } from '../src/workoutLaunch'
import { colors, pageBackground, pageTitle, primaryGradient } from '../src/theme'
import { showDialog } from '../src/dialog'
import { Icon as LineIcon } from '../src/icons'
import { BottomSheet } from '../src/BottomSheet'
import { PastePlanSheet } from '../src/PastePlanSheet'
import { useStarterPlan } from '../src/useStarterPlan'
import { starterPlanInput } from '../../src/shared/planImport'
import { planToText } from '../../src/shared/planText'

const STARTER = starterPlanInput()

export default function TemplatesScreen() {
  const { user } = useAuthRuntime()
  if (!user) return <SafeAreaView edges={['top']} style={styles.screen}><StatusBar style="light" /><Text style={styles.copy}>Restoring sign-in…</Text></SafeAreaView>
  return <Plans uid={user.uid} />
}

function Plans({ uid }: { uid: string }) {
  const router = useRouter()
  // Web confirms a saved plan with a toast; here the list shows it for a few seconds.
  const { saved } = useLocalSearchParams<{ saved?: string }>()
  useEffect(() => {
    if (saved !== '1') return
    const timer = setTimeout(() => router.setParams({ saved: undefined }), 4000)
    return () => clearTimeout(timer)
  }, [router, saved])
  const navigation = useBottomNavigation()
  const active = useActiveRuntime()
  const closure = useClosureRuntime()
  const launch = useLaunchRuntime()
  const [stored, setStored] = useState<{ key: string; state: ReadState<WorkoutTemplate[]> } | null>(null)
  const [readAttempt, setReadAttempt] = useState(0)
  const [expanded, setExpanded] = useState<{ uid: string; id: string | null }>({ uid, id: null })
  const [planAction, setPlanAction] = useState<PlanAction | null>(null)
  const [moreTarget, setMoreTarget] = useState<WorkoutTemplate | null>(null)
  const [pasting, setPasting] = useState(false)
  const unavailable = launch.state.status === 'unavailable'

  useFocusEffect(useCallback(() => startRead(() => readTemplates(uid), (state) => {
    setStored({ key: uid, state })
    if (state.status === 'ready') {
      setExpanded((current) => ({ uid, id: current.uid === uid && state.data.some((plan) => plan.id === current.id) ? current.id : null }))
      setPlanAction((current) => reconcilePlanAction(current, state.data, state.fromCache))
    }
  }), [uid, readAttempt, unavailable]))

  const state = readStateForKey(uid, stored)
  const plans = state.status === 'ready' ? state.data : []
  const shortList = plans.length <= 2
  const starting = launch.state.status === 'starting'
  const canStart = (active.state.status === 'empty' || active.state.status === 'ready') && closure.closure.status === 'ready' && launch.state.status === 'ready' && !planAction
  const feedback = ['retry', 'unavailable', 'corrupt'].includes(launch.state.status)
  const feedbackPlan = plans.find((plan) => plan.id === launch.state.selection?.templateId)
  const retryRead = () => setReadAttempt((value) => value + 1)
  const starter = useStarterPlan(uid, retryRead)
  const empty = state.status === 'ready' && !state.fromCache && plans.length === 0
  async function deleteConfirmed(id: string, name: string, baseline: string) {
    setPlanAction({ id, name, baseline, status: 'deleting' })
    try {
      await deletePlanIfUnchanged(uid, id, baseline)
      setPlanAction(null); retryRead()
    } catch {
      try {
        const current = await readTemplateFromServer(uid, id)
        if (!current) { setPlanAction(null); retryRead(); return }
        if (templateFingerprint(current) !== baseline) {
          setPlanAction({ id, name, baseline, status: 'error', error: 'Plan changed. Review it before deleting.' }); retryRead(); return
        }
      } catch { /* Keep the confirmed target for an explicit retry. */ }
      setPlanAction({ id, name, baseline, status: 'error', error: 'Could not delete plan. Check your connection and try again.' })
    }
  }
  async function askDelete(plan: WorkoutTemplate, retry = false) {
    if (planAction && !(retry && planAction.status === 'error' && planAction.id === plan.id)) return
    setPlanAction({ id: plan.id, name: plan.name, baseline: templateFingerprint(plan), status: 'checking' })
    try {
      const check = await inspectPlanForDelete(plan, planAction, retry, (id) => readTemplateFromServer(uid, id))
      if (check.kind === 'busy') return
      if (check.kind === 'absent') { setPlanAction(null); retryRead(); return }
      if (check.kind === 'changed') {
        setPlanAction({ id: plan.id, name: plan.name, baseline: templateFingerprint(plan), status: 'error', error: 'Plan changed. Review the latest version before deleting.' }); retryRead(); return
      }
      setPlanAction(null)
      showDialog('Delete plan?', `Delete “${check.current.name}”? This does not change an active workout.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete plan', style: 'destructive', onPress: () => { void deleteConfirmed(plan.id, check.current.name, check.baseline) } },
      ])
    } catch { setPlanAction({ id: plan.id, name: plan.name, baseline: templateFingerprint(plan), status: 'error', error: 'Could not check plan. Check your connection and try again.' }) }
  }
  const retryLaunch = () => {
    if (unavailable) { launch.dismissUnavailable(); retryRead() }
    else void launch.retry()
  }
  const launchFeedback = <View accessibilityRole="alert" style={styles.feedback}>
    <Text style={styles.copy}>{launch.state.message ?? 'Could not start the workout.'}</Text>
    {launch.state.status !== 'corrupt' && <Pressable accessibilityRole="button" onPress={retryLaunch} style={styles.retry}><Text style={styles.actionText}>Try again</Text></Pressable>}
  </View>

  return <SafeAreaView onFocus={navigation.onFocus} onBlur={navigation.onBlur} edges={['top']} style={styles.screen}>
    <StatusBar style="light" />
    <HistoryHeader />
    <ScrollView onScroll={navigation.onScroll} scrollEventThrottle={16} contentContainerStyle={styles.content}>
      <View style={styles.heading}><View><Text accessibilityRole="header" style={styles.title}>Plans</Text>{plans.length > 0 && <Text style={styles.count}>{plans.length} {pluralize(plans.length, 'plan', 'plans')}</Text>}</View><View style={styles.headerActions}><Pressable accessibilityRole="button" onPress={() => setPasting(true)} style={empty ? styles.pastePrimary : styles.newPlan}><LineIcon name="paste" size={15} color={empty ? colors.onPrimary : colors.text} /><Text style={empty ? styles.pastePrimaryText : styles.newPlanText}>Paste a plan</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.navigate('/templates/new')} style={styles.newPlan}><LineIcon name="plus" size={15} color={colors.text} /><Text style={styles.newPlanText}>New plan</Text></Pressable></View></View>
      {saved === '1' && <Text accessibilityLiveRegion="polite" style={styles.savedNotice}>Plan saved</Text>}
      {feedback && !feedbackPlan && launchFeedback}
      {launch.state.status === 'loading' && <Text style={styles.noticeCopy}>Checking workout start…</Text>}
      {state.status === 'loading' && <View style={[styles.status, styles.loading]}><ActivityIndicator color={colors.accent} /><Text style={styles.copy}>Loading plans…</Text></View>}
      {state.status === 'error' && <View accessibilityRole="alert" style={styles.status}><Text style={styles.statusTitle}>Could not load plans</Text><Text style={[styles.copy, styles.statusCopy]}>Check your connection and try again.</Text><Pressable accessibilityRole="button" onPress={retryRead} style={styles.readRetry}><Text style={styles.readRetryText}>Try again</Text></Pressable></View>}
      {state.status === 'ready' && state.fromCache && <View accessibilityRole="alert" style={styles.cache}><Text style={styles.copy}>{plans.length ? 'Showing plans saved on this device. Starting requires a connection.' : 'Could not confirm your saved plans. This device has no copy to check offline.'}</Text><Pressable accessibilityRole="button" onPress={retryRead} style={styles.retry}><Text style={styles.actionText}>Try again</Text></Pressable></View>}
      {empty && <View style={styles.empty}><Text accessibilityRole="header" style={styles.emptyTitle}>You have no plans yet</Text><Text style={styles.emptyCopy}>Paste the plan you already follow, start from ours, or build one. Start any day with one tap.</Text>
        <View style={styles.starter}><View style={styles.starterHead}><Text style={styles.starterLabel}>Starter plan</Text><Text style={styles.starterName}>{STARTER.name} · {STARTER.days.length} days</Text></View>
          {STARTER.days.map((day) => <View key={day.name} style={styles.starterDay}><Text style={styles.starterDayName}>{day.name}</Text><Text style={styles.starterExercises}>{day.exercises.map((exercise) => exercise.name).join(' · ')}</Text></View>)}
          <Pressable accessibilityRole="button" disabled={starter.saving} onPress={() => void starter.create()} style={[styles.starterUse, starter.saving && styles.disabled]}><Text style={styles.starterUseText}>{starter.saving ? 'Adding…' : 'Use the starter plan'}</Text></Pressable>
          {starter.error && <Text accessibilityRole="alert" style={styles.copy}>{starter.error}</Text>}
        </View></View>}
      {plans.length > 0 && <View style={styles.board}>{plans.map((plan) => {
        // A one-day plan has nothing to choose, so its Start is always visible.
        const single = plan.days.length === 1
        const open = shortList || single || (expanded.uid === uid && expanded.id === plan.id)
        const exerciseCount = plan.days.reduce((sum, day) => sum + day.exercises.length, 0)
        return <View key={plan.id} style={styles.plan}>
          <View style={styles.planHead}><View style={styles.planTitleCopy}><Text accessibilityRole="header" numberOfLines={2} style={styles.planTitle}>{plan.name}</Text><Text style={styles.daysCount}>{plan.days.length} {pluralize(plan.days.length, 'day', 'days')} · {exerciseCount} {pluralize(exerciseCount, 'exercise', 'exercises')}</Text></View><View style={styles.planActions}><Pressable accessibilityRole="button" accessibilityLabel={`Edit plan ${plan.name}`} disabled={!!planAction} onPress={() => router.navigate(`/templates/${plan.id}/edit`)} style={styles.planAction}><Icon kind="edit" color={colors.muted} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`More actions for plan ${plan.name}`} disabled={!!planAction} onPress={() => setMoreTarget(plan)} style={styles.planAction}><LineIcon name="more" size={18} /></Pressable>{!shortList && !single && <Pressable accessibilityRole="button" accessibilityLabel={`${open ? 'Collapse' : 'Structure'} ${plan.name}`} accessibilityState={{ expanded: open }} onPress={() => setExpanded({ uid, id: open ? null : plan.id })} style={styles.structure}><Icon kind={open ? 'up' : 'down'} color={colors.muted} /></Pressable>}</View></View>
          {planAction?.id === plan.id && <View accessibilityRole="alert" style={styles.feedback}><Text style={styles.copy}>{planAction.status === 'checking' ? 'Checking plan…' : planAction.status === 'deleting' ? 'Deleting plan…' : planAction.error}</Text>{planAction.status === 'error' && <Pressable accessibilityRole="button" onPress={() => { void askDelete(plan, true) }} style={styles.retry}><Text style={styles.actionText}>Try again</Text></Pressable>}</View>}
          {feedback && feedbackPlan?.id === plan.id && launchFeedback}
          {open && <View style={styles.days}>{plan.days.map((day, dayIndex) => {
            const pending = starting && launch.state.selection?.templateId === plan.id && launch.state.selection.dayIndex === dayIndex
            return <View key={`${plan.id}:${dayIndex}`} style={styles.day}>
              <View style={styles.dayHead}><Pressable accessibilityRole="button" accessibilityLabel={`Open ${day.name} in ${plan.name}`} onPress={() => router.navigate(`/templates/${plan.id}/edit`)} style={styles.dayCopy}><Text style={styles.dayTitle}>{day.name}</Text><Text style={styles.exerciseCount}>{day.exercises.length ? `${day.exercises.length} ${pluralize(day.exercises.length, 'exercise', 'exercises')}` : 'No exercises'}</Text></Pressable>{day.exercises.length > 0 ? <Pressable accessibilityRole="button" accessibilityLabel={`Start day ${day.name} from plan ${plan.name}`} accessibilityState={{ disabled: !canStart, busy: pending }} disabled={!canStart} onPress={() => void launch.start({ kind: 'template', selection: { templateId: plan.id, dayIndex }, snapshot: plan })} style={[styles.start, !canStart && styles.disabled]}><Text style={styles.startText}>{pending ? 'Starting…' : 'Start'}</Text></Pressable> : <Pressable accessibilityRole="button" accessibilityLabel={`Edit empty day ${day.name} in plan ${plan.name}`} onPress={() => router.navigate(`/templates/${plan.id}/edit`)} style={styles.start}><Text style={styles.startText}>Edit</Text></Pressable>}</View>
            </View>
          })}</View>}
        </View>
      })}</View>}
      <View style={styles.tools}>
        <Pressable accessibilityRole="button" onPress={() => router.navigate('/exercises')} style={styles.tool}><Text style={styles.toolText}>Exercises</Text><LineIcon name="chevron-right" /></Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.navigate('/coach')} style={styles.tool}><Text style={styles.toolText}>Generate a plan with Coach</Text><LineIcon name="chevron-right" /></Pressable>
        {plans.length > 0 && <Pressable accessibilityRole="button" disabled={starter.saving} onPress={() => void starter.create()} style={styles.tool}><Text style={styles.toolText}>{starter.saving ? 'Adding the starter plan…' : `Use the starter plan · ${STARTER.name}`}</Text><LineIcon name="chevron-right" /></Pressable>}
        {plans.length > 0 && starter.error && <Text accessibilityRole="alert" style={styles.copy}>{starter.error}</Text>}
      </View>
    </ScrollView>
  {moreTarget && <BottomSheet title={moreTarget.name} onClose={() => setMoreTarget(null)}>
    {(close) => <><Pressable accessibilityRole="button" onPress={() => { const plan = moreTarget; close(() => void Share.share({ title: plan.name, message: planToText({ name: plan.name, days: plan.days }) })) }} style={styles.sheetRow}>
      <Text style={styles.sheetRowText}>Share plan</Text><LineIcon name="share" size={16} />
    </Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Delete plan ${moreTarget.name}`} disabled={!!planAction} onPress={() => close(() => void askDelete(moreTarget))} style={styles.sheetRow}>
      <Text style={styles.sheetRowQuiet}>Delete plan</Text><LineIcon name="trash" size={16} />
    </Pressable></>}
  </BottomSheet>}
  {pasting && <PastePlanSheet uid={uid} onClose={() => setPasting(false)} />}
  <BottomNavigation {...navigation} />
  </SafeAreaView>
}

function Icon({ kind, color }: { kind: 'up' | 'down' | 'edit'; color: string }) {
  const path = kind === 'up' ? 'm18 15-6-6-6 6' : kind === 'down' ? 'm6 9 6 6 6-6' : 'M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4'
  return <Svg accessibilityElementsHidden width={15} height={15} viewBox="0 0 24 24"><Path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
}

const styles = StyleSheet.create({
  savedNotice: { color: colors.recovery, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 13, paddingTop: 12 },
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, experimental_backgroundImage: pageBackground },
    heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingBottom: 8 },
  
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  pastePrimary: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.primaryEnd, experimental_backgroundImage: primaryGradient }, pastePrimaryText: { color: colors.onPrimary, fontFamily: 'InstrumentSans_700Bold', fontSize: 14 },
  starter: { marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(244,238,232,0.08)' }, starterHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, paddingBottom: 10 },
  starterLabel: { color: colors.muted, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 12 }, starterName: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 15 },
  starterDay: { flexDirection: 'row', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(244,238,232,0.075)' }, starterDayName: { width: 56, color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 13 }, starterExercises: { flex: 1, color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, lineHeight: 19 },
  starterUse: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 14, marginTop: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(244,238,232,0.12)' }, starterUseText: { color: colors.text, fontFamily: 'InstrumentSans_700Bold', fontSize: 13 },
  sheetRowText: { color: colors.text, fontFamily: 'InstrumentSans_400Regular', fontSize: 15.5 },
  newPlan: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'center' }, newPlanText: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14 },
  title: pageTitle,
  count: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 13, marginTop: 2 }, 
  board: { marginTop: 4 }, plan: { paddingBottom: 12 }, 
  planHead: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 16, paddingBottom: 2 }, planTitleCopy: { flex: 1, minWidth: 0 },
  planActions: { flexDirection: 'row' }, planAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  planTitle: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 20, lineHeight: 25, letterSpacing: -0.3 }, daysCount: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, lineHeight: 18, marginTop: 2 },
  structure: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  days: { gap: 2 },
  day: { }, 
  dayHead: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, dayCopy: { flex: 1, minWidth: 0, minHeight: 50, justifyContent: 'center', gap: 1 },
  dayTitle: { color: colors.text, fontFamily: 'InstrumentSans_400Regular', fontSize: 15.5, lineHeight: 21 }, exerciseCount: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, lineHeight: 18 },
  start: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center', paddingLeft: 12 }, startText: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14 },
  sheetRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 50 }, sheetRowQuiet: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 15.5 }, disabled: { opacity: 0.62 },
  
  tools: { marginTop: 8 }, tool: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, toolText: { color: colors.text, fontFamily: 'InstrumentSans_400Regular', fontSize: 15 },
  copy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, lineHeight: 22 },
  status: { alignItems: 'flex-start', paddingVertical: 24 }, loading: { alignItems: 'center', gap: 12 }, statusCopy: { lineHeight: 24, marginTop: 8 }, statusTitle: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 18, lineHeight: 28 },
  readRetry: { minHeight: 45, minWidth: 192, marginTop: 24, paddingHorizontal: 16, borderRadius: 8, boxShadow: '0 12px 28px rgba(244, 238, 232, 0.12)', alignItems: 'center', justifyContent: 'center', backgroundColor: '#d9cfc2', experimental_backgroundImage: primaryGradient }, readRetryText: { color: colors.onPrimary, fontFamily: 'InstrumentSans_700Bold', fontSize: 14 },
  retry: { minHeight: 44, justifyContent: 'center' }, actionText: { color: colors.accentText, fontFamily: 'InstrumentSans_700Bold', fontSize: 13 },
  cache: { gap: 4, paddingVertical: 16 }, feedback: { gap: 4, paddingBottom: 16, paddingTop: 12 },
  activeCopy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12.5, lineHeight: 18, marginTop: 16 }, noticeCopy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12.5, marginTop: 12 },
  empty: { paddingVertical: 16, marginTop: 4 }, emptyTitle: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 20, lineHeight: 26 }, emptyCopy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14.08, lineHeight: 21.8, marginTop: 10.4 },
})
