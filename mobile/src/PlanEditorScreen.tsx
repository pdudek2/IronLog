import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, BackHandler, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'

import ExercisePicker from './ExercisePicker'
import HistoryHeader from './HistoryHeader'
import { createSessionRevision, PlanRequestError, readExerciseMetadata, readTemplateFromServer, readUnits, savePlan } from './firebase'
import { useActiveRuntime, useAuthRuntime } from './runtime'
import { useSessionRead } from './useSessionRead'
import { newPlanDraft, normalizePlanDraft, type EditorDay, type PlanDraft } from './planEditor'
import { planEditorJournal } from './filePlanEditorJournal'
import { templateFingerprint } from '../../src/shared/templateFingerprint'

const colors = { background: '#111012', surface: '#1a191c', text: '#f4f1f2', muted: '#a09aa0', accent: '#ff7182', line: 'rgba(244,241,242,0.12)' }
const newId = () => createSessionRevision()

export default function PlanEditorScreen({ targetId }: { targetId: string | null }) {
  const { user } = useAuthRuntime()
  if (!user) return <SafeAreaView style={styles.screen}><Text style={styles.muted}>Restoring sign-in…</Text></SafeAreaView>
  return <Editor key={`${user.uid}:${targetId ?? 'new'}`} uid={user.uid} targetId={targetId} />
}

function Editor({ uid, targetId }: { uid: string; targetId: string | null }) {
  const router = useRouter()
  const active = useActiveRuntime()
  const insets = useSafeAreaInsets()
  const [draft, setDraft] = useState<PlanDraft | null>(null)
  const draftRef = useRef<PlanDraft | null>(null)
  const writeRef = useRef<Promise<void>>(Promise.resolve())
  const sequence = useRef(0)
  const alive = useRef(true)
  const inputFocused = useRef(false)
  const [loadingError, setLoadingError] = useState<string | null>(null)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [reloadAvailable, setReloadAvailable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [durable, setDurable] = useState(true)
  const [picking, setPicking] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const loadMetadata = useCallback(() => readExerciseMetadata(uid), [uid])
  const catalog = useSessionRead(uid, loadMetadata, picking)

  useEffect(() => {
    alive.current = true
    let cancelled = false
    setDraft(null); draftRef.current = null; setLoadingError(null); setMessage(null); setReloadAvailable(false)
    void (async () => {
      try {
        const existing = await planEditorJournal.load(uid, targetId)
        if (cancelled) return
        if (existing) { draftRef.current = existing; setDraft(existing); return }
        const [units, template] = await Promise.all([readUnits(uid), targetId ? readTemplateFromServer(uid, targetId) : Promise.resolve(null)])
        if (cancelled) return
        if (targetId && !template) { setLoadingError('Plan was deleted or is unavailable.'); return }
        const fresh = newPlanDraft(newId(), units, template, newId)
        await planEditorJournal.save(uid, fresh)
        if (cancelled) return
        draftRef.current = fresh; setDraft(fresh)
      } catch (error) { if (!cancelled) setLoadingError(error instanceof Error ? error.message : 'Could not open plan editor.') }
    })()
    return () => { cancelled = true; alive.current = false }
  }, [uid, targetId, attempt])

  function persist(next: PlanDraft): Promise<void> {
    const updated = { ...next, revision: (draftRef.current?.revision ?? next.revision) + 1 }
    draftRef.current = updated
    setDraft(updated)
    setStorageError(null); setDurable(false)
    const token = ++sequence.current
    const write = planEditorJournal.save(uid, updated)
    writeRef.current = write
    void write.then(() => { if (alive.current && sequence.current === token) setDurable(true) },
      () => { if (alive.current && sequence.current === token) { setStorageError('Draft could not be saved on this device. Retry before leaving or saving.'); setDurable(false) } })
    return write
  }
  function change(edit: (current: PlanDraft) => PlanDraft) {
    const current = draftRef.current
    if (!current || current.pending || busy) return
    void persist(edit(current))
    setMessage(null); setReloadAvailable(false)
  }
  function changeDay(edit: (day: EditorDay) => EditorDay) {
    change((current) => ({ ...current, days: current.days.map((day) => day.rowId === current.selectedDayId ? edit(day) : day) }))
  }
  function leave(destination: 'back' | 'plans' | 'workout') {
    const go = () => {
      if (destination === 'workout') router.navigate('/')
      else if (destination === 'plans') router.replace('/templates')
      else router.back()
    }
    if (!draftRef.current) { go(); return }
    Alert.alert(draftRef.current.pending ? 'Save outcome unresolved' : 'Leave editor?',
      draftRef.current.pending ? 'The saved operation will remain on this device. Return here to retry it.' : 'Your plan draft will remain on this device.',
      [{ text: 'Stay', style: 'cancel' }, { text: 'Leave and keep draft', onPress: go }])
  }
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (picking) { setPicking(false); return true }
      if (inputFocused.current) { Keyboard.dismiss(); inputFocused.current = false; return true }
      leave('back'); return true
    })
    return () => subscription.remove()
  }, [picking]))

  async function save() {
    let current = draftRef.current
    if (!current || busy) return
    setBusy(true); setMessage(null)
    try {
      await writeRef.current
      if (storageError) throw new Error('Draft storage needs a successful retry.')
      current = draftRef.current!
      if (!current.pending) {
        const request = normalizePlanDraft(current, newId())
        await persist({ ...current, pending: request })
        current = draftRef.current!
      }
      const submitted = current.pending!
      const acknowledged = await savePlan(uid, submitted)
      if (!alive.current) return
      const confirmed = await readTemplateFromServer(uid, acknowledged.id)
      if (!alive.current) return
      if (!confirmed || templateFingerprint(confirmed) !== templateFingerprint(submitted)) {
        await persist({ ...draftRef.current!, pending: null })
        setReloadAvailable(true)
        throw new Error(confirmed ? 'Plan changed after saving. Your draft is retained.' : 'Plan was deleted after saving. Your draft is retained.')
      }
      const cleared = await planEditorJournal.clearIfMatches(uid, targetId, current.draftId, current.revision)
      if (!alive.current) return
      if (!cleared) throw new Error('A newer local draft exists. It was kept on this device.')
      router.replace('/templates')
    } catch (error) {
      if (!alive.current) return
      if (error instanceof PlanRequestError && (error.status === 409 || error.status === 404)) {
        const present = draftRef.current
        if (present?.pending) { try { await persist({ ...present, pending: null }) } catch { /* storage error is displayed by persist */ } }
        setReloadAvailable(true)
      }
      setMessage(error instanceof Error ? error.message : 'Could not save plan. Retry with the same operation.')
    } finally { if (alive.current) setBusy(false) }
  }
  async function discard() {
    const current = draftRef.current
    if (!current || current.pending || busy) return
    Alert.alert('Discard draft?', 'Your local changes will be removed.', [{ text: 'Keep draft', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => {
      void planEditorJournal.clearIfMatches(uid, targetId, current.draftId, current.revision).then((cleared) => {
        if (alive.current && cleared) router.replace('/templates')
        else if (alive.current) setMessage('Could not discard this draft. Retry.')
      }, () => { if (alive.current) setStorageError('Could not remove local draft. Retry.') })
    } }])
  }
  function reload() {
    Alert.alert('Reload plan?', 'This discards local changes and loads the latest server version.', [{ text: 'Keep draft', style: 'cancel' }, { text: 'Reload', style: 'destructive', onPress: () => {
      const current = draftRef.current
      if (!current || current.pending) return
      void planEditorJournal.clearIfMatches(uid, targetId, current.draftId, current.revision).then((cleared) => {
        if (alive.current && cleared) setAttempt((value) => value + 1)
        else if (alive.current) setStorageError('Could not discard the local draft.')
      }, () => { if (alive.current) setStorageError('Could not discard the local draft.') })
    } }])
  }
  if (!draft) return <SafeAreaView edges={['top']} style={styles.screen}><StatusBar style="light" /><View style={styles.loading}>{loadingError ? <><Text style={styles.error}>{loadingError}</Text><Pressable onPress={() => setAttempt((value) => value + 1)} style={styles.button}><Text style={styles.actionText}>Retry</Text></Pressable><Pressable onPress={() => router.replace('/templates')} style={styles.button}><Text style={styles.muted}>Plans</Text></Pressable></> : <ActivityIndicator color={colors.accent} />}</View></SafeAreaView>
  const day = draft.days.find((item) => item.rowId === draft.selectedDayId) ?? draft.days[0]!
  const locked = busy || !!draft.pending
  const canAddDay = draft.days.length < 14
  const error = storageError ?? message
  return <SafeAreaView edges={['top']} style={styles.screen}>
    <StatusBar style="light" />
    <HistoryHeader />
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}><Pressable accessibilityRole="button" onPress={() => leave('plans')} style={styles.headerLink}><Text style={styles.muted}>‹  Plans</Text></Pressable><Text accessibilityRole="header" style={styles.title}>{targetId ? 'Edit plan' : 'New plan'}</Text>{active.state.status === 'ready' && <Pressable accessibilityRole="button" onPress={() => leave('workout')} style={styles.headerLink}><Text style={styles.accent}>Return</Text></Pressable>}</View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Text style={styles.label}>NAME</Text>
        <TextInput accessibilityLabel="Plan name" editable={!locked} maxLength={120} value={draft.name} onFocus={() => { inputFocused.current = true }} onBlur={() => { inputFocused.current = false }} onChangeText={(value) => change((current) => ({ ...current, name: value }))} placeholder="E.g. Upper / Lower 4 days" placeholderTextColor={colors.muted} style={styles.nameInput} />
        <View style={styles.selector}><ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={styles.tabsContent}>{draft.days.map((item, index) => <Pressable key={item.rowId} accessibilityRole="tab" accessibilityState={{ selected: item.rowId === day.rowId }} onPress={() => change((current) => ({ ...current, selectedDayId: item.rowId }))} style={[styles.tab, item.rowId === day.rowId && styles.selectedTab]}><Text style={[styles.tabText, item.rowId === day.rowId && styles.tabTextSelected]}>{item.name.trim() || `Day ${index + 1}`}</Text><Text style={styles.tabCount}>{item.exercises.length} ex. · {item.exercises.reduce((sum, exercise) => sum + (Number(exercise.sets) || 0), 0)} sets</Text></Pressable>)}</ScrollView><Pressable accessibilityRole="button" disabled={!canAddDay || locked} onPress={() => { const rowId = newId(); change((current) => ({ ...current, selectedDayId: rowId, days: [...current.days, { rowId, name: `Day ${current.days.length + 1}`, exercises: [] }] })) }} style={styles.addDay}><Text style={styles.addDayText}>＋ Add day</Text></Pressable></View>
        <View style={styles.dayEditor}><View style={styles.dayHeading}><Text style={styles.label}>DAY NAME</Text>{draft.days.length > 1 && <Pressable accessibilityRole="button" disabled={locked} onPress={() => change((current) => { const days = current.days.filter((item) => item.rowId !== day.rowId); return { ...current, days, selectedDayId: days[0]!.rowId } })} style={styles.textButton}><Text style={styles.muted}>Remove day</Text></Pressable>}</View><TextInput accessibilityLabel="Day name" editable={!locked} maxLength={80} value={day.name} onFocus={() => { inputFocused.current = true }} onBlur={() => { inputFocused.current = false }} onChangeText={(value) => changeDay((item) => ({ ...item, name: value }))} style={styles.dayInput} />
          {day.exercises.map((exercise) => <View key={exercise.rowId} style={styles.exercise}><View style={styles.exerciseHead}><View style={styles.exerciseNameGroup}><Text style={styles.exerciseName}>{exercise.name}</Text>{exercise.exerciseSource === 'user' && <Text style={styles.mine}>mine</Text>}</View><Pressable accessibilityRole="button" accessibilityLabel={`Remove exercise ${exercise.name}`} disabled={locked} onPress={() => changeDay((item) => ({ ...item, exercises: item.exercises.filter((row) => row.rowId !== exercise.rowId) }))} style={styles.remove}><Text style={styles.muted}>×</Text></Pressable></View><View style={styles.fields}>{([['SETS', 'sets'], ['REPS', 'targetReps'], [`WEIGHT (${draft.units})`, 'weight']] as const).map(([label, field]) => <View key={field} style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput accessibilityLabel={`${label} — ${exercise.name}`} keyboardType={field === 'weight' ? 'decimal-pad' : 'number-pad'} editable={!locked} value={exercise[field]} onFocus={() => { inputFocused.current = true }} onBlur={() => { inputFocused.current = false }} onChangeText={(value) => changeDay((item) => ({ ...item, exercises: item.exercises.map((row) => row.rowId === exercise.rowId ? { ...row, [field]: value } : row) }))} style={styles.numberInput} /></View>)}</View></View>)}
          <Pressable accessibilityRole="button" disabled={locked || day.exercises.length >= 20} onPress={() => setPicking(true)} style={[styles.addExercise, day.exercises.length > 0 && styles.addExerciseMore]}><Text style={day.exercises.length ? styles.muted : styles.addExerciseText}>＋ Add exercise</Text></Pressable>
        </View>
        <Pressable accessibilityRole="button" disabled={locked} onPress={() => void discard()} style={styles.discard}><Text style={styles.muted}>Discard draft</Text></Pressable>
      </ScrollView>
      <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 12) }]}><View style={styles.dockCopy}><Text style={styles.dockTitle}>{draft.pending ? 'Save outcome unresolved' : durable ? 'Draft saved on device' : 'Saving draft…'}</Text>{error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}</View><View style={styles.dockActions}>{reloadAvailable && !draft.pending && <Pressable accessibilityRole="button" onPress={reload} style={styles.secondary}><Text style={styles.accent}>Reload</Text></Pressable>}{storageError && <Pressable accessibilityRole="button" onPress={() => { void persist(draftRef.current!) }} style={styles.secondary}><Text style={styles.accent}>Retry draft</Text></Pressable>}<Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || !!storageError }} disabled={busy || !!storageError} onPress={() => void save()} style={[styles.save, (busy || !!storageError) && styles.disabled]}><Text style={styles.saveText}>{busy ? 'Saving…' : draft.pending ? 'Retry save' : 'Save plan'}</Text></Pressable></View></View>
    </KeyboardAvoidingView>
    {picking && <ExercisePicker userExercises={catalog.state} onRetryUserExercises={catalog.retry} onClose={() => setPicking(false)} onSelect={(exerciseId, name, source) => { if (day.exercises.some((exercise) => exercise.exerciseId === exerciseId && exercise.exerciseSource === source)) { setMessage('Exercise is already in this day.'); return }; changeDay((item) => ({ ...item, exercises: [...item.exercises, { rowId: newId(), exerciseId, exerciseSource: source, name, sets: '4', targetReps: '8', weight: '0' }] })); setPicking(false) }} />}
  </SafeAreaView>
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, loading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24 },
  header: { borderBottomColor: colors.line, borderBottomWidth: 1, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12 }, headerLink: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }, title: { color: '#fff', fontFamily: 'ArchivoHeading', fontSize: 36, lineHeight: 38 },
  content: { paddingHorizontal: 16, paddingTop: 22, paddingBottom: 44 }, label: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 11 }, nameInput: { minHeight: 44, marginTop: 4, borderRadius: 8, backgroundColor: colors.surface, paddingHorizontal: 14, color: colors.text, fontFamily: 'InstrumentSans_400Regular', fontSize: 14 },
  selector: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 22, paddingBottom: 8, borderBottomColor: colors.line, borderBottomWidth: 1 }, tabs: { flex: 1 }, tabsContent: { gap: 8 }, tab: { minWidth: 136, minHeight: 56, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.surface }, selectedTab: { backgroundColor: '#242126' }, tabText: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 12 }, tabTextSelected: { color: colors.accent }, tabCount: { color: colors.muted, fontFamily: 'SplineSansMono_600SemiBold', fontSize: 10, marginTop: 4 }, addDay: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.surface }, addDayText: { color: colors.text, fontFamily: 'InstrumentSans_700Bold', fontSize: 13 },
  dayHeading: { minHeight: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, textButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }, accent: { color: colors.accent, fontFamily: 'InstrumentSans_700Bold', fontSize: 13 }, muted: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 13 },
  dayEditor: { paddingTop: 16 }, dayInput: { minHeight: 44, marginTop: 4, borderRadius: 8, backgroundColor: colors.surface, paddingHorizontal: 14, color: colors.text, fontFamily: 'InstrumentSans_500Medium', fontSize: 14 }, exercise: { paddingVertical: 12, borderBottomColor: colors.line, borderBottomWidth: 1 }, exerciseHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, exerciseNameGroup: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }, exerciseName: { color: colors.text, fontFamily: 'InstrumentSans_700Bold', fontSize: 14, flexShrink: 1 }, mine: { color: colors.accent, fontFamily: 'InstrumentSans_700Bold', fontSize: 11 }, remove: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }, fields: { flexDirection: 'row', gap: 8, marginTop: 8 }, field: { flex: 1 }, fieldLabel: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 10, marginBottom: 6 }, numberInput: { minHeight: 44, borderRadius: 8, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 12, fontFamily: 'SplineSansMono_600SemiBold', fontSize: 14 },
  addExercise: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 16, marginTop: 10, borderRadius: 8, backgroundColor: '#b5213a' }, addExerciseMore: { backgroundColor: 'transparent', paddingHorizontal: 4 }, addExerciseText: { color: '#fff', fontFamily: 'InstrumentSans_700Bold', fontSize: 13 }, actionText: { color: colors.accent, fontFamily: 'InstrumentSans_700Bold', fontSize: 13 }, discard: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', marginTop: 18 },
  dock: { flexDirection: 'row', alignItems: 'center', borderTopColor: colors.line, borderTopWidth: 1, backgroundColor: '#0f0e10', paddingHorizontal: 16, paddingTop: 8, gap: 8 }, dockCopy: { flex: 1, gap: 3 }, dockTitle: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 11 }, error: { color: '#ff8796', fontFamily: 'InstrumentSans_500Medium', fontSize: 12, lineHeight: 16 }, dockActions: { flexDirection: 'row', gap: 4 }, save: { minHeight: 44, minWidth: 114, alignItems: 'center', justifyContent: 'center', backgroundColor: '#b5213a', borderRadius: 8 }, saveText: { color: '#fff', fontFamily: 'InstrumentSans_700Bold', fontSize: 13 }, secondary: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }, disabled: { opacity: 0.55 }, button: { minHeight: 44, justifyContent: 'center' },
})
