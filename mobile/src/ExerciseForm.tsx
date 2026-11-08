import { useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Exercise } from '../../data/exercises'
import { EXERCISE_CATEGORY_LABELS, getEquipmentLabel, getMuscleLabel } from '../../src/lib/exerciseLabels'
import { categories, equipmentOptions, muscleOptions, validateExerciseInput, type ExerciseInput, type ExerciseMutation } from './exerciseCatalogue'
import { createSessionRevision } from './firebase'
import { confirmExerciseMutation, ExerciseCreateConflictError, ExerciseNotSubmittedError, writeCustomExercise } from './nativeExercises'
import { startExerciseMutation, waitForExerciseMutation, waitForExerciseConfirmation, type MutationAttempt } from './exerciseMutation'
import { colors, primaryGradient } from './theme'
import { showDialog } from './dialog'
import { Icon } from './icons'

const initial: ExerciseInput = { name: '', category: 'chest', equipment: 'barbell', muscles: [] }
export default function ExerciseForm({ uid, exercise, initialName, onClose, onSaved }: {
  uid: string; exercise: Exercise | null; initialName?: string; onClose: () => void
  // A confirmed create passes the new exercise; a reload after a conflict passes nothing.
  onSaved: (created?: { id: string; name: string }) => void
}) {
  const baseline = useRef<ExerciseInput>(exercise ?? { ...initial, name: initialName ?? '' })
  const [input, setInput] = useState<ExerciseInput>(baseline.current)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createConflict, setCreateConflict] = useState(false)
  const attempt = useRef<MutationAttempt | null>(null)
  const running = useRef(false)
  const alive = useRef(true)
  const id = useRef(exercise?.id ?? createSessionRevision())
  const insets = useSafeAreaInsets()
  const nameField = useRef<TextInput>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const locked = busy || !!attempt.current
  function close() {
    if (!alive.current) return
    if (createConflict) { onSaved(); return }
    if (running.current || attempt.current) { setError('Save outcome unresolved. Check the outcome before closing.'); return }
    if (JSON.stringify(input) === JSON.stringify(baseline.current)) { onClose(); return }
    showDialog('Discard changes?', 'Your exercise changes will be removed.', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => { if (alive.current && !running.current && !attempt.current) onClose() } }])
  }
  async function submit(kind: 'save' | 'delete' = 'save') {
    if (running.current || createConflict) return
    let operation: ExerciseMutation
    try { operation = attempt.current?.operation ?? (kind === 'delete' ? { kind: 'delete', id: id.current, source: 'user' }
      : { kind: exercise ? 'update' : 'create', id: id.current, source: 'user', input: validateExerciseInput(input) }) }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : 'Check the exercise fields.'); nameField.current?.focus(); return }
    const done = () => onSaved(operation.kind === 'create' ? { id: operation.id, name: operation.input.name } : undefined)
    running.current = true; setBusy(true); setError(null)
    try {
      if (attempt.current) {
        const confirmed = await waitForExerciseConfirmation(confirmExerciseMutation(uid, operation))
        if (!alive.current) return
        if (confirmed === null) { setError('Could not confirm the save yet. Check your connection and try again.'); return }
        if (confirmed) { done(); return }
        if (attempt.current.status === 'pending') { setError('Still checking the save. Keep this form open and try again.'); return }
      }
      const current = startExerciseMutation(operation, next => writeCustomExercise(uid, next))
      attempt.current = current
      const status = await waitForExerciseMutation(current)
      if (!alive.current) return
      if (status === 'saved') { done(); return }
      if (status === 'pending') { setError('Could not confirm the save yet. Check the outcome before closing.'); return }
      if (current.error instanceof ExerciseCreateConflictError) {
        setCreateConflict(true); setError(current.error.message); return
      }
      if (current.error instanceof ExerciseNotSubmittedError) {
        attempt.current = null
        setError(current.error.message)
        return
      }
      // A lost acknowledgement is reconciled using the same exercise ID before any retry.
      try {
        const confirmed = await waitForExerciseConfirmation(confirmExerciseMutation(uid, operation))
        if (!alive.current) return
        if (confirmed) { done(); return }
        if (confirmed === null) { setError('Could not confirm the save yet. Check your connection and try again.'); return }
      } catch (confirmationError) {
        if (confirmationError instanceof ExerciseCreateConflictError) {
          if (alive.current) { setCreateConflict(true); setError(confirmationError.message) }
          return
        }
        if (confirmationError instanceof ExerciseNotSubmittedError) {
          attempt.current = null
          if (alive.current) setError(confirmationError.message)
          return
        }
        // Retain the operation for reconciliation.
      }
      if (!alive.current) return
      const code = typeof current.error === 'object' && current.error && 'code' in current.error ? String(current.error.code) : ''
      const knownRejection = !code || code.endsWith('permission-denied') || code.endsWith('invalid-argument')
      if (knownRejection) attempt.current = null
      setError(current.error instanceof Error ? current.error.message : 'Could not save. Check your connection and try again.')
    } catch (nextError) {
      if (alive.current) {
        if (nextError instanceof ExerciseCreateConflictError) { setCreateConflict(true); setError(nextError.message) }
        // The server definitely refused the earlier request, so the form is released instead of staying locked.
        else if (nextError instanceof ExerciseNotSubmittedError) { attempt.current = null; setError(nextError.message) }
        else setError('Could not confirm the save. Check your connection and try again.')
      }
    }
    finally { running.current = false; if (alive.current) setBusy(false) }
  }
  function askDelete() {
    if (locked || !exercise) return
    showDialog('Delete exercise?', `Delete exercise "${exercise.name}"? It will no longer be available in your exercise library.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { if (alive.current) void submit('delete') } }])
  }
  return <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
    <KeyboardAvoidingView style={[styles.overlay, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Pressable accessibilityLabel="Close form backdrop" onPress={close} style={StyleSheet.absoluteFill} />
      <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(16, insets.bottom) }]}>
        <View style={styles.header}><Text accessibilityRole="header" style={styles.title}>{exercise ? 'Edit custom exercise' : 'Add custom exercise'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close form" onPress={close} style={styles.close}><Icon name="close" size={18} /></Pressable></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <View style={styles.group}><Text style={styles.label}>Name</Text><TextInput ref={nameField} accessibilityLabel="Exercise name" autoFocus value={input.name} editable={!locked} maxLength={120} onChangeText={name => { setInput({ ...input, name }); setError(null) }} placeholder="E.g. Banded Pull-apart" placeholderTextColor={colors.mutedSoft} style={styles.input} /></View>
          <View style={styles.pair}>
            <Select label="Category" value={input.category} options={categories} getLabel={value => EXERCISE_CATEGORY_LABELS[value]!} disabled={locked} onChange={category => setInput({ ...input, category })} />
            <Select label="Equipment" value={input.equipment} options={equipmentOptions} getLabel={getEquipmentLabel} disabled={locked} onChange={equipment => setInput({ ...input, equipment })} />
          </View>
          <View style={styles.group}><Text style={styles.label}>Muscle groups</Text><View style={styles.chips}>{muscleOptions.map(muscle => <Pressable key={muscle} accessibilityRole="button" accessibilityState={{ selected: input.muscles.includes(muscle), disabled: locked }} disabled={locked} onPress={() => setInput({ ...input, muscles: input.muscles.includes(muscle) ? input.muscles.filter(value => value !== muscle) : [...input.muscles, muscle] })} style={[styles.chip, input.muscles.includes(muscle) && styles.selectedChip]}><Text style={[styles.chipText, input.muscles.includes(muscle) && styles.selectedChipText]}>{getMuscleLabel(muscle)}</Text></Pressable>)}</View></View>
          {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <Pressable accessibilityRole="button" accessibilityLabel={busy ? 'Saving' : createConflict ? 'Close and reload library' : attempt.current ? 'Check outcome / Retry' : exercise ? 'Save changes' : 'Add exercise'} disabled={busy} accessibilityState={{ disabled: busy, busy }} onPress={() => createConflict ? onSaved() : void submit()} style={[styles.save, busy && { opacity: 0.5 }]}><Text style={styles.saveText}>{busy ? 'Saving…' : createConflict ? 'Close and reload library' : attempt.current ? 'Check outcome / Retry' : exercise ? 'Save changes' : 'Add exercise'}</Text></Pressable>
          {exercise && <Pressable accessibilityRole="button" disabled={locked} onPress={askDelete} style={styles.remove}><Text style={styles.removeText}>Delete exercise</Text></Pressable>}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>
}

function Select<T extends string>({ label, value, options, getLabel, disabled, onChange }: { label: string; value: T; options: T[]; getLabel: (value: T) => string; disabled: boolean; onChange: (value: T) => void }) {
  const [open, setOpen] = useState(false)
  return <View style={[styles.group, styles.half]}><Text style={styles.label}>{label}</Text><Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${getLabel(value)}`} accessibilityState={{ expanded: open, disabled }} disabled={disabled} onPress={() => setOpen(!open)} style={styles.select}><Text style={styles.selectText}>{getLabel(value)}</Text><Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} /></Pressable>{open && <View style={styles.options}>{options.map(option => <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: value === option, disabled }} disabled={disabled} onPress={() => { onChange(option); setOpen(false) }} style={styles.option}><Text style={[styles.selectText, value === option && styles.selectedOption]}>{getLabel(option)}</Text></Pressable>)}</View>}</View>
}
const field = { borderRadius: 12, backgroundColor: 'rgba(0, 0, 0, 0.2)', boxShadow: 'inset 0 1px 0 rgba(0, 0, 0, 0.2)', minHeight: 48, paddingHorizontal: 14 } as const
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-start', backgroundColor: 'rgba(13, 11, 10, 0.6)' },
  sheet: { maxHeight: '90%', borderBottomLeftRadius: 24, borderBottomRightRadius: 24, overflow: 'hidden', backgroundColor: colors.surfaceRaised, experimental_backgroundImage: `linear-gradient(180deg, ${colors.surfaceHigh}, ${colors.surfaceRaised})` },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, paddingHorizontal: 20, paddingTop: 20 },
  close: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', marginTop: -10, marginRight: -10 },
  title: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 19, lineHeight: 25, letterSpacing: -0.2 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, gap: 16 }, group: { gap: 6 }, half: { flex: 1, minWidth: 0 }, pair: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  label: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 13 },
  input: { ...field, color: colors.text, fontFamily: 'InstrumentSans_400Regular', fontSize: 16 },
  select: { ...field, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, selectText: { color: colors.text, fontFamily: 'InstrumentSans_400Regular', fontSize: 16 }, selectedOption: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold' },
  options: { borderRadius: 12, backgroundColor: 'rgba(255, 255, 255, 0.04)' }, option: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, chip: { minHeight: 44, paddingHorizontal: 13, justifyContent: 'center', borderRadius: 11, backgroundColor: 'rgba(255, 255, 255, 0.055)' }, selectedChip: { backgroundColor: 'rgba(255, 255, 255, 0.17)' }, chipText: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 14 }, selectedChipText: { color: colors.textStrong },
  error: { color: colors.warning, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, lineHeight: 18 },
  save: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: colors.primaryEnd, experimental_backgroundImage: primaryGradient, boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.5), 0 2px 8px rgba(0, 0, 0, 0.35)' }, saveText: { color: colors.onPrimary, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 16 },
  remove: { minHeight: 44, alignItems: 'center', justifyContent: 'center' }, removeText: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 14 },
})
