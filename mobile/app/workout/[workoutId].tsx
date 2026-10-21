import WorkoutDraftRecovery from '../../src/WorkoutDraftRecovery'
import { useCallback, useMemo, useRef } from 'react'
import { ActivityIndicator, BackHandler, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import Svg, { Path } from 'react-native-svg'

import { exercises as exerciseCatalog } from '../../../data/exercises'
import { EXERCISE_CATEGORY_COLORS, EXERCISE_CATEGORY_LABELS, getEquipmentLabel } from '../../../src/lib/exerciseLabels'
import { formatCompactVolume, kgToDisplayWeight } from '../../../src/shared/weightUnits'
import { readExerciseMetadata, readSavedWorkout } from '../../src/firebase'
import { useSessionRead } from '../../src/useSessionRead'
import { useActiveRuntime, useAuthRuntime, useOptionalClosureRuntime } from '../../src/runtime'
import ActiveWorkoutReturnBar from '../../src/ActiveWorkoutReturnBar'
import HistoryHeader from '../../src/HistoryHeader'
import { formatWorkoutDate, formatWorkoutDuration, workoutFocusLabel, workoutSetVolumeLabel } from '../../src/history'
import { workoutTitle } from '../../../src/lib/workoutCopy'
import grainTexture from '../../assets/grain.png'
import { colors, pageBackground } from '../../src/theme'
import { Icon } from '../../src/icons'

export default function SavedWorkoutScreen() {
  const { workoutId: routeId, saved } = useLocalSearchParams<{ workoutId: string; saved?: string }>()
  const workoutId = Array.isArray(routeId) ? routeId[0] ?? '' : routeId ?? ''
  const validWorkoutId = Boolean(workoutId && !workoutId.includes('/'))
  const { user } = useAuthRuntime()
  const active = useActiveRuntime()
  const closure = useOptionalClosureRuntime()
  const router = useRouter()
  const uid = user?.uid ?? null
  const workoutLoader = useCallback(() => uid && validWorkoutId
    ? readSavedWorkout(uid, workoutId)
    : Promise.resolve({ data: null, fromCache: false }), [uid, validWorkoutId, workoutId])
  const metadataLoader = useCallback(() => uid ? readExerciseMetadata(uid) : Promise.resolve({ data: [], fromCache: false }), [uid])
  const workoutRead = useSessionRead(`saved-workout:${uid ?? ''}:${workoutId}`, workoutLoader, Boolean(uid && validWorkoutId))
  const metadata = useSessionRead(`history-exercises:${uid ?? ''}`, metadataLoader, Boolean(uid))
  const workout = workoutRead.state.status === 'ready' ? workoutRead.state.data : null

  // Like web, only the navigation that follows Finish shows the result, and its Back leaves for Home.
  const resultIsValid = saved === '1' && closure?.completed?.action === 'finish' && closure.completed.workoutId === workoutId
  const back = () => {
    if (resultIsValid) router.dismissTo('/dashboard')
    else if (router.canGoBack()) router.back()
    else router.replace('/history')
  }
  // After a cold start Finish replaces the only route with this screen, so Android Back would leave the app.
  const latestBack = useRef(back)
  latestBack.current = back
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { latestBack.current(); return true })
    return () => subscription.remove()
  }, []))
  const retryWorkout = workoutRead.retry
  const exerciseMap = useMemo(() => {
    const entries = new Map<string, { category?: string; equipment?: string }>(exerciseCatalog.map((exercise) => [`global:${exercise.id}`, exercise]))
    if (metadata.state.status === 'ready') {
      for (const exercise of metadata.state.data) entries.set(`user:${exercise.id}`, exercise)
    }
    return entries
  }, [metadata.state])
  const heroLabel = workout ? workoutTitle(workout) : ''
  const focusLabel = workoutFocusLabel(workout?.exercises.map((exercise) => exercise.exerciseId
    ? exerciseMap.get(`${exercise.exerciseSource}:${exercise.exerciseId}`)?.category : undefined) ?? [])
  const totalSets = workout?.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0) ?? 0
  const totalReps = workout?.exercises.reduce((sum, exercise) => sum + exercise.sets.reduce((inner, set) => inner + set.reps, 0), 0) ?? 0
  const volume = workout?.exercises.reduce((sum, exercise) => sum + exercise.sets.reduce((inner, set) => inner + set.weight * set.reps, 0), 0) ?? 0

  if (!user) return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <StatusBar style="light" />
      <Text accessibilityLiveRegion="polite" style={styles.statusText}>Restoring sign-in…</Text>
    </SafeAreaView>
  )

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <StatusBar style="light" />
      <HistoryHeader />
      <ActiveWorkoutReturnBar />
      <ScrollView contentContainerStyle={styles.content}>
        <View pointerEvents="none" style={styles.grain}><Image accessibilityElementsHidden resizeMode="repeat" source={grainTexture} style={styles.grainImage} /></View>
        <View style={styles.navRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} style={styles.backButton}>
            <Svg accessibilityElementsHidden height={16} width={16} viewBox="0 0 24 24"><Path d="m12 19-7-7 7-7" fill="none" stroke={colors.muted} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /><Path d="M19 12H5" fill="none" stroke={colors.muted} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></Svg><Text style={styles.backText}>{resultIsValid ? 'Back to Home' : 'Back'}</Text>
          </Pressable>
        </View>

        <WorkoutDraftRecovery uid={user.uid} workoutId={workoutId} />
        {resultIsValid && <View style={styles.resultBanner}>
          <View accessibilityElementsHidden style={styles.resultMark}><Icon name="check" size={18} color={colors.recovery} /></View>
          <View style={styles.resultCopy}><Text style={styles.resultTitle}>Workout saved</Text><Text style={styles.resultSubtitle}>Your completed session is ready below.</Text></View>
        </View>}

        {validWorkoutId && workoutRead.state.status === 'loading' && <View style={styles.feedbackRow}><ActivityIndicator color={colors.accent} /><Text style={styles.statusText}>Loading workout…</Text></View>}
        {!validWorkoutId && <View style={styles.emptyState}><Text style={styles.statusText}>Workout not found.</Text></View>}
        {workoutRead.state.status === 'error' && <View accessibilityRole="alert" style={styles.notice}>
          <Text style={styles.noticeTitle}>{resultIsValid ? 'Workout saved, but its summary could not load.' : 'Could not load workout.'}</Text>
          <Pressable accessibilityRole="button" onPress={retryWorkout} style={styles.retryButton}><Text style={styles.retryText}>Try again</Text></Pressable>
        </View>}
        {workoutRead.state.status === 'ready' && !workoutRead.state.data && workoutRead.state.fromCache && <View accessibilityRole="alert" style={styles.notice}>
          <Text style={styles.noticeTitle}>Could not confirm this workout is missing.</Text>
          <Text style={styles.statusText}>This device has no saved copy to check while offline.</Text>
          <Pressable accessibilityRole="button" onPress={retryWorkout} style={styles.retryButton}><Text style={styles.retryText}>Try again</Text></Pressable>
        </View>}
        {workoutRead.state.status === 'ready' && workoutRead.state.data && workoutRead.state.fromCache && <View style={styles.cacheNoticeRow}>
          <Text style={styles.cacheNotice}>Showing the saved copy on this device.</Text>
          <Pressable accessibilityRole="button" onPress={retryWorkout} style={styles.retryButton}><Text style={styles.retryText}>Try again</Text></Pressable>
        </View>}
        {workoutRead.state.status === 'ready' && !workoutRead.state.data && !workoutRead.state.fromCache && <View style={styles.emptyState}><Text style={styles.statusText}>Workout not found.</Text></View>}

        {metadata.state.status === 'error' && <View accessibilityRole="alert" style={styles.metadataNotice}>
          <Text style={styles.statusText}>Could not load your exercises. The saved workout is still available, but some categories may be incomplete.</Text>
          <Pressable accessibilityRole="button" onPress={metadata.retry} style={styles.retryButton}><Text style={styles.retryText}>Try again</Text></Pressable>
        </View>}

        {workout && <>
          <View style={styles.sessionHead}>
            <Text style={styles.kicker}>{formatWorkoutDate(workout.startedAt)}{focusLabel ? ` · ${focusLabel}` : ''}</Text>
            <Text accessibilityRole="header" style={styles.workoutName}>{heroLabel}</Text>
          </View>

          <View style={styles.mutationActions}>
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/workout-edit/[workoutId]', params: { workoutId } })} style={styles.editAction}><Text style={[styles.retryText, { color: colors.textStrong, textAlign: 'center' }]}>Edit workout</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/workout-edit/[workoutId]', params: { workoutId, action: 'delete' } })} style={styles.retryButton}><Text style={[styles.retryText, { color: colors.warning }]}>Delete</Text></Pressable>
          </View>

          <View accessibilityLabel="Workout summary" style={styles.facts}>
            <SummaryFact label="Time" value={formatWorkoutDuration(workout.startedAt, workout.finishedAt)} />
            <SummaryFact label="Sets" value={String(totalSets)} />
            <SummaryFact label="Reps" value={String(totalReps)} />
            <SummaryFact label="Volume" value={formatCompactVolume(volume, active.state.units)} />
          </View>

          {!workout.materialized && <Text accessibilityLiveRegion="polite" style={styles.projectionStatus}>Stats are still syncing.</Text>}

          <View style={styles.exerciseList}>
            {workout.exercises.map((exercise, index) => {
              const exerciseData = exercise.exerciseId ? exerciseMap.get(`${exercise.exerciseSource}:${exercise.exerciseId}`) : undefined
              const accent = EXERCISE_CATEGORY_COLORS[exerciseData?.category ?? ''] ?? colors.muted
              const category = exerciseData?.category ? EXERCISE_CATEGORY_LABELS[exerciseData.category] ?? exerciseData.category : null
              const equipment = exerciseData?.equipment ? getEquipmentLabel(exerciseData.equipment) : null
              const reps = exercise.sets.reduce((sum, set) => sum + set.reps, 0)
              return <View key={`${exercise.exerciseSource}:${exercise.exerciseId ?? exercise.name}:${index}`} style={styles.exercisePanel}>
                <View style={styles.exerciseHead}>
                  <View style={styles.exerciseTitleRow}>
                    <Text accessibilityRole="header" style={styles.exerciseName}>{exercise.name}</Text>
                    <Text style={styles.sequence}>{index + 1} / {workout.exercises.length}</Text>
                  </View>
                  {(category || equipment) && <Text style={styles.taxonomy}>{category ? <Text style={{ color: accent }}>{category}</Text> : null}{category && equipment ? ' · ' : ''}{equipment}</Text>}
                  <Text style={styles.exerciseTotals}>{exercise.sets.length} {exercise.sets.length === 1 ? 'set' : 'sets'}<Text style={styles.exerciseReps}> · {reps} reps</Text></Text>
                </View>
                <View accessibilityLabel={`Sets: ${exercise.name}`} style={styles.table}>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.cell, styles.indexCell, styles.headerCell]}>Set</Text>
                    <Text style={[styles.cell, styles.headerCell]}>Weight {active.state.units}</Text>
                    <Text style={[styles.cell, styles.headerCell]}>Reps</Text>
                    <Text style={[styles.cell, styles.headerCell]}>Vol. {active.state.units}</Text>
                  </View>
                  {exercise.sets.map((set, setIndex) => <View key={setIndex} style={[styles.tableRow, setIndex % 2 === 0 && styles.tableRowShaded]}>
                    <Text style={[styles.cell, styles.indexCell, styles.setIndex]}>{setIndex + 1}</Text>
                    <Text style={styles.cell}>{kgToDisplayWeight(set.weight, active.state.units)}</Text>
                    <Text style={styles.cell}>{set.reps}</Text>
                    <Text style={styles.cell}>{workoutSetVolumeLabel(set.weight, set.reps, active.state.units)}</Text>
                  </View>)}
                </View>
              </View>
            })}
          </View>
        </>}
      </ScrollView>
    </SafeAreaView>
  )
}

function SummaryFact({ label, value }: { label: string; value: string }) {
  return <View style={styles.fact}>
    <Text style={styles.factLabel}>{label}</Text>
    <Text numberOfLines={1} style={styles.factValue}>{value}</Text>
  </View>
}

const styles = StyleSheet.create({
  mutationActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-start', paddingBottom: 16 },
  editAction: { flex: 1, minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 8 },
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { flexGrow: 1, paddingBottom: 36, paddingHorizontal: 16, paddingTop: 16, experimental_backgroundImage: pageBackground },
  grain: { height: '100%', opacity: 0.024, position: 'absolute', width: '100%' },
  grainImage: { height: '100%', width: '100%' },
  navRow: { alignItems: 'center', flexDirection: 'row', minHeight: 44 },
  backButton: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 5, minHeight: 40, paddingHorizontal: 1 },
  backText: { color: colors.muted, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 13 },
  resultBanner: { alignItems: 'center', backgroundColor: 'rgba(143, 184, 160, 0.08)', borderColor: 'rgba(143, 184, 160, 0.3)', borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, marginBottom: 10, marginTop: 4, padding: 14 },
  resultMark: { alignItems: 'center', backgroundColor: 'rgba(143, 184, 160, 0.13)', borderRadius: 50, height: 36, justifyContent: 'center', width: 36 },
  check: { color: colors.accentText, fontFamily: 'InstrumentSans_700Bold', fontSize: 18 },
  resultCopy: { flex: 1 },
  resultTitle: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 16 },
  resultSubtitle: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, lineHeight: 18, marginTop: 2 },
  sessionHead: { paddingBottom: 22, paddingTop: 18 },
  kicker: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 12, marginBottom: 9 },
  workoutName: { color: colors.textStrong, fontFamily: 'ArchivoHeading', fontSize: 34, lineHeight: 34 },
  facts: { backgroundColor: colors.backgroundElevated, borderBottomColor: colors.lineStrong, borderBottomWidth: StyleSheet.hairlineWidth, borderTopColor: colors.lineStrong, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', marginHorizontal: -16, paddingHorizontal: 16 },
  fact: { flex: 1, minWidth: 0, paddingVertical: 15 },
  factLabel: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 12, marginBottom: 6 },
  factValue: { color: colors.textStrong, fontFamily: 'SplineSansMono_600SemiBold', fontSize: 16, letterSpacing: -0.4 },
  projectionStatus: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, lineHeight: 18, marginTop: 9 },
  exerciseList: { minWidth: 0 },
  exercisePanel: { paddingBottom: 19, paddingTop: 30 },
  exerciseHead: { marginBottom: 20 },
  exerciseTitleRow: { alignItems: 'baseline', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  exerciseName: { color: colors.textStrong, flex: 1, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 21, letterSpacing: -0.35, lineHeight: 25 },
  sequence: { color: colors.muted, fontFamily: 'SplineSansMono_600SemiBold', fontSize: 12 },
  taxonomy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, lineHeight: 19, marginTop: 6 },
  exerciseTotals: { color: colors.text, fontFamily: 'InstrumentSans_500Medium', fontSize: 13, marginTop: 15 },
  exerciseReps: { color: colors.muted },
  table: { marginHorizontal: -16 },
  tableHeader: { alignItems: 'center', flexDirection: 'row', minHeight: 46 },
  tableRow: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 46 },
  tableRowShaded: { backgroundColor: 'rgba(255,255,255,0.035)' },
  cell: { color: colors.text, flex: 1, fontFamily: 'SplineSansMono_600SemiBold', fontSize: 13, fontVariant: ['tabular-nums'], textAlign: 'right', paddingRight: 16 },
  headerCell: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 12 },
  indexCell: { flex: 0, width: 54, paddingLeft: 16, paddingRight: 0, textAlign: 'left' },
  setIndex: { color: colors.recovery },
  feedbackRow: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingVertical: 15 },
  notice: { backgroundColor: colors.surfaceRaised, gap: 6, marginTop: 10, padding: 14 },
  noticeTitle: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 15 },
  retryButton: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44, paddingHorizontal: 2 },
  retryText: { color: colors.accentText, fontFamily: 'InstrumentSans_700Bold', fontSize: 12 },
  cacheNoticeRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10 },
  cacheNotice: { color: colors.muted, flex: 1, fontFamily: 'InstrumentSans_500Medium', fontSize: 12 },
  metadataNotice: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, gap: 4, marginTop: 10, paddingVertical: 8 },
  emptyState: { paddingVertical: 22 },
  statusText: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, lineHeight: 19 },
})
