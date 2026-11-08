import { useCallback, useEffect, useState } from 'react'
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { BottomSheet } from './BottomSheet'
import { createSessionRevision, readExerciseMetadata, readUnits } from './firebase'
import { planEditorJournal } from './filePlanEditorJournal'
import { importedPlanDraft } from './planEditor'
import { useSessionRead } from './useSessionRead'
import { colors, primaryGradient } from './theme'
import { importPlanText } from '../../src/shared/planImport'

const EXAMPLE = 'Upper\nBench press 4x8 60 kg\nPull-up 3x8\n\nLower\nSquat 3x5 @80'

export function PastePlanSheet({ uid, onClose }: { uid: string; onClose: () => void }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [collision, setCollision] = useState(false)
  const [busy, setBusy] = useState(false)
  // The sheet sits at the screen bottom; lift its content above the keyboard so Continue stays reachable.
  const [keyboard, setKeyboard] = useState(0)
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', (event) => setKeyboard(event.endCoordinates.height))
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboard(0))
    return () => { shown.remove(); hidden.remove() }
  }, [])
  const load = useCallback(() => readExerciseMetadata(uid), [uid])
  const catalog = useSessionRead(uid, load, true)
  // Own exercises match before the catalogue, so wait for them unless they failed to load.
  const loading = catalog.state.status === 'loading'

  async function proceed(close: (after?: () => void) => void) {
    const own = catalog.state.status === 'ready'
      ? catalog.state.data.map((exercise) => ({ exerciseId: exercise.id, exerciseSource: 'user' as const, name: exercise.name, muscles: exercise.muscles }))
      : []
    const pasted = importPlanText(text, own)
    if (!pasted) { setError('No exercises found. Write one exercise per line with its sets, like “Bench press 4x8 60 kg”.'); return }
    setBusy(true); setError(null); setCollision(false)
    try {
      const draft = importedPlanDraft(pasted, await readUnits(uid), createSessionRevision)
      if (!await planEditorJournal.installIfEmpty(uid, draft, createSessionRevision())) { setCollision(true); return }
      close(() => router.push('/templates/new'))
    } catch {
      setError('Could not open the plan editor. Your text is still here; try again.')
    } finally { setBusy(false) }
  }

  return <BottomSheet title="Paste a plan" onClose={onClose}>{(close) => <View>
    {keyboard === 0 && <Text style={styles.help}>Day names on their own line, then one exercise per line with sets, reps and weight. You check the result before saving.</Text>}
    <TextInput accessibilityLabel="Plan text" multiline value={text} maxLength={20000} onChangeText={(value) => { setText(value); setError(null) }}
      placeholder={EXAMPLE} placeholderTextColor={colors.muted} selectionColor={colors.accentText} textAlignVertical="top" style={[styles.field, keyboard > 0 && styles.fieldTyping]} />
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {collision && <View style={styles.collision}>
      <Text style={styles.help}>A new plan draft is already on this device. Finish or discard it before pasting another plan.</Text>
      <Pressable accessibilityRole="button" onPress={() => close(() => router.push('/templates/new'))} style={styles.link}><Text style={styles.linkText}>Open the draft</Text></Pressable>
    </View>}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !text.trim() || loading || busy }} disabled={!text.trim() || loading || busy}
      onPress={() => void proceed(close)} style={[styles.continue, (!text.trim() || loading || busy) && styles.disabled]}>
      <Text style={styles.continueText}>{loading ? 'Loading your exercises…' : busy ? 'Opening…' : 'Continue'}</Text>
    </Pressable>
    {keyboard > 0 && <View style={{ height: keyboard }} />}
  </View>}</BottomSheet>
}

const styles = StyleSheet.create({
  help: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, lineHeight: 21, marginBottom: 12 },
  field: { minHeight: 208, maxHeight: 320, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.035)', paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontFamily: 'InstrumentSans_400Regular', fontSize: 15, lineHeight: 22 },
  fieldTyping: { minHeight: 120, maxHeight: 150 },
  error: { color: '#f0a75a', fontFamily: 'InstrumentSans_500Medium', fontSize: 13, lineHeight: 18, marginTop: 10 },
  collision: { marginTop: 12 },
  link: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }, linkText: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14 },
  continue: { minHeight: 48, marginTop: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.primaryEnd, experimental_backgroundImage: primaryGradient },
  continueText: { color: colors.onPrimary, fontFamily: 'InstrumentSans_700Bold', fontSize: 15 },
  disabled: { opacity: 0.55 },
})
