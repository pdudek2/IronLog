import { StatusBar } from 'expo-status-bar'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Animated,
  Easing,
  ActivityIndicator,
  AppState,
  Image,
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
import Svg, { Defs, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg'

import grainTexture from '../assets/grain.png'
import { exercises as exerciseCatalog } from '../../data/exercises'
import {
  EXERCISE_CATEGORY_COLORS,
  EXERCISE_CATEGORY_LABELS,
} from '../../src/lib/exerciseLabels'
import { kgStringToDisplayWeight } from '../../src/shared/weightUnits'
import { login, logout, observeAuth, readPreviousSets, readExerciseMetadata, type AuthUser } from '../src/firebase'
import {
  formatElapsed,
  summarizeExercise,
  type ActiveWorkout,
  type Units,
  type WorkoutExercise,
} from '../src/session'
import { useActiveSession } from '../src/useActiveSession'
import { useSessionRead } from '../src/useSessionRead'
import type { ExerciseMetadata } from '../src/scopedRead'
import { getAuthErrorMessage } from '../../src/shared/authErrors'
import { SIGNAL_PATH } from '../../src/shared/authVisual'
import { EQUIPMENT_LABELS, focusExerciseIndex, focusSetIndex, formatPreviousSet } from '../../src/shared/workoutDisplay'

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

const AnimatedPath = Animated.createAnimatedComponent(Path)

function GrainBackdrop({ scrollY }: { scrollY: Animated.Value }) {
  return (
    <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ translateY: scrollY }] }]}>
      <Image resizeMode="repeat" source={grainTexture} style={styles.grainBackdrop} />
    </Animated.View>
  )
}

function SignalBackdrop({ focused }: { focused: boolean }) {
  const path = useRef<Path>(null)
  const [length, setLength] = useState(0)
  const [reduced, setReduced] = useState(true)
  const [active, setActive] = useState(AppState.currentState === 'active')
  const lead = useRef(new Animated.Value(0)).current
  const echo = useRef(new Animated.Value(0)).current
  useEffect(() => {
    let mounted = true
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (mounted) setReduced(value) })
    const accessibility = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced)
    const lifecycle = AppState.addEventListener('change', (state) => setActive(state === 'active'))
    return () => { mounted = false; accessibility.remove(); lifecycle.remove() }
  }, [])
  useEffect(() => {
    lead.setValue(0)
    echo.setValue(0)
    if (reduced || !active || !length) return
    const duration = focused ? 2400 : 5400
    const animation = Animated.parallel([
      Animated.timing(lead, { toValue: 1, delay: focused ? 80 : 480, duration, easing: Easing.linear, useNativeDriver: false }),
      Animated.timing(echo, { toValue: 1, delay: focused ? 0 : 360, duration, easing: Easing.linear, useNativeDriver: false }),
    ])
    animation.start()
    return () => animation.stop()
  }, [focused, reduced, active, length, lead, echo])
  const traceOpacity = (value: Animated.Value, peak: number) => value.interpolate({
    inputRange: [0, focused ? 0.12 : 0.10, focused ? 0.76 : 0.72, 1], outputRange: [0, peak, peak, 0],
  })
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.signalBackdrop, focused && { opacity: 0.28 }, focused && !reduced && styles.signalFocused]}
    >
      <Svg onLayout={() => requestAnimationFrame(() => setLength(path.current?.getTotalLength() ?? 0))} height="100%" preserveAspectRatio="none" viewBox="0 0 1200 240" width="100%">
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
        <Path ref={path} d={SIGNAL_PATH} fill="none" stroke="url(#auth-signal-stroke)" strokeWidth="3" opacity="0.62" />
        {length > 0 && !reduced && <>
          <AnimatedPath d={SIGNAL_PATH} fill="none" stroke="rgba(240,67,90,0.52)" strokeWidth={9} strokeLinecap="round"
            strokeDasharray={[length * 0.11, length * 0.89]} strokeDashoffset={echo.interpolate({ inputRange: [0, 1], outputRange: [length, 0] })}
            opacity={traceOpacity(echo, focused ? 0.42 : 0.32)} />
          <AnimatedPath d={SIGNAL_PATH} fill="none" stroke="rgba(255,244,246,0.94)" strokeWidth={4} strokeLinecap="round"
            strokeDasharray={[length * 0.075, length * 0.925]} strokeDashoffset={lead.interpolate({ inputRange: [0, 1], outputRange: [length, 0] })}
            opacity={traceOpacity(lead, focused ? 1 : 0.92)} />
        </>}
      </Svg>
    </View>
  )
}

function LoginForm() {
  const { fontScale } = useWindowDimensions()
  const passwordInput = useRef<TextInput>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ field: 'email' | 'password'; message: string } | null>(null)
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null)

  const submit = async () => {
    if (busy) return
    if (!email.trim() || !password) {
      setError({ field: !email.trim() ? 'email' : 'password', message: 'Enter your email and password.' })
      return
    }
    setBusy(true)
    setError(null)
    try {
      await login(email, password)
    } catch (cause) {
      setError({ field: 'password', message: getAuthErrorMessage(cause, 'login') })
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
        <SignalBackdrop focused={focusedField !== null} />
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>IL</Text>
            <View style={styles.brandDot} />
          </View>
          <Text style={styles.brandName}>IronLog</Text>
        </View>
        <View accessible accessibilityRole="header" accessibilityLabel="Find your training rhythm.">
          <Text style={styles.hero}>Find your{`\n`}training</Text>
          {/* Native Text preserves Android's nonlinear accessibility scaling; SVG does not. */}
          {fontScale !== 1 ? <Text style={styles.heroAccent}>rhythm.</Text> : <Svg height={34.496} width={160} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Defs>
              <LinearGradient id="rhythm" x1="-160%" x2="100%" y1="0%" y2="100%">
                <Stop offset="0" stopColor="#ff7182" /><Stop offset="0.38" stopColor="#ff7182" />
                <Stop offset="0.49" stopColor="#fff7f8" /><Stop offset="0.60" stopColor="#ff7182" />
                <Stop offset="1" stopColor="#d83a50" />
              </LinearGradient>
            </Defs>
            <SvgText x={9.152} y={28.4} fill="url(#rhythm)" fontFamily="InstrumentSans_700Bold" fontSize={35.2} letterSpacing={-1.584}>rhythm.</SvgText>
          </Svg>}
        </View>
        <Text style={styles.lead}>Every set builds on the last.</Text>
        <View style={[styles.formDivider, focusedField !== null && styles.formDividerFocused]} />
        <Text accessibilityRole="header" style={styles.formTitle}>Sign in</Text>
        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <View style={[styles.inputSurface, focusedField === 'email' && styles.inputFocused]}>
            <TextInput
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoComplete="email"
              inputMode="email"
              keyboardType="email-address"
              onChangeText={(value) => { setEmail(value); if (error?.field === 'email') setError(null) }}
              onBlur={() => setFocusedField(null)}
              onFocus={() => setFocusedField('email')}
              placeholder="email@example.com"
              placeholderTextColor={colors.mutedSoft}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => passwordInput.current?.focus()}
              selectionColor={colors.accentText}
              style={styles.input}
              value={email}
            />
          </View>
          {error?.field === 'email' && <Text accessibilityLiveRegion="polite" style={styles.loginError}>{error.message}</Text>}
          <Text style={[styles.label, styles.passwordLabel]}>Password</Text>
          <View style={[styles.inputSurface, focusedField === 'password' && styles.inputFocused]}>
            <TextInput
              accessibilityLabel="Password"
              ref={passwordInput}
              autoCapitalize="none"
              autoComplete="current-password"
              onChangeText={(value) => { setPassword(value); if (error?.field === 'password') setError(null) }}
              onBlur={() => setFocusedField(null)}
              onFocus={() => setFocusedField('password')}
              onSubmitEditing={() => void submit()}
              placeholder="••••••••"
              placeholderTextColor={colors.mutedSoft}
              returnKeyType="done"
              selectionColor={colors.accentText}
              secureTextEntry
              style={styles.input}
              value={password}
            />
          </View>
          {error?.field === 'password' && <Text accessibilityLiveRegion="polite" style={styles.loginError}>{error.message}</Text>}
          <View style={styles.omittedAuthActionSpace} />
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
  return kgStringToDisplayWeight(weightKg, units) || '—'
}

function ExerciseLedger({ uid, sessionKey, exercise, expanded, collapsible, units, metadata, onToggle }: {
  uid: string; sessionKey: string; exercise: WorkoutExercise; expanded: boolean; collapsible: boolean
  units: Units; metadata: ExerciseMetadata | undefined; onToggle: () => void
}) {
  const summary = summarizeExercise(exercise, units)
  const load = useCallback(() => readPreviousSets(uid, exercise.exerciseId, exercise.exerciseSource), [uid, exercise.exerciseId, exercise.exerciseSource])
  const history = useSessionRead(JSON.stringify([uid, sessionKey, exercise.exerciseSource, exercise.exerciseId]), load, expanded)
  const category = metadata ? EXERCISE_CATEGORY_LABELS[metadata.category] : undefined
  const equipment = metadata ? EQUIPMENT_LABELS[metadata.equipment] : undefined
  const accent = metadata ? EXERCISE_CATEGORY_COLORS[metadata.category] ?? colors.accent : colors.accent
  const currentSet = focusSetIndex(exercise.sets)
  const heading = <>
    <View style={styles.flex}>
      {(category || equipment) && <Text style={styles.exerciseMeta}>
        {category && <Text style={{ color: accent }}>{category}</Text>}{category && equipment ? ' · ' : ''}{equipment}
      </Text>}
      {/* Android needs an explicit break opportunity after a hyphen to match browser wrapping. */}
      <Text accessibilityLabel={exercise.name} textBreakStrategy="simple" style={styles.exerciseName}>{exercise.name.replaceAll('-', '-\u200b')}</Text>
      {!expanded && <Text style={styles.exerciseCompact}>{summary.completed}/{summary.total} sets · {summary.volume}</Text>}
    </View>
    {collapsible && <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={styles.chevron}>
      <Svg width={18} height={18} viewBox="0 0 24 24" style={expanded ? styles.chevronExpanded : undefined}>
        <Path d="m6 9 6 6 6-6" fill="none" stroke={expanded ? accent : colors.muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>}
    <View importantForAccessibility="no-hide-descendants" style={styles.omittedDeleteSpace} />
  </>
  return <View style={styles.exerciseCard}>
    {collapsible ? <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} exercise ${exercise.name}`}
      accessibilityState={{ expanded }} onPress={onToggle} style={({ pressed }) => [styles.exerciseHeading, pressed && styles.headingPressed]}>{heading}</Pressable>
      : <View style={styles.exerciseHeading}>{heading}</View>}
    {expanded && <View>
      <View accessibilityLabel={`Exercise summary ${exercise.name}`} style={styles.exerciseSummary}>
        {[['Progress', `${summary.completed}/${summary.total}`], ['Volume', summary.volume], ['Max', summary.max]].map(([label, value], index) =>
          <View key={label} style={[styles.summaryCell, index === 2 && styles.summaryCellLast]}>
            <Text style={styles.summaryLabel}>{label}</Text><Text numberOfLines={1} style={styles.summaryValue}>{value}</Text>
          </View>)}
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.setGrid, styles.setHeaderGrid]}>
        <View style={styles.setToggleColumn} /><Text style={[styles.setHeaderCell, styles.setPreviousColumn]}>Prev.</Text><Text style={[styles.setHeaderCell, styles.setWeightColumn]}>{units}</Text>
        <Text style={[styles.setHeaderCell, styles.setRepsColumn]}>Reps</Text><View style={styles.setTrailingColumn} />
      </View>
      {exercise.sets.map((set, index) => {
        const previous = history.state.status === 'ready' ? history.state.data[index] : undefined
        const previousText = history.state.status === 'ready' && (previous || !history.state.fromCache)
          ? formatPreviousSet(previous, units) : history.state.status === 'error' ? '?' : '…'
        const current = !set.done && index === currentSet
        return <Fragment key={index}><View style={styles.setGrid}>
          <View accessibilityLabel={`Set ${index + 1}, ${set.done ? 'completed' : 'not completed'}`} style={styles.setToggleColumn}>
            {set.done ? <Svg width={16} height={16} viewBox="0 0 24 24" style={{ alignSelf: 'center' }}><Path d="m20 6-11 11-5-5" fill="none" stroke={colors.recovery} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
              : <Text style={[styles.setToggle, { color: current ? accent : colors.muted }]}>{index + 1}</Text>}
          </View>
          <Text numberOfLines={1} accessibilityLabel={`Previous set result ${index + 1}: ${previousText}`} style={[styles.setCellMuted, styles.setPreviousColumn]}>{previousText}</Text>
          <Text accessibilityLabel={`Weight, ${exercise.name}, set ${index + 1}, ${units}`} style={[styles.setCellValue, styles.setWeightColumn, set.done ? styles.setCellDone : styles.setCellCurrent]}>{displaySetWeight(set.weight, units)}</Text>
          <Text accessibilityLabel={`Reps, ${exercise.name}, set ${index + 1}`} style={[styles.setCellValue, styles.setRepsColumn, set.done ? styles.setCellDone : styles.setCellCurrent]}>{set.reps || '—'}</Text>
          <View style={styles.setTrailingColumn} />
        </View>{current && <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.omittedSetAdjustmentsSpace} />}</Fragment>
      })}
      {history.state.status === 'error' && <Pressable accessibilityRole="button" onPress={history.retry} style={styles.lookupAction}><Text style={styles.lookupText}>History unavailable · Retry</Text></Pressable>}
      {history.state.status === 'ready' && history.state.fromCache && <Text style={styles.lookupText}>History saved on this device · reconnect to refresh</Text>}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.omittedWorkoutActionsSpace} />
    </View>}
  </View>
}

function WorkoutLedger({ uid, session, units, stale }: { uid: string; session: ActiveWorkout; units: Units; stale: boolean }) {
  const [manual, setManual] = useState<string | null>(null)
  const identity = (exercise: WorkoutExercise, index: number) => exercise.clientId ?? `${exercise.exerciseSource}:${exercise.exerciseId}:${index}`
  const focused = focusExerciseIndex(session.exercises)
  const defaultId = focused >= 0 ? identity(session.exercises[focused]!, focused) : ''
  const expandedId = manual === '' || session.exercises.some((exercise, index) => identity(exercise, index) === manual) ? manual : defaultId
  const loadMetadata = useCallback(() => readExerciseMetadata(uid), [uid])
  const hasCustom = session.exercises.some((exercise) => exercise.exerciseSource === 'user')
  const sessionKey = `${session.sessionId}:${stale}`
  const catalog = useSessionRead(JSON.stringify([uid, sessionKey]), loadMetadata, hasCustom)
  return <View style={styles.exerciseStack}>
    {hasCustom && catalog.state.status === 'error' && <Pressable onPress={catalog.retry} accessibilityRole="button" style={styles.lookupAction}><Text style={styles.lookupText}>Exercise details unavailable · Retry</Text></Pressable>}
    {session.exercises.map((exercise, index) => <ExerciseLedger
      key={identity(exercise, index)} uid={uid} sessionKey={sessionKey} exercise={exercise} units={units}
      expanded={session.exercises.length === 1 || identity(exercise, index) === expandedId} collapsible={session.exercises.length > 1}
      metadata={exercise.exerciseSource === 'global' ? exerciseCatalog.find(({ id }) => id === exercise.exerciseId)
        : catalog.state.status === 'ready' ? catalog.state.data.find(({ id }) => id === exercise.exerciseId) : undefined}
      onToggle={() => setManual(identity(exercise, index) === expandedId ? '' : identity(exercise, index))} />)}
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.omittedAddExerciseSpace} />
    <Text style={styles.previewCopy}>Read-only preview</Text>
  </View>
}

function SessionScreen({ user }: { user: AuthUser }) {
  const scrollY = useRef(new Animated.Value(0)).current
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
      <Animated.ScrollView
        contentContainerStyle={styles.sessionContent}
        stickyHeaderIndices={[1]}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
      >
      <GrainBackdrop scrollY={scrollY} />
      {state.status === 'ready' ? (
        <View style={styles.lifecycleBar}>
          <View style={styles.lifecycleBarInner}>
            <Elapsed session={state.session} />
            <SignOutButton busy={signingOut} onPress={() => void doLogout()} />
          </View>
        </View>
      ) : (
        <View style={styles.lifecycleBar}>
          <View style={styles.lifecycleBarInner}>
          <View style={styles.sessionBrand}>
            <View style={styles.brandMarkSmall}><Text style={styles.brandMarkTextSmall}>IL</Text></View>
            <Text style={styles.brandNameSmall}>IronLog</Text>
          </View>
          <SignOutButton busy={signingOut} onPress={() => void doLogout()} />
          </View>
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
          <Text accessibilityRole="header" style={styles.stateTitle}>Checking your session…</Text>
          <Text style={styles.stateCopy}>Waiting for confirmation. If you are offline, reconnect to load your session.</Text>
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
          <View style={styles.workoutLabelsBand}><Text accessibilityLabel={`Session type: ${state.session.label ?? 'Current workout'}`} style={styles.sessionLabel}>{state.session.label ?? 'Current workout'}</Text></View>
          {state.stale && (
            <View style={styles.staleNotice}>
              <Text style={styles.staleTitle}>Saved on this device</Text>
              <Text style={styles.staleCopy}>This may be out of date. Reconnect to confirm the workout is still active.</Text>
            </View>
          )}

          {state.session.exercises.length === 0 ? (
            <Text style={[styles.stateCopy, styles.emptyExerciseCopy]}>No exercises yet.</Text>
          ) : (
            <WorkoutLedger key={state.session.sessionId} uid={user.uid} session={state.session} units={state.units} stale={state.stale} />
          )}
        </View>
        )}
      </Animated.ScrollView>
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
      ) : user ? <SessionScreen key={user.uid} user={user} /> : <LoginForm />}
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
  grainBackdrop: { height: '100%', opacity: 0.024, width: '100%' },
  signalBackdrop: { height: 288, left: '-6%', opacity: 0.2, overflow: 'hidden', position: 'absolute', top: 544, transform: [{ rotate: '-4deg' }, { scaleY: 1.02 }], width: '112%' },
  brandRow: { alignItems: 'center', flexDirection: 'row', marginBottom: 18.4 },
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
  hero: { color: colors.textStrong, fontFamily: 'ArchivoHero', fontSize: 35.2, letterSpacing: 0, lineHeight: 34.496 },
  heroAccent: { color: colors.accentText, fontFamily: 'InstrumentSans_700Bold', fontSize: 35.2, letterSpacing: -1.584, lineHeight: 34.496, marginLeft: 9.152 },
  lead: { color: 'rgba(244, 241, 242, 0.7)', fontFamily: 'InstrumentSans_400Regular', fontSize: 14.4, lineHeight: 22.3, marginTop: 12 },
  formDivider: { backgroundColor: colors.lineStrong, height: 1, marginBottom: 20, marginTop: 20 },
  formDividerFocused: { backgroundColor: 'rgba(255, 113, 130, 0.5)' },
  formTitle: { color: colors.textStrong, fontFamily: 'ArchivoHeading', fontSize: 29.6, lineHeight: 29.6 },
  form: { marginTop: 51.84 },
  label: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 12, lineHeight: 16, marginBottom: 4 },
  passwordLabel: { marginTop: 16 },
  inputSurface: {
    backgroundColor: 'rgba(8, 7, 9, 0.16)',
    experimental_backgroundImage: 'linear-gradient(180deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.03))',
    borderColor: 'rgba(244, 241, 242, 0.13)',
    borderRadius: 8,
    borderWidth: 1,
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.075), 0 1px 0 rgba(255, 255, 255, 0.035)',
  },
  input: {
    color: colors.text,
    fontFamily: 'InstrumentSans_400Regular',
    fontSize: 14,
    lineHeight: 20,
    minHeight: 50,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  inputFocused: { borderColor: colors.accentText, boxShadow: '0 0 0 3px rgba(240, 67, 90, 0.24)' },
  loginError: { color: colors.warning, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, lineHeight: 18, marginTop: 4 },
  omittedAuthActionSpace: { height: 49 },
  button: { alignItems: 'center', borderRadius: 8, justifyContent: 'center', minHeight: 48, marginTop: 15, paddingHorizontal: 18 },
  buttonPrimary: {
    backgroundColor: '#a91f35',
    boxShadow: '0 6px 8px rgba(240, 67, 90, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.18)',
    experimental_backgroundImage: 'linear-gradient(180deg, #c72e44 0%, #a91f35 100%)',
  },
  buttonSecondary: { backgroundColor: colors.surfaceRaised, borderColor: colors.lineStrong, borderWidth: 1, minWidth: 140 },
  buttonDisabled: { opacity: 0.55 },
  buttonPressed: { opacity: 0.82 },
  buttonText: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 14 },
  buttonSecondaryText: { color: colors.text },
  error: { color: colors.accent, fontFamily: 'InstrumentSans_500Medium', fontSize: 14, lineHeight: 20, marginTop: 6 },
  sessionContent: {
    flexGrow: 1,
    paddingBottom: 128,
    experimental_backgroundImage: 'linear-gradient(115deg, rgba(240, 67, 90, 0.055) 0%, transparent 26%, transparent 68%, rgba(143, 184, 160, 0.065) 100%), linear-gradient(180deg, #0b0a0c 0%, #111012 42%, #0d0c0e 100%)',
  },
  sessionShell: { flex: 1, backgroundColor: colors.background },
  lifecycleBar: { backgroundColor: '#0d0b0e', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, height: 69, zIndex: 4 },
  lifecycleBarInner: { alignItems: 'center', flexDirection: 'row', height: 69, paddingHorizontal: 16 },
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
  elapsed: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 20, lineHeight: 28, fontVariant: ['tabular-nums'] },
  workoutLabelsBand: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, height: 52 },
  sessionLabel: { color: colors.accentText, borderBottomColor: colors.accent, borderBottomWidth: 2, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 12, lineHeight: 18, paddingHorizontal: 12, paddingVertical: 12 },
  previewCopy: { color: colors.mutedSoft, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, textAlign: 'center', paddingVertical: 8 },
  lookupText: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, lineHeight: 18 },
  lookupAction: { minHeight: 44, justifyContent: 'center' },
  omittedDeleteSpace: { width: 86 },
  setCellDone: { opacity: 0.7 },
  signalFocused: { opacity: 0.28, transform: [{ translateX: -9.6 }, { translateY: -5.6 }, { rotate: '-3deg' }, { scaleY: 1.08 }] },
  staleNotice: { backgroundColor: colors.surface, borderColor: colors.accent, borderWidth: 1, borderRadius: 16, marginHorizontal: 16, marginTop: 14, paddingHorizontal: 12, paddingVertical: 10 },
  staleTitle: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 13 },
  staleCopy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, lineHeight: 17, marginTop: 3 },
  emptyExerciseCopy: { marginTop: 80 },
  exerciseStack: { paddingHorizontal: 16, paddingTop: 4 },
  exerciseCard: { paddingBottom: 12, paddingTop: 10.4 },
  exerciseHeading: { alignItems: 'center', flexDirection: 'row', minHeight: 44 },
  headingPressed: { opacity: 0.72 },
  exerciseMeta: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 12, lineHeight: 18 },
  exerciseName: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 18, lineHeight: 28, marginTop: 6 },
  exerciseCompact: { color: colors.muted, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 11.52, lineHeight: 17.28, marginTop: 5.6 },
  chevron: { height: 18, marginLeft: 12, transform: [{ rotate: '0deg' }], width: 18 },
  chevronExpanded: { transform: [{ rotate: '180deg' }] },
  exerciseSummary: { flexDirection: 'row', marginBottom: 3.2, marginTop: 5.6, paddingVertical: 4 },
  summaryCell: { alignItems: 'baseline', flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'center', paddingHorizontal: 6 },
  summaryCellLast: { paddingRight: 0 },
  summaryLabel: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 12, lineHeight: 18 },
  summaryValue: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 12.8, fontVariant: ['tabular-nums'], lineHeight: 19.2 },
  setGrid: { alignItems: 'center', flexDirection: 'row', gap: 5.6, minHeight: 47.2 },
  setHeaderGrid: { minHeight: 18 },
  setToggleColumn: { width: 44, flexShrink: 0 },
  // Proportional bases preserve CSS .9fr/1fr sizing even at the weight column minimum.
  setPreviousColumn: { flexBasis: 48.96, flexGrow: 0.9, flexShrink: 1, minWidth: 0 },
  setWeightColumn: { flexBasis: 54.4, flexGrow: 1, flexShrink: 0, minWidth: 54.4 },
  setRepsColumn: { width: 52, flexShrink: 0 },
  setTrailingColumn: { width: 44, flexShrink: 0 },
  setHeaderCell: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  setToggle: { fontFamily: 'InstrumentSans_700Bold', fontSize: 16, textAlign: 'center', width: 44 },
  setCellMuted: { color: colors.muted, fontFamily: 'SplineSansMono_600SemiBold', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  setCellValue: { color: colors.text, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, fontVariant: ['tabular-nums'], lineHeight: 44, textAlign: 'center' },
  setCellCurrent: { borderBottomColor: colors.lineStrong, borderBottomWidth: StyleSheet.hairlineWidth },
  omittedSetAdjustmentsSpace: { height: 52 },
  omittedWorkoutActionsSpace: { height: 49 },
  omittedAddExerciseSpace: { height: 72 },
})
