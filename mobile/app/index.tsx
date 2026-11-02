import { useOptionalLaunchRuntime } from '../src/launchRuntime'
import BottomNavigation, { useBottomNavigation } from '../src/BottomNavigation'
import { StatusBar } from 'expo-status-bar'
import { useIsFocused, useRouter } from 'expo-router'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Animated,
  Easing,
  ActivityIndicator,
  AppState,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  useWindowDimensions,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Defs, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg'

import { exercises as exerciseCatalog } from '../../data/exercises'
import { EXERCISE_CATEGORY_LABELS } from '../../src/lib/exerciseLabels'
import {
  displayWeightDeltaToKg,
} from '../../src/shared/weightUnits'
import { login, logout, readExerciseHistory, readExerciseMetadata, readRecentWorkouts, type AuthUser } from '../src/firebase'
import { recentExercisePicks } from '../../src/shared/recentExercises'
import { getStaleSessionAgeLabel, isActiveSessionStale } from '../../src/lib/sessionDuration'
import {
  formatElapsed,
  summarizeExercise,
  type ActiveWorkout,
  type ExerciseSource,
  type Units,
  type WorkoutExercise,
} from '../src/session'
import { useSessionRead } from '../src/useSessionRead'
import type { ClosureState } from '../src/useWorkoutClosure'
import type { ExerciseMetadata } from '../src/scopedRead'
import { exerciseHasEnteredSets, MAX_SESSION_EXERCISES } from '../src/setMutations'
import {
  reconcileSetInputSubmissions,
  setInputToStoredValue,
  storedValueToSetInput,
} from '../src/setInput'
import { getAuthErrorMessage } from '../../src/shared/authErrors'
import { SIGNAL_PATH } from '../../src/shared/authVisual'
import { EQUIPMENT_LABELS, focusExerciseIndex, focusSetIndex, formatPreviousSet, WORKOUT_LABELS } from '../../src/shared/workoutDisplay'
import { useActiveRuntime, useAuthRuntime, useClosureRuntime } from '../src/runtime'
import ExercisePicker from '../src/ExercisePicker'
import { useKeyboardReveal } from '../src/useKeyboardReveal'
import { covers } from '../src/covers'
import { overloadHintLabel } from '../../src/shared/nextSessionRecommendation'
import { workoutCover } from '../../src/shared/workoutCover'
import { colors, primaryGradient } from '../src/theme'
import { showDialog } from '../src/dialog'
import HistoryHeader from '../src/HistoryHeader'
import { BrandMark, Icon } from '../src/icons'

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
// The discard whose result already decided where to land, so a later visit to `/` is not sent Home again.
const handledDiscard = { sessionId: '' }

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
            <Stop offset="0" stopColor={colors.accentText} />
            <Stop offset="0.52" stopColor={colors.accent} />
            <Stop offset="1" stopColor={colors.recovery} />
          </LinearGradient>
          <LinearGradient id="auth-signal-fill" x1="0" x2="0" y1="46" y2="240" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={colors.accent} stopOpacity="0.15" />
            <Stop offset="1" stopColor={colors.accent} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Path d={`${SIGNAL_PATH}V240H-20Z`} fill="url(#auth-signal-fill)" opacity="0.72" />
        <Path ref={path} d={SIGNAL_PATH} fill="none" stroke="url(#auth-signal-stroke)" strokeWidth="3" opacity="0.62" />
        {length > 0 && !reduced && <>
          <AnimatedPath d={SIGNAL_PATH} fill="none" stroke="rgba(244, 238, 232, 0.312)" strokeWidth={9} strokeLinecap="round"
            strokeDasharray={[length * 0.11, length * 0.89]} strokeDashoffset={echo.interpolate({ inputRange: [0, 1], outputRange: [length, 0] })}
            opacity={traceOpacity(echo, focused ? 0.42 : 0.32)} />
          <AnimatedPath d={SIGNAL_PATH} fill="none" stroke="rgba(244, 238, 232,0.94)" strokeWidth={4} strokeLinecap="round"
            strokeDasharray={[length * 0.075, length * 0.925]} strokeDashoffset={lead.interpolate({ inputRange: [0, 1], outputRange: [length, 0] })}
            opacity={traceOpacity(lead, focused ? 1 : 0.92)} />
        </>}
      </Svg>
    </View>
  )
}

function LoginForm() {
  const router = useRouter()
  const { fontScale } = useWindowDimensions()
  const passwordInput = useRef<TextInput>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ field: 'email' | 'password'; message: string } | null>(null)
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null)
  // KeyboardAvoidingView already shrinks the form; scrolling to its end keeps Sign in above the keyboard too.
  const { scroll, keyboardInset } = useKeyboardReveal()
  useEffect(() => {
    if (!keyboardInset) return
    const timer = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50)
    return () => clearTimeout(timer)
  }, [keyboardInset, scroll])

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
      router.replace('/dashboard')
    } catch (cause) {
      setError({ field: 'password', message: getAuthErrorMessage(cause, 'login') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.flex, styles.loginShell]}>
      <ScrollView
        ref={scroll}
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.loginContent}
        keyboardShouldPersistTaps="handled"
      >
        <SignalBackdrop focused={focusedField !== null} />
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <BrandMark width={21} />
          </View>
          <Text style={styles.brandName}>SHEAR</Text>
        </View>
        <View accessible accessibilityRole="header" accessibilityLabel="Find your training rhythm.">
          <Text style={styles.hero}>Find your{`\n`}training</Text>
          {/* Native Text preserves Android's nonlinear accessibility scaling; SVG does not. */}
          {fontScale !== 1 ? <Text style={styles.heroAccent}>rhythm.</Text> : <Svg height={34.496} width={160} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Defs>
              <LinearGradient id="rhythm" x1="-160%" x2="100%" y1="0%" y2="100%">
                <Stop offset="0" stopColor={colors.accentText} /><Stop offset="0.38" stopColor={colors.accentText} />
                <Stop offset="0.49" stopColor="#fbf7f2" /><Stop offset="0.60" stopColor={colors.accentText} />
                <Stop offset="1" stopColor="#f4eee8" />
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


function SetValueInput({ value, units, field, label, done, rejectedEdit, onChange, large = false, onFocusChange }: {
  value: string
  units: Units
  field: 'weight' | 'reps'
  label: string
  done: boolean
  rejectedEdit: object | null
  onChange: (value: string) => void
  large?: boolean
  onFocusChange?: (focused: boolean) => void
}) {
  const displayed = storedValueToSetInput(value, field, units)
  const [text, setText] = useState(displayed)
  const focused = useRef(false)
  const pendingSubmissions = useRef<string[]>([])
  const inputUnits = useRef(units)
  useEffect(() => {
    if (inputUnits.current !== units) {
      inputUnits.current = units
      focused.current = false
      pendingSubmissions.current = []
      setText(displayed)
      return
    }
    const reconciliation = reconcileSetInputSubmissions(pendingSubmissions.current, value, rejectedEdit !== null)
    pendingSubmissions.current = reconciliation.pending
    if (!reconciliation.acknowledged || (!focused.current && reconciliation.pending.length === 0)) {
      setText(displayed)
    }
  }, [displayed, value, rejectedEdit, units])
  return <TextInput
    accessibilityLabel={label}
    inputMode={field === 'weight' ? 'decimal' : 'numeric'}
    keyboardType={field === 'weight' ? 'decimal-pad' : 'number-pad'}
    onBlur={() => {
      focused.current = false
      onFocusChange?.(false)
      if (pendingSubmissions.current.length === 0) setText(displayed)
    }}
    onChangeText={(next) => {
      setText(next)
      const canonical = setInputToStoredValue(next, field, units)
      pendingSubmissions.current.push(canonical)
      onChange(canonical)
    }}
    onFocus={() => { focused.current = true; onFocusChange?.(true) }}
    placeholder="0"
    placeholderTextColor={colors.mutedSoft}
    selectTextOnFocus
    selectionColor={colors.lineStrong}
    style={large ? styles.panelInput : [styles.setInput, done && styles.setInputDone]}
    value={text}
  />
}

interface EditingActions {
  updateSet(exerciseId: string, setId: string, field: 'weight' | 'reps', value: string): void
  adjustSet(exerciseId: string, setId: string, field: 'weight' | 'reps', delta: number): void
  applyOverload(exerciseId: string, weightKg: number): void
  setDone(exerciseId: string, setId: string, done: boolean): void
  addSet(exerciseId: string): void
  removeSet(exerciseId: string, setId: string): void
  addExercise(exerciseId: string, name: string, source: ExerciseSource): string
  removeExercise(exerciseId: string): void
}

function PlusIcon({ color = colors.text }: { color?: string }) {
  return <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="M12 5v14M5 12h14" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" /></Svg>
}

function LabelTabs({ active, onToggle }: { active: string; onToggle: (label: string) => void }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={styles.flex} contentContainerStyle={styles.labelTabs}>
    {WORKOUT_LABELS.map((label) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: active === label }}
      accessibilityLabel={`Session type ${label}`} onPress={() => onToggle(label)}
      style={({ pressed }) => [styles.labelTab, active === label && styles.labelTabActive, pressed && styles.headingPressed]}>
      <Text style={[styles.labelTabText, active === label && styles.labelTabTextActive]}>{label}</Text>
    </Pressable>)}
  </ScrollView>
}


function ExerciseLedger({ uid, sessionKey, exercise, position, count, expanded, collapsible, units, metadata, onToggle, editing, rejectedEdit }: {
  uid: string; sessionKey: string; exercise: WorkoutExercise; position: number; count: number; expanded: boolean; collapsible: boolean
  units: Units; metadata: ExerciseMetadata | undefined; onToggle: () => void; editing: EditingActions; rejectedEdit: object | null
}) {
  const summary = summarizeExercise(exercise, units)
  const load = useCallback(() => readExerciseHistory(uid, exercise.exerciseId, exercise.exerciseSource), [uid, exercise.exerciseId, exercise.exerciseSource])
  const history = useSessionRead(JSON.stringify([uid, sessionKey, exercise.exerciseSource, exercise.exerciseId]), load, expanded)
  const category = metadata ? EXERCISE_CATEGORY_LABELS[metadata.category] : undefined
  const equipment = metadata ? EQUIPMENT_LABELS[metadata.equipment] : undefined
  const currentSet = focusSetIndex(exercise.sets)
  const [hintClosed, setHintClosed] = useState(false)
  const suggestion = history.state.status === 'ready' && !hintClosed && exercise.sets.some((set) => !set.done) ? history.state.data.suggestion : null
  const heading = <>
    {expanded ? <View style={styles.flex}>
      <Text style={styles.exercisePosition}>Exercise {position} of {count}</Text>
      {/* Android needs an explicit break opportunity after a hyphen to match browser wrapping. */}
      <Text accessibilityLabel={exercise.name} textBreakStrategy="simple" style={styles.exerciseName}>{exercise.name.replaceAll('-', '-\u200b')}</Text>
      {(category || equipment) && <Text style={styles.exerciseMeta}>{category}{category && equipment ? ' · ' : ''}{equipment}</Text>}
    </View> : <View style={styles.collapsedRow}>
      <Text accessibilityLabel={exercise.name} numberOfLines={1} style={styles.collapsedName}>{exercise.name}</Text>
      <Text style={styles.exerciseCompact}>{summary.completed}/{summary.total} sets</Text>
    </View>}
    {collapsible && <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={styles.chevron}>
      <Svg width={18} height={18} viewBox="0 0 24 24" style={expanded ? styles.chevronExpanded : undefined}>
        <Path d="m6 9 6 6 6-6" fill="none" stroke={colors.muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>}
  </>
  const remove = () => {
    if (!exerciseHasEnteredSets(exercise)) return editing.removeExercise(exercise.clientId)
    showDialog('Remove exercise?', 'This will remove the exercise and its sets from the active session.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove exercise', style: 'destructive', onPress: () => editing.removeExercise(exercise.clientId) },
    ])
  }
  return <View style={styles.exerciseCard}>
    <View style={styles.exerciseHeadRow}>
    {collapsible ? <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} exercise ${exercise.name}`}
      accessibilityState={{ expanded }} onPress={onToggle} style={({ pressed }) => [styles.exerciseHeading, pressed && styles.headingPressed]}>{heading}</Pressable>
      : <View style={styles.exerciseHeading}>{heading}</View>}
    {expanded && <Pressable accessibilityRole="button" accessibilityLabel={`Remove exercise ${exercise.name}`} hitSlop={4} onPress={remove}
      style={({ pressed }) => [styles.deleteExercise, pressed && styles.headingPressed]}>
      <Svg width={14} height={14} viewBox="0 0 24 24"><Path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6" fill="none" stroke={colors.muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
    </Pressable>}
    </View>
    {expanded && <View>
      {suggestion && <View style={styles.hint}>
        <Text style={styles.hintText}>{overloadHintLabel(suggestion, units)}</Text>
        <Pressable accessibilityRole="button" onPress={() => { editing.applyOverload(exercise.clientId, suggestion.suggestedWeight); setHintClosed(true) }}
          style={({ pressed }) => [styles.hintApply, pressed && styles.headingPressed]}><Text style={styles.hintApplyText}>Apply</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss suggestion" onPress={() => setHintClosed(true)}
          style={({ pressed }) => [styles.hintClose, pressed && styles.headingPressed]}><Icon name="close" size={16} /></Pressable>
      </View>}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.setGrid, styles.setHeaderGrid]}>
        <View style={styles.setToggleColumn} /><Text style={[styles.setHeaderCell, styles.setPreviousColumn]}>Last</Text><Text style={[styles.setHeaderCell, styles.setWeightColumn]}>{units}</Text>
        <Text style={[styles.setHeaderCell, styles.setRepsColumn]}>Reps</Text><View style={styles.setTrailingColumn} />
      </View>
      {exercise.sets.map((set, index) => {
        const previous = history.state.status === 'ready' ? history.state.data.sets[index] : undefined
        const previousText = history.state.status === 'ready' && (previous || !history.state.fromCache)
          // A cached copy without this set cannot say whether it existed: unknown, not loading.
          ? formatPreviousSet(previous, units) : history.state.status === 'loading' ? '…' : '?'
        const current = !set.done && index === currentSet
        return <View key={set.clientId} style={[styles.setGrid, current && styles.setRowCurrent]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${set.done ? 'Unmark' : 'Mark'} set ${index + 1} for ${exercise.name}`}
            onPress={() => editing.setDone(exercise.clientId, set.clientId, !set.done)} style={[styles.setToggleColumn, styles.setTouchTarget]}>
            {set.done ? <Svg width={16} height={16} viewBox="0 0 24 24" style={{ alignSelf: 'center' }}><Path d="m20 6-11 11-5-5" fill="none" stroke={colors.recovery} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
              : <Text style={[styles.setToggle, current && styles.setToggleCurrent]}>{index + 1}</Text>}
          </Pressable>
          <Text numberOfLines={1} accessibilityLabel={`Previous set result ${index + 1}: ${previousText}`} style={[styles.setCellMuted, styles.setPreviousColumn]}>{previousText}</Text>
          {current ? <>
            <Text style={[styles.setNow, styles.weightInputColumn]}>{storedValueToSetInput(set.weight, 'weight', units) || 0}</Text>
            <Text style={[styles.setNow, styles.repsInputColumn]}>{set.reps || 0}</Text>
          </> : <>
          <View style={styles.weightInputColumn}><SetValueInput rejectedEdit={rejectedEdit} value={set.weight} units={units} field="weight" done={set.done}
            label={`Weight, ${exercise.name}, set ${index + 1}, ${units}`} onChange={(value) => editing.updateSet(exercise.clientId, set.clientId, 'weight', value)} /></View>
          <View style={styles.repsInputColumn}><SetValueInput rejectedEdit={rejectedEdit} value={set.reps} units={units} field="reps" done={set.done}
            label={`Reps, ${exercise.name}, set ${index + 1}`} onChange={(value) => editing.updateSet(exercise.clientId, set.clientId, 'reps', value)} /></View>
          </>}
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove set ${index + 1}`} onPress={() => editing.removeSet(exercise.clientId, set.clientId)} style={[styles.setTrailingColumn, styles.setTouchTarget]}>
            <Svg width={15} height={15} viewBox="0 0 24 24" style={{ alignSelf: 'center' }}><Path d="m18 6-12 12M6 6l12 12" fill="none" stroke={colors.mutedSoft} strokeWidth={2} strokeLinecap="round" /></Svg>
          </Pressable>
        </View>
      })}
      {history.state.status === 'error' && <Pressable accessibilityRole="button" onPress={history.retry} style={styles.lookupAction}><Text style={styles.lookupText}>History unavailable · Retry</Text></Pressable>}
      {history.state.status === 'ready' && history.state.fromCache && <Text style={styles.lookupText}>History saved on this device · reconnect to refresh</Text>}
      <Pressable accessibilityRole="button" accessibilityLabel={`Add set to ${exercise.name}`} onPress={() => editing.addSet(exercise.clientId)}
        style={({ pressed }) => [styles.addSetButton, pressed && styles.setStepperPressed]}><View style={styles.addSetContent}>
          <Svg width={15} height={15} viewBox="0 0 24 24"><Path d="M12 5v14M5 12h14" fill="none" stroke={colors.text} strokeWidth={2.4} strokeLinecap="round" /></Svg>
          <Text style={styles.addSetText}>Add set</Text>
        </View></Pressable>
    </View>}
  </View>
}

const exerciseIdentity = (exercise: WorkoutExercise, index: number) => exercise.clientId ?? `${exercise.exerciseSource}:${exercise.exerciseId}:${index}`

function expandedExerciseId(session: ActiveWorkout, manual: string | null) {
  const focused = focusExerciseIndex(session.exercises)
  const defaultId = focused >= 0 ? exerciseIdentity(session.exercises[focused]!, focused) : ''
  return manual === '' || session.exercises.some((exercise, index) => exerciseIdentity(exercise, index) === manual) ? manual : defaultId
}

function WorkoutLedger({ uid, session, units, stale, editing, rejectedEdit, expandedId, onExpand }: { uid: string; session: ActiveWorkout; units: Units; stale: boolean; editing: EditingActions; rejectedEdit: object | null; expandedId: string | null; onExpand: (id: string) => void }) {
  const [picking, setPicking] = useState(false)
  const loadMetadata = useCallback(() => readExerciseMetadata(uid), [uid])
  const hasCustom = session.exercises.some((exercise) => exercise.exerciseSource === 'user')
  const sessionKey = `${session.sessionId}:${stale}`
  const catalog = useSessionRead(JSON.stringify([uid, sessionKey]), loadMetadata, hasCustom || picking)
  const full = session.exercises.length >= MAX_SESSION_EXERCISES
  const openPicker = () => { catalog.retry(); setPicking(true) }
  const loadRecent = useCallback(() => readRecentWorkouts(uid, 10), [uid])
  const recent = useSessionRead(`recent-exercises:${uid}`, loadRecent, session.exercises.length === 0)
  const quickPicks = recent.state.status === 'ready' ? recentExercisePicks(recent.state.data) : []
  const picker = picking && <ExercisePicker userExercises={catalog.state} onRetryUserExercises={catalog.retry} onClose={() => setPicking(false)}
    onSelect={(id, name, source) => {
      setPicking(false)
      onExpand(editing.addExercise(id, name, source))
    }} />
  if (session.exercises.length === 0) return <View style={styles.exerciseStack}>
    <View accessibilityLabel="No exercises yet" style={styles.emptyWorkout}>
      <Pressable accessibilityRole="button" accessibilityLabel="Add exercise" onPress={openPicker}
        style={({ pressed }) => [styles.primaryAction, styles.buttonPrimary, styles.emptyWorkoutAction, pressed && styles.buttonPressed]}>
        <PlusIcon color={colors.onPrimary} /><Text style={styles.primaryActionText}>Add exercise</Text>
      </Pressable>
    </View>
    {quickPicks.length > 0 && <View style={styles.quickStart}>
      <Text accessibilityRole="header" style={styles.quickStartTitle}>Recently used</Text>
      <View style={styles.quickPickList}>
        {quickPicks.map(({ id, name, source }) => {
          const category = exerciseCatalog.find((exercise) => exercise.id === id)?.category
          return <Pressable key={`${source}:${id}`} accessibilityRole="button" onPress={() => onExpand(editing.addExercise(id, name, source))}
            style={({ pressed }) => [styles.quickPick, pressed && styles.setStepperPressed]}>
            <View style={styles.quickPickCopy}>
              <Text numberOfLines={1} style={styles.quickPickName}>{name}</Text>
              {category && <Text style={styles.quickPickMeta}>{EXERCISE_CATEGORY_LABELS[category] ?? category}</Text>}
            </View>
            <Text style={styles.quickPickAction}>Add</Text>
          </Pressable>
        })}
      </View>
    </View>}
    {picker}
  </View>
  return <View style={styles.exerciseStack}>
    {hasCustom && catalog.state.status === 'error' && <Pressable onPress={catalog.retry} accessibilityRole="button" style={styles.lookupAction}><Text style={styles.lookupText}>Exercise details unavailable · Retry</Text></Pressable>}
    {[true, false].map((open) => <Fragment key={String(open)}>
      {!open && session.exercises.length > 1 && <Text accessibilityRole="header" style={styles.upNext}>Up next</Text>}
      {session.exercises.map((exercise, index) => (session.exercises.length === 1 || exerciseIdentity(exercise, index) === expandedId) === open && <ExerciseLedger
        key={exerciseIdentity(exercise, index)} uid={uid} sessionKey={sessionKey} exercise={exercise} units={units}
        position={index + 1} count={session.exercises.length}
        expanded={open} collapsible={session.exercises.length > 1}
        metadata={exercise.exerciseSource === 'global' ? exerciseCatalog.find(({ id }) => id === exercise.exerciseId)
          : catalog.state.status === 'ready' ? catalog.state.data.find(({ id }) => id === exercise.exerciseId) : undefined}
        editing={editing} rejectedEdit={rejectedEdit}
        onToggle={() => onExpand(open ? '' : exerciseIdentity(exercise, index))} />)}
    </Fragment>)}
    <Pressable accessibilityRole="button" accessibilityLabel="Add exercise" accessibilityState={{ disabled: full }} disabled={full} onPress={openPicker}
      style={({ pressed }) => [styles.primaryAction, styles.inlineAddExercise, full && styles.buttonDisabled, pressed && styles.setStepperPressed]}>
      <PlusIcon /><Text style={styles.addExerciseText}>Add exercise</Text>
    </Pressable>
    {full && <Text style={styles.previewCopy}>Sessions hold up to {MAX_SESSION_EXERCISES} exercises.</Text>}
    {picker}
  </View>
}

const REST_SECONDS = 90
type Rest = { sessionId: string; startedAt: number; totalSec: number }
// shortcut: lives only in memory, so a killed app forgets the rest; move it to the session journal if testers miss it.
let lastRest: Rest | null = null

function RestBar({ rest, undoLabel, onUndo, onAddTime, onSkip }: { rest: Rest; undoLabel?: string; onUndo: () => void; onAddTime: (seconds: number) => void; onSkip: () => void }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(interval)
  }, [rest.startedAt, rest.totalSec])
  const remainingMs = Math.max(0, rest.startedAt + rest.totalSec * 1000 - now)
  const remaining = Math.ceil(remainingMs / 1000)
  const finished = remainingMs === 0
  const skip = useRef(onSkip)
  skip.current = onSkip
  useEffect(() => {
    if (!finished) return
    Vibration.vibrate([0, 120, 60, 120])
    const timeout = setTimeout(() => skip.current(), 3500)
    return () => clearTimeout(timeout)
  }, [finished])
  return <View accessibilityRole="timer" accessibilityLiveRegion={finished ? 'polite' : 'none'} style={styles.panelStatus}>
    <View style={styles.restTrack}><View style={[styles.restFill, { width: `${remainingMs / (rest.totalSec * 1000) * 100}%` }]} /></View>
    {finished ? <Text style={styles.panelStatusText}>Ready — time for the next set</Text> : <>
      <Text style={styles.restLabel}>Rest</Text>
      <Text style={styles.restValue}>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</Text>
    </>}
    <View style={styles.flex} />
    {undoLabel && <Pressable accessibilityRole="button" onPress={onUndo} style={styles.restAction}><Text style={styles.restActionText}>{undoLabel}</Text></Pressable>}
    {!finished && <Pressable accessibilityRole="button" accessibilityLabel="Add 30 seconds" onPress={() => onAddTime(30)} style={styles.restAction}><Text style={styles.restActionText}>+30 s</Text></Pressable>}
    <Pressable accessibilityRole="button" accessibilityLabel="Skip rest" onPress={onSkip} style={styles.restAction}><Text style={styles.restActionText}>Skip</Text></Pressable>
  </View>
}

function SetStepper({ label, step, onStep }: { label: string; step: number; onStep: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Adjust ${label} by ${step > 0 ? '+' : ''}${step}`} onPress={onStep}
    style={({ pressed }) => [styles.panelStep, pressed && styles.setStepperPressed]}><Text style={styles.panelStepText}>{step > 0 ? `+${step}` : `−${-step}`}</Text></Pressable>
}

function SetPanel({ exercise, setIndex, units, rejectedEdit, editing, rest, inset, nextName, finishing, onInputFocus, onLog, onNext, onFinish }: {
  exercise: WorkoutExercise; setIndex: number; units: Units; rejectedEdit: object | null; editing: EditingActions; rest: React.ReactNode; inset: number
  nextName: string | null; finishing: boolean; onInputFocus: (focused: boolean) => void; onLog: () => void; onNext: () => void; onFinish: () => void
}) {
  const set = setIndex >= 0 ? exercise.sets[setIndex] : undefined
  const number = setIndex + 1
  const adjust = (field: 'weight' | 'reps', delta: number) => set && editing.adjustSet(exercise.clientId, set.clientId, field, delta)
  const action = set ? 'Log set' : nextName ? `Go to ${nextName}` : finishing ? 'Finishing…' : 'Finish workout'
  return <View accessibilityLabel="Current set" style={[styles.panel, { paddingBottom: inset }]}>
    {rest ?? <View style={styles.panelStatus}><Text style={styles.panelStatusText}>{set ? `Set ${number} of ${exercise.sets.length}` : 'All sets done'}</Text></View>}
    {set && <View style={styles.panelNums}>
      <View style={styles.panelNum}>
        <SetStepper label="weight" step={-2.5} onStep={() => adjust('weight', displayWeightDeltaToKg(-2.5, units))} />
        <View style={styles.panelValue}><SetValueInput large onFocusChange={onInputFocus} rejectedEdit={rejectedEdit} value={set.weight} units={units} field="weight" done={false}
          label={`Weight, ${exercise.name}, set ${number}, ${units}`} onChange={(value) => editing.updateSet(exercise.clientId, set.clientId, 'weight', value)} /><Text style={styles.panelUnit}>{units}</Text></View>
        <SetStepper label="weight" step={2.5} onStep={() => adjust('weight', displayWeightDeltaToKg(2.5, units))} />
      </View>
      <View style={styles.panelDivider} />
      <View style={styles.panelNum}>
        <SetStepper label="reps" step={-1} onStep={() => adjust('reps', -1)} />
        <View style={styles.panelValue}><SetValueInput large onFocusChange={onInputFocus} rejectedEdit={rejectedEdit} value={set.reps} units={units} field="reps" done={false}
          label={`Reps, ${exercise.name}, set ${number}`} onChange={(value) => editing.updateSet(exercise.clientId, set.clientId, 'reps', value)} /><Text style={styles.panelUnit}>reps</Text></View>
        <SetStepper label="reps" step={1} onStep={() => adjust('reps', 1)} />
      </View>
    </View>}
    <Pressable accessibilityRole="button" accessibilityLabel={set ? `Log set ${number} for ${exercise.name}` : action} disabled={!set && !nextName && finishing}
      onPress={set ? onLog : nextName ? onNext : onFinish} style={({ pressed }) => [styles.panelAction, !set && !nextName && finishing && styles.buttonDisabled, pressed && styles.buttonPressed]}>
      <Text style={styles.panelActionText}>{action}</Text>
    </Pressable>
  </View>
}

// Copy mirrors the web closure alerts in WorkoutPage.
type ClosureNoticeStatus = Exclude<ClosureState['status'], 'loading' | 'ready' | 'submitting'>

const CLOSURE_COPY: Record<ClosureNoticeStatus, { title: string; copy: string; action: string }> = {
  read_failed: { title: 'Could not check the saved workout request.', copy: 'Editing and closing stay locked until its local recovery record can be read.', action: 'Try again' },
  corrupt: { title: 'The saved workout request is damaged.', copy: 'Its files were preserved. Editing and closing stay locked until recovery succeeds.', action: 'Try again' },
  intent_storage_failed: { title: 'Could not save the close request on this device.', copy: 'The server was not contacted. Retry the local save, or return to editing.', action: 'Retry local save' },
  retry_storage_failed: { title: 'Could not safely save the retry.', copy: 'The earlier request may already have reached the server. Editing remains locked while its last saved copy is preserved.', action: 'Retry recovery' },
  resolution_storage_failed: { title: 'The server answered, but local recovery could not be cleared.', copy: 'Your workout stays locked until this device saves the resolved state.', action: 'Retry local recovery' },
  closure_unconfirmed: { title: 'Could not confirm session closure.', copy: 'Your workout data is preserved. Editing is locked until the server confirms the outcome.', action: 'Try again' },
  closure_rejected: { title: 'The server did not accept this workout.', copy: 'Some set data is invalid: reps must be whole numbers from 1 to 1000 and weight between 0 and 2000 kg. Correct it and try again.', action: 'Return to editing' },
  closure_failed: { title: 'This session cannot be closed.', copy: 'The server refused this request. Try again, or reopen the app to see the latest state.', action: 'Try again' },
  auth_required: { title: 'Your sign-in session needs refreshing.', copy: 'Your workout data is preserved. Sign in again, then retry closing the session.', action: 'Sign in again' },
  session_mismatch: { title: 'This session is no longer active on the server.', copy: 'Could not automatically sync the session opened on another device.', action: 'Try again' },
  closure_conflict: { title: 'The server rejected closing this session.', copy: 'This session was already closed with a different outcome, and automatic reconciliation failed.', action: 'Try again' },
  active_session_changed: { title: 'The session changed on another device.', copy: 'Check the latest data on this device, then finish it again.', action: 'Load current session' },
}

function ClosureNotice({ closure, onRetry, onDismiss, onSignIn }: { closure: ClosureState; onRetry: () => void; onDismiss: () => void; onSignIn: () => void }) {
  if (closure.status === 'ready') return null
  if (closure.status === 'loading') return <View accessibilityLiveRegion="polite" style={styles.closureNotice}>
    <ActivityIndicator color={colors.accent} />
    <Text style={styles.syncTitle}>Checking saved workout requests…</Text>
    <Text style={styles.syncCopy}>Editing and closing stay locked until recovery is checked.</Text>
  </View>
  if (closure.status === 'submitting') return <View accessibilityLiveRegion="polite" style={styles.closureNotice}>
    <ActivityIndicator color={colors.accent} />
    <Text style={styles.syncTitle}>{closure.intent.action === 'finish' ? 'Saving workout…' : 'Discarding workout…'}</Text>
  </View>
  const { title, copy, action } = CLOSURE_COPY[closure.status]
  const canDismiss = closure.status === 'active_session_changed' || closure.status === 'closure_conflict' || closure.status === 'session_mismatch' || closure.status === 'closure_rejected'
  const onPress = closure.status === 'auth_required' ? onSignIn : canDismiss ? onDismiss : onRetry
  return <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.closureNotice}>
    <Text style={styles.syncTitle}>{title}</Text>
    <Text style={styles.syncCopy}>{copy}</Text>
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.closureAction, styles.buttonPrimary, pressed && styles.buttonPressed]}>
      <Text style={styles.buttonText}>{action}</Text>
    </Pressable>
    {closure.status === 'intent_storage_failed' && <Pressable accessibilityRole="button" onPress={onDismiss} style={styles.closureAction}>
      <Text style={styles.syncActionText}>Return to editing</Text>
    </Pressable>}
  </View>
}

function guardClosureInteraction<Args extends unknown[]>(canEdit: () => boolean, action: (...args: Args) => void): (...args: Args) => void
function guardClosureInteraction<Args extends unknown[], Result>(canEdit: () => boolean, action: (...args: Args) => Result, blockedResult: Result): (...args: Args) => Result
function guardClosureInteraction<Args extends unknown[], Result>(canEdit: () => boolean, action: (...args: Args) => Result, blockedResult?: Result) {
  return (...args: Args): Result | undefined => canEdit() ? action(...args) : blockedResult
}

function WorkoutOptionsMenu({ busy, onDiscard, onHistory, onSignOut }: { busy: boolean; onDiscard: () => void; onHistory: () => void; onSignOut: () => void }) {
  const insets = useSafeAreaInsets()
  const [open, setOpen] = useState(false)
  const choose = (action: () => void) => () => { setOpen(false); action() }
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="More workout options" accessibilityState={{ expanded: open }} onPress={() => setOpen(true)}
      style={({ pressed }) => [styles.optionsTrigger, pressed && styles.pickerPressed]}>
      <Svg width={20} height={20} viewBox="0 0 24 24">
        {[5, 12, 19].map((cx) => <Circle key={cx} cx={cx} cy={12} r={1} fill="none" stroke={colors.muted} strokeWidth={2} />)}
      </Svg>
    </Pressable>
    <Modal animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent transparent visible={open}>
      <Pressable accessibilityLabel="Close workout options" onPress={() => setOpen(false)} style={StyleSheet.absoluteFill} />
      <View accessibilityLabel="Workout options" style={[styles.optionsMenu, { top: Math.max(12, insets.top) + 57.6 }]}>
        <Pressable accessibilityRole="menuitem" disabled={busy} onPress={choose(onDiscard)} style={({ pressed }) => [styles.optionsItem, pressed && styles.optionsItemPressed]}>
          <Text style={styles.optionsItemText}>Discard workout</Text>
        </Pressable>
        <Pressable accessibilityRole="menuitem" onPress={choose(onHistory)} style={({ pressed }) => [styles.optionsItem, pressed && styles.pickerPressed]}>
          <Text style={[styles.optionsItemText, styles.optionsItemNeutral]}>History</Text>
        </Pressable>
        <Pressable accessibilityRole="menuitem" onPress={choose(onSignOut)} style={({ pressed }) => [styles.optionsItem, pressed && styles.pickerPressed]}>
          <Text style={[styles.optionsItemText, styles.optionsItemNeutral]}>Sign out</Text>
        </Pressable>
      </View>
    </Modal>
  </>
}

function SessionScreen({ user }: { user: AuthUser }) {
  const navigation = useBottomNavigation()
  const { scroll, content, keyboardInset } = useKeyboardReveal()
  const isFocused = useIsFocused()
  const router = useRouter()
  const active = useActiveRuntime()
  const closureRuntime = useClosureRuntime()
  const {
    state, retry, retrySave, discardLocalChanges,
    updateSet, adjustSet, applyOverload, setDone, addSet, removeSet, addExercise, removeExercise, setLabel, refreshStart,
  } = active
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const [manualExercise, setManualExercise] = useState<{ sessionId: string; id: string } | null>(null)
  const [rest, setRest] = useState(lastRest)
  const [lastLogged, setLastLogged] = useState<{ exerciseId: string; setId: string } | null>(null)
  const [panelInputFocused, setPanelInputFocused] = useState(false)
  const changeRest = (next: Rest | null) => { lastRest = next; setRest(next) }
  const insets = useSafeAreaInsets()
  const { closure, completed, locked, canEdit: canEditClosure, start: startClosure, retry: retryClosure, dismiss: dismissClosure } = closureRuntime
  const sessionClosed = state.status === 'ready' && completed?.action === 'finish'
    && completed.workoutId === state.session.sessionId
  const launch = useOptionalLaunchRuntime()
  const replacementLocked = !!launch?.state.replacing
  const sessionLocked = locked || sessionClosed || replacementLocked
  const canEditCurrentSession = () => !sessionClosed && !replacementLocked && canEditClosure()

  const doLogout = async () => {
    setLogoutError(null)
    try {
      await logout()
    } catch {
      setLogoutError('Could not sign out. Check your connection and try again.')
    }
  }

  const session = state.status === 'ready' ? state.session : null
  // Decided when the session or the screen comes into view, so a long workout is not interrupted mid-set.
  const sessionId = session?.sessionId, startedAt = session?.startedAt
  const oldSession = useMemo(() => startedAt !== undefined && isActiveSessionStale({ startedAt }), [sessionId, startedAt, isFocused])
  const resumePrompt = oldSession && !sessionClosed
  const restartAfterDiscard = useRef<string | null>(null)
  // App start (cold, or after Android Back destroyed the activity) opens a fresh `/`; web sends `/` to `/dashboard`.
  // Every later entry to `/` arrives with a session or an unfinished closure, so only this instance's first settled state decides.
  const landing = useRef(true)
  // Like web, a discarded workout returns Home; "Discard and start again" from the old-session prompt starts a new one instead.
  useEffect(() => {
    if (state.status !== 'empty' || closure.status !== 'ready' || completed?.action !== 'discard' || handledDiscard.sessionId === completed.sessionId) return
    handledDiscard.sessionId = completed.sessionId
    const restart = restartAfterDiscard.current === completed.sessionId
    restartAfterDiscard.current = null
    if (!isFocused) return
    if (restart) void launch?.start({ kind: 'empty' })
    else router.replace('/dashboard')
  }, [state.status, closure.status, completed, isFocused, launch, router])
  // Only a server-confirmed absence with no closure result goes Home; a workout, a closure under recovery or a later visit stays here.
  useEffect(() => {
    if (!landing.current || state.status === 'loading' || state.status === 'cache-miss' || closure.status === 'loading') return
    landing.current = false
    if (isFocused && state.status === 'empty' && closure.status === 'ready' && !completed) router.replace('/dashboard')
  }, [state.status, closure.status, completed, isFocused, router])
  // Closure is decided against the server's revision, so it waits for local edits to be acknowledged.
  const closable = (action: () => void) => () => {
    if (!isFocused || state.status !== 'ready' || sessionLocked) return
    if (state.stale || state.syncStatus !== 'saved') {
      showDialog('Waiting for sync', state.stale
        ? 'Reconnect to confirm the workout is still active, then try again.'
        : state.syncStatus === 'failed' ? 'Your latest changes are not saved yet. Tap Retry in the sync notice, then try again.'
          : state.syncStatus === 'conflict' ? 'This workout changed on another device. Resolve it in the sync notice first.'
            : state.syncStatus === 'storage-error' ? 'This device could not store your latest changes. Retry in the sync notice first.'
              : 'Your latest changes are still syncing. Try again once they are saved.')
      return
    }
    action()
  }
  const discard = closable(() => showDialog('Discard workout?', 'All data from this session will be lost.', [
    { text: 'Back', style: 'cancel' },
    { text: 'Discard workout', style: 'destructive', onPress: () => session && startClosure('discard', session) },
  ]))
  const discardOld = closable(() => { if (session) { restartAfterDiscard.current = session.sessionId; startClosure('discard', session) } })
  const discardEmpty = () => showDialog('Finish without saving?', 'No sets are marked complete. The session will be discarded without saving a workout.', [
    { text: 'Back', style: 'cancel' },
    { text: 'Discard session', style: 'destructive', onPress: () => session && startClosure('discard', session) },
  ])
  const finish = closable(() => {
    if (!session) return
    const sets = session.exercises.flatMap((exercise) => exercise.sets)
    if (!sets.some((set) => set.done)) return discardEmpty()
    if (!session.sessionRevision) {
      showDialog('Waiting for sync', 'This workout has not been saved from this app yet. Change any set, then try again.')
      return
    }
    const unfinished = sets.filter((set) => !set.done).length
    if (unfinished === 0) return startClosure('finish', session)
    showDialog('Finish workout?', `Unfinished sets: ${unfinished}. Only completed sets will be saved.`, [
      { text: 'Continue workout', style: 'cancel' },
      { text: 'Save completed sets', onPress: () => startClosure('finish', session) },
    ])
  })

  const confirmDiscardLocal = () => showDialog(
    'Use latest workout?',
    'Your edits saved on this device will be discarded.',
    [
      { text: 'Keep local edits', style: 'cancel' },
      { text: 'Use latest', style: 'destructive', onPress: guardClosureInteraction(canEditCurrentSession, discardLocalChanges) },
    ],
  )

  const liveSession = state.status === 'ready' && !sessionClosed && !resumePrompt ? state.session : null
  const manual = manualExercise?.sessionId === liveSession?.sessionId ? manualExercise?.id ?? null : null
  const expandedId = liveSession ? expandedExerciseId(liveSession, manual) : null
  const expandExercise = (id: string | null) => { if (liveSession) setManualExercise({ sessionId: liveSession.sessionId, id: id ?? '' }) }
  const expandedIndex = liveSession ? liveSession.exercises.findIndex((exercise, index) => exerciseIdentity(exercise, index) === expandedId) : -1
  const panelIndex = !liveSession ? -1 : expandedIndex >= 0 ? expandedIndex : focusExerciseIndex(liveSession.exercises)
  const panelExercise = panelIndex >= 0 ? liveSession?.exercises[panelIndex] : undefined
  const panelSetIndex = panelExercise ? panelExercise.sets.findIndex((set) => !set.done) : -1
  const undoExercise = lastLogged ? liveSession?.exercises.find(({ clientId }) => clientId === lastLogged.exerciseId) : undefined
  const undoSetIndex = undoExercise ? undoExercise.sets.findIndex(({ clientId }) => clientId === lastLogged?.setId) : -1
  const undoSet = undoExercise?.sets[undoSetIndex]
  const nextExerciseIndex = !liveSession ? -1 : liveSession.exercises.findIndex((exercise, index) => index !== panelIndex && exercise.sets.some((set) => !set.done))
  const currentRest = rest && rest.sessionId === liveSession?.sessionId ? rest : null
  const toggleSet = guardClosureInteraction(canEditCurrentSession, (exerciseId: string, setId: string, done: boolean) => {
    setDone(exerciseId, setId, done)
    if (!done) { changeRest(null); return }
    if (liveSession) changeRest({ sessionId: liveSession.sessionId, startedAt: Date.now(), totalSec: REST_SECONDS })
    setLastLogged({ exerciseId, setId })
    const exercise = liveSession?.exercises.find(({ clientId }) => clientId === exerciseId)
    if (exercise?.sets.every((set) => set.done || set.clientId === setId)) setManualExercise(null)
  })
  const liveSessionId = liveSession?.sessionId
  useEffect(() => {
    if (!isFocused || !liveSessionId) return
    const back = BackHandler.addEventListener('hardwareBackPress', () => { router.navigate('/dashboard'); return true })
    return () => back.remove()
  }, [isFocused, liveSessionId, router])
  // The keyboard lifts the panel, which would then cover a row being edited further up the list.
  const panelVisible = panelExercise && !sessionLocked && (keyboardInset === 0 || panelInputFocused)
  const panelEditing: EditingActions = {
    updateSet: guardClosureInteraction(canEditCurrentSession, updateSet),
    adjustSet: guardClosureInteraction(canEditCurrentSession, adjustSet),
    applyOverload: guardClosureInteraction(canEditCurrentSession, applyOverload),
    setDone: toggleSet,
    addSet: guardClosureInteraction(canEditCurrentSession, addSet),
    removeSet: guardClosureInteraction(canEditCurrentSession, removeSet),
    addExercise: guardClosureInteraction(canEditCurrentSession, addExercise, ''),
    removeExercise: guardClosureInteraction(canEditCurrentSession, removeExercise),
  }
  const rejectedEditState = state.status === 'ready' && state.syncStatus === 'storage-error' ? state : null

  return (
    <View onFocus={navigation.onFocus} onBlur={navigation.onBlur} pointerEvents={isFocused ? 'auto' : 'none'} style={styles.sessionShell}>
      <Animated.ScrollView
        ref={scroll}
        innerViewRef={content}
        contentContainerStyle={[styles.sessionContent, panelVisible ? styles.sessionContentPanel : keyboardInset > 0 && { paddingBottom: keyboardInset }]}
        keyboardShouldPersistTaps="handled"
        stickyHeaderIndices={[0]}
        scrollEventThrottle={16}
        onScroll={navigation.onScroll}
      >
      {state.status === 'ready' && !sessionClosed && !resumePrompt ? (
        <View style={styles.lifecycleBar}>
          <View style={styles.lifecycleBarInner}>
            <Elapsed session={state.session} />
            <View style={styles.flex} />
            <Pressable accessibilityRole="button" accessibilityLabel="Minimize workout" accessibilityHint="Your workout keeps running" onPress={() => router.navigate('/dashboard')} style={styles.minimizeButton}>
              <Svg accessibilityElementsHidden height={17} width={17} viewBox="0 0 24 24"><Path d="m6 9 6 6 6-6" fill="none" stroke={colors.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
              <View><Text style={styles.minimizeText}>Minimize</Text><Text style={styles.minimizeHint}>Keeps running</Text></View>
            </Pressable>
            <WorkoutOptionsMenu busy={locked} onDiscard={discard} onHistory={() => router.push('/history')} onSignOut={() => void doLogout()} />
            <Pressable accessibilityRole="button" accessibilityLabel="Finish workout" disabled={locked} onPress={finish}
              style={({ pressed }) => [styles.finishButton, styles.buttonPrimary, locked && styles.buttonDisabled, pressed && styles.buttonPressed]}>
              <Text style={styles.finishButtonText}>{closure?.status === 'submitting' ? '...' : 'Finish'}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <HistoryHeader />
      )}
      {logoutError && <Text accessibilityLiveRegion="polite" style={styles.logoutError}>{logoutError}</Text>}

      {state.status === 'loading' && (
        <View accessibilityLiveRegion="polite" style={styles.centerState}>
          <View style={[styles.brandMark, styles.loaderMark]}><BrandMark width={26} /></View>
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

      {closure && <ClosureNotice closure={closure} onRetry={retryClosure} onDismiss={dismissClosure} onSignIn={() => void doLogout()} />}

      {state.status === 'empty' && (
        <View style={styles.centerState}>
          <Text accessibilityRole="header" style={styles.stateTitle}>{completed?.action === 'finish' ? 'Workout saved' : completed ? 'Workout discarded' : 'No workout in progress'}</Text>
          <Text style={styles.stateCopy}>{completed?.action === 'finish' ? 'Your saved workout is ready in History.' : 'Start a workout from Train whenever you are ready.'}</Text>
          <ActionButton label="History" onPress={() => router.push('/history')} secondary />
          <ActionButton label="Train" onPress={() => router.navigate('/dashboard')} secondary />
        </View>
      )}

      {sessionClosed && (
        <View style={styles.centerState}>
          <Text accessibilityRole="header" style={styles.stateTitle}>Workout saved</Text>
          <Text style={styles.stateCopy}>Your completed session is ready in History.</Text>
          <ActionButton label="History" onPress={() => router.push('/history')} secondary />
          <ActionButton label="Train" onPress={() => router.navigate('/dashboard')} secondary />
        </View>
      )}

      {state.status === 'error' && (
        <View style={styles.centerState}>
          <Text accessibilityRole="header" style={styles.stateTitle}>Session unavailable</Text>
          <Text accessibilityLiveRegion="polite" style={styles.error}>{state.message}</Text>
          <ActionButton label="Retry" onPress={retry} secondary />
        </View>
      )}

        {resumePrompt && session && (
          <View style={styles.resumePanel}>
            <Text style={styles.resumeEyebrow}>Active session</Text>
            <Text accessibilityRole="header" style={styles.resumeTitle}>Resume an old session?</Text>
            <Text style={styles.resumeCopy}>You have an active session from {getStaleSessionAgeLabel(session.startedAt)} ago. Resume your exercises with a refreshed timer, or discard the session and start again.</Text>
            <View style={styles.resumeActions}>
              <ActionButton label="Continue" disabled={sessionLocked} onPress={guardClosureInteraction(canEditCurrentSession, refreshStart)} />
              <ActionButton label="Discard and start again" disabled={sessionLocked} onPress={discardOld} secondary />
            </View>
          </View>
        )}
        {state.status === 'ready' && !sessionClosed && !resumePrompt && (<>
        {replacementLocked && <View accessibilityRole="alert" style={styles.syncNotice}><Text style={styles.syncCopy}>{launch?.state.message ?? 'Replacing workout…'}</Text>{launch?.state.status !== 'starting' && <Pressable accessibilityRole="button" onPress={() => void launch?.retry()} style={styles.syncAction}><Text style={styles.syncActionText}>Check replacement</Text></Pressable>}</View>}
        <View pointerEvents={sessionLocked ? 'none' : 'auto'}>
          <Text accessibilityLiveRegion="polite" style={styles.syncInline}>{state.syncStatus === 'saving' ? 'Syncing…' : state.syncStatus === 'local' && !state.stale ? 'Saved on device' : ''}</Text>
          {state.stale && !['failed', 'storage-error', 'conflict'].includes(state.syncStatus) && (
            <View style={styles.staleNotice}>
              <Text style={styles.staleTitle}>Saved on this device</Text>
              <Text style={styles.staleCopy}>This may be out of date. Reconnect to confirm the workout is still active.</Text>
            </View>
          )}

          {['failed', 'storage-error', 'conflict'].includes(state.syncStatus) && <View accessibilityLiveRegion="polite" style={styles.syncNotice}>
            <Text style={styles.syncTitle}>{state.syncStatus === 'conflict'
              ? state.conflict === 'closed' ? 'Workout closed elsewhere' : state.conflict === 'replaced' ? 'A different workout is active' : 'Workout changed elsewhere'
              : state.syncStatus === 'failed' ? 'Sync paused'
                  : state.syncStatus === 'storage-error' ? 'Device save failed' : 'Saved on this device'}</Text>
            <Text style={styles.syncCopy}>{state.syncStatus === 'conflict'
              ? 'Your local edits are preserved. Review them, or use the latest server state.'
              : state.syncStatus === 'failed' ? 'Your edits are preserved on this device. Retry when connected.'
                : state.syncStatus === 'storage-error' ? 'The latest change was not accepted because it could not be saved safely.'
                  : state.syncStatus === 'saving' ? 'Syncing changes…' : 'Changes will sync when the server is available.'}</Text>
            {state.syncStatus === 'failed' && <Pressable accessibilityRole="button" onPress={guardClosureInteraction(canEditCurrentSession, retrySave)} style={styles.syncAction}><Text style={styles.syncActionText}>Retry</Text></Pressable>}
            {state.syncStatus === 'conflict' && <Pressable accessibilityRole="button" onPress={confirmDiscardLocal} style={styles.syncAction}><Text style={styles.syncActionText}>Use latest</Text></Pressable>}
          </View>}

          {state.session.exercises.length > 0 && <View style={styles.sessionTop}>
            {closure.status === 'ready' && <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={styles.band}>
              <Image source={covers[workoutCover(state.session.label)]} style={styles.bandImage} />
              <View style={styles.bandFade} />
            </View>}
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.segs}>{state.session.exercises.map((exercise, index) => {
              const done = exercise.sets.filter((set) => set.done).length
              return <View key={exerciseIdentity(exercise, index)} style={[styles.seg, index === panelIndex && styles.segCurrent]}><View style={[styles.segFill, { width: `${exercise.sets.length ? done / exercise.sets.length * 100 : 0}%` }]} /></View>
            })}</View>
          </View>}
          <WorkoutLedger key={state.session.sessionId} uid={user.uid} session={state.session} units={state.units} stale={state.stale} rejectedEdit={rejectedEditState}
            expandedId={expandedId} onExpand={expandExercise} editing={panelEditing} />
          <Text style={styles.workoutLabelsTitle}>SESSION TYPE</Text>
          <View style={styles.workoutLabelsBand}>
            <LabelTabs active={state.session.label ?? ''} onToggle={guardClosureInteraction(canEditCurrentSession, (label) => setLabel(state.session.label === label ? '' : label))} />
          </View>
        </View>
        </>)}
      </Animated.ScrollView>
      {panelVisible && <SetPanel exercise={panelExercise} setIndex={panelSetIndex} units={state.status === 'ready' ? state.units : 'kg'} onInputFocus={setPanelInputFocused}
        rejectedEdit={rejectedEditState} inset={Math.max(keyboardInset, insets.bottom + 14)} finishing={closure?.status === 'submitting'}
        nextName={nextExerciseIndex >= 0 ? liveSession?.exercises[nextExerciseIndex]?.name ?? null : null}
        editing={panelEditing}
        rest={currentRest && <RestBar rest={currentRest} undoLabel={undoSet?.done ? `Undo set ${undoSetIndex + 1}` : undefined}
          onUndo={() => { if (undoExercise && undoSet) toggleSet(undoExercise.clientId, undoSet.clientId, false) }}
          onAddTime={(seconds) => changeRest({ ...currentRest, totalSec: currentRest.totalSec + seconds })} onSkip={() => changeRest(null)} />}
        onLog={() => { const set = panelExercise.sets[panelSetIndex]; if (set) toggleSet(panelExercise.clientId, set.clientId, true) }}
        onNext={() => { const next = liveSession?.exercises[nextExerciseIndex]; if (next) expandExercise(exerciseIdentity(next, nextExerciseIndex)) }}
        onFinish={finish} />}
      {!liveSession && <BottomNavigation {...navigation} />}
    </View>
  )
}

export default function IndexScreen() {
  const { user, startupError } = useAuthRuntime()

  return (
    <SafeAreaView edges={user ? ['top'] : ['top', 'bottom']} style={styles.safeArea}>
      <StatusBar style="light" />
      {startupError ? (
        <View style={styles.centerState}>
          <Text accessibilityRole="header" style={styles.stateTitle}>App configuration unavailable</Text>
          <Text style={styles.stateCopy}>Rebuild this client with an explicit Firebase backend.</Text>
        </View>
      ) : user === undefined ? (
        <View style={styles.centerState}>
          <View style={[styles.brandMark, styles.loaderMark]}><BrandMark width={26} /></View>
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
    experimental_backgroundImage: 'radial-gradient(ellipse 672px 544px at 12% 12%, rgba(244, 238, 232, 0.084), transparent 72%), radial-gradient(ellipse 736px 608px at 86% 78%, rgba(244, 238, 232, 0.066), transparent 74%), linear-gradient(122deg, #181412 0%, #0d0b0a 52%, #0f0d0c 100%)',
  },
  loginContent: { flexGrow: 1, paddingBottom: 24, paddingHorizontal: 16, paddingTop: 20, position: 'relative' },
    signalBackdrop: { height: 288, left: '-6%', opacity: 0.2, overflow: 'hidden', position: 'absolute', top: 544, transform: [{ rotate: '-4deg' }, { scaleY: 1.02 }], width: '112%' },
  brandRow: { alignItems: 'center', flexDirection: 'row', marginBottom: 18.4 },
  brandMark: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 17, 16, 0.68)',
    borderColor: 'rgba(244, 238, 232, 0.18)',
    borderRadius: 8,
    borderWidth: 1,
    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.16)',
    experimental_backgroundImage: 'linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.045))',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  // Same box as the web loader (.puls-loader).
  loaderMark: { height: 44, width: 44 },
  brandName: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 15, marginLeft: 12 },
  hero: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 35.2, letterSpacing: 0, lineHeight: 34.496 },
  heroAccent: { color: colors.accentText, fontFamily: 'InstrumentSans_700Bold', fontSize: 35.2, letterSpacing: -1.584, lineHeight: 34.496, marginLeft: 9.152 },
  lead: { color: 'rgba(244, 238, 232, 0.7)', fontFamily: 'InstrumentSans_400Regular', fontSize: 14.4, lineHeight: 22.3, marginTop: 12 },
  formDivider: { backgroundColor: colors.lineStrong, height: 1, marginBottom: 20, marginTop: 20 },
  formDividerFocused: { backgroundColor: 'rgba(244, 238, 232, 0.5)' },
  formTitle: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 29.6, lineHeight: 29.6 },
  form: { marginTop: 51.84 },
  label: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 12, lineHeight: 16, marginBottom: 4 },
  passwordLabel: { marginTop: 16 },
  inputSurface: {
    backgroundColor: 'rgba(13, 11, 10, 0.16)',
    experimental_backgroundImage: 'linear-gradient(180deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.03))',
    borderColor: 'rgba(244, 238, 232, 0.13)',
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
  inputFocused: { borderColor: colors.accentText, boxShadow: '0 0 0 3px rgba(244, 238, 232, 0.144)' },
  loginError: { color: colors.warning, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, lineHeight: 18, marginTop: 4 },
  omittedAuthActionSpace: { height: 49 },
  button: { alignItems: 'center', borderRadius: 8, justifyContent: 'center', minHeight: 48, marginTop: 15, paddingHorizontal: 18 },
  buttonPrimary: {
    backgroundColor: colors.primaryEnd,
    boxShadow: '0 6px 8px rgba(244, 238, 232, 0.108), inset 0 1px 0 rgba(255, 255, 255, 0.18)',
    experimental_backgroundImage: primaryGradient,
  },
  buttonSecondary: { backgroundColor: colors.surfaceRaised, borderColor: colors.lineStrong, borderWidth: 1, minWidth: 140 },
  buttonDisabled: { opacity: 0.55 },
  buttonPressed: { opacity: 0.82 },
  buttonText: { color: colors.onPrimary, fontFamily: 'InstrumentSans_700Bold', fontSize: 14 },
  buttonSecondaryText: { color: colors.text },
  error: { color: colors.accent, fontFamily: 'InstrumentSans_500Medium', fontSize: 14, lineHeight: 20, marginTop: 6 },
  sessionContent: {
    flexGrow: 1,
    paddingBottom: 128,
  },
  sessionShell: { flex: 1, backgroundColor: colors.background },
  lifecycleBar: { backgroundColor: '#0f0d0c', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, height: 69, zIndex: 4 },
  lifecycleBarInner: { alignItems: 'center', flexDirection: 'row', height: 69, paddingHorizontal: 16 },
  logoutError: { color: colors.warning, fontFamily: 'InstrumentSans_500Medium', fontSize: 13, lineHeight: 19, paddingHorizontal: 16, paddingVertical: 10 },
  centerState: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 420, paddingHorizontal: 20, gap: 12 },
  stateTitle: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 22, textAlign: 'center' },
  stateCopy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  elapsed: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 20, lineHeight: 28, fontVariant: ['tabular-nums'] },
  workoutLabelsTitle: { color: colors.muted, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 11, letterSpacing: 0.4, paddingHorizontal: 16, paddingTop: 10 },
  workoutLabelsBand: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, height: 52 },
  syncInline: { color: colors.mutedSoft, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 11, lineHeight: 18, height: 18, textAlign: 'right', paddingHorizontal: 16 },
  previewCopy: { color: colors.mutedSoft, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, textAlign: 'center', paddingVertical: 8 },
  lookupText: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, lineHeight: 18 },
  lookupAction: { minHeight: 44, justifyContent: 'center' },
  setCellDone: { opacity: 0.7 },
  signalFocused: { opacity: 0.28, transform: [{ translateX: -9.6 }, { translateY: -5.6 }, { rotate: '-3deg' }, { scaleY: 1.08 }] },
  staleNotice: { backgroundColor: colors.surface, borderColor: colors.lineStrong, borderWidth: 1, borderRadius: 16, marginHorizontal: 16, marginTop: 14, paddingHorizontal: 12, paddingVertical: 10 },
  staleTitle: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 13 },
  staleCopy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, lineHeight: 17, marginTop: 3 },
  syncNotice: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, marginHorizontal: 16, paddingHorizontal: 4, paddingVertical: 10 },
  syncTitle: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 13, lineHeight: 18 },
  syncCopy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, lineHeight: 17, marginTop: 2 },
  syncAction: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44, paddingRight: 16 },
  syncActionText: { color: colors.accentText, fontFamily: 'InstrumentSans_700Bold', fontSize: 12 },
  exerciseStack: { paddingHorizontal: 16, paddingTop: 4 },
  exerciseCard: { paddingBottom: 4 },
  exerciseHeadRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8 },
  exerciseHeading: { alignItems: 'center', flex: 1, flexDirection: 'row', minHeight: 44 },
  // .workout-danger-action: 0.4rem 0.65rem padding, 0.76rem/700, muted.
  deleteExercise: { alignItems: 'center', flexDirection: 'row', gap: 5.6, justifyContent: 'center', minHeight: 44, paddingHorizontal: 10.4 },
  headingPressed: { opacity: 0.72 },
  exerciseMeta: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, lineHeight: 20, marginTop: 2 },
  exerciseName: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 30, lineHeight: 34, letterSpacing: -0.78 },
  exerciseCompact: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, lineHeight: 20 },
  exercisePosition: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, lineHeight: 20 },
  collapsedRow: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  collapsedName: { color: colors.text, flex: 1, fontFamily: 'InstrumentSans_400Regular', fontSize: 15 },
  hint: { alignItems: 'center', flexDirection: 'row', gap: 4, marginTop: 4, minHeight: 44 },
  hintText: { color: colors.muted, flex: 1, fontFamily: 'InstrumentSans_400Regular', fontSize: 14 },
  hintApply: { backgroundColor: colors.choiceSelected, borderRadius: 10, height: 36, justifyContent: 'center', paddingHorizontal: 13 },
  hintApplyText: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14 },
  hintClose: { alignItems: 'center', height: 44, justifyContent: 'center', marginRight: -12, width: 44 },
  upNext: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14, marginBottom: 4, marginTop: 12 },
  addExerciseText: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14 },
  setRowCurrent: { backgroundColor: 'rgba(244, 238, 232, 0.1)', borderRadius: 11 },
  setNow: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 16, fontVariant: ['tabular-nums'], textAlign: 'center' },
  sessionTop: { paddingHorizontal: 16, paddingTop: 10 },
  band: { height: 176, left: 0, position: 'absolute', right: 0, top: -64 },
  bandImage: { height: '100%', opacity: 0.7, resizeMode: 'cover', width: '100%' },
  bandFade: { ...StyleSheet.absoluteFill, experimental_backgroundImage: `linear-gradient(180deg, ${colors.background}8c, ${colors.background})` },
  segs: { flexDirection: 'row', gap: 4, marginBottom: 14 },
  seg: { backgroundColor: 'rgba(255, 255, 255, 0.12)', borderRadius: 2, flex: 1, height: 3, overflow: 'hidden' },
  segCurrent: { backgroundColor: 'rgba(244, 238, 232, 0.36)' },
  segFill: { backgroundColor: colors.seam, height: '100%' },
  sessionContentPanel: { paddingBottom: 248 },
  panel: { backgroundColor: colors.surfaceRaised, borderTopLeftRadius: 22, borderTopRightRadius: 22, bottom: 0, boxShadow: '0 -18px 40px -14px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.07)', experimental_backgroundImage: `linear-gradient(180deg, ${colors.surfaceHigh}, ${colors.surfaceRaised})`, left: 0, paddingHorizontal: 16, paddingTop: 12, position: 'absolute', right: 0 },
  panelStatus: { alignItems: 'center', flexDirection: 'row', marginBottom: 6, minHeight: 44, paddingHorizontal: 2 },
  panelStatusText: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 15 },
  panelNums: { alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 12 },
  panelNum: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 2 },
  panelDivider: { backgroundColor: colors.line, height: 44, width: 1 },
  panelValue: { alignItems: 'center', flex: 1, minWidth: 0 },
  panelInput: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 21, fontVariant: ['tabular-nums'], letterSpacing: -0.42, minWidth: 0, padding: 0, textAlign: 'center', width: '100%' },
  panelUnit: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 12 },
  panelStep: { alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.09)', borderRadius: 12, boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)', height: 44, justifyContent: 'center', width: 44 },
  panelStepText: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 13, fontVariant: ['tabular-nums'] },
  panelAction: { alignItems: 'center', backgroundColor: colors.primaryEnd, borderRadius: 15, boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.5), 0 2px 8px rgba(0, 0, 0, 0.35)', experimental_backgroundImage: primaryGradient, height: 52, justifyContent: 'center' },
  panelActionText: { color: colors.onPrimary, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 16 },
  restTrack: { height: 2, left: 6, position: 'absolute', right: 6, top: -6 },
  restFill: { backgroundColor: colors.seam, height: '100%' },
  restLabel: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, marginRight: 8 },
  restValue: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 22, fontVariant: ['tabular-nums'], letterSpacing: -0.35 },
  restAction: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 8 },
  restActionText: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14 },
  chevron: { height: 18, marginLeft: 12, transform: [{ rotate: '0deg' }], width: 18 },
  chevronExpanded: { transform: [{ rotate: '180deg' }] },
  setGrid: { alignItems: 'center', flexDirection: 'row', gap: 5.6, minHeight: 47.2 },
  setHeaderGrid: { minHeight: 18 },
  setToggleColumn: { width: 44, flexShrink: 0 },
  // Proportional bases preserve CSS .9fr/1fr sizing even at the weight column minimum.
  setPreviousColumn: { flexBasis: 48.96, flexGrow: 0.9, flexShrink: 1, minWidth: 0 },
  setWeightColumn: { flexBasis: 54.4, flexGrow: 1, flexShrink: 0, minWidth: 54.4 },
  setRepsColumn: { width: 52, flexShrink: 0 },
  setTrailingColumn: { width: 44, flexShrink: 0 },
  setTouchTarget: { alignItems: 'center', height: 44, justifyContent: 'center' },
  weightInputColumn: { flexBasis: 54.4, flexGrow: 1, flexShrink: 0, minWidth: 54.4 },
  repsInputColumn: { width: 52, flexShrink: 0 },
  setHeaderCell: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  setToggle: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 16, lineHeight: 24, textAlign: 'center', width: 44 },
  setToggleCurrent: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold' },
  setCellMuted: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, lineHeight: 18, textAlign: 'center', fontVariant: ['tabular-nums'] },
  setCellValue: { color: colors.text, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, fontVariant: ['tabular-nums'], lineHeight: 44, textAlign: 'center' },
  setCellCurrent: { borderBottomColor: colors.lineStrong, borderBottomWidth: StyleSheet.hairlineWidth },
  setInput: { borderBottomColor: colors.lineStrong, borderBottomWidth: 1, color: colors.text, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, fontVariant: ['tabular-nums'], height: 44, lineHeight: 21, paddingHorizontal: 4, paddingVertical: 8, textAlign: 'center' },
  setInputDone: { borderBottomColor: 'transparent', opacity: 0.7 },
  setStepperPressed: { backgroundColor: 'rgba(244, 238, 232, 0.072)', opacity: 0.9 },
  addSetButton: { alignItems: 'center', backgroundColor: 'rgba(38, 33, 30,0.76)', borderRadius: 8, justifyContent: 'center', minHeight: 44, marginTop: 4 },
  addSetContent: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center' },
  addSetText: { color: colors.text, fontFamily: 'InstrumentSans_700Bold', fontSize: 12, lineHeight: 18 },
  omittedSetAdjustmentsSpace: { height: 52 },
  // Web: rounded-xl px-5 text-sm font-bold min-h-11 with the primary gradient.
  finishButton: { alignItems: 'center', borderRadius: 12, justifyContent: 'center', marginLeft: 8, minHeight: 44, paddingHorizontal: 20 },
  minimizeButton: { alignItems: 'center', flexDirection: 'row', gap: 5, minHeight: 44, paddingHorizontal: 2 },
  minimizeText: { color: colors.text, fontFamily: 'InstrumentSans_700Bold', fontSize: 12 },
  minimizeHint: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 11 },
  finishButtonText: { color: colors.onPrimary, fontFamily: 'InstrumentSans_700Bold', fontSize: 14, lineHeight: 20 },
  optionsTrigger: { alignItems: 'center', borderRadius: 8, height: 44, justifyContent: 'center', width: 44 },
  optionsMenu: { backgroundColor: colors.surfaceRaised, borderColor: colors.lineStrong, borderRadius: 8, borderWidth: 1, boxShadow: '0 12px 32px rgba(0, 0, 0, 0.42)', padding: 5.6, position: 'absolute', right: 16 },
  optionsItem: { borderRadius: 5, justifyContent: 'center', minHeight: 44, paddingHorizontal: 13.6, paddingVertical: 10.4 },
  optionsItemPressed: { backgroundColor: 'rgba(240, 167, 90, 0.10)' },
  optionsItemText: { color: colors.warning, fontFamily: 'InstrumentSans_700Bold', fontSize: 14, lineHeight: 20 },
  optionsItemNeutral: { color: colors.text },
  closureNotice: { backgroundColor: colors.surface, borderColor: colors.warning, borderRadius: 16, borderWidth: 1, gap: 4, marginHorizontal: 16, marginTop: 14, padding: 16 },
  closureAction: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 8, justifyContent: 'center', marginTop: 8, minHeight: 44, paddingHorizontal: 16 },
  closureActionText: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 14 },
  omittedWorkoutActionsSpace: { height: 49 },
  // .workout-primary-action: full width, 3rem tall, 0.9rem/700.
  primaryAction: { alignItems: 'center', borderRadius: 8, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 48 },
  primaryActionText: { color: colors.onPrimary, fontFamily: 'InstrumentSans_700Bold', fontSize: 14.4, lineHeight: 20 },
  inlineAddExercise: { marginTop: 8, justifyContent: 'flex-start', minHeight: 44 },
  emptyWorkout: { borderBottomColor: colors.lineStrong, borderBottomWidth: 1, borderTopColor: colors.lineStrong, borderTopWidth: 1, paddingVertical: 22.4 },
  emptyWorkoutAction: { maxWidth: 320, width: '100%' },
  resumePanel: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 8, borderWidth: 1, margin: 16, padding: 24 },
  resumeEyebrow: { color: colors.accent, fontFamily: 'InstrumentSans_700Bold', fontSize: 12, marginBottom: 8 },
  resumeTitle: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 24, lineHeight: 26.4 },
  resumeCopy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, lineHeight: 24, marginTop: 12 },
  resumeActions: { gap: 12, marginTop: 24 },
  quickStart: { marginTop: 21.6 },
  quickStartTitle: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 14.72, marginBottom: 11.2 },
  quickPickList: { borderTopColor: colors.line, borderTopWidth: 1 },
  quickPick: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: 1, flexDirection: 'row', gap: 16, justifyContent: 'space-between', minHeight: 57.6, paddingVertical: 12 },
  quickPickCopy: { flexShrink: 1, gap: 2.88 },
  quickPickName: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 14.4 },
  quickPickMeta: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 11.84 },
  quickPickAction: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 12.8 },
  labelTabs: { paddingRight: 32 },
  labelTab: { borderBottomColor: 'transparent', borderBottomWidth: 2, justifyContent: 'center', minHeight: 44, paddingHorizontal: 12 },
  labelTabActive: { borderBottomColor: colors.accent },
  labelTabText: { color: colors.muted, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 12, lineHeight: 18 },
  labelTabTextActive: { color: colors.accentText },
  pickerPressed: { backgroundColor: 'rgba(255, 255, 255, 0.035)' },

})
