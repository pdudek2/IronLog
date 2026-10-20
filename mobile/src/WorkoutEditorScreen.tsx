import { WORKOUT_LABELS } from '../../src/shared/workoutDisplay'
import grainTexture from '../assets/grain.png'
import { formatCompactVolume } from '../../src/shared/weightUnits'
import { exercises as exerciseCatalog } from '../../data/exercises'
import { EXERCISE_CATEGORY_LABELS, EXERCISE_CATEGORY_COLORS, getEquipmentLabel } from '../../src/lib/exerciseLabels'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ActivityIndicator, BackHandler, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { createSessionRevision, readExerciseMetadata } from './firebase'
import { useActiveRuntime, useAuthRuntime } from './runtime'
import { useSessionRead } from './useSessionRead'
import { workoutEditorJournal } from './fileWorkoutEditorJournal'
import { WorkoutEditorController } from './workoutEditorController'
import { readWorkoutMutation, sendWorkoutMutation } from './workoutMutationNative'
import { normalizeWorkoutDraft, workoutDraftDirty, type WorkoutDraft, type WorkoutDraftExercise } from './workoutEditor'
import { formatWorkoutDate, formatWorkoutDuration } from './history'
import { workoutTitle } from '../../src/lib/workoutCopy'
import type { NavigationExit } from './BottomNavigation'
import HistoryHeader from './HistoryHeader'
import ActiveWorkoutReturnBar from './ActiveWorkoutReturnBar'
import ExercisePicker from './ExercisePicker'
import { useKeyboardReveal } from './useKeyboardReveal'

const c = { bg: '#111012', text: '#f4f1f2', muted: '#a09aa0', accent: '#ff7182', line: 'rgba(244,241,242,0.12)' }
const id = createSessionRevision
interface Dialog { title: string; copy: string; confirm: string; run: () => void; cancel?: () => void; keep?: () => void }
export default function WorkoutEditorScreen({ workoutId, deleting }: { workoutId: string; deleting: boolean }) {
  const { user } = useAuthRuntime()
  return user ? <Editor key={`${user.uid}:${workoutId}`} uid={user.uid} workoutId={workoutId} deleting={deleting} /> : <View style={styles.screen}><Text style={styles.muted}>Restoring sign-in…</Text></View>
}
function Editor({ uid, workoutId, deleting }: { uid: string; workoutId: string; deleting: boolean }) {
  const active = useActiveRuntime(), router = useRouter(), insets = useSafeAreaInsets()
  const { scroll, content: scrollContent } = useKeyboardReveal()
  const [controller] = useState(() => new WorkoutEditorController({ uid, workoutId, owner: id(), units: active.state.units, newId: id, journal: workoutEditorJournal,
    read: op => readWorkoutMutation(uid, workoutId, op), send: op => sendWorkoutMutation(uid, op) }))
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot)
  const draft = state.draft
  const [labelPicker, setLabelPicker] = useState(false)
  const [picking, setPicking] = useState(false), [dialog, setDialog] = useState<Dialog | null>(null)
  const focused = useRef(false), navigated = useRef(false), initialDelete = useRef(deleting)
  const loadCatalog = useCallback(() => readExerciseMetadata(uid), [uid])
  const catalog = useSessionRead(`workout-picker:${uid}`, loadCatalog)
  const metadata = new Map<string, { category: string; equipment: string }>(exerciseCatalog.map(ex => [`global:${ex.id}`, { category: ex.category, equipment: ex.equipment }]))
  if (catalog.state.status === 'ready') for (const ex of catalog.state.data) metadata.set(`user:${ex.id}`, { category: ex.category, equipment: ex.equipment })
  let content = draft?.original
  try { if (draft) content = normalizeWorkoutDraft(draft) } catch { /* keep the last saved summary while a field is incomplete */ }
  const sets = content?.exercises.flatMap(ex => ex.sets) ?? []
  useEffect(() => () => controller.dispose(), [controller])
  const headingFor = (workout: { label?: string | null; exercises: { name: string }[] }) => workoutTitle(workout)
  // The editor always sits on this workout's detail; web replaces it with History, so drop it too and Back cannot reopen a deleted workout.
  const toHistory = () => { router.dismiss(); router.dismissTo('/history') }
  const exitAfter = (toList: boolean) => toList ? toHistory() : router.dismissTo({ pathname: '/workout/[workoutId]', params: { workoutId } })
  function finishNavigation() {
    if (!focused.current || navigated.current) return
    navigated.current = true; exitAfter(draft?.pending?.action === 'delete' || state.phase === 'gone')
  }
  useEffect(() => {
    if (['complete', 'gone', 'pending'].includes(state.phase)) finishNavigation()
  }, [state.phase])
  useEffect(() => {
    if (!initialDelete.current || !draft || state.busy) return
    initialDelete.current = false
    if (!draft.pending) setDialog({ title: 'Delete workout?', copy: `${headingFor(draft.original)} · ${formatWorkoutDate(draft.startedAt)}\nThis removes the workout and updates your records.`, confirm: 'Delete workout', cancel: () => { if (!workoutDraftDirty(draft)) void controller.discard(); else router.dismissTo({ pathname: '/workout/[workoutId]', params: { workoutId } }) }, run: () => { void controller.submit('delete') } })
  }, [draft, state.busy])
  const leave: NavigationExit = proceed => {
    void (async () => {
      if (!await controller.flush() || !focused.current) return
      const current = controller.state.draft
      const go = () => { if (focused.current) void proceed() }
      if (!current || current.pending) { go(); return }
      if (!workoutDraftDirty(current)) { navigated.current = true; if (await controller.discard()) go(); else navigated.current = false; return }
      setDialog({ title: 'Leave this edit?', copy: 'Your changes have not been saved to the workout.', confirm: 'Discard changes',
        run: () => { navigated.current = true; void controller.discard().then(ok => { if (ok) go(); else navigated.current = false }) }, keep: go })
    })()
  }
  useFocusEffect(useCallback(() => {
    focused.current = true; navigated.current = false
    if (['complete', 'gone', 'pending'].includes(controller.state.phase)) {
      navigated.current = true
      exitAfter(controller.state.draft?.pending?.action === 'delete' || controller.state.phase === 'gone')
    }
    else void controller.open()
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (Keyboard.isVisible()) { Keyboard.dismiss(); return true }
      leave(() => router.dismissTo({ pathname: '/workout/[workoutId]', params: { workoutId } })); return true
    })
    return () => { focused.current = false; subscription.remove() }
  }, [controller, workoutId]))
  function change(edit: (draft: WorkoutDraft) => WorkoutDraft) { void controller.change(edit) }
  function changeExercise(rowId: string, edit: (ex: WorkoutDraftExercise) => WorkoutDraftExercise) {
    change(d => ({ ...d, exercises: d.exercises.map(ex => ex.rowId === rowId ? edit(ex) : ex) }))
  }
  const locked = state.busy || !!draft?.pending
  return <SafeAreaView edges={['top']} style={styles.screen}>
    <StatusBar style="light" /><HistoryHeader onRequestAction={(_, go) => leave(go)} /><ActiveWorkoutReturnBar onRequestExit={leave} />
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View pointerEvents="none" style={styles.grain}><Image accessibilityElementsHidden resizeMode="repeat" source={grainTexture} style={styles.grainImage} /></View>
      <ScrollView ref={scroll} innerViewRef={scrollContent} stickyHeaderIndices={[1]} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: 32 + insets.bottom }]}>
        <View>
          <View style={{ alignSelf: 'flex-start' }}><Action title="‹  Back" onPress={() => leave(() => router.dismissTo({ pathname: '/workout/[workoutId]', params: { workoutId } }))} /></View>
          {!draft && state.busy && <ActivityIndicator color={c.accent} />}
          {draft && <View style={styles.heading}><Text style={styles.kicker}>{formatWorkoutDate(draft.startedAt)}</Text><Text accessibilityRole="header" style={styles.title}>{headingFor(draft)}</Text></View>}
        </View>
      <View style={styles.dock}>
        {state.error && <Text accessibilityRole="alert" style={styles.error}>{state.error}</Text>}
        {draft?.pending && state.phase === 'unknown' && <Text style={styles.muted}>{draft.pending.committed ? draft.pending.action === 'delete' ? 'Workout deleted. Stats cleanup is still pending.' : 'Workout saved. Stats are still syncing.' : 'Outcome not confirmed. Your change is saved on this device.'}</Text>}
        <View style={styles.actions}>
          {state.storageFailed ? <Action title="Retry draft" onPress={() => void controller.retryStorage()} />
            : state.phase === 'conflict' ? <Action outlined title="Discard draft" onPress={() => setDialog({ title: 'Discard this draft?', copy: 'The latest saved workout will be kept.', confirm: 'Discard draft', run: () => { void controller.discard() } })} />
              : draft ? <>
                <Action grow outlined title={draft.pending ? 'Back to history' : 'Cancel'} disabled={state.busy} onPress={() => leave(() => exitAfter(!!draft.pending))} />
                <Action grow primary title={state.busy ? 'Saving…' : draft.pending ? 'Check and retry' : 'Save'} disabled={state.busy} onPress={() => void controller.submit(draft.pending?.action ?? 'update')} />
              </> : <Action title="Try again" disabled={state.busy} onPress={() => void controller.open()} />}
        </View>
      </View>
        <View>{draft && <>
          <View style={styles.facts}>{[['Time', formatWorkoutDuration(draft.startedAt, draft.finishedAt)], ['Sets', String(sets.length)], ['Reps', String(sets.reduce((n, set) => n + set.reps, 0))], ['Volume', formatCompactVolume(sets.reduce((n, set) => n + set.weight * set.reps, 0), draft.units)]].map(([label, value]) => <View key={label} style={styles.fact}><Text style={styles.label}>{label}</Text><Text numberOfLines={1} style={styles.factValue}>{value}</Text></View>)}</View>
          <Text style={styles.label}>Session type</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Session type, ${draft.label || 'No label'}`} disabled={locked} onPress={() => setLabelPicker(true)} style={[styles.input, styles.labelInput]}><Text style={styles.labelValue}>{draft.label || 'No label'}</Text><Text style={styles.labelValue}>⌄</Text></Pressable>
          {draft.exercises.map((ex, index) => { const info = metadata.get(`${ex.exerciseSource}:${ex.exerciseId}`); return <View key={ex.rowId} style={styles.exercise}>
            <View style={styles.exerciseHead}><Text accessibilityRole="header" style={styles.exerciseTitle}>{ex.name}</Text><Text style={styles.muted}>{index + 1} / {draft.exercises.length}</Text><Action title="Delete" disabled={locked} onPress={() => change(d => ({ ...d, exercises: d.exercises.filter(item => item.rowId !== ex.rowId) }))} /></View>
            {info && <Text style={styles.muted}><Text style={{ color: EXERCISE_CATEGORY_COLORS[info.category] ?? c.muted }}>{EXERCISE_CATEGORY_LABELS[info.category] ?? info.category}</Text> · {getEquipmentLabel(info.equipment).toLowerCase()}</Text>}
            <Text style={styles.muted}>{ex.sets.length} {ex.sets.length === 1 ? 'set' : 'sets'} · {ex.sets.reduce((sum, set) => sum + (Number(set.reps) || 0), 0)} reps</Text>
            <View style={[styles.row, styles.tableHead]}><Text style={[styles.muted, styles.index]}>#</Text><Text style={[styles.muted, styles.cell]}>{draft.units}</Text><Text style={[styles.muted, styles.cell]}>Reps</Text><View style={styles.remove} /></View>
            {ex.sets.map((set, setIndex) => <View key={set.rowId} style={styles.row}>
              <Text style={[styles.index, styles.setNumber]}>{setIndex + 1}</Text>
              <TextInput accessibilityLabel={`Weight, ${ex.name}, set ${setIndex + 1}, ${draft.units}`} keyboardType="decimal-pad" maxLength={32} editable={!locked} value={set.weight} style={[styles.input, styles.cell]} selectTextOnFocus onChangeText={weight => changeExercise(ex.rowId, item => ({ ...item, sets: item.sets.map(s => s.rowId === set.rowId ? { ...s, weight } : s) }))} />
              <TextInput accessibilityLabel={`Reps, ${ex.name}, set ${setIndex + 1}`} keyboardType="number-pad" maxLength={16} editable={!locked} value={set.reps} style={[styles.input, styles.cell]} selectTextOnFocus onChangeText={reps => changeExercise(ex.rowId, item => ({ ...item, sets: item.sets.map(s => s.rowId === set.rowId ? { ...s, reps } : s) }))} />
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove set ${setIndex + 1}, ${ex.name}`} disabled={locked || ex.sets.length <= 1} onPress={() => changeExercise(ex.rowId, item => ({ ...item, sets: item.sets.filter(s => s.rowId !== set.rowId) }))} style={styles.remove}><Text style={styles.muted}>{ex.sets.length > 1 ? '×' : ''}</Text></Pressable>
            </View>)}
            <Action outlined title="+ Set" disabled={locked || ex.sets.length >= 20} onPress={() => changeExercise(ex.rowId, item => ({ ...item, sets: [...item.sets, { rowId: id(), weight: '0', reps: '' }] }))} />
          </View> })}
          <Action outlined title="+ Add exercise" disabled={locked || draft.exercises.length >= 20} onPress={() => setPicking(true)} />
        </>}</View>
      </ScrollView>

    </KeyboardAvoidingView>
    {picking && <ExercisePicker userExercises={catalog.state} onRetryUserExercises={catalog.retry} onClose={() => setPicking(false)} onSelect={(exerciseId, name, exerciseSource) => {
      change(d => ({ ...d, exercises: [...d.exercises, { rowId: id(), exerciseId, name, exerciseSource, sets: [{ rowId: id(), weight: '0', reps: '' }] }] })); setPicking(false)
    }} />}
    {labelPicker && draft && <Modal transparent animationType="fade" onRequestClose={() => setLabelPicker(false)} statusBarTranslucent navigationBarTranslucent><View style={styles.backdrop}><View style={[styles.dialog, { maxHeight: '80%' }]}><Text style={[styles.exerciseTitle, { flex: 0 }]}>Session type</Text><ScrollView>{[...new Set(['', draft.label, ...WORKOUT_LABELS])].map(label => <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: draft.label === label }} onPress={() => { change(d => ({ ...d, label })); setLabelPicker(false) }} style={styles.action}><Text style={[styles.actionText, draft.label === label && { color: c.accent }]}>{label || 'No label'}</Text></Pressable>)}</ScrollView><Action outlined title="Cancel" onPress={() => setLabelPicker(false)} /></View></View></Modal>}
    {dialog && <Modal transparent animationType="fade" onRequestClose={() => { const cancel = dialog.cancel; setDialog(null); cancel?.() }} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.backdrop}><View accessibilityViewIsModal style={styles.dialog}>
        <Text accessibilityRole="header" style={[styles.exerciseTitle, { flex: 0 }]}>{dialog.title}</Text><Text style={styles.muted}>{dialog.copy}</Text>
        <Action outlined title={dialog.keep ? 'Keep editing' : 'Cancel'} onPress={() => { const cancel = dialog.cancel; setDialog(null); cancel?.() }} />
        {dialog.keep && <Action title="Leave with draft" onPress={() => { const go = dialog.keep!; setDialog(null); go() }} />}
        <Action primary title={dialog.confirm} onPress={() => { const go = dialog.run; setDialog(null); go() }} />
      </View></View>
    </Modal>}
  </SafeAreaView>
}
function Action({ title, onPress, disabled, primary, outlined, grow }: { title: string; onPress: () => void; disabled?: boolean; primary?: boolean; outlined?: boolean; grow?: boolean }) {
  const button = <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.action, outlined && styles.outline, primary && styles.primary, disabled && { opacity: .4 }]}><Text style={[styles.actionText, title === 'Delete' && { color: '#ffb45e' }, primary && { color: '#fff' }]}>{title}</Text></Pressable>
  return grow ? <View style={{ flex: 1, minWidth: 0 }}>{button}</View> : button
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg }, content: { padding: 16, paddingBottom: 32, experimental_backgroundImage: 'linear-gradient(115deg, rgba(240,67,90,0.055) 0%, transparent 26%, transparent 68%, rgba(143,184,160,0.065) 100%), linear-gradient(180deg, #0b0a0c 0%, #111012 42%, #0d0c0e 100%)' },
  grain: { height: '100%', opacity: .024, position: 'absolute', width: '100%' }, grainImage: { height: '100%', width: '100%' },
  facts: { flexDirection: 'row', backgroundColor: '#151316', marginHorizontal: -16, paddingHorizontal: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.line, marginBottom: 24 }, fact: { flex: 1, minWidth: 0, paddingVertical: 15 }, factValue: { color: '#fff', fontFamily: 'SplineSansMono_600SemiBold', fontSize: 16, letterSpacing: -.4 },
  heading: { paddingTop: 18, paddingBottom: 22, marginBottom: 0 },
  title: { color: '#fff', fontFamily: 'ArchivoHeading', fontSize: 34, lineHeight: 36, marginTop: 9 },
  kicker: { color: c.muted, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 12 },
  label: { color: c.muted, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 12, marginBottom: 8 },
  input: { minHeight: 44, color: '#fff', backgroundColor: 'rgba(255,255,255,0.045)', borderWidth: 1, borderColor: c.line, borderRadius: 8, textAlign: 'center', fontFamily: 'SplineSansMono_600SemiBold', fontSize: 13, padding: 6 },
  labelInput: { width: 288, maxWidth: '100%', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, labelValue: { color: '#fff', fontFamily: 'InstrumentSans_600SemiBold', fontSize: 13 },
  exercise: { paddingTop: 30, paddingBottom: 22, borderBottomWidth: 1, borderBottomColor: c.line, gap: 8 },
  exerciseHead: { flexDirection: 'row', alignItems: 'center', gap: 8 }, exerciseTitle: { color: '#fff', fontFamily: 'InstrumentSans_600SemiBold', fontSize: 21, letterSpacing: -.35, lineHeight: 25, flex: 1 },
  muted: { color: c.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 6, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: c.line },
  tableHead: { backgroundColor: '#211f23', minHeight: 38, marginTop: 8 },
  index: { width: 20, textAlign: 'center' }, cell: { flex: 1, textAlign: 'center' }, remove: { width: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }, setNumber: { color: '#8fb8a0', fontFamily: 'SplineSansMono_600SemiBold', fontSize: 12 },
  action: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center', borderRadius: 8 }, outline: { borderWidth: 1, borderColor: c.line }, primary: { backgroundColor: '#bd203b' }, actionText: { color: c.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 13 },
  dock: { paddingHorizontal: 16, paddingTop: 0, paddingBottom: 28, marginHorizontal: -16, backgroundColor: '#111012', gap: 8 }, actions: { flexDirection: 'row', gap: 8 }, error: { color: '#ffbd7a', fontFamily: 'InstrumentSans_400Regular', fontSize: 12, lineHeight: 18 },
  backdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.7)' }, dialog: { backgroundColor: '#211f23', borderRadius: 12, padding: 20, gap: 16 },
})
