import { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'

import grainTexture from '../assets/grain.png'
import { pluralize } from '../../src/lib/pluralize'
import ActiveWorkoutReturnBar from '../src/ActiveWorkoutReturnBar'
import HistoryHeader from '../src/HistoryHeader'
import { deletePlanIfUnchanged, readTemplateFromServer, readTemplates } from '../src/firebase'
import { inspectPlanForDelete } from '../src/planDeleteFlow'
import { templateFingerprint } from '../../src/shared/templateFingerprint'
import { useLaunchRuntime } from '../src/launchRuntime'
import { useActiveRuntime, useAuthRuntime, useClosureRuntime } from '../src/runtime'
import { readStateForKey, startRead, type ReadState } from '../src/scopedRead'
import type { WorkoutTemplate } from '../src/workoutLaunch'

const colors = { background: '#111012', strong: '#fff', muted: '#a09aa0', accent: '#ff7182', line: 'rgba(244,241,242,0.12)' }

export default function TemplatesScreen() {
  const { user } = useAuthRuntime()
  if (!user) return <SafeAreaView edges={['top']} style={styles.screen}><StatusBar style="light" /><Text style={styles.copy}>Restoring sign-in…</Text></SafeAreaView>
  return <Plans uid={user.uid} />
}

function Plans({ uid }: { uid: string }) {
  const router = useRouter()
  const active = useActiveRuntime()
  const closure = useClosureRuntime()
  const launch = useLaunchRuntime()
  const [stored, setStored] = useState<{ key: string; state: ReadState<WorkoutTemplate[]> } | null>(null)
  const [readAttempt, setReadAttempt] = useState(0)
  const [expanded, setExpanded] = useState<{ uid: string; id: string | null }>({ uid, id: null })
  const [planAction, setPlanAction] = useState<{ id: string; name: string; baseline: string; status: 'checking' | 'deleting' | 'error'; error?: string } | null>(null)
  const unavailable = launch.state.status === 'unavailable'

  useFocusEffect(useCallback(() => startRead(() => readTemplates(uid), (state) => {
    setStored({ key: uid, state })
    if (state.status === 'ready') setExpanded((current) => ({ uid, id: current.uid === uid && state.data.some((plan) => plan.id === current.id) ? current.id : null }))
  }), [uid, readAttempt, unavailable]))

  const state = readStateForKey(uid, stored)
  const plans = state.status === 'ready' ? state.data : []
  const shortList = plans.length <= 2
  const starting = launch.state.status === 'starting'
  const canStart = active.state.status === 'empty' && closure.closure.status === 'ready' && launch.state.status === 'ready' && !planAction
  const hasActive = active.state.status === 'ready'
  const feedback = ['retry', 'unavailable', 'corrupt'].includes(launch.state.status)
  const feedbackPlan = plans.find((plan) => plan.id === launch.state.selection?.templateId)
  const retryRead = () => setReadAttempt((value) => value + 1)
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
      Alert.alert('Delete plan?', `Delete “${check.current.name}”? This does not change an active workout.`, [
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

  return <SafeAreaView edges={['top']} style={styles.screen}>
    <StatusBar style="light" />
    <HistoryHeader />
    <ActiveWorkoutReturnBar />
    <ScrollView contentContainerStyle={styles.content}>
      <View pointerEvents="none" style={styles.grain}><Image accessibilityElementsHidden resizeMode="repeat" source={grainTexture} style={styles.grainImage} /></View>
      <View style={styles.heading}><View><Text accessibilityRole="header" style={styles.title}>Plans</Text>{plans.length > 0 && <View accessibilityLabel={`${plans.length} ${pluralize(plans.length, 'plan', 'plans')}`} style={styles.summary}><Text style={styles.countNumber}>{plans.length}</Text><Text style={styles.count}>{pluralize(plans.length, 'plan', 'plans')}</Text></View>}</View><Pressable accessibilityRole="button" onPress={() => router.navigate('/templates/new')} style={styles.newPlan}><Text style={styles.newPlanText}>＋ New plan</Text></Pressable></View>
      {hasActive && <Text style={styles.activeCopy}>Resume or finish your current workout before starting another day.</Text>}
      {feedback && !feedbackPlan && launchFeedback}
      {launch.state.status === 'loading' && <Text style={styles.noticeCopy}>Checking workout start…</Text>}
      {state.status === 'loading' && <View style={[styles.status, styles.loading]}><ActivityIndicator color={colors.accent} /><Text style={styles.copy}>Loading templates…</Text></View>}
      {state.status === 'error' && <View accessibilityRole="alert" style={styles.status}><Text style={styles.statusTitle}>Could not load templates</Text><Text style={[styles.copy, styles.statusCopy]}>Check your connection and try again without reloading the page.</Text><Pressable accessibilityRole="button" onPress={retryRead} style={styles.readRetry}><Text style={styles.readRetryText}>Try again</Text></Pressable></View>}
      {state.status === 'ready' && state.fromCache && <View accessibilityRole="alert" style={styles.cache}><Text style={styles.copy}>{plans.length ? 'Showing plans saved on this device. Starting requires a connection.' : 'Could not confirm your saved plans. This device has no copy to check offline.'}</Text><Pressable accessibilityRole="button" onPress={retryRead} style={styles.retry}><Text style={styles.actionText}>Try again</Text></Pressable></View>}
      {state.status === 'ready' && !state.fromCache && plans.length === 0 && <View style={styles.empty}><Text accessibilityRole="header" style={styles.emptyTitle}>You have no plans yet</Text><Text style={styles.emptyCopy}>A plan stores your days, exercises and sets. Create your first plan to get started.</Text></View>}
      {plans.length > 0 && <View style={styles.board}>{plans.map((plan, planIndex) => {
        const open = shortList || (expanded.uid === uid && expanded.id === plan.id)
        return <View key={plan.id} style={[styles.plan, planIndex < plans.length - 1 && styles.planDivider]}>
          <View style={styles.planHead}><View style={styles.planTitleCopy}><Text accessibilityRole="header" style={styles.planTitle}>{plan.name}</Text>{plan.days.length > 1 && <Text style={styles.daysCount}>{plan.days.length} days</Text>}</View><View style={styles.planActions}><Pressable accessibilityRole="button" accessibilityLabel={`Edit plan ${plan.name}`} disabled={!!planAction} onPress={() => router.navigate(`/templates/${plan.id}/edit`)} style={styles.planAction}><Icon kind="edit" color={colors.strong} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Delete plan ${plan.name}`} disabled={!!planAction} onPress={() => void askDelete(plan)} style={styles.planAction}><Icon kind="delete" color={colors.accent} /></Pressable>{!shortList && <Pressable accessibilityRole="button" accessibilityLabel={`${open ? 'Collapse' : 'Structure'} ${plan.name}`} accessibilityState={{ expanded: open }} onPress={() => setExpanded({ uid, id: open ? null : plan.id })} style={styles.structure}><Icon kind={open ? 'up' : 'down'} color={colors.muted} /></Pressable>}</View></View>
          {planAction?.id === plan.id && <View accessibilityRole="alert" style={styles.feedback}><Text style={styles.copy}>{planAction.status === 'checking' ? 'Checking plan…' : planAction.status === 'deleting' ? 'Deleting plan…' : planAction.error}</Text>{planAction.status === 'error' && <Pressable accessibilityRole="button" onPress={() => { void askDelete(plan, true) }} style={styles.retry}><Text style={styles.actionText}>Try again</Text></Pressable>}</View>}
          {feedback && feedbackPlan?.id === plan.id && launchFeedback}
          {open && <View style={styles.days}>{plan.days.map((day, dayIndex) => {
            const pending = starting && launch.state.selection?.templateId === plan.id && launch.state.selection.dayIndex === dayIndex
            return <View key={`${plan.id}:${dayIndex}`} style={[styles.day, dayIndex < plan.days.length - 1 && styles.dayDivider]}>
              <View style={styles.dayHead}><View style={styles.dayCopy}><Text style={styles.dayTitle}>{day.name}</Text><Text style={styles.exerciseCount}>{day.exercises.length ? `${day.exercises.length} ${pluralize(day.exercises.length, 'exercise', 'exercises')}` : 'No exercises'}</Text></View>{day.exercises.length > 0 ? <Pressable accessibilityRole="button" accessibilityLabel={`Start day ${day.name} from template ${plan.name}`} accessibilityState={{ disabled: !canStart, busy: pending }} disabled={!canStart} onPress={() => void launch.start({ kind: 'template', selection: { templateId: plan.id, dayIndex }, snapshot: plan })} style={[styles.start, !canStart && styles.disabled]}><Text style={styles.startText}>{pending ? 'Starting…' : 'Start'}</Text>{!pending && <Icon kind="play" color={colors.accent} />}</Pressable> : <Pressable accessibilityRole="button" accessibilityLabel={`Edit empty day ${day.name} in plan ${plan.name}`} onPress={() => router.navigate(`/templates/${plan.id}/edit`)} style={styles.start}><Text style={styles.startText}>Edit</Text></Pressable>}</View>
              {day.exercises.length > 0 && <View style={styles.preview}>{day.exercises.slice(0, 5).map((exercise, index) => <View key={index} style={styles.previewItem}>{index > 0 && <Text style={styles.previewText}>·</Text>}<Text style={styles.previewName}>{exercise.name}</Text></View>)}{day.exercises.length > 5 && <View style={styles.previewItem}><Text style={styles.previewText}>·</Text><Text style={styles.previewName}>+{day.exercises.length - 5}</Text></View>}</View>}
            </View>
          })}</View>}
        </View>
      })}</View>}
    </ScrollView>
  </SafeAreaView>
}

function Icon({ kind, color }: { kind: 'play' | 'up' | 'down' | 'edit' | 'delete'; color: string }) {
  const path = kind === 'play' ? 'm8 5 11 7-11 7z' : kind === 'up' ? 'm18 15-6-6-6 6' : kind === 'down' ? 'm6 9 6 6 6-6' : kind === 'edit' ? 'M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4' : 'M4 7h16M10 4h4M6 7l1 13h10l1-13M10 10v7m4-7v7'
  return <Svg accessibilityElementsHidden width={15} height={15} viewBox="0 0 24 24"><Path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, experimental_backgroundImage: 'linear-gradient(115deg, rgba(240, 67, 90, 0.055) 0%, transparent 26%, transparent 68%, rgba(143, 184, 160, 0.065) 100%), linear-gradient(180deg, #0b0a0c 0%, #111012 42%, #0d0c0e 100%)' },
  grain: { ...StyleSheet.absoluteFill, opacity: 0.024 }, grainImage: { width: '100%', height: '100%' },
  heading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, borderBottomColor: 'rgba(244,241,242,0.11)', borderBottomWidth: 1, paddingTop: 16, paddingBottom: 16 },
  newPlan: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#b5213a', experimental_backgroundImage: 'linear-gradient(180deg, #c72e44 0%, #a91f35 100%)' }, newPlanText: { color: '#fff', fontFamily: 'InstrumentSans_700Bold', fontSize: 13 },
  title: { color: colors.strong, fontFamily: 'ArchivoHeading', fontSize: 38.4, lineHeight: 37.632, marginTop: 6.08 },
  summary: { flexDirection: 'row', alignItems: 'baseline', gap: 4.8 }, count: { includeFontPadding: false, lineHeight: 12.672, color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 11.52 }, countNumber: { includeFontPadding: false, lineHeight: 15.656, color: colors.strong, fontFamily: 'SplineSansMono_600SemiBold', fontSize: 14.08 },
  board: { marginTop: 7.2 }, plan: { padding: 0 }, planDivider: { borderBottomColor: colors.line, borderBottomWidth: 1 },
  planHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, paddingTop: 14.4, paddingBottom: 10 }, planTitleCopy: { flex: 1, minWidth: 0 },
  planActions: { flexDirection: 'row', gap: 2 }, planAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  planTitle: { color: colors.strong, fontFamily: 'ArchivoHeading', fontSize: 20.8, lineHeight: 23.3 }, daysCount: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12.48, lineHeight: 18.72, marginTop: 7.2 },
  structure: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  days: { backgroundColor: 'rgba(255,255,255,0.035)', borderRadius: 14, paddingVertical: 7.2, paddingHorizontal: 16, marginBottom: 20 },
  day: { paddingVertical: 14.4 }, dayDivider: { borderBottomColor: 'rgba(244,241,242,0.1)', borderBottomWidth: 1 },
  dayHead: { minHeight: 44, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12.8 }, dayCopy: { flex: 1, minWidth: 0, gap: 2.88 },
  dayTitle: { color: colors.strong, fontFamily: 'InstrumentSans_700Bold', fontSize: 14.72, lineHeight: 22.08 }, exerciseCount: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 11.52, lineHeight: 17.28 },
  start: { flexDirection: 'row', minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', gap: 5.6 }, startText: { color: colors.accent, fontFamily: 'InstrumentSans_700Bold', fontSize: 11.52 }, disabled: { opacity: 0.62 },
  preview: { flexDirection: 'row', flexWrap: 'wrap', gap: 5.6, marginTop: 12 }, previewItem: { flexDirection: 'row', gap: 5.6, maxWidth: '100%' }, previewText: { color: colors.muted, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 11.84, lineHeight: 17.76 }, previewName: { color: colors.muted, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 11.84, lineHeight: 17.76, flexShrink: 1 },
  copy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, lineHeight: 22 },
  status: { alignItems: 'flex-start', paddingVertical: 24 }, loading: { alignItems: 'center', gap: 12 }, statusCopy: { lineHeight: 24, marginTop: 8 }, statusTitle: { color: colors.strong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 18, lineHeight: 28 },
  readRetry: { minHeight: 45, minWidth: 192, marginTop: 24, paddingHorizontal: 16, borderRadius: 8, boxShadow: '0 12px 28px rgba(240,67,90,0.2)', alignItems: 'center', justifyContent: 'center', backgroundColor: '#b5213a', experimental_backgroundImage: 'linear-gradient(180deg, #c72e44 0%, #a91f35 100%)' }, readRetryText: { color: '#fff', fontFamily: 'InstrumentSans_700Bold', fontSize: 14 },
  retry: { minHeight: 44, justifyContent: 'center' }, actionText: { color: colors.accent, fontFamily: 'InstrumentSans_700Bold', fontSize: 13 },
  cache: { gap: 4, paddingVertical: 16 }, feedback: { gap: 4, paddingBottom: 16, paddingTop: 12 },
  activeCopy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12.5, lineHeight: 18, marginTop: 16 }, noticeCopy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12.5, marginTop: 12 },
  empty: { paddingVertical: 17.6, marginTop: 7.2, borderBottomWidth: 1, borderBottomColor: colors.line }, emptyTitle: { color: colors.strong, fontFamily: 'ArchivoHeading', fontSize: 21.6, lineHeight: 23.3 }, emptyCopy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14.08, lineHeight: 21.8, marginTop: 10.4 },
})
