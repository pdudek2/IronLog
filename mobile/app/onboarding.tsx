import Slider from '@react-native-community/slider'
import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { createProfile, logout } from '../src/firebase'
import { ProfileDataError, type ProfileFields } from '../src/profile'
import { useActiveRuntime, useAuthRuntime } from '../src/runtime'
import { colors, primaryGradient } from '../src/theme'

// Same goals and descriptions as the web onboarding.
const GOALS: { value: ProfileFields['primaryGoal']; label: string; desc: string }[] = [
  { value: 'strength', label: 'Strength', desc: 'Heavy weights, low reps' },
  { value: 'hypertrophy', label: 'Muscle growth', desc: 'Volume and progression' },
  { value: 'endurance', label: 'Endurance', desc: 'More reps, lighter weights' },
  { value: 'weight_loss', label: 'Fat loss', desc: 'Calorie deficit and cardio' },
]
const SAVE_LIMIT_MS = 15_000

// Reached only by `replace`, so it is the root of the stack and Back closes the app instead of looping to Train.
export default function OnboardingScreen() {
  const { user } = useAuthRuntime()
  const active = useActiveRuntime()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [input, setInput] = useState<ProfileFields>({ displayName: '', primaryGoal: 'hypertrophy', weeklyGoal: 3, units: 'kg' })
  const [nameError, setNameError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!user || saving) return
    if (!input.displayName.trim()) { setNameError('Enter your name'); return }
    setNameError('')
    setSaveError('')
    setSaving(true)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      // Creating only a missing profile makes a retry after a timeout safe.
      const units = await Promise.race([
        createProfile(user.uid, input),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), SAVE_LIMIT_MS) }),
      ])
      // The workout runtime read units at sign-in, before there was a profile.
      active.refreshUnits(user.uid, units)
      router.replace('/dashboard')
    } catch (cause) {
      if (cause instanceof ProfileDataError) setNameError(cause.message)
      else setSaveError('Could not save your profile. Try again.')
    } finally {
      clearTimeout(timer)
      setSaving(false)
    }
  }

  return <SafeAreaView edges={['top']} style={styles.screen}>
    <StatusBar style="light" />
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.page, { paddingBottom: Math.max(32, insets.bottom) }]}>
        <Text accessibilityRole="header" style={styles.title}>Set up your profile</Text>
        <Text style={styles.lead}>You can change these settings later in your profile.</Text>
        <View pointerEvents="none" style={styles.seam} />

        <View style={styles.section}>
          <Text style={styles.label}>Name</Text>
          <TextInput accessibilityLabel="Name" autoComplete="name" editable={!saving} placeholder="E.g. Alex" placeholderTextColor={colors.muted}
            selectionColor={colors.accentText} value={input.displayName} maxLength={80}
            onChangeText={(displayName) => { setInput((current) => ({ ...current, displayName })); if (nameError) setNameError('') }}
            style={[styles.input, nameError ? styles.invalidInput : null]} />
          {nameError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{nameError}</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Training goal</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Training goal" style={styles.goals}>
            {GOALS.map((goal) => {
              const selected = input.primaryGoal === goal.value
              return <Pressable key={goal.value} accessibilityRole="radio" accessibilityState={{ checked: selected }} disabled={saving}
                onPress={() => setInput((current) => ({ ...current, primaryGoal: goal.value }))} style={[styles.goal, selected && styles.goalSelected]}>
                <Text style={[styles.goalTitle, selected && styles.goalTitleSelected]}>{goal.label}</Text>
                <Text style={styles.goalDesc}>{goal.desc}</Text>
              </Pressable>
            })}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.weekHeading}>
            <Text style={styles.label}>Workouts per week</Text>
            <Text accessibilityLiveRegion="polite" style={styles.weekValue}>{input.weeklyGoal}</Text>
          </View>
          <Slider accessibilityLabel="Workouts per week" accessibilityValue={{ min: 1, max: 7, now: input.weeklyGoal }} disabled={saving}
            minimumValue={1} maximumValue={7} step={1} value={input.weeklyGoal}
            onValueChange={(value) => setInput((current) => ({ ...current, weeklyGoal: Math.round(value) }))}
            minimumTrackTintColor={colors.accent} maximumTrackTintColor={colors.surfaceHigh} thumbTintColor={colors.text} style={styles.slider} />
          <View style={styles.bounds}><Text style={styles.bound}>1</Text><Text style={styles.bound}>7</Text></View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Units</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Units" style={styles.units}>
            {(['kg', 'lbs'] as const).map((units) => {
              const selected = input.units === units
              return <Pressable key={units} accessibilityRole="radio" accessibilityState={{ checked: selected }} disabled={saving}
                onPress={() => setInput((current) => ({ ...current, units }))} style={[styles.unit, selected && styles.unitSelected]}>
                <Text style={[styles.unitText, !selected && styles.unitTextQuiet]}>{units}</Text>
              </Pressable>
            })}
          </View>
        </View>

        {saveError ? <Text accessibilityRole="alert" style={[styles.error, styles.saveError]}>{saveError}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving, busy: saving }} disabled={saving} onPress={() => void save()}
          style={({ pressed }) => [styles.save, saving && styles.disabled, pressed && styles.pressed]}>
          <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save profile'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => void logout()} style={styles.signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  page: { paddingHorizontal: 16, paddingTop: 24 },
  title: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 36, lineHeight: 40, letterSpacing: -1, marginTop: 16 },
  lead: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 15, lineHeight: 22, marginTop: 6 },
  seam: { backgroundColor: colors.seam, height: 2.5, marginTop: 20, marginBottom: 8 },
  section: { paddingVertical: 12 },
  label: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14, lineHeight: 20 },
  input: { height: 46, marginTop: 8, borderColor: 'transparent', borderWidth: 1, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.035)', color: colors.textStrong, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, paddingHorizontal: 16 },
  invalidInput: { borderColor: colors.warning },
  error: { color: colors.warning, fontFamily: 'InstrumentSans_500Medium', fontSize: 13, lineHeight: 18, marginTop: 6 },
  goals: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  goal: { flexBasis: '48%', flexGrow: 1, minHeight: 64, justifyContent: 'center', gap: 2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.035)' },
  goalSelected: { backgroundColor: colors.choiceSelected },
  goalTitle: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14 },
  goalTitleSelected: { color: colors.textStrong },
  goalDesc: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, lineHeight: 16 },
  weekHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  weekValue: { color: colors.accentText, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14, lineHeight: 20 },
  slider: { height: 44, marginHorizontal: -8 },
  bounds: { flexDirection: 'row', justifyContent: 'space-between' },
  bound: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12 },
  units: { flexDirection: 'row', gap: 2, padding: 3, borderRadius: 12, marginTop: 10, backgroundColor: 'rgba(255,255,255,0.035)' },
  unit: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  unitSelected: { backgroundColor: colors.choiceSelected },
  unitText: { color: colors.text, fontFamily: 'InstrumentSans_700Bold', fontSize: 14.4 },
  unitTextQuiet: { color: colors.muted },
  saveError: { marginBottom: 8 },
  save: { minHeight: 52, marginTop: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: colors.primaryEnd, experimental_backgroundImage: primaryGradient },
  saveText: { color: colors.onPrimary, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 16 },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.82 },
  signOut: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginTop: 12 },
  signOutText: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14 },
})
