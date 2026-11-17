import Slider from '@react-native-community/slider'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, BackHandler, Keyboard, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import Constants from 'expo-constants'
import * as Updates from 'expo-updates'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import HistoryHeader from '../src/HistoryHeader'
import BottomNavigation, { useBottomNavigation, useNavigationInset, type NavigationExit } from '../src/BottomNavigation'
import { KeyboardAwareScrollView, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller'
import { deleteAccountOnServer, logout, readFirstWorkoutAt, readProfile, readProgressRecords, readRecentWorkouts, saveProfile } from '../src/firebase'
import { BottomSheet } from '../src/BottomSheet'
import { markAccountDeleted, ownsJournalKey } from '../src/accountData'
import { removeAccountJournals } from '../src/fileSessionJournal'
import { removeCoachKey } from '../src/coachNative'
import { FEEDBACK_EMAIL, feedbackMailto } from '../../src/shared/feedbackMail'
import { getAuthErrorMessage } from '../../src/shared/authErrors'
import { pluralize } from '../../src/lib/pluralize'
import { trainingSinceLabel } from '../../src/shared/workoutDisplay'
import { ProfileController, profileGoals, type ProfileState } from '../src/profile'
import { useActiveRuntime, useAuthRuntime } from '../src/runtime'
import { colors, pageTitle, primaryGradient, fieldColors } from '../src/theme'
import { showDialog } from '../src/dialog'

const STATS_WORKOUTS = 50
const PRIVACY_URL = 'https://getshear.vercel.app/privacy'
// EXPO_PUBLIC_COMMIT is inlined into the bundle at build or update time; the runtime version leads to the native-* tag of the build.
const APP_VERSION = `${Constants.expoConfig?.version ?? '?'} · ${process.env.EXPO_PUBLIC_COMMIT ?? 'dev'} · ${Updates.runtimeVersion?.slice(0, 7) ?? '?'}`

function feedbackUrl(): string {
  const model = (Platform.constants as { Model?: string }).Model
  return feedbackMailto({
    platform: 'Android', system: `Android ${Platform.Version}${model ? ` · ${model}` : ''}`,
    version: APP_VERSION, date: new Date(),
  })
}

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
  const [deleting, setDeleting] = useState(false)
  const navigation = useBottomNavigation()
  const navigationInset = useNavigationInset()
  const focused = useRef(false)
  const exiting = useRef(false)
  const confirming = useRef(false)
  const inputFocused = useRef(false)
  const scroll = useRef<KeyboardAwareScrollViewRef>(null)
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
  const [stats, setStats] = useState<{ workouts: number; records: number } | null>(null)
  const [createdAt, setCreatedAt] = useState<number | null>(null)
  const [firstWorkoutAt, setFirstWorkoutAt] = useState<number | null>(null)
  useEffect(() => {
    let live = true
    void Promise.all([readRecentWorkouts(uid, STATS_WORKOUTS), readProgressRecords(uid), readProfile(uid)]).then(([workouts, records, profile]) => {
      if (!live) return
      setCreatedAt(profile.data?.createdAt ?? null)
      setStats({ workouts: workouts.data.length, records: records.data.records.length })
    }).catch(() => undefined)
    readFirstWorkoutAt(uid).then((at) => { if (live) setFirstWorkoutAt(at) }).catch(() => undefined)
    return () => { live = false }
  }, [uid])
  const current = state ?? controller.state
  const input = current.input
  const locked = current.status !== 'ready' || current.busy || current.pending
  const submit = async () => { await controller.save(); if (controller.state.nameError && focused.current) { scroll.current?.scrollTo({ y: 0, animated: true }); name.current?.focus() } }
  return <SafeAreaView edges={['top']} style={styles.screen}>
    <StatusBar style="light" />
    <HistoryHeader onRequestAction={(action, proceed) => { if (action !== 'profile') leave(proceed) }} />
    <KeyboardAwareScrollView ref={scroll} bottomOffset={16} onScroll={navigation.onScroll} scrollEventThrottle={16} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.page, { paddingBottom: 32 + navigationInset }]}>
        <View style={styles.head}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{(input?.displayName || '?').charAt(0).toUpperCase()}</Text></View>
          <View style={styles.headCopy}>
            <Text accessibilityRole="header" accessibilityLabel="Profile" numberOfLines={1} style={styles.title}>{input?.displayName || 'Profile'}</Text>
            {createdAt ? <Text style={styles.since}>{trainingSinceLabel(createdAt, firstWorkoutAt)}</Text> : null}
            {stats && <Text style={styles.since}>{stats.workouts >= STATS_WORKOUTS ? `${STATS_WORKOUTS}+` : stats.workouts} {pluralize(stats.workouts, 'workout', 'workouts')} · {stats.records} {pluralize(stats.records, 'record', 'records')}</Text>}
          </View>
        </View>
        {current.status === 'loading' ? <ActivityIndicator color={colors.accentText} style={styles.loading} />
          : !input ? <View style={styles.loading}><Text accessibilityRole="alert" style={styles.error}>{current.status === 'missing' ? 'Profile setup is missing. Retry or return to Train.' : current.message}</Text><Pressable accessibilityRole="button" onPress={() => void controller.load(true)} style={styles.retry}><Text style={styles.accent}>Retry</Text></Pressable><Pressable accessibilityRole="button" onPress={() => leave(() => router.replace('/dashboard'))} style={styles.retry}><Text style={styles.muted}>Back to Home</Text></Pressable></View>
          : <View style={styles.form}>
            <View style={styles.section}><Text style={styles.label}>Name</Text><TextInput ref={name} accessibilityLabel="Name" autoComplete="name" editable={!locked} placeholder="E.g. Alex" placeholderTextColor={colors.muted} {...fieldColors} value={input.displayName} onFocus={() => { inputFocused.current = true }} onBlur={() => { inputFocused.current = false }} onChangeText={displayName => controller.change({ displayName })} style={[styles.input, current.nameError && styles.invalidInput]} />{current.nameError && <Text accessibilityRole="alert" style={styles.error}>{current.nameError}</Text>}</View>
            <View style={styles.goalSection}><Text style={styles.goalLabel}>Primary goal</Text><View style={styles.goals}>{profileGoals.map(goal => <Pressable key={goal.value} accessibilityRole="button" accessibilityState={{ selected: input.primaryGoal === goal.value, disabled: locked }} disabled={locked} onPress={() => controller.change({ primaryGoal: goal.value })} style={[styles.goal, input.primaryGoal === goal.value && styles.selectedGoal]}><Text style={[styles.goalText, input.primaryGoal === goal.value && styles.selectedText]}>{goal.label}</Text></Pressable>)}</View></View>
            <View style={styles.section}><View style={styles.weekHeading}><Text style={styles.label}>Workouts per week</Text><Text accessibilityLiveRegion="polite" style={styles.weekValue}>{input.weeklyGoal} {input.weeklyGoal === 1 ? 'workout' : 'workouts'}</Text></View><Slider accessibilityLabel="Workouts per week" accessibilityValue={{ min: 1, max: 7, now: Math.min(7, input.weeklyGoal), text: `${input.weeklyGoal} saved workouts; choose 1 to 7` }} disabled={locked} minimumValue={1} maximumValue={7} step={1} value={Math.min(7, input.weeklyGoal)} onValueChange={weeklyGoal => controller.change({ weeklyGoal })} minimumTrackTintColor="rgba(255,255,255,0.08)" maximumTrackTintColor="rgba(255,255,255,0.08)" thumbTintColor={colors.accent} style={styles.slider} /><View style={styles.bounds} accessible={false}><Text style={styles.bound}>1</Text><Text style={styles.bound}>7</Text></View><Text style={styles.unitsLabel}>Units</Text><View style={styles.units}>{(['kg', 'lbs'] as const).map(units => <Pressable key={units} accessibilityRole="button" accessibilityLabel={units} accessibilityState={{ selected: input.units === units, disabled: locked }} disabled={locked} onPress={() => controller.change({ units })} style={[styles.unit, units === 'lbs' && undefined, input.units === units && styles.selectedUnit]}><Text style={[styles.unitText, input.units === units && styles.selectedText]}>{units}</Text></Pressable>)}</View></View>
            <View style={styles.saveSection}><Pressable accessibilityRole="button" accessibilityLabel={current.busy ? 'Saving' : current.pending ? 'Check save outcome' : 'Save changes'} accessibilityState={{ disabled: !controller.canSave, busy: current.busy }} disabled={!controller.canSave} onPress={() => void submit()} style={[styles.save, !controller.canSave && styles.disabled]}><Text style={styles.saveText}>{current.busy ? 'Saving…' : current.pending ? 'Check save outcome' : 'Save changes'}</Text></Pressable>{current.message && <Text accessibilityRole={current.message === 'Profile saved' ? undefined : 'alert'} accessibilityLiveRegion="polite" style={current.message === 'Profile saved' ? styles.success : styles.error}>{current.message}</Text>}{current.status !== 'ready' && <Pressable accessibilityRole="button" onPress={() => void controller.load(true)} style={styles.retry}><Text style={styles.accent}>Retry</Text></Pressable>}</View>
          </View>}
        <View style={styles.links}>
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(feedbackUrl()).catch(() => undefined)} style={styles.linkRow}><Text style={styles.linkText}>Send feedback</Text><Text style={styles.linkMeta}>Email</Text></Pressable>
          {/* Android 11+ does not report a mail app for mailto, so the address is always there to copy. */}
          <Text selectable style={styles.address}>{FEEDBACK_EMAIL}</Text>
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(PRIVACY_URL).catch(() => undefined)} style={styles.linkRow}><Text style={styles.linkText}>Privacy policy</Text><Text style={styles.linkMeta}>Opens the browser</Text></Pressable>
        </View>
        <Pressable accessibilityRole="button" disabled={signingOut} onPress={() => leave(signOut)} style={styles.signOut}><Text style={styles.signOutText}>Sign out</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={signingOut} onPress={() => setDeleting(true)} style={styles.signOut}><Text style={styles.signOutText}>Delete account</Text></Pressable>
        <Text selectable style={styles.version}>{APP_VERSION}</Text>
    </KeyboardAwareScrollView>
    <BottomNavigation {...navigation} onRequestExit={leave} />
    {deleting && <BottomSheet title="Delete account" onClose={() => setDeleting(false)}>
      {(close) => <DeleteAccount uid={uid} working={active.state.status === 'ready'} close={close} onDeleted={() => router.replace('/')} />}
    </BottomSheet>}
  </SafeAreaView>
}

// Password again, then the server deletes everything; the device forgets the account's journals and Coach key.
function DeleteAccount({ uid, working, close, onDeleted }: { uid: string; working: boolean; close: (after?: () => void) => void; onDeleted: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (busy) return
    if (working) { setError('Finish or discard your workout first.'); return }
    if (!password) { setError('Enter your password.'); return }
    setBusy(true)
    setError('')
    try {
      await deleteAccountOnServer(uid, password)
      await removeAccountJournals((key) => ownsJournalKey(key, uid), uid).catch(() => undefined)
      await removeCoachKey(uid).catch(() => undefined)
      markAccountDeleted()
      await logout().catch(() => undefined)
      close(onDeleted)
    } catch (cause) {
      const code = typeof cause === 'object' && cause && 'code' in cause ? String(cause.code) : ''
      setError(code === 'auth/network-request-failed' ? 'Connect to the internet to delete your account.'
        : code === 'auth/wrong-password' || code === 'auth/invalid-credential' ? 'Wrong password.'
        : code.startsWith('auth/') ? getAuthErrorMessage(cause, 'login')
        : cause instanceof Error && cause.message ? cause.message : 'Could not delete your account. Try again.')
      setBusy(false)
    }
  }
  return <View style={styles.deleteSheet}>
    <Text style={styles.deleteCopy}>This deletes your account, profile, plans, workouts, records and check-ins at once. It cannot be undone.</Text>
    <Text style={styles.label}>Password</Text>
    <TextInput accessibilityLabel="Password" autoCapitalize="none" autoComplete="current-password" secureTextEntry editable={!busy}
      {...fieldColors} value={password} onChangeText={(value) => { setPassword(value); setError('') }} style={styles.input} />
    {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    <Text style={styles.deleteCopy}>Forgot your password? Sign out and use “Forgot password?” on the sign-in screen.</Text>
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => void submit()} style={[styles.save, busy && styles.disabled]}>
      <Text style={styles.saveText}>{busy ? 'Deleting…' : 'Delete account'}</Text>
    </Pressable>
  </View>
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, page: { paddingHorizontal: 16, paddingTop: 16 },
  head: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingBottom: 4 }, headCopy: { flex: 1, minWidth: 0 }, title: pageTitle,
  avatar: { alignItems: 'center', backgroundColor: colors.choiceSelected, borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
  avatarText: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 18 },
  since: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14 },
  form: { paddingTop: 8 }, goalSection: { paddingVertical: 8 }, section: { paddingVertical: 12, gap: 0 },
  label: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14, lineHeight: 20 },
  input: { height: 46, marginTop: 8, borderColor: 'transparent', borderWidth: 1, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.035)', color: colors.textStrong, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, paddingHorizontal: 16 }, invalidInput: { borderColor: colors.warning },
  goalLabel: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14, lineHeight: 20, marginBottom: 10 }, goals: { flexDirection: 'row', gap: 2, padding: 3, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.035)' },
  goal: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 9, paddingHorizontal: 4 }, selectedGoal: { backgroundColor: colors.choiceSelected }, goalText: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 13, lineHeight: 16, textAlign: 'center' }, selectedText: { color: colors.text },
  weekHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }, weekValue: { color: colors.accentText, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14, lineHeight: 20 }, slider: { height: 44, marginVertical: -10, marginHorizontal: -8 }, bounds: { flexDirection: 'row', justifyContent: 'space-between' }, bound: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, lineHeight: 16 }, unitsLabel: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14, lineHeight: 20, marginTop: 20, marginBottom: 8 },
  units: { alignSelf: 'flex-start', flexDirection: 'row', gap: 2, padding: 3, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.035)' }, unit: { minHeight: 44, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderRadius: 9 }, selectedUnit: { backgroundColor: colors.choiceSelected }, unitText: { color: colors.text, fontFamily: 'InstrumentSans_700Bold', fontSize: 14.4 },
  saveSection: { paddingTop: 20, gap: 12 }, save: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: colors.primaryEnd, experimental_backgroundImage: primaryGradient }, saveText: { color: colors.onPrimary, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 16 }, disabled: { opacity: 0.55 },
  links: { marginTop: 20 },
  linkRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  linkText: { color: colors.text, fontFamily: 'InstrumentSans_500Medium', fontSize: 15 },
  linkMeta: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13 },
  address: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, marginTop: -8, marginBottom: 4 },
  version: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, marginTop: 16 },
  deleteSheet: { gap: 10, paddingBottom: 8 },
  deleteCopy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, lineHeight: 20 },
  signOut: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginTop: 12 }, signOutText: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14 },
  loading: { marginTop: 32, gap: 12 }, error: { color: colors.warning, fontFamily: 'InstrumentSans_500Medium', fontSize: 13, lineHeight: 18 }, success: { color: colors.recovery, fontFamily: 'InstrumentSans_500Medium', fontSize: 13 }, retry: { minHeight: 44, justifyContent: 'center' }, accent: { color: colors.accentText, fontFamily: 'InstrumentSans_700Bold', fontSize: 14 }, muted: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 14 },
})
