import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, BackHandler, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Svg, { Path } from 'react-native-svg'

import ExercisePicker from './ExercisePicker'
import HistoryHeader from './HistoryHeader'
import { createSessionRevision, PlanRequestError, readExerciseMetadata, readTemplateFromServer, readUnits, savePlan } from './firebase'
import { useActiveRuntime, useAuthRuntime } from './runtime'
import { useSessionRead } from './useSessionRead'
import { newPlanDraft, normalizePlanDraft, type EditorDay, type PlanDraft } from './planEditor'
import { finishAcknowledgedPlanSave, releaseRejectedPlanSave, requestPlanEditorExit } from './planEditorFlow'
import { planEditorJournal } from './filePlanEditorJournal'

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
  const ownerId = useRef(newId())
  const draftRef = useRef<PlanDraft | null>(null)
  const writeRef = useRef<Promise<void>>(Promise.resolve())
  const sequence = useRef(0)
  const alive = useRef(true)
  const focused = useRef(false)
  const exiting = useRef(false)
  const completed = useRef(false)
  const inputFocused = useRef(false)
  const dayTabs = useRef<ScrollView>(null)
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
    if (!draft) return
    const index = draft.days.findIndex((item) => item.rowId === draft.selectedDayId)
    const frame = requestAnimationFrame(() => dayTabs.current?.scrollTo({ x: Math.max(0, index) * 144, animated: true }))
    return () => cancelAnimationFrame(frame)
  }, [draft?.selectedDayId])

  useEffect(() => {
    alive.current = true
    let cancelled = false
    setDraft(null); draftRef.current = null; setLoadingError(null); setMessage(null); setReloadAvailable(false)
    void (async () => {
      try {
        const existing = await planEditorJournal.open(uid, targetId, ownerId.current)
        if (cancelled) return
        if (existing) { draftRef.current = existing; setDraft(existing); return }
        const [units, template] = await Promise.all([readUnits(uid), targetId ? readTemplateFromServer(uid, targetId) : Promise.resolve(null)])
        if (cancelled) return
        if (targetId && !template) { setLoadingError('Plan was deleted or is unavailable.'); return }
        const fresh = newPlanDraft(newId(), units, template, newId)
        if (!await planEditorJournal.saveIfOwned(uid, fresh, ownerId.current, null)) throw new Error('Plan editor changed while loading. Retry to open the latest draft.')
        if (cancelled) return
        draftRef.current = fresh; setDraft(fresh)
      } catch (error) { if (!cancelled) setLoadingError(error instanceof Error ? error.message : 'Could not open plan editor.') }
    })()
    return () => { cancelled = true; alive.current = false }
  }, [uid, targetId, attempt])

  function persist(next: PlanDraft): Promise<void> {
    const previous = draftRef.current
    const updated = { ...next, revision: (previous?.revision ?? next.revision) + 1 }
    draftRef.current = updated
    setDraft(updated)
    setStorageError(null); setDurable(false)
    const token = ++sequence.current
    const write = planEditorJournal.saveIfOwned(uid, updated, ownerId.current, previous && { draftId: previous.draftId, revision: previous.revision })
      .then((saved) => { if (!saved) throw new Error('This draft is open in another editor. Reload it before editing.') })
    writeRef.current = write
    void write.then(() => { if (alive.current && sequence.current === token) setDurable(true) },
      () => { if (alive.current && sequence.current === token) { setStorageError('Draft could not be saved on this device. Retry before leaving or saving.'); setDurable(false) } })
    return write
  }
  function change(edit: (current: PlanDraft) => PlanDraft, markDirty = true) {
    const current = draftRef.current
    if (!current || current.pending || busy) return
    void persist({ ...edit(current), dirty: current.dirty || markDirty })
    setMessage(null); setReloadAvailable(false)
  }
  function changeDay(edit: (day: EditorDay) => EditorDay) {
    change((current) => ({ ...current, days: current.days.map((day) => day.rowId === current.selectedDayId ? edit(day) : day) }))
  }
  function leave(proceed: () => void | Promise<boolean>) {
    void requestPlanEditorExit({ flush: () => writeRef.current, draft: () => draftRef.current,
      storageFailed: () => !!storageError, isCurrent: () => alive.current && focused.current && !exiting.current,
      confirm: (title, copy, go) => Alert.alert(title, copy, [{ text: 'Stay', style: 'cancel' }, { text: 'Leave', onPress: go }]),
      proceed: () => { exiting.current = true; void Promise.resolve(proceed()).then((navigated) => { if (navigated === false) exiting.current = false }) },
    })
  }
  useFocusEffect(useCallback(() => {
    focused.current = true
    exiting.current = false
    if (completed.current) { router.replace('/templates'); return () => { focused.current = false } }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (picking) { setPicking(false); return true }
      if (inputFocused.current) { Keyboard.dismiss(); inputFocused.current = false; return true }
      leave(() => router.back()); return true
    })
    return () => { focused.current = false; subscription.remove() }
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
      const outcome = await finishAcknowledgedPlanSave({ draft: () => draftRef.current!, acknowledged,
        read: (id) => readTemplateFromServer(uid, id), persist,
        clear: (latest) => planEditorJournal.clearIfOwned(uid, targetId, ownerId.current, latest.draftId, latest.revision),
        shouldNavigate: () => alive.current && focused.current && !exiting.current,
        navigate: () => router.replace('/templates'),
      })
      if (!alive.current) return
      if (outcome === 'saved') {
        if (!focused.current || exiting.current) completed.current = true
      } else {
        setReloadAvailable(outcome !== 'newer')
        setMessage(outcome === 'changed' ? 'Plan changed after saving. Reload it to see the latest version.'
          : outcome === 'deleted' ? 'Plan was deleted after saving. Reload or discard this draft.'
            : 'A newer local draft exists. It was kept on this device.')
      }
    } catch (error) {
      if (!alive.current) return
      if (error instanceof PlanRequestError && draftRef.current) {
        try {
          const disposition = await releaseRejectedPlanSave(error.status, draftRef.current, persist)
          if (disposition === 'conflict') setReloadAvailable(true)
        } catch { /* storage error is displayed by persist */ }
      }
      setMessage(error instanceof Error ? error.message : 'Could not save plan. Retry with the same operation.')
    } finally { if (alive.current) setBusy(false) }
  }
  async function discard() {
    const current = draftRef.current
    if (!current || current.pending || busy) return
    Alert.alert('Discard draft?', 'Your local changes will be removed.', [{ text: 'Keep draft', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => {
      void planEditorJournal.clearIfOwned(uid, targetId, ownerId.current, current.draftId, current.revision).then((cleared) => {
        if (alive.current && cleared) router.replace('/templates')
        else if (alive.current) setMessage('Could not discard this draft. Retry.')
      }, () => { if (alive.current) setStorageError('Could not remove local draft. Retry.') })
    } }])
  }
  function reload() {
    Alert.alert('Reload plan?', 'This discards local changes and loads the latest server version.', [{ text: 'Keep draft', style: 'cancel' }, { text: 'Reload', style: 'destructive', onPress: () => {
      const current = draftRef.current
      if (!current || current.pending) return
      void (async () => {
        try {
          const latest = current.resolvedId ? await readTemplateFromServer(uid, current.resolvedId) : null
          const cleared = await planEditorJournal.clearIfOwned(uid, targetId, ownerId.current, current.draftId, current.revision)
          if (!alive.current) return
          if (!cleared) { setStorageError('Could not discard the local draft.'); return }
          if (current.resolvedId) router.replace(latest ? `/templates/${current.resolvedId}/edit` : '/templates')
          else setAttempt((value) => value + 1)
        } catch { if (alive.current) setMessage('Could not load the latest plan. Retry Reload.') }
      })()
    } }])
  }
  if (!draft) return <SafeAreaView edges={['top']} style={styles.screen}><StatusBar style="light" /><View style={styles.loading}>{loadingError ? <><Text style={styles.error}>{loadingError}</Text><Pressable onPress={() => setAttempt((value) => value + 1)} style={styles.button}><Text style={styles.actionText}>Retry</Text></Pressable><Pressable onPress={() => router.replace('/templates')} style={styles.button}><Text style={styles.muted}>Plans</Text></Pressable></> : <ActivityIndicator color={colors.accent} />}</View></SafeAreaView>
  const day = draft.days.find((item) => item.rowId === draft.selectedDayId) ?? draft.days[0]!
  const locked = busy || !!draft.pending
  const canAddDay = draft.days.length < 14
  const error = storageError ?? message
  const reloadReady = reloadAvailable || !!draft.resolvedId
  const canSubmit = (!!draft.pending || (draft.name.trim().length >= 2 && draft.days.some((item) => item.exercises.length > 0)))
    && !(draft.resolvedId && !draft.pending) && !busy && !storageError
  const showDock = !targetId || draft.dirty || !!draft.pending || !!error || reloadReady || busy
  return <SafeAreaView edges={['top']} style={styles.screen}>
    <StatusBar style="light" />
    <HistoryHeader onRequestAction={(_, proceed) => leave(proceed)} />
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}><Pressable accessibilityRole="button" onPress={() => leave(() => router.replace('/templates'))} style={styles.headerLink}><Text style={styles.muted}>‹  Plans</Text></Pressable><Text accessibilityRole="header" style={styles.title}>{targetId ? 'Edit plan' : 'New plan'}</Text>{active.state.status === 'ready' && <Pressable accessibilityRole="button" onPress={() => leave(() => router.replace('/'))} style={styles.headerLink}><Text style={styles.accent}>Return</Text></Pressable>}</View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Text style={styles.label}>Name</Text>
        <TextInput accessibilityLabel="Plan name" editable={!locked} maxLength={120} value={draft.name} onFocus={() => { inputFocused.current = true }} onBlur={() => { inputFocused.current = false }} onChangeText={(value) => change((current) => ({ ...current, name: value }))} placeholder="E.g. Upper / Lower 4 days" placeholderTextColor={colors.muted} style={styles.nameInput} />
        <View style={styles.selector}><ScrollView ref={dayTabs} horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={styles.tabsContent}>{draft.days.map((item, index) => <Pressable key={item.rowId} accessibilityRole="tab" accessibilityState={{ selected: item.rowId === day.rowId }} onPress={() => change((current) => ({ ...current, selectedDayId: item.rowId }), false)} style={[styles.tab, item.rowId === day.rowId && styles.selectedTab]}><Text numberOfLines={1} style={[styles.tabText, item.rowId === day.rowId && styles.tabTextSelected]}>{item.name.trim() || `Day ${index + 1}`}</Text><Text style={styles.tabCount}>{item.exercises.length} ex. · {item.exercises.reduce((sum, exercise) => sum + (Number(exercise.sets) || 0), 0)} sets</Text></Pressable>)}</ScrollView><Pressable accessibilityRole="button" disabled={!canAddDay || locked} onPress={() => { const rowId = newId(); change((current) => ({ ...current, selectedDayId: rowId, days: [...current.days, { rowId, name: `Day ${current.days.length + 1}`, exercises: [] }] })) }} style={styles.addDay}><PlanIcon kind="plus" color={colors.text} /><Text style={styles.addDayText}>Add day</Text></Pressable></View>
        <View style={styles.dayEditor}><View style={styles.dayHeading}><Text style={styles.label}>Day name</Text>{draft.days.length > 1 && <Pressable accessibilityRole="button" disabled={locked} onPress={() => change((current) => { const days = current.days.filter((item) => item.rowId !== day.rowId); return { ...current, days, selectedDayId: days[0]!.rowId } })} style={styles.textButton}><Text style={styles.muted}>Remove day</Text></Pressable>}</View><TextInput accessibilityLabel="Day name" editable={!locked} maxLength={80} value={day.name} onFocus={() => { inputFocused.current = true }} onBlur={() => { inputFocused.current = false }} onChangeText={(value) => changeDay((item) => ({ ...item, name: value }))} style={styles.dayInput} />
          {day.exercises.map((exercise) => <View key={exercise.rowId} style={styles.exercise}><View style={styles.exerciseHead}><View style={styles.exerciseNameGroup}><Text style={styles.exerciseName}>{exercise.name}</Text>{exercise.exerciseSource === 'user' && <Text style={styles.mine}>mine</Text>}</View><Pressable accessibilityRole="button" accessibilityLabel={`Remove exercise ${exercise.name}`} disabled={locked} onPress={() => changeDay((item) => ({ ...item, exercises: item.exercises.filter((row) => row.rowId !== exercise.rowId) }))} style={styles.remove}><Text style={styles.muted}>×</Text></Pressable></View><View style={styles.fields}>{([['SETS', 'sets'], ['REPS', 'targetReps'], [`WEIGHT (${draft.units})`, 'weight']] as const).map(([label, field]) => <View key={field} style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput accessibilityLabel={`${label} — ${exercise.name}`} keyboardType={field === 'weight' ? 'decimal-pad' : 'number-pad'} editable={!locked} value={exercise[field]} onFocus={() => { inputFocused.current = true }} onBlur={() => { inputFocused.current = false }} onChangeText={(value) => changeDay((item) => ({ ...item, exercises: item.exercises.map((row) => row.rowId === exercise.rowId ? { ...row, [field]: value } : row) }))} style={styles.numberInput} /></View>)}</View></View>)}
          <Pressable accessibilityRole="button" disabled={locked || day.exercises.length >= 20} onPress={() => setPicking(true)} style={[styles.addExercise, day.exercises.length > 0 && styles.addExerciseMore]}><PlanIcon kind="plus" color={day.exercises.length ? colors.muted : '#fff'} /><Text style={day.exercises.length ? styles.muted : styles.addExerciseText}>Add exercise</Text></Pressable>
        </View>
        {(draft.dirty || draft.resolvedId) && <Pressable accessibilityRole="button" disabled={locked} onPress={() => void discard()} style={styles.discard}><Text style={styles.muted}>Discard draft</Text></Pressable>}
      </ScrollView>
      {showDock && <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 12) }]}><View style={styles.dockCopy}>{(draft.pending || draft.dirty || !durable) && <Text style={styles.dockTitle}>{draft.pending ? 'Save outcome unresolved' : durable ? 'Unsaved changes' : 'Saving draft…'}</Text>}{error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}</View><View style={styles.dockActions}>{reloadReady && !draft.pending && <Pressable accessibilityRole="button" onPress={reload} style={styles.secondary}><Text style={styles.accent}>Reload</Text></Pressable>}{storageError && <Pressable accessibilityRole="button" onPress={() => { void persist(draftRef.current!) }} style={styles.secondary}><Text style={styles.accent}>Retry draft</Text></Pressable>}<Pressable accessibilityRole="button" accessibilityState={{ disabled: !canSubmit }} disabled={!canSubmit} onPress={() => void save()} style={[styles.save, !canSubmit && styles.disabled]}><PlanIcon kind="pencil" color="#fff" /><Text style={styles.saveText}>{busy ? 'Saving…' : draft.pending ? 'Retry save' : 'Save plan'}</Text></Pressable></View></View>}
    </KeyboardAvoidingView>
    {picking && <ExercisePicker userExercises={catalog.state} onRetryUserExercises={catalog.retry} onClose={() => setPicking(false)} onSelect={(exerciseId, name, source) => { if (day.exercises.some((exercise) => exercise.exerciseId === exerciseId && exercise.exerciseSource === source)) { setMessage('Exercise is already in this day.'); return }; changeDay((item) => ({ ...item, exercises: [...item.exercises, { rowId: newId(), exerciseId, exerciseSource: source, name, sets: '4', targetReps: '8', weight: '0' }] })); setPicking(false) }} />}
  </SafeAreaView>
}

function PlanIcon({ kind, color }: { kind: 'plus' | 'pencil'; color: string }) {
  return <Svg accessibilityElementsHidden width={15} height={15} viewBox="0 0 24 24"><Path d={kind === 'plus' ? 'M12 5v14M5 12h14' : 'M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4'} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, experimental_backgroundImage: 'linear-gradient(115deg, rgba(240,67,90,0.055) 0%, transparent 26%, transparent 68%, rgba(143,184,160,0.065) 100%), linear-gradient(180deg, #0b0a0c 0%, #111012 42%, #0d0c0e 100%)' }, loading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24 },
  header: { borderBottomColor: colors.line, borderBottomWidth: 1, marginHorizontal: 16, paddingTop: 6, paddingBottom: 12 }, headerLink: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }, title: { color: '#fff', fontFamily: 'ArchivoHeading', fontSize: 36, lineHeight: 38 },
  content: { paddingHorizontal: 16, paddingTop: 22, paddingBottom: 44 }, label: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 11 }, nameInput: { minHeight: 44, marginTop: 4, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.045)', paddingHorizontal: 14, color: colors.text, fontFamily: 'InstrumentSans_400Regular', fontSize: 14 },
  selector: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 22, paddingBottom: 8, borderBottomColor: colors.line, borderBottomWidth: 1 }, tabs: { flex: 1 }, tabsContent: { gap: 8 }, tab: { width: 136, minHeight: 56, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8 }, selectedTab: { backgroundColor: 'rgba(244,241,242,0.075)' }, tabText: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 12 }, tabTextSelected: { color: colors.accent }, tabCount: { color: colors.muted, fontFamily: 'SplineSansMono_600SemiBold', fontSize: 10, marginTop: 4 }, addDay: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.035)' }, addDayText: { color: colors.text, fontFamily: 'InstrumentSans_700Bold', fontSize: 13 },
  dayHeading: { minHeight: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, textButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }, accent: { color: colors.accent, fontFamily: 'InstrumentSans_700Bold', fontSize: 13 }, muted: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 13 },
  dayEditor: { paddingTop: 16 }, dayInput: { minHeight: 44, marginTop: 4, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.045)', paddingHorizontal: 14, color: colors.text, fontFamily: 'InstrumentSans_500Medium', fontSize: 14 }, exercise: { paddingVertical: 12, borderBottomColor: colors.line, borderBottomWidth: 1 }, exerciseHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, exerciseNameGroup: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }, exerciseName: { color: colors.text, fontFamily: 'InstrumentSans_700Bold', fontSize: 14, flexShrink: 1 }, mine: { color: colors.accent, fontFamily: 'InstrumentSans_700Bold', fontSize: 11 }, remove: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }, fields: { flexDirection: 'row', gap: 8, marginTop: 8 }, field: { flex: 1 }, fieldLabel: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 10, marginBottom: 6 }, numberInput: { minHeight: 44, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.045)', color: colors.text, paddingHorizontal: 12, fontFamily: 'SplineSansMono_600SemiBold', fontSize: 14 },
  addExercise: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 16, marginTop: 10, borderRadius: 8, backgroundColor: '#b5213a', experimental_backgroundImage: 'linear-gradient(180deg, #c72e44 0%, #a91f35 100%)' }, addExerciseMore: { backgroundColor: 'transparent', experimental_backgroundImage: 'none', paddingHorizontal: 4 }, addExerciseText: { color: '#fff', fontFamily: 'InstrumentSans_700Bold', fontSize: 13 }, actionText: { color: colors.accent, fontFamily: 'InstrumentSans_700Bold', fontSize: 13 }, discard: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', marginTop: 18 },
  dock: { flexDirection: 'row', alignItems: 'center', borderTopColor: colors.line, borderTopWidth: 1, backgroundColor: '#0f0e10', paddingHorizontal: 16, paddingTop: 8, gap: 8 }, dockCopy: { flex: 1, gap: 3 }, dockTitle: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 11 }, error: { color: '#ff8796', fontFamily: 'InstrumentSans_500Medium', fontSize: 12, lineHeight: 16 }, dockActions: { flexDirection: 'row', gap: 4 }, save: { minHeight: 44, minWidth: 114, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#b5213a', borderRadius: 8, experimental_backgroundImage: 'linear-gradient(180deg, #c72e44 0%, #a91f35 100%)' }, saveText: { color: '#fff', fontFamily: 'InstrumentSans_700Bold', fontSize: 13 }, secondary: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }, disabled: { opacity: 0.55 }, button: { minHeight: 44, justifyContent: 'center' },
})
