import Slider from '@react-native-community/slider'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, BackHandler, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import HistoryHeader from '../src/HistoryHeader'
import BottomNavigation, { useBottomNavigation, type NavigationExit } from '../src/BottomNavigation'
import { logout, readProfile, saveProfile } from '../src/firebase'
import { ProfileController, profileGoals, type ProfileState } from '../src/profile'
import { useActiveRuntime, useAuthRuntime } from '../src/runtime'
import { colors, pageTitle, primaryGradient } from '../src/theme'
import { showDialog } from '../src/dialog'

export default function ProfileScreen() {
  const { user } = useAuthRuntime()
  if (!user) return null
  return <Profile key={user.uid} uid={user.uid} />
}

function Profile({ uid }: { uid: string }) {
  const router = useRouter()
  const active = useActiveRuntime()
  const runtime = useRef(active)
  runtime.current = active
  const [state, setState] = useState<ProfileState | null>(null)
  const [controller] = useState(() => new ProfileController(uid, { read: readProfile, write: saveProfile,
    applyUnits: (owner, units) => runtime.current.refreshUnits(owner, units) }, setState))
  const [signingOut, setSigningOut] = useState(false)
  const navigation = useBottomNavigation()
  const insets = useSafeAreaInsets()
  const focused = useRef(false)
  const exiting = useRef(false)
  const confirming = useRef(false)
  const inputFocused = useRef(false)
  const scroll = useRef<ScrollView>(null)
  const name = useRef<TextInput>(null)
  useEffect(() => () => controller.dispose(), [controller])
  const leave: NavigationExit = proceed => {
    if (!focused.current || exiting.current || confirming.current) return
    if (controller.state.busy || controller.state.pending) {
      showDialog('Save outcome unresolved', 'Check the save outcome before leaving this profile.'); return
    }
    const go = () => {
      confirming.current = false
      if (!focused.current || controller.state.busy || controller.state.pending) return
      exiting.current = true
      Keyboard.dismiss()
      void Promise.resolve(proceed()).then(result => { if (result === false) exiting.current = false; else controller.discard() })
    }
    if (!controller.dirty) { go(); return }
    confirming.current = true
    showDialog('Discard changes?', 'Your profile changes will be removed.', [
      { text: 'Keep editing', style: 'cancel', onPress: () => { confirming.current = false } },
      { text: 'Discard', style: 'destructive', onPress: go },
    ], { onDismiss: () => { confirming.current = false } })
  }
  useFocusEffect(useCallback(() => {
    focused.current = true; exiting.current = false; confirming.current = false
    void controller.load()
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (inputFocused.current || Keyboard.isVisible()) { Keyboard.dismiss(); inputFocused.current = false; return true }
      leave(() => router.canGoBack() ? router.back() : router.replace('/dashboard')); return true
    })
    return () => { focused.current = false; controller.suspendRead(); back.remove() }
  }, [controller]))
  const signOut = async () => {
    if (signingOut) return false
    setSigningOut(true)
    try {
      await logout()
      router.replace('/')
      return true
    } catch {
      showDialog('Could not sign out', 'Check your connection and try again.')
      setSigningOut(false)
      return false
    }
  }
  const current = state ?? controller.state
  const input = current.input
  const locked = current.status !== 'ready' || current.busy || current.pending
  const submit = async () => { await controller.save(); if (controller.state.nameError && focused.current) { scroll.current?.scrollTo({ y: 0, animated: true }); name.current?.focus() } }
  return <SafeAreaView edges={['top']} style={styles.screen}>
    <StatusBar style="light" />
    <HistoryHeader onRequestAction={(action, proceed) => { if (action !== 'profile') leave(proceed) }} />
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView ref={scroll} onScroll={navigation.onScroll} scrollEventThrottle={16} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.page, { paddingBottom: Math.max(32, insets.bottom) }]}>
        <View style={styles.heading}><Text accessibilityRole="header" style={styles.title}>Profile</Text></View>
        {current.status === 'loading' ? <ActivityIndicator color={colors.accentText} style={styles.loading} />
          : !input ? <View style={styles.loading}><Text accessibilityRole="alert" style={styles.error}>{current.status === 'missing' ? 'Profile setup is missing. Retry or return to Train.' : current.message}</Text><Pressable accessibilityRole="button" onPress={() => void controller.load(true)} style={styles.retry}><Text style={styles.accent}>Retry</Text></Pressable><Pressable accessibilityRole="button" onPress={() => leave(() => router.replace('/dashboard'))} style={styles.retry}><Text style={styles.muted}>Back to Home</Text></Pressable></View>
          : <View style={styles.form}>
            <View style={styles.section}><Text style={styles.label}>Name</Text><TextInput ref={name} accessibilityLabel="Name" autoComplete="name" editable={!locked} placeholder="E.g. Alex" placeholderTextColor={colors.muted} selectionColor={colors.accentText} value={input.displayName} onFocus={() => { inputFocused.current = true; navigation.onFocus() }} onBlur={() => { inputFocused.current = false; navigation.onBlur() }} onChangeText={displayName => controller.change({ displayName })} style={[styles.input, current.nameError && styles.invalidInput]} />{current.nameError && <Text accessibilityRole="alert" style={styles.error}>{current.nameError}</Text>}</View>
            <View style={styles.goalSection}><Text style={styles.goalLabel}>Primary goal</Text><View style={styles.goals}>{profileGoals.map(goal => <Pressable key={goal.value} accessibilityRole="button" accessibilityState={{ selected: input.primaryGoal === goal.value, disabled: locked }} disabled={locked} onPress={() => controller.change({ primaryGoal: goal.value })} style={[styles.goal, input.primaryGoal === goal.value && styles.selectedGoal]}><Text style={[styles.goalText, input.primaryGoal === goal.value && styles.selectedText]}>{goal.label}</Text></Pressable>)}</View></View>
            <View style={styles.section}><View style={styles.weekHeading}><Text style={styles.label}>Workouts per week</Text><Text accessibilityLiveRegion="polite" style={styles.weekValue}>{input.weeklyGoal} {input.weeklyGoal === 1 ? 'workout' : 'workouts'}</Text></View><Slider accessibilityLabel="Workouts per week" accessibilityValue={{ min: 1, max: 7, now: Math.min(7, input.weeklyGoal), text: `${input.weeklyGoal} saved workouts; choose 1 to 7` }} disabled={locked} minimumValue={1} maximumValue={7} step={1} value={Math.min(7, input.weeklyGoal)} onValueChange={weeklyGoal => controller.change({ weeklyGoal })} minimumTrackTintColor="rgba(255,255,255,0.08)" maximumTrackTintColor="rgba(255,255,255,0.08)" thumbTintColor={colors.accent} style={styles.slider} /><View style={styles.bounds} accessible={false}><Text style={styles.bound}>1</Text><Text style={styles.bound}>7</Text></View><Text style={styles.unitsLabel}>Units</Text><View style={styles.units}>{(['kg', 'lbs'] as const).map(units => <Pressable key={units} accessibilityRole="button" accessibilityLabel={units} accessibilityState={{ selected: input.units === units, disabled: locked }} disabled={locked} onPress={() => controller.change({ units })} style={[styles.unit, units === 'lbs' && undefined, input.units === units && styles.selectedUnit]}><Text style={[styles.unitText, input.units === units && styles.selectedText]}>{units}</Text></Pressable>)}</View></View>
            <View style={styles.saveSection}><Pressable accessibilityRole="button" accessibilityLabel={current.busy ? 'Saving' : current.pending ? 'Check save outcome' : 'Save changes'} accessibilityState={{ disabled: current.busy || current.status !== 'ready', busy: current.busy }} disabled={current.busy || current.status !== 'ready'} onPress={() => void submit()} style={[styles.save, (current.busy || current.status !== 'ready') && styles.disabled]}><Text style={styles.saveText}>{current.busy ? 'Saving…' : current.pending ? 'Check save outcome' : 'Save changes'}</Text></Pressable>{current.message && <Text accessibilityRole={current.message === 'Profile saved' ? undefined : 'alert'} accessibilityLiveRegion="polite" style={current.message === 'Profile saved' ? styles.success : styles.error}>{current.message}</Text>}{current.status !== 'ready' && <Pressable accessibilityRole="button" onPress={() => void controller.load(true)} style={styles.retry}><Text style={styles.accent}>Retry</Text></Pressable>}</View>
          </View>}
        <Pressable accessibilityRole="button" disabled={signingOut} onPress={() => leave(signOut)} style={styles.signOut}><Text style={styles.signOutText}>Sign out</Text></Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
    <BottomNavigation {...navigation} onRequestExit={leave} />
  </SafeAreaView>
}

const border = colors.line
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, page: { paddingHorizontal: 16, paddingTop: 16 },
  heading: { paddingBottom: 4 }, title: pageTitle,
  form: { paddingTop: 8 }, goalSection: { paddingVertical: 8 }, section: { paddingVertical: 12, gap: 0 },
  label: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14, lineHeight: 20 },
  input: { height: 46, marginTop: 8, borderColor: border, borderWidth: 1, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.035)', color: colors.textStrong, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, paddingHorizontal: 16 }, invalidInput: { borderColor: colors.warning },
  goalLabel: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14, lineHeight: 20, marginBottom: 10 }, goals: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, padding: 3, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.035)' },
  goal: { width: '49%', flexGrow: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 9 }, selectedGoal: { backgroundColor: colors.choiceSelected }, goalText: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 13, lineHeight: 18 }, selectedText: { color: colors.text },
  weekHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }, weekValue: { color: colors.accentText, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14, lineHeight: 20 }, slider: { height: 44, marginVertical: -10, marginHorizontal: -8 }, bounds: { flexDirection: 'row', justifyContent: 'space-between' }, bound: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, lineHeight: 16 }, unitsLabel: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14, lineHeight: 20, marginTop: 20, marginBottom: 8 },
  units: { alignSelf: 'flex-start', flexDirection: 'row', gap: 2, padding: 3, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.035)' }, unit: { minHeight: 44, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderRadius: 9 }, selectedUnit: { backgroundColor: colors.choiceSelected }, unitText: { color: colors.text, fontFamily: 'InstrumentSans_700Bold', fontSize: 14.4 },
  saveSection: { paddingTop: 20, gap: 12 }, save: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: colors.primaryEnd, experimental_backgroundImage: primaryGradient }, saveText: { color: colors.onPrimary, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 16 }, disabled: { opacity: 0.55 },
  signOut: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginTop: 12 }, signOutText: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14 },
  loading: { marginTop: 32, gap: 12 }, error: { color: colors.warning, fontFamily: 'InstrumentSans_500Medium', fontSize: 13, lineHeight: 18 }, success: { color: colors.recovery, fontFamily: 'InstrumentSans_500Medium', fontSize: 13 }, retry: { minHeight: 44, justifyContent: 'center' }, accent: { color: colors.accentText, fontFamily: 'InstrumentSans_700Bold', fontSize: 14 }, muted: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 14 },
})
