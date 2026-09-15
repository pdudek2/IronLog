import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { login, logout, observeAuth, type AuthUser } from '../src/firebase'
import { formatElapsed, formatSet, type ActiveWorkout } from '../src/session'
import { useActiveSession } from '../src/useActiveSession'

const colors = {
  background: '#111012',
  surface: '#1a191c',
  surfaceRaised: '#211f23',
  line: 'rgba(244, 241, 242, 0.12)',
  lineStrong: 'rgba(244, 241, 242, 0.20)',
  text: '#f4f1f2',
  textStrong: '#ffffff',
  muted: '#a09aa0',
  mutedSoft: '#8f8990',
  accent: '#f0435a',
  accentText: '#ff7182',
  recovery: '#8fb8a0',
  warning: '#f0a75a',
}

function authMessage(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
    return 'Email or password is incorrect.'
  }
  if (code.includes('network-request-failed')) return 'Can’t reach the sign-in service. Check your connection.'
  return 'Sign in failed. Check your connection and try again.'
}

function ActionButton({ label, onPress, secondary = false, disabled = false }: {
  label: string
  onPress: () => void
  secondary?: boolean
  disabled?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.buttonSecondary,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.buttonSecondaryText]}>{label}</Text>
    </Pressable>
  )
}

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await login(email, password)
    } catch (cause) {
      setError(authMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.loginContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandRow}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>IL</Text></View>
          <Text style={styles.brandName}>IronLog</Text>
          <Text style={styles.previewLabel}>Native preview</Text>
        </View>
        <Text accessibilityRole="header" style={styles.hero}>
          Find your{`\n`}training <Text style={styles.heroAccent}>rhythm.</Text>
        </Text>
        <Text style={styles.lead}>Every set builds on the last.</Text>
        <View style={styles.formDivider} />
        <Text accessibilityRole="header" style={styles.formTitle}>Sign in</Text>
        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            accessibilityLabel="Email"
            autoCapitalize="none"
            autoComplete="email"
            inputMode="email"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="email@example.com"
            placeholderTextColor={colors.mutedSoft}
            returnKeyType="next"
            selectionColor={colors.accentText}
            style={styles.input}
            value={email}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            accessibilityLabel="Password"
            autoCapitalize="none"
            autoComplete="current-password"
            onChangeText={setPassword}
            onSubmitEditing={() => void submit()}
            placeholder="••••••••"
            placeholderTextColor={colors.mutedSoft}
            returnKeyType="done"
            selectionColor={colors.accentText}
            secureTextEntry
            style={styles.input}
            value={password}
          />
          {error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
          <ActionButton disabled={busy} label={busy ? 'Signing in…' : 'Sign in'} onPress={() => void submit()} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function Elapsed({ session }: { session: ActiveWorkout }) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1_000)
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now())
    })
    return () => {
      clearInterval(interval)
      subscription.remove()
    }
  }, [session.startedAt])

  return <Text accessibilityLabel={`Elapsed time ${formatElapsed(session.startedAt, now)}`} style={styles.elapsed}>{formatElapsed(session.startedAt, now)}</Text>
}

function SessionScreen({ user }: { user: AuthUser }) {
  const { state, retry } = useActiveSession(user.uid)
  const [signingOut, setSigningOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)

  const doLogout = async () => {
    setSigningOut(true)
    setLogoutError(null)
    try {
      await logout()
    } catch {
      setLogoutError('Could not sign out. Check your connection and try again.')
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.sessionContent}>
      <View style={styles.topbar}>
        <View style={[styles.flex, styles.sessionBrand]}>
          <View style={styles.brandMarkSmall}><Text style={styles.brandMarkTextSmall}>IL</Text></View>
          <View style={styles.flex}>
            <Text style={styles.brandNameSmall}>IronLog</Text>
            <Text numberOfLines={1} style={styles.account}>{user.email ?? 'Signed in'}</Text>
          </View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Sign out" disabled={signingOut} onPress={() => void doLogout()} hitSlop={12}>
          <Text style={styles.signOut}>{signingOut ? 'Signing out…' : 'Sign out'}</Text>
        </Pressable>
      </View>
      {logoutError && <Text accessibilityLiveRegion="polite" style={styles.logoutError}>{logoutError}</Text>}

      {state.status === 'loading' && (
        <View accessibilityLiveRegion="polite" style={styles.centerState}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.stateTitle}>Checking your session…</Text>
        </View>
      )}

      {state.status === 'cache-miss' && (
        <View style={styles.centerState}>
          <Text accessibilityRole="header" style={styles.stateTitle}>Connection needed</Text>
          <Text style={styles.stateCopy}>This device has no confirmed session to show. Reconnect and retry.</Text>
          <ActionButton label="Retry" onPress={retry} secondary />
        </View>
      )}

      {state.status === 'empty' && (
        <View style={styles.centerState}>
          <Text accessibilityRole="header" style={styles.stateTitle}>No workout in progress</Text>
          <Text style={styles.stateCopy}>Start one on IronLog web and it will appear here.</Text>
        </View>
      )}

      {state.status === 'error' && (
        <View style={styles.centerState}>
          <Text accessibilityRole="header" style={styles.stateTitle}>Session unavailable</Text>
          <Text accessibilityLiveRegion="polite" style={styles.error}>{state.message}</Text>
          <ActionButton label="Retry" onPress={retry} secondary />
        </View>
      )}

      {state.status === 'ready' && (
        <View>
          <View style={styles.sessionHeader}>
            <Text style={styles.sectionLabel}>Active workout</Text>
            <Text accessibilityRole="header" style={styles.sessionTitle}>{state.session.label ?? 'Current workout'}</Text>
            <Elapsed session={state.session} />
            {state.stale && (
              <View style={styles.staleNotice}>
                <Text style={styles.staleTitle}>Saved on this device</Text>
                <Text style={styles.staleCopy}>This may be out of date. Reconnect to confirm the workout is still active.</Text>
              </View>
            )}
          </View>

          {state.session.exercises.length === 0 ? (
            <Text style={styles.stateCopy}>No exercises yet.</Text>
          ) : state.session.exercises.map((exercise, exerciseIndex) => (
            <View key={`${exercise.exerciseSource}:${exercise.exerciseId}:${exerciseIndex}`} style={styles.exercise}>
              <View style={styles.exerciseBody}>
                <Text style={styles.exerciseName}>{exercise.name}</Text>
                {exercise.sets.map((set, setIndex) => (
                  <View key={setIndex} style={styles.setRow}>
                    <Text style={styles.setNumber}>SET {setIndex + 1}</Text>
                    <Text style={styles.setValue}>{formatSet(set, state.units)}</Text>
                    <Text accessibilityLabel={set.done ? 'Completed' : 'Not completed'} style={set.done ? styles.done : styles.pending}>{set.done ? 'DONE' : 'OPEN'}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
          <Text style={styles.previewFooter}>Native preview · Read only</Text>
        </View>
      )}
    </ScrollView>
  )
}

export default function IndexScreen() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined)
  const [startupError, setStartupError] = useState(false)

  useEffect(() => observeAuth(setUser, () => setStartupError(true)), [])

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      {startupError ? (
        <View style={styles.centerState}>
          <Text accessibilityRole="header" style={styles.stateTitle}>App configuration unavailable</Text>
          <Text style={styles.stateCopy}>Rebuild this client with an explicit Firebase backend.</Text>
        </View>
      ) : user === undefined ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.stateTitle}>Restoring sign-in…</Text>
        </View>
      ) : user ? <SessionScreen user={user} /> : <LoginForm />}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  loginContent: { flexGrow: 1, justifyContent: 'center', padding: 28, paddingBottom: 44 },
  sessionContent: { flexGrow: 1, padding: 22, paddingBottom: 44 },
  brandRow: { alignItems: 'center', flexDirection: 'row', marginBottom: 34 },
  brandMark: { alignItems: 'center', backgroundColor: colors.accent, borderRadius: 7, height: 34, justifyContent: 'center', width: 34 },
  brandMarkText: { color: colors.textStrong, fontFamily: 'Archivo_800ExtraBold', fontSize: 13 },
  brandName: { color: colors.textStrong, fontFamily: 'Archivo_700Bold', fontSize: 19, marginLeft: 10 },
  previewLabel: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 12, marginLeft: 'auto' },
  hero: { color: colors.textStrong, fontFamily: 'Archivo_700Bold', fontSize: 39, letterSpacing: -0.6, lineHeight: 40, maxWidth: 330 },
  heroAccent: { color: colors.accentText, fontFamily: 'InstrumentSans_700Bold' },
  lead: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 16, lineHeight: 24, marginTop: 14 },
  formDivider: { backgroundColor: colors.lineStrong, height: 1, marginBottom: 24, marginTop: 30 },
  formTitle: { color: colors.textStrong, fontFamily: 'Archivo_700Bold', fontSize: 27, lineHeight: 30 },
  form: { gap: 9, marginTop: 16 },
  label: { color: colors.muted, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 13, marginTop: 8 },
  input: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 8, borderWidth: 1, color: colors.text, fontFamily: 'InstrumentSans_500Medium', fontSize: 16, minHeight: 54, paddingHorizontal: 16 },
  button: { alignItems: 'center', backgroundColor: colors.accent, borderRadius: 8, justifyContent: 'center', minHeight: 52, marginTop: 15, paddingHorizontal: 18 },
  buttonSecondary: { backgroundColor: colors.surfaceRaised, borderColor: colors.lineStrong, borderWidth: 1, minWidth: 140 },
  buttonDisabled: { opacity: 0.55 },
  buttonPressed: { opacity: 0.82 },
  buttonText: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 15 },
  buttonSecondaryText: { color: colors.text },
  error: { color: colors.warning, fontFamily: 'InstrumentSans_500Medium', fontSize: 14, lineHeight: 20, marginTop: 6 },
  topbar: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 16, paddingBottom: 18 },
  sessionBrand: { alignItems: 'center', flexDirection: 'row' },
  brandMarkSmall: { alignItems: 'center', backgroundColor: colors.accent, borderRadius: 6, height: 30, justifyContent: 'center', marginRight: 10, width: 30 },
  brandMarkTextSmall: { color: colors.textStrong, fontFamily: 'Archivo_800ExtraBold', fontSize: 11 },
  brandNameSmall: { color: colors.textStrong, fontFamily: 'Archivo_700Bold', fontSize: 15 },
  account: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, marginTop: 2 },
  signOut: { color: colors.accentText, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14, paddingVertical: 10 },
  logoutError: { color: colors.warning, fontFamily: 'InstrumentSans_500Medium', fontSize: 13, lineHeight: 19, paddingTop: 14 },
  centerState: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 420, paddingHorizontal: 20, gap: 12 },
  stateTitle: { color: colors.textStrong, fontFamily: 'Archivo_700Bold', fontSize: 22, textAlign: 'center' },
  stateCopy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  sessionHeader: { paddingBottom: 28, paddingTop: 34 },
  sectionLabel: { color: colors.accentText, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 13 },
  sessionTitle: { color: colors.textStrong, fontFamily: 'Archivo_700Bold', fontSize: 34, letterSpacing: -0.5, marginTop: 9 },
  elapsed: { color: colors.text, fontFamily: 'SplineSansMono_600SemiBold', fontSize: 28, fontVariant: ['tabular-nums'], letterSpacing: 0.5, marginTop: 8 },
  staleNotice: { borderLeftColor: colors.warning, borderLeftWidth: 2, marginTop: 20, paddingLeft: 12 },
  staleTitle: { color: colors.warning, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 13 },
  staleCopy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, lineHeight: 19, marginTop: 4, maxWidth: 380 },
  exercise: { borderTopColor: colors.line, borderTopWidth: 1, paddingVertical: 20 },
  exerciseBody: { flex: 1 },
  exerciseName: { color: colors.textStrong, fontFamily: 'Archivo_700Bold', fontSize: 19, marginBottom: 10 },
  setRow: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, minHeight: 44 },
  setNumber: { color: colors.muted, fontFamily: 'SplineSansMono_600SemiBold', fontSize: 11, width: 48 },
  setValue: { color: colors.text, flex: 1, fontFamily: 'SplineSansMono_600SemiBold', fontSize: 13, fontVariant: ['tabular-nums'] },
  done: { color: colors.recovery, fontFamily: 'InstrumentSans_700Bold', fontSize: 11 },
  pending: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 11 },
  previewFooter: { color: colors.mutedSoft, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, marginTop: 18, textAlign: 'center' },
})
