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
  useWindowDimensions,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg'

import { exercises as exerciseCatalog } from '../../data/exercises'
import {
  EXERCISE_CATEGORY_COLORS,
  EXERCISE_CATEGORY_LABELS,
  getEquipmentLabel,
} from '../../src/lib/exerciseLabels'
import { kgStringToDisplayWeight } from '../../src/shared/weightUnits'
import { login, logout, observeAuth, type AuthUser } from '../src/firebase'
import {
  formatElapsed,
  summarizeExercise,
  type ActiveWorkout,
  type Units,
  type WorkoutExercise,
} from '../src/session'
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
        secondary ? styles.buttonSecondary : styles.buttonPrimary,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.buttonSecondaryText]}>{label}</Text>
    </Pressable>
  )
}

const SIGNAL_PATH = 'M-20 190C40 190 72 190 94 184C112 178 120 158 132 132C146 102 162 82 184 84C208 86 218 116 230 150C240 178 252 190 278 190C314 190 332 184 346 158C364 124 374 66 402 58C430 50 444 102 458 150C468 180 480 190 506 190C542 190 558 182 574 154C592 120 606 92 628 94C650 96 662 128 674 158C686 182 700 190 724 190C758 190 776 184 790 162C808 136 818 112 840 114C864 116 874 146 886 168C896 184 908 190 930 190C960 190 976 184 990 166C1004 148 1016 132 1034 134C1054 136 1062 158 1074 174C1086 188 1098 190 1116 188C1148 186 1178 180 1220 176'

function GridBackdrop() {
  const { width } = useWindowDimensions()
  const columns = Math.ceil(width / 44)

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={styles.gridBackdrop}>
      {Array.from({ length: columns + 1 }, (_, index) => (
        <View key={`v${index}`} style={[styles.gridVertical, { left: index * 44 }]} />
      ))}
      {Array.from({ length: 10 }, (_, index) => (
        <View key={`h${index}`} style={[styles.gridHorizontal, { opacity: Math.max(0.1, 1 - index / 10), top: index * 44 }]} />
      ))}
    </View>
  )
}

function SignalBackdrop() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.signalBackdrop}
    >
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 1200 240" width="100%">
        <Defs>
          <LinearGradient id="auth-signal-stroke" x1="0" x2="0" y1="46" y2="196" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#ff7182" />
            <Stop offset="0.52" stopColor="#f0435a" />
            <Stop offset="1" stopColor="#8fb8a0" />
          </LinearGradient>
          <LinearGradient id="auth-signal-fill" x1="0" x2="0" y1="46" y2="240" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#f0435a" stopOpacity="0.15" />
            <Stop offset="1" stopColor="#f0435a" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Path d={`${SIGNAL_PATH}V240H-20Z`} fill="url(#auth-signal-fill)" opacity="0.72" />
        <Path d={SIGNAL_PATH} fill="none" stroke="url(#auth-signal-stroke)" strokeWidth="3" opacity="0.62" />
      </Svg>
    </View>
  )
}

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null)

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
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.flex, styles.loginShell]}>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.loginContent}
        keyboardShouldPersistTaps="handled"
      >
        <GridBackdrop />
        <SignalBackdrop />
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>IL</Text>
            <View style={styles.brandDot} />
          </View>
          <Text style={styles.brandName}>IronLog</Text>
        </View>
        <Text accessibilityRole="header" style={styles.hero}>
          Find your{`\n`}training{`\n`}<Text style={styles.heroAccent}>rhythm.</Text>
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
            onBlur={() => setFocusedField(null)}
            onFocus={() => setFocusedField('email')}
            placeholder="email@example.com"
            placeholderTextColor={colors.mutedSoft}
            returnKeyType="next"
            selectionColor={colors.accentText}
            style={[styles.input, focusedField === 'email' && styles.inputFocused]}
            value={email}
          />
          <Text style={[styles.label, styles.passwordLabel]}>Password</Text>
          <TextInput
            accessibilityLabel="Password"
            autoCapitalize="none"
            autoComplete="current-password"
            onChangeText={setPassword}
            onBlur={() => setFocusedField(null)}
            onFocus={() => setFocusedField('password')}
            onSubmitEditing={() => void submit()}
            placeholder="••••••••"
            placeholderTextColor={colors.mutedSoft}
            returnKeyType="done"
            selectionColor={colors.accentText}
            secureTextEntry
            style={[styles.input, focusedField === 'password' && styles.inputFocused]}
            value={password}
          />
          {error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
          {!error && <View style={styles.omittedAuthActionSpace} />}
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

function SignOutButton({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Sign out"
      disabled={busy}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.signOutButton, busy && styles.buttonDisabled, pressed && styles.buttonPressed]}
    >
      <Text style={styles.signOutButtonText}>{busy ? 'Signing out…' : 'Sign out'}</Text>
    </Pressable>
  )
}

function displaySetWeight(weightKg: string, units: Units): string {
  return (kgStringToDisplayWeight(weightKg, units) || '—').replace('.', ',')
}

function ExerciseLedger({
  exercise,
  expanded,
  units,
  onToggle,
}: {
  exercise: WorkoutExercise
  expanded: boolean
  units: Units
  onToggle: () => void
}) {
  const summary = summarizeExercise(exercise, units)
  const catalogExercise = exercise.exerciseSource === 'global'
    ? exerciseCatalog.find(({ id }) => id === exercise.exerciseId)
    : undefined
  const category = catalogExercise ? EXERCISE_CATEGORY_LABELS[catalogExercise.category] : undefined
  const equipment = catalogExercise ? getEquipmentLabel(catalogExercise.equipment) : undefined
  const accent = catalogExercise ? EXERCISE_CATEGORY_COLORS[catalogExercise.category] : colors.muted

  return (
    <View style={styles.exerciseCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} exercise ${exercise.name}`}
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={({ pressed }) => [styles.exerciseHeading, pressed && styles.headingPressed]}
      >
        <View style={styles.flex}>
          {expanded && (category || equipment) && (
            <Text style={styles.exerciseMeta}>
              {category && <Text style={{ color: accent }}>{category}</Text>}
              {category && equipment ? ' · ' : ''}
              {equipment}
            </Text>
          )}
          <Text style={styles.exerciseName}>{exercise.name}</Text>
          {!expanded && (
            <Text style={styles.exerciseCompact}>
              {summary.completed}/{summary.total} sets · {summary.volume}
            </Text>
          )}
        </View>
        <View accessibilityElementsHidden style={[styles.chevron, expanded && styles.chevronExpanded]}>
          <View style={[styles.chevronStroke, styles.chevronStrokeLeft]} />
          <View style={[styles.chevronStroke, styles.chevronStrokeRight]} />
        </View>
      </Pressable>

      {expanded && (
        <View>
          <View accessibilityLabel={`Exercise summary ${exercise.name}`} style={styles.exerciseSummary}>
            {[
              ['Progress', `${summary.completed}/${summary.total}`],
              ['Volume', summary.volume],
              ['Max', summary.max],
            ].map(([label, value], index) => (
              <View key={label} style={[styles.summaryCell, index === 2 && styles.summaryCellLast]}>
                <Text style={styles.summaryLabel}>{label}</Text>
                <Text style={styles.summaryValue}>{value}</Text>
              </View>
            ))}
          </View>

          <View accessibilityElementsHidden style={[styles.setGrid, styles.setHeaderGrid]}>
            <View style={styles.setToggleColumn} />
            <Text style={styles.setHeaderCell}>Prev.</Text>
            <Text style={styles.setHeaderCell}>{units}</Text>
            <Text style={styles.setHeaderCell}>Reps</Text>
            <View style={styles.setTrailingColumn} />
          </View>

          {exercise.sets.map((set, setIndex) => (
            <View accessibilityLabel={`Set ${setIndex + 1}, ${displaySetWeight(set.weight, units)} ${units}, ${set.reps} reps, ${set.done ? 'completed' : 'not completed'}`} key={setIndex} style={styles.setGrid}>
              <Text style={[styles.setToggle, set.done ? styles.setToggleDone : styles.setToggleOpen]}>{set.done ? '✓' : setIndex + 1}</Text>
              <Text style={styles.setCellMuted}>—</Text>
              <Text style={[styles.setCellValue, !set.done && styles.setCellCurrent]}>{displaySetWeight(set.weight, units)}</Text>
              <Text style={[styles.setCellValue, !set.done && styles.setCellCurrent]}>{set.reps || '—'}</Text>
              <View style={styles.setTrailingColumn} />
            </View>
          ))}

          <View accessibilityElementsHidden style={styles.omittedWorkoutActionsSpace} />
        </View>
      )}
    </View>
  )
}

function WorkoutLedger({ session, units }: { session: ActiveWorkout; units: Units }) {
  const [expandedIndex, setExpandedIndex] = useState(() => {
    const openIndex = session.exercises.findIndex((exercise) => exercise.sets.some((set) => !set.done))
    return openIndex >= 0 ? openIndex : 0
  })

  return (
    <View style={styles.exerciseStack}>
      {session.exercises.map((exercise, exerciseIndex) => (
        <ExerciseLedger
          exercise={exercise}
          expanded={exerciseIndex === expandedIndex}
          key={`${exercise.exerciseSource}:${exercise.exerciseId}:${exerciseIndex}`}
          onToggle={() => setExpandedIndex(exerciseIndex === expandedIndex ? -1 : exerciseIndex)}
          units={units}
        />
      ))}
      <View accessibilityElementsHidden style={styles.omittedAddExerciseSpace} />
    </View>
  )
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
    <View style={styles.sessionShell}>
      <GridBackdrop />
      <ScrollView contentContainerStyle={styles.sessionContent} stickyHeaderIndices={[0]}>
      {state.status === 'ready' ? (
        <View style={styles.lifecycleBar}>
          <View style={styles.lifecycleBarInner}>
            <Elapsed session={state.session} />
            <SignOutButton busy={signingOut} onPress={() => void doLogout()} />
          </View>
        </View>
      ) : (
        <View style={styles.accountBar}>
          <View style={styles.sessionBrand}>
            <View style={styles.brandMarkSmall}><Text style={styles.brandMarkTextSmall}>IL</Text></View>
            <Text style={styles.brandNameSmall}>IronLog</Text>
          </View>
          <SignOutButton busy={signingOut} onPress={() => void doLogout()} />
        </View>
      )}
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
          <View accessibilityElementsHidden style={styles.omittedWorkoutLabelsBand} />
          {state.stale && (
            <View style={styles.staleNotice}>
              <Text style={styles.staleTitle}>Saved on this device</Text>
              <Text style={styles.staleCopy}>This may be out of date. Reconnect to confirm the workout is still active.</Text>
            </View>
          )}

          <View accessibilityElementsHidden>
            <Text style={styles.srSessionLabel}>{state.session.label ?? 'Current workout'}</Text>
          </View>

          {state.session.exercises.length === 0 ? (
            <Text style={[styles.stateCopy, styles.emptyExerciseCopy]}>No exercises yet.</Text>
          ) : (
            <WorkoutLedger key={state.session.sessionId} session={state.session} units={state.units} />
          )}
        </View>
        )}
      </ScrollView>
    </View>
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
  loginShell: {
    experimental_backgroundImage: 'radial-gradient(ellipse 672px 544px at 12% 12%, rgba(240, 67, 90, 0.14), transparent 72%), radial-gradient(ellipse 736px 608px at 86% 78%, rgba(143, 184, 160, 0.11), transparent 74%), linear-gradient(122deg, #181114 0%, #0b0a0c 52%, #080d0b 100%)',
  },
  loginContent: { flexGrow: 1, paddingBottom: 24, paddingHorizontal: 16, paddingTop: 20, position: 'relative' },
  gridBackdrop: { height: 440, left: 0, opacity: 0.72, overflow: 'hidden', position: 'absolute', right: 0, top: 0 },
  gridVertical: { backgroundColor: 'rgba(244, 241, 242, 0.018)', bottom: 0, position: 'absolute', top: 0, width: StyleSheet.hairlineWidth },
  gridHorizontal: { backgroundColor: 'rgba(244, 241, 242, 0.024)', height: StyleSheet.hairlineWidth, left: 0, position: 'absolute', right: 0 },
  signalBackdrop: { height: 288, left: '-6%', opacity: 0.2, overflow: 'hidden', position: 'absolute', top: 544, transform: [{ rotate: '-4deg' }, { scaleY: 1.02 }], width: '112%' },
  brandRow: { alignItems: 'center', flexDirection: 'row', marginBottom: 17 },
  brandMark: {
    alignItems: 'center',
    backgroundColor: 'rgba(17, 16, 18, 0.68)',
    borderColor: 'rgba(244, 241, 242, 0.18)',
    borderRadius: 8,
    borderWidth: 1,
    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.16)',
    experimental_backgroundImage: 'linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.045))',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  brandMarkText: { color: colors.textStrong, fontFamily: 'Archivo_800ExtraBold', fontSize: 13 },
  brandDot: { backgroundColor: colors.accent, borderRadius: 2, bottom: 7, height: 4, position: 'absolute', right: 7, width: 4 },
  brandName: { color: colors.textStrong, fontFamily: 'Archivo_700Bold', fontSize: 15, marginLeft: 12 },
  hero: { color: colors.textStrong, fontFamily: 'Archivo_700Bold', fontSize: 35.2, letterSpacing: 0, lineHeight: 34.5, maxWidth: 220 },
  heroAccent: { color: colors.accentText, fontFamily: 'Archivo_700Bold' },
  lead: { color: 'rgba(244, 241, 242, 0.7)', fontFamily: 'InstrumentSans_400Regular', fontSize: 14.4, lineHeight: 22.3, marginTop: 12 },
  formDivider: { backgroundColor: colors.lineStrong, height: StyleSheet.hairlineWidth, marginBottom: 18, marginTop: 21 },
  formTitle: { color: colors.textStrong, fontFamily: 'Archivo_700Bold', fontSize: 29, lineHeight: 34 },
  form: { marginTop: 50 },
  label: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 13, lineHeight: 17, marginBottom: 6 },
  passwordLabel: { marginTop: 16 },
  input: {
    backgroundColor: 'rgba(8, 7, 9, 0.16)',
    borderColor: 'rgba(244, 241, 242, 0.13)',
    borderRadius: 8,
    borderWidth: 1,
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.075), 0 1px 0 rgba(255, 255, 255, 0.035)',
    color: colors.text,
    experimental_backgroundImage: 'linear-gradient(180deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.03))',
    fontFamily: 'InstrumentSans_400Regular',
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  inputFocused: { borderColor: colors.accentText, borderWidth: 1.5 },
  omittedAuthActionSpace: { height: 44 },
  button: { alignItems: 'center', borderRadius: 8, justifyContent: 'center', minHeight: 48, marginTop: 15, paddingHorizontal: 18 },
  buttonPrimary: {
    backgroundColor: '#a91f35',
    boxShadow: '0 6px 8px rgba(240, 67, 90, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.18)',
    experimental_backgroundImage: 'linear-gradient(180deg, #c72e44 0%, #a91f35 100%)',
  },
  buttonSecondary: { backgroundColor: colors.surfaceRaised, borderColor: colors.lineStrong, borderWidth: 1, minWidth: 140 },
  buttonDisabled: { opacity: 0.55 },
  buttonPressed: { opacity: 0.82 },
  buttonText: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 15 },
  buttonSecondaryText: { color: colors.text },
  error: { color: colors.warning, fontFamily: 'InstrumentSans_500Medium', fontSize: 14, lineHeight: 20, marginTop: 6 },
  sessionContent: { flexGrow: 1, paddingBottom: 24 },
  sessionShell: {
    flex: 1,
    experimental_backgroundImage: 'linear-gradient(115deg, rgba(240, 67, 90, 0.055) 0%, transparent 26%, transparent 68%, rgba(143, 184, 160, 0.065) 100%), linear-gradient(180deg, #0b0a0c 0%, #111012 42%, #0d0c0e 100%)',
  },
  lifecycleBar: { backgroundColor: '#0d0b0e', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, height: 69, zIndex: 4 },
  lifecycleBarInner: { alignItems: 'center', flexDirection: 'row', height: 69, paddingHorizontal: 16 },
  accountBar: { alignItems: 'center', backgroundColor: '#0d0b0e', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', height: 69, justifyContent: 'space-between', paddingHorizontal: 16 },
  sessionBrand: { alignItems: 'center', flexDirection: 'row' },
  brandMarkSmall: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderColor: colors.lineStrong, borderRadius: 5, borderWidth: 1, height: 32, justifyContent: 'center', marginRight: 10, width: 32 },
  brandMarkTextSmall: { color: colors.textStrong, fontFamily: 'Archivo_800ExtraBold', fontSize: 11 },
  brandNameSmall: { color: colors.textStrong, fontFamily: 'Archivo_700Bold', fontSize: 15 },
  signOutButton: { alignItems: 'center', justifyContent: 'center', marginLeft: 'auto', minHeight: 44, paddingHorizontal: 6 },
  signOutButtonText: { color: colors.muted, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 12 },
  logoutError: { color: colors.warning, fontFamily: 'InstrumentSans_500Medium', fontSize: 13, lineHeight: 19, paddingHorizontal: 16, paddingVertical: 10 },
  centerState: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 420, paddingHorizontal: 20, gap: 12 },
  stateTitle: { color: colors.textStrong, fontFamily: 'Archivo_700Bold', fontSize: 22, textAlign: 'center' },
  stateCopy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  elapsed: { color: colors.textStrong, fontFamily: 'Archivo_700Bold', fontSize: 20, fontVariant: ['tabular-nums'], letterSpacing: -0.3 },
  omittedWorkoutLabelsBand: { backgroundColor: '#121013', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, height: 52 },
  srSessionLabel: { height: 0, opacity: 0, position: 'absolute', width: 0 },
  staleNotice: { backgroundColor: 'rgba(240,167,90,0.08)', borderLeftColor: colors.warning, borderLeftWidth: 2, marginHorizontal: 16, marginTop: 14, paddingHorizontal: 12, paddingVertical: 10 },
  staleTitle: { color: colors.warning, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 13 },
  staleCopy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, lineHeight: 17, marginTop: 3 },
  emptyExerciseCopy: { marginTop: 80 },
  exerciseStack: { paddingHorizontal: 16 },
  exerciseCard: { paddingVertical: 12 },
  exerciseHeading: { alignItems: 'center', flexDirection: 'row', minHeight: 44 },
  headingPressed: { opacity: 0.72 },
  exerciseMeta: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 10.6, letterSpacing: 1.48, lineHeight: 14, textTransform: 'uppercase' },
  exerciseName: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 18, lineHeight: 22, marginTop: 6 },
  exerciseCompact: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, lineHeight: 17, marginTop: 4 },
  chevron: { height: 18, marginLeft: 12, transform: [{ rotate: '0deg' }], width: 18 },
  chevronExpanded: { transform: [{ rotate: '180deg' }] },
  chevronStroke: { backgroundColor: colors.muted, borderRadius: 1, height: 1.5, position: 'absolute', top: 9, width: 8 },
  chevronStrokeLeft: { left: 2, transform: [{ rotate: '45deg' }] },
  chevronStrokeRight: { right: 2, transform: [{ rotate: '-45deg' }] },
  exerciseSummary: { borderBottomColor: 'rgba(244, 241, 242, 0.09)', borderBottomWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(244, 241, 242, 0.09)', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', marginBottom: 9, marginTop: 10, paddingVertical: 7 },
  summaryCell: { alignItems: 'baseline', flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'center', paddingHorizontal: 6 },
  summaryCellLast: { paddingRight: 0 },
  summaryLabel: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 12 },
  summaryValue: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 12.8, fontVariant: ['tabular-nums'] },
  setGrid: { alignItems: 'center', flexDirection: 'row', gap: 6, minHeight: 48 },
  setHeaderGrid: { minHeight: 32 },
  setToggleColumn: { width: 38 },
  setTrailingColumn: { width: 28 },
  setHeaderCell: { color: colors.muted, flex: 1, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 12, textAlign: 'center' },
  setToggle: { fontFamily: 'InstrumentSans_700Bold', fontSize: 16, textAlign: 'center', width: 38 },
  setToggleDone: { color: colors.recovery },
  setToggleOpen: { color: '#d97b91' },
  setCellMuted: { color: colors.muted, flex: 1, fontFamily: 'InstrumentSans_500Medium', fontSize: 14, textAlign: 'center' },
  setCellValue: { color: colors.text, flex: 1, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, fontVariant: ['tabular-nums'], lineHeight: 30, textAlign: 'center' },
  setCellCurrent: { borderBottomColor: colors.lineStrong, borderBottomWidth: StyleSheet.hairlineWidth },
  omittedWorkoutActionsSpace: { height: 81 },
  omittedAddExerciseSpace: { height: 72 },
})
