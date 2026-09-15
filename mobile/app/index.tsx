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
  background: '#080b0f',
  surface: '#11161d',
  surfaceRaised: '#171e27',
  line: '#27313d',
  text: '#f5f7fa',
  muted: '#97a3b2',
  accent: '#d8ff3e',
  danger: '#ff7b7b',
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
        <Text style={styles.eyebrow}>IRONLOG · NATIVE PREVIEW</Text>
        <Text accessibilityRole="header" style={styles.hero}>Your session, at a glance.</Text>
        <Text style={styles.lead}>Sign in to view the workout currently saved to your account.</Text>
        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            accessibilityLabel="Email"
            autoCapitalize="none"
            autoComplete="email"
            inputMode="email"
            keyboardType="email-address"
            onChangeText={setEmail}
            returnKeyType="next"
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
            returnKeyType="done"
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

  const doLogout = async () => {
    setSigningOut(true)
    try {
      await logout()
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.sessionContent}>
      <View style={styles.topbar}>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>IRONLOG · PREVIEW</Text>
          <Text numberOfLines={1} style={styles.account}>{user.email ?? 'Signed in'}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Sign out" disabled={signingOut} onPress={() => void doLogout()} hitSlop={12}>
          <Text style={styles.signOut}>{signingOut ? 'Signing out…' : 'Sign out'}</Text>
        </Pressable>
      </View>

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
            <Text style={[styles.badge, state.stale && styles.badgeStale]}>
              {state.stale ? 'SAVED ON DEVICE' : 'LIVE FROM SERVER'}
            </Text>
            <Text accessibilityRole="header" style={styles.sessionTitle}>{state.session.label ?? 'Current workout'}</Text>
            <Elapsed session={state.session} />
            {state.stale && (
              <Text style={styles.staleCopy}>Not yet confirmed by the server. Reconnect before relying on its active status.</Text>
            )}
          </View>

          {state.session.exercises.length === 0 ? (
            <Text style={styles.stateCopy}>No exercises yet.</Text>
          ) : state.session.exercises.map((exercise, exerciseIndex) => (
            <View key={`${exercise.exerciseSource}:${exercise.exerciseId}:${exerciseIndex}`} style={styles.exercise}>
              <Text style={styles.exerciseIndex}>{String(exerciseIndex + 1).padStart(2, '0')}</Text>
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
  loginContent: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingBottom: 40 },
  sessionContent: { flexGrow: 1, padding: 20, paddingBottom: 48 },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  hero: { color: colors.text, fontSize: 38, fontWeight: '800', letterSpacing: -1.2, lineHeight: 42, marginTop: 14 },
  lead: { color: colors.muted, fontSize: 16, lineHeight: 24, marginTop: 12, maxWidth: 360 },
  form: { marginTop: 38, gap: 10 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.8 },
  input: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 12, borderWidth: 1, color: colors.text, fontSize: 17, minHeight: 54, paddingHorizontal: 16 },
  button: { alignItems: 'center', backgroundColor: colors.accent, borderRadius: 12, justifyContent: 'center', minHeight: 52, marginTop: 14, paddingHorizontal: 18 },
  buttonSecondary: { backgroundColor: colors.surfaceRaised, borderColor: colors.line, borderWidth: 1, minWidth: 140 },
  buttonDisabled: { opacity: 0.55 },
  buttonPressed: { opacity: 0.82 },
  buttonText: { color: '#111500', fontSize: 15, fontWeight: '800' },
  buttonSecondaryText: { color: colors.text },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, marginTop: 6 },
  topbar: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 16, paddingBottom: 18 },
  account: { color: colors.muted, fontSize: 13, marginTop: 5 },
  signOut: { color: colors.text, fontSize: 14, fontWeight: '700', paddingVertical: 10 },
  centerState: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 420, paddingHorizontal: 20, gap: 12 },
  stateTitle: { color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  stateCopy: { color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  sessionHeader: { paddingBottom: 28, paddingTop: 32 },
  badge: { alignSelf: 'flex-start', backgroundColor: '#25320d', borderRadius: 999, color: colors.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 6 },
  badgeStale: { backgroundColor: '#352b16', color: '#ffd27a' },
  sessionTitle: { color: colors.text, fontSize: 34, fontWeight: '800', letterSpacing: -1, marginTop: 16 },
  elapsed: { color: colors.accent, fontSize: 30, fontVariant: ['tabular-nums'], fontWeight: '700', letterSpacing: 1, marginTop: 8 },
  staleCopy: { color: '#d7b86e', fontSize: 13, lineHeight: 19, marginTop: 12, maxWidth: 380 },
  exercise: { borderTopColor: colors.line, borderTopWidth: 1, flexDirection: 'row', gap: 14, paddingVertical: 22 },
  exerciseIndex: { color: colors.accent, fontSize: 12, fontWeight: '900', letterSpacing: 1, paddingTop: 3 },
  exerciseBody: { flex: 1 },
  exerciseName: { color: colors.text, fontSize: 19, fontWeight: '700', marginBottom: 12 },
  setRow: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 9, flexDirection: 'row', gap: 10, marginTop: 7, minHeight: 44, paddingHorizontal: 12 },
  setNumber: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.7, width: 42 },
  setValue: { color: colors.text, flex: 1, fontSize: 14, fontVariant: ['tabular-nums'], fontWeight: '600' },
  done: { color: colors.accent, fontSize: 10, fontWeight: '900' },
  pending: { color: colors.muted, fontSize: 10, fontWeight: '900' },
})
