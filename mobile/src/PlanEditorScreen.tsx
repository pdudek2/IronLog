import { shouldSaveImportedDraft } from './coachPlan'
import BottomNavigation, { useBottomNavigation } from './BottomNavigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, BackHandler, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Svg, { Path } from 'react-native-svg'

import ExercisePicker from './ExercisePicker'
import ExerciseForm from './ExerciseForm'
import { unmatchedHint } from '../../src/shared/planImport'
import HistoryHeader from './HistoryHeader'
import { createSessionRevision, PlanRequestError, readExerciseMetadata, readTemplateFromServer, readUnits, savePlan } from './firebase'
import { useActiveRuntime, useAuthRuntime } from './runtime'
import { useSessionRead } from './useSessionRead'
import { newPlanDraft, normalizePlanDraft, refreshPlanDraftUnits, type EditorDay, type PlanDraft } from './planEditor'
import { finishAcknowledgedPlanSave, releaseRejectedPlanSave, requestPlanEditorExit } from './planEditorFlow'
import { planEditorJournal } from './filePlanEditorJournal'
import { colors, pageBackground, pageTitle, primaryGradient } from './theme'
import { showDialog } from './dialog'
import { Icon } from './icons'
import { pluralize } from '../../src/lib/pluralize'
import { newPlanDayId } from '../../src/shared/planDay'

const newId = () => createSessionRevision()

export default function PlanEditorScreen({ targetId, saveImport }: { targetId: string | null; saveImport?: string }) {
  const { user } = useAuthRuntime()
  if (!user) return <SafeAreaView style={styles.screen}><Text style={styles.muted}>Restoring sign-in…</Text></SafeAreaView>
  return <Editor key={`${user.uid}:${targetId ?? 'new'}`} uid={user.uid} targetId={targetId} saveImport={saveImport} />
}

function Editor({ uid, targetId, saveImport }: { uid: string; targetId: string | null; saveImport?: string }) {
  const active = useActiveRuntime()
  const router = useRouter()
  const navigation = useBottomNavigation()
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
  const [loadingError, setLoadingError] = useState<string | null>(null)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [reloadAvailable, setReloadAvailable] = useState(false)
  const saveLock = useRef(false)
  const [busy, setBusy] = useState(false)
  const [durable, setDurable] = useState(true)
  const [picking, setPicking] = useState(false)
  // The pasted row being resolved in the selected day.
  const [resolving, setResolving] = useState<{ rowId: string; mode: 'choose' | 'create' } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const loadMetadata = useCallback(() => readExerciseMetadata(uid), [uid])
  const catalog = useSessionRead(uid, loadMetadata, picking || resolving?.mode === 'choose')

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
      confirm: (title, copy, go) => showDialog(title, copy, [{ text: 'Stay', style: 'cancel' }, { text: 'Leave', onPress: go }]),
      proceed: () => { exiting.current = true; void Promise.resolve(proceed()).then((navigated) => { if (navigated === false) exiting.current = false }) },
    })
  }
  // The Back handler outlives renders; it calls the latest leave so a storage error raised since focus is seen.
  const latestLeave = useRef(leave)
  latestLeave.current = leave
  useFocusEffect(useCallback(() => {
    focused.current = true
    exiting.current = false
    if (completed.current) { router.replace({ pathname: '/templates', params: { saved: '1' } }); return () => { focused.current = false } }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (picking) { setPicking(false); return true }
      if (resolving) { setResolving(null); return true }
      if (inputFocused.current) { Keyboard.dismiss(); inputFocused.current = false; return true }
      latestLeave.current(() => router.back()); return true
    })
    return () => { focused.current = false; subscription.remove() }
  }, [picking, resolving]))

  useFocusEffect(useCallback(() => {
    let cancelled = false
    const units = active.state.status === 'ready' || active.state.status === 'empty'
      ? Promise.resolve(active.state.units) : readUnits(uid)
    void units.then(async units => {
      if (cancelled || !alive.current || !focused.current) return
      await writeRef.current
      if (cancelled || !alive.current || !focused.current) return
      const current = draftRef.current
      if (current && current.units !== units) await persist(refreshPlanDraftUnits(current, units))
    }).catch(error => {
      if (!cancelled && alive.current) setMessage(error instanceof Error ? error.message : 'Could not refresh profile units. Reopen this editor to retry.')
    })
    return () => { cancelled = true }
  }, [uid, draft?.draftId, active.state.status, active.state.units]))

  const importAttempted = useRef(false)
  useEffect(() => {
    if (importAttempted.current || !focused.current || !shouldSaveImportedDraft(draft, saveImport)) return
    importAttempted.current = true
    router.setParams({ saveImport: undefined })
    void save()
  }, [draft?.draftId, saveImport])

  async function save() {
    let current = draftRef.current
    if (!current || saveLock.current) return
    saveLock.current = true
    setBusy(true); setMessage(null)
    try {
      await writeRef.current
      if (storageError) throw new Error('Draft storage needs a successful retry.')
      if (!alive.current) return
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
        navigate: () => router.replace({ pathname: '/templates', params: { saved: '1' } }),
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
      setMessage(error instanceof PlanRequestError ? error.message : 'Could not confirm the save. Your draft is safe. Retry save to check again.')
    } finally { saveLock.current = false; if (alive.current) setBusy(false) }
  }
  async function discard() {
    const current = draftRef.current
    if (!current || current.pending || busy) return
    showDialog('Discard draft?', 'Your local changes will be removed.', [{ text: 'Keep draft', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => {
      void planEditorJournal.clearIfOwned(uid, targetId, ownerId.current, current.draftId, current.revision).then((cleared) => {
        if (alive.current && cleared) router.replace('/templates')
        else if (alive.current) setMessage('Could not discard this draft. Retry.')
      }, () => { if (alive.current) setStorageError('Could not remove local draft. Retry.') })
    } }])
  }
  function reload() {
    showDialog('Reload plan?', 'This discards local changes and loads the latest server version.', [{ text: 'Keep draft', style: 'cancel' }, { text: 'Reload', style: 'destructive', onPress: () => {
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
  const totalExercises = draft.days.reduce((sum, item) => sum + item.exercises.length, 0)
  const totalSets = draft.days.reduce((sum, item) => sum + daySets(item), 0)
  const openRows = draft.days.reduce((sum, item) => sum + item.exercises.filter((exercise) => exercise.unmatched).length, 0)
  const resolvingRow = resolving ? day.exercises.find((exercise) => exercise.rowId === resolving.rowId) : undefined
  function resolveRow(rowId: string, exerciseId: string, name: string, source: 'global' | 'user'): boolean {
    if (day.exercises.some((exercise) => exercise.rowId !== rowId && exercise.exerciseId === exerciseId && exercise.exerciseSource === source)) { setMessage('Exercise is already in this day.'); return false }
    changeDay((item) => ({ ...item, exercises: item.exercises.map((row) => row.rowId !== rowId || !row.unmatched ? row
      : { ...row, exerciseId, exerciseSource: source, name, unmatched: undefined, detail: row.unmatched.line }) }))
    setResolving(null)
    return true
  }
  const error = storageError ?? message
  const reloadReady = reloadAvailable || !!draft.resolvedId
  const canSubmit = (!!draft.pending || (draft.name.trim().length >= 2 && draft.days.some((item) => item.exercises.length > 0) && openRows === 0))
    && !(draft.resolvedId && !draft.pending) && !busy && !storageError
  const showDock = !targetId || draft.dirty || !!draft.pending || !!error || reloadReady || busy
  return <SafeAreaView onFocus={navigation.onFocus} onBlur={navigation.onBlur} edges={['top']} style={styles.screen}>
    <StatusBar style="light" />
    <HistoryHeader onRequestAction={(_, proceed) => leave(proceed)} />
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView onScroll={navigation.onScroll} scrollEventThrottle={16} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={styles.header}><Pressable accessibilityRole="button" onPress={() => leave(() => router.replace('/templates'))} style={[styles.headerLink, styles.headerLinkRow]}><Icon name="chevron-left" /><Text style={styles.muted}>Plans</Text></Pressable><View style={styles.heading}><Text accessibilityRole="header" style={styles.title}>{targetId ? 'Edit plan' : 'New plan'}</Text><Text style={styles.summary}>{draft.days.length} {pluralize(draft.days.length, 'day', 'days')} · {totalExercises} {pluralize(totalExercises, 'exercise', 'exercises')} · {totalSets} {pluralize(totalSets, 'set', 'sets')}</Text></View></View>
        <Text style={styles.label}>Name</Text>
        <TextInput accessibilityLabel="Plan name" editable={!locked} maxLength={120} value={draft.name} onFocus={() => { inputFocused.current = true }} onBlur={() => { inputFocused.current = false }} onChangeText={(value) => change((current) => ({ ...current, name: value }))} placeholder="E.g. Upper / Lower 4 days" placeholderTextColor={colors.muted} style={styles.nameInput} />
        {draft.skipped && draft.skipped.length > 0 && <View accessibilityLabel="Lines not added" style={styles.skipped}><Text style={styles.skippedTitle}>{draft.skipped.length} {pluralize(draft.skipped.length, 'line was', 'lines were')} not added</Text>{draft.skipped.map((item, index) => <View key={index} style={styles.skippedRow}><Text style={styles.skippedLine}>{item.line}</Text><Text style={styles.detail}>{item.reason}</Text></View>)}</View>}
        <View style={styles.selector}><View style={styles.tabs}>{draft.days.map((item, index) => <Pressable key={item.rowId} accessibilityRole="tab" accessibilityState={{ selected: item.rowId === day.rowId }} onPress={() => change((current) => ({ ...current, selectedDayId: item.rowId }), false)} style={[styles.tab, item.rowId === day.rowId && styles.selectedTab]}><Text numberOfLines={1} style={[styles.tabText, item.rowId === day.rowId && styles.tabTextSelected]}>{item.name.trim() || `Day ${index + 1}`}</Text><Text style={styles.tabCount}>{item.exercises.some((exercise) => exercise.unmatched) ? `${item.exercises.filter((exercise) => exercise.unmatched).length} to choose` : `${item.exercises.length} ex. · ${daySets(item)} ${pluralize(daySets(item), 'set', 'sets')}`}</Text></Pressable>)}</View><Pressable accessibilityRole="button" disabled={!canAddDay || locked} onPress={() => { const rowId = newId(); change((current) => ({ ...current, selectedDayId: rowId, days: [...current.days, { rowId, dayId: newPlanDayId(), name: `Day ${current.days.length + 1}`, exercises: [] }] })) }} style={styles.addDay}><PlanIcon kind="plus" color={colors.text} /><Text style={styles.addDayText}>Add day</Text></Pressable></View>
        <View style={styles.dayEditor}><View style={styles.dayHeading}><Text style={styles.label}>Day name</Text>{draft.days.length > 1 && <Pressable accessibilityRole="button" disabled={locked} onPress={() => change((current) => { const days = current.days.filter((item) => item.rowId !== day.rowId); return { ...current, days, selectedDayId: days[0]!.rowId } })} style={styles.textButton}><Text style={styles.muted}>Remove day</Text></Pressable>}</View><TextInput accessibilityLabel="Day name" editable={!locked} maxLength={80} value={day.name} onFocus={() => { inputFocused.current = true }} onBlur={() => { inputFocused.current = false }} onChangeText={(value) => changeDay((item) => ({ ...item, name: value }))} style={styles.dayInput} />
          {day.exercises.map((exercise) => <View key={exercise.rowId} style={styles.exercise}><View style={styles.exerciseHead}><View style={styles.exerciseNameGroup}><Text style={styles.exerciseName}>{exercise.name}</Text>{exercise.exerciseSource === 'user' && !exercise.unmatched && <Text style={styles.mine}>mine</Text>}</View><Pressable accessibilityRole="button" accessibilityLabel={`Remove exercise ${exercise.name}`} disabled={locked} onPress={() => changeDay((item) => ({ ...item, exercises: item.exercises.filter((row) => row.rowId !== exercise.rowId) }))} style={styles.remove}><Icon name="close" /></Pressable></View>{exercise.unmatched ? <Text style={styles.detail}><Text style={styles.detailStrong}>{unmatchedHint[exercise.unmatched.reason]}</Text> {exercise.unmatched.line}</Text> : exercise.detail ? <Text style={styles.detail}>{exercise.detail}</Text> : null}<View style={styles.fields}>{([['Sets', 'sets', 'sets'], ['Reps', 'targetReps', 'reps'], [`Weight (${draft.units})`, 'weight', draft.units]] as const).map(([label, field, unit]) => <View key={field} style={styles.field}><TextInput accessibilityLabel={`${label} — ${exercise.name}`} keyboardType={field === 'weight' ? 'decimal-pad' : 'number-pad'} editable={!locked} value={exercise[field]} onFocus={() => { inputFocused.current = true }} onBlur={() => { inputFocused.current = false }} onChangeText={(value) => changeDay((item) => ({ ...item, exercises: item.exercises.map((row) => row.rowId === exercise.rowId ? { ...row, [field]: value } : row) }))} style={styles.numberInput} /><Text accessibilityElementsHidden importantForAccessibility="no" pointerEvents="none" style={styles.fieldUnit}>{unit}</Text></View>)}</View>{exercise.unmatched && <View style={styles.resolve}><Pressable accessibilityRole="button" accessibilityLabel={`Choose exercise for ${exercise.name}`} disabled={locked} onPress={() => setResolving({ rowId: exercise.rowId, mode: 'choose' })} style={styles.choose}><Text style={styles.chooseText}>Choose exercise</Text></Pressable>{exercise.unmatched.reason !== 'duplicate' && <Pressable accessibilityRole="button" disabled={locked} onPress={() => setResolving({ rowId: exercise.rowId, mode: 'create' })} style={styles.create}><Text style={styles.createText}>Create “{exercise.name}”</Text></Pressable>}</View>}</View>)}
          <Pressable accessibilityRole="button" disabled={locked || day.exercises.length >= 20} onPress={() => setPicking(true)} style={[styles.addExercise, day.exercises.length > 0 && styles.addExerciseMore]}><PlanIcon kind="plus" color={day.exercises.length ? colors.muted : colors.onPrimary} /><Text style={day.exercises.length ? styles.muted : styles.addExerciseText}>Add exercise</Text></Pressable>
        </View>
        {(draft.dirty || draft.resolvedId) && <Pressable accessibilityRole="button" disabled={locked} onPress={() => void discard()} style={styles.discard}><Text style={styles.muted}>Discard draft</Text></Pressable>}
      </ScrollView>
      {showDock && <View style={[styles.dock, { paddingBottom: navigation.keyboard ? Math.max(insets.bottom, 12) : 12 }]}><View style={styles.dockCopy}>{(draft.pending || draft.dirty || !durable) && <Text style={styles.dockTitle}>{draft.pending ? 'Save outcome unresolved' : !durable ? 'Saving draft…' : openRows > 0 ? `Choose ${openRows} ${pluralize(openRows, 'exercise', 'exercises')} to save` : 'Unsaved changes'}</Text>}{error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}</View><View style={styles.dockActions}>{reloadReady && !draft.pending && <Pressable accessibilityRole="button" onPress={reload} style={styles.secondary}><Text style={styles.accent}>Reload</Text></Pressable>}{storageError && <Pressable accessibilityRole="button" onPress={() => { void persist(draftRef.current!) }} style={styles.secondary}><Text style={styles.accent}>Retry draft</Text></Pressable>}<Pressable accessibilityRole="button" accessibilityState={{ disabled: !canSubmit }} disabled={!canSubmit} onPress={() => void save()} style={[styles.save, !canSubmit && styles.disabled]}><PlanIcon kind="pencil" color={colors.textStrong} /><Text style={styles.saveText}>{busy ? 'Saving…' : draft.pending ? 'Retry save' : 'Save plan'}</Text></Pressable></View></View>}
    </KeyboardAvoidingView>
    <BottomNavigation {...navigation} onRequestExit={leave} />
    {resolving?.mode === 'choose' && resolvingRow && <ExercisePicker userExercises={catalog.state} onRetryUserExercises={catalog.retry} title={`Choose for “${resolvingRow.name}”`} suggestions={resolvingRow.unmatched?.suggestions} onClose={() => setResolving(null)} onSelect={(exerciseId, name, source) => { resolveRow(resolvingRow.rowId, exerciseId, name, source) }} />}
    {resolving?.mode === 'create' && resolvingRow && <ExerciseForm uid={uid} exercise={null} initialName={resolvingRow.name} onClose={() => setResolving(null)} onSaved={(created) => { catalog.retry(); if (created) resolveRow(resolvingRow.rowId, created.id, created.name, 'user'); else setResolving(null) }} />}
    {picking && <ExercisePicker userExercises={catalog.state} onRetryUserExercises={catalog.retry} onClose={() => setPicking(false)} onSelect={(exerciseId, name, source) => { if (day.exercises.some((exercise) => exercise.exerciseId === exerciseId && exercise.exerciseSource === source)) { setMessage('Exercise is already in this day.'); return }; changeDay((item) => ({ ...item, exercises: [...item.exercises, { rowId: newId(), exerciseId, exerciseSource: source, name, sets: '4', targetReps: '8', weight: '0' }] })); setPicking(false) }} />}
  </SafeAreaView>
}

function PlanIcon({ kind, color }: { kind: 'plus' | 'pencil'; color: string }) {
  return <Svg accessibilityElementsHidden width={15} height={15} viewBox="0 0 24 24"><Path d={kind === 'plus' ? 'M12 5v14M5 12h14' : 'M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4'} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
}

const styles = StyleSheet.create({
  headerLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  screen: { flex: 1, backgroundColor: colors.background, experimental_backgroundImage: pageBackground }, loading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24 },
  header: { marginBottom: 12, paddingTop: 4, paddingBottom: 4 }, headerLink: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }, title: pageTitle, heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', columnGap: 16, rowGap: 4 }, summary: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 15, lineHeight: 22, fontVariant: ['tabular-nums'] },
  content: { paddingHorizontal: 16, paddingTop: 0, paddingBottom: 44 }, label: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13 }, nameInput: { minHeight: 44, marginTop: 4, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.035)', paddingHorizontal: 14, color: colors.text, fontFamily: 'InstrumentSans_400Regular', fontSize: 14 },
  selector: { gap: 4, marginTop: 16, paddingBottom: 8 }, tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, tab: { width: '31.5%', minHeight: 56, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12 }, selectedTab: { backgroundColor: colors.choiceSelected }, tabText: { color: colors.muted, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 13 }, tabTextSelected: { color: colors.text }, tabCount: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, marginTop: 2 }, addDay: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 4 }, addDayText: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14 },
  dayHeading: { minHeight: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, textButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }, accent: { color: colors.accentText, fontFamily: 'InstrumentSans_700Bold', fontSize: 13 }, muted: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 13 },
  dayEditor: { paddingTop: 8 }, dayInput: { minHeight: 44, marginTop: 4, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.035)', paddingHorizontal: 14, color: colors.text, fontFamily: 'InstrumentSans_400Regular', fontSize: 14 }, exercise: { paddingVertical: 8 }, exerciseHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, exerciseNameGroup: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }, exerciseName: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 15, flexShrink: 1 }, mine: { color: colors.accentText, fontFamily: 'InstrumentSans_700Bold', fontSize: 11 }, remove: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }, fields: { flexDirection: 'row', gap: 8, marginTop: 2 }, field: { flex: 1 }, fieldUnit: { position: 'absolute', right: 12, top: 0, bottom: 0, textAlignVertical: 'center', color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12.5 }, numberInput: { minHeight: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.035)', color: colors.text, paddingLeft: 12, paddingRight: 40, fontFamily: 'InstrumentSans_400Regular', fontSize: 14 },
  addExercise: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 16, marginTop: 10, borderRadius: 12, backgroundColor: colors.primaryEnd, experimental_backgroundImage: primaryGradient }, addExerciseMore: { backgroundColor: 'transparent', experimental_backgroundImage: 'none', paddingHorizontal: 4 }, addExerciseText: { color: colors.onPrimary, fontFamily: 'InstrumentSans_700Bold', fontSize: 13 }, actionText: { color: colors.accentText, fontFamily: 'InstrumentSans_700Bold', fontSize: 13 }, discard: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', marginTop: 18 },
  detail: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12.5, lineHeight: 17, marginTop: 1, marginBottom: 4 }, detailStrong: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold' },
  resolve: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 16, marginTop: 6 }, choose: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(244,238,232,0.12)' }, chooseText: { color: colors.text, fontFamily: 'InstrumentSans_700Bold', fontSize: 13 }, create: { minHeight: 44, justifyContent: 'center' }, createText: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 13 },
  skipped: { paddingTop: 16, paddingBottom: 12, gap: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(244,238,232,0.08)' }, skippedTitle: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 13.5 }, skippedRow: { gap: 1 }, skippedLine: { color: colors.text, fontFamily: 'InstrumentSans_400Regular', fontSize: 13 },
  dock: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, paddingHorizontal: 16, paddingTop: 8, gap: 8 }, dockCopy: { flex: 1, gap: 3 }, dockTitle: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 11 }, error: { color: '#f0a75a', fontFamily: 'InstrumentSans_500Medium', fontSize: 12, lineHeight: 16 }, dockActions: { flexDirection: 'row', gap: 4 }, save: { minHeight: 44, minWidth: 114, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryEnd, borderRadius: 12, experimental_backgroundImage: primaryGradient }, saveText: { color: colors.onPrimary, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14 }, secondary: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }, disabled: { opacity: 0.55 }, button: { minHeight: 44, justifyContent: 'center' },
})

function daySets(day: { exercises: { sets: string }[] }): number {
  return day.exercises.reduce((sum, exercise) => sum + (Number(exercise.sets) || 0), 0)
}
