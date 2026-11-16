import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { planCut, type CutChoice, type CutPlan } from '../../src/shared/sessionCut'
import { pluralize } from '../../src/lib/pluralize'
import type { ActiveWorkout } from './session'
import { colors, primaryGradient } from './theme'
import { Icon } from './icons'

const LEFT = [30, 20, 15, 10] as const
const STEP_MS = 5 * 60_000
const minutes = (sec: number) => Math.round(sec / 60)
const clockLabel = (at: number) => { const date = new Date(at); return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}` }

type Pick = { kind: 'left'; min: number } | { kind: 'clock'; at: number } | null

// „Short on time”, the same sheet as web: the time left, a preview of the rest and one tap that cuts it.
export function SessionCut({ session, disabled, onCut, onFinish, close }: {
  session: ActiveWorkout
  disabled: boolean
  onCut: (plan: CutPlan, choice: CutChoice, now: number) => void
  onFinish: () => void
  close: (after?: () => void) => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const [pick, setPick] = useState<Pick>(null)
  const [straight, setStraight] = useState(false)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(timer)
  }, [])

  const choiceAt = (time: number): CutChoice => ({
    leftMin: pick === null ? null : pick.kind === 'left' ? pick.min : Math.max(0, Math.floor((pick.at - time) / 60_000)),
    clock: pick?.kind === 'clock',
    straight,
  })
  const base = planCut(session, { leftMin: null, clock: false, straight: false }, now)
  const remaining = minutes(base.result.fullEstimateSec)
  const choice = choiceAt(now)
  const passed = choice.leftMin !== null && choice.leftMin < 1
  const plan = choice.leftMin !== null && !passed ? planCut(session, choice, now) : null
  const shorter = LEFT.filter((left) => left < remaining)
  const defaultClock = Math.floor((now + base.result.fullEstimateSec * 1000) / STEP_MS) * STEP_MS
  const clockAt = pick?.kind === 'clock' ? pick.at : defaultClock
  const grouped = plan?.groups.some((group, index) => group && group !== session.exercises[index]?.group) ?? false
  const apply = () => {
    const time = Date.now()
    onCut(planCut(session, choiceAt(time), time), choiceAt(time), time)
    close()
  }

  return <View style={styles.body}>
    <Text style={styles.lead}>~{remaining} min of work left · {base.openBefore} {pluralize(base.openBefore, 'set', 'sets')}</Text>
    {passed ? <Text accessibilityLiveRegion="polite" style={styles.line}>That time has passed.</Text>
      : plan && !plan.changed && plan.result.fits ? <Text accessibilityLiveRegion="polite" style={styles.line}><Text style={styles.strong}>You have time.</Text> The rest takes ~{minutes(plan.result.estimateSec)} min.</Text>
      : plan && plan.openAfter === 0 ? <Text accessibilityLiveRegion="polite" style={styles.line}><Text style={styles.strong}>Nothing more fits.</Text> Finish here.</Text>
      : plan && !plan.result.fits ? <Text accessibilityLiveRegion="polite" style={styles.line}><Text style={styles.strong}>Doesn’t fit in {choice.leftMin} min.</Text> The shortest finish takes ~{minutes(plan.result.estimateSec)} min.</Text>
      : plan ? <Text accessibilityLiveRegion="polite" style={styles.line}><Text style={styles.strong}>~{minutes(plan.result.estimateSec)} min</Text> · {plan.openAfter} of {plan.openBefore} sets left · Same weights</Text>
      : null}

    {plan?.changed && plan.openAfter > 0 && <CutPreview session={session} plan={plan} />}

    {plan?.changed && (grouped || straight) && <Pressable accessibilityRole="switch" accessibilityState={{ checked: straight }} accessibilityLabel="Without supersets" onPress={() => setStraight(!straight)} style={styles.switchRow}>
      <Text style={styles.switchText}>Without supersets</Text>
      <View style={[styles.track, straight && styles.trackOn]}><View style={[styles.thumb, straight && styles.thumbOn]} /></View>
    </Pressable>}

    <View accessibilityRole="radiogroup" accessibilityLabel="Time left" style={styles.time}>
      {shorter.map((left) => {
        const checked = pick?.kind === 'left' && pick.min === left
        return <Pressable key={left} accessibilityRole="radio" accessibilityState={{ checked }} onPress={() => setPick({ kind: 'left', min: left })} style={[styles.timeButton, checked && styles.timeChecked]}>
          <Text style={[styles.timeText, checked && styles.timeTextChecked]}>{left} min</Text>
        </Pressable>
      })}
    </View>
    <View style={styles.clock}>
      <Text style={styles.clockLabel}>Finish by</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Five minutes earlier" onPress={() => setPick({ kind: 'clock', at: clockAt - STEP_MS })} style={styles.step}><Icon name="minus" size={16} color={colors.text} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: pick?.kind === 'clock' }} accessibilityLabel={`Finish by ${clockLabel(clockAt)}`} onPress={() => setPick({ kind: 'clock', at: clockAt })}
        style={[styles.step, styles.clockTime, pick?.kind === 'clock' && styles.timeChecked]}>
        <Text style={[styles.timeText, pick?.kind === 'clock' && styles.timeTextChecked]}>{clockLabel(clockAt)}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Five minutes later" onPress={() => setPick({ kind: 'clock', at: clockAt + STEP_MS })} style={styles.step}><Icon name="plus" size={16} color={colors.text} /></Pressable>
    </View>

    {/* The time controls and the button stay put under the thumb; what changes grows above them. */}
    <View style={styles.actions}>
      {plan?.changed && !plan.result.fits && plan.openAfter > 0 && <Pressable accessibilityRole="button" disabled={disabled} onPress={() => close(onFinish)} style={({ pressed }) => [styles.action, styles.actionQuiet, pressed && styles.pressed]}>
        <Text style={[styles.actionText, styles.actionQuietText]}>Finish</Text>
      </Pressable>}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || !plan?.changed }} disabled={disabled || !plan?.changed} onPress={apply} style={({ pressed }) => [styles.action, styles.actionPrimary, (disabled || !plan?.changed) && styles.disabled, pressed && styles.pressed]}>
        <Text style={styles.actionText}>{plan?.changed && plan.openAfter === 0 ? 'End here' : 'Shorten the rest'}</Text>
      </Pressable>
    </View>
  </View>
}

function CutPreview({ session, plan }: { session: ActiveWorkout; plan: CutPlan }) {
  const open = (index: number) => plan.after[index]! - plan.done[index]!
  const row = (index: number) => <View key={index} style={styles.row}>
    <Text numberOfLines={1} style={styles.rowName}>{session.exercises[index]!.name}</Text>
    <Text style={styles.rowMeta}>{open(index)} {pluralize(open(index), 'set', 'sets')}</Text>
  </View>
  const seen = new Set<string>()
  const rows = session.exercises.flatMap((_, index) => {
    if (open(index) <= 0) return []
    const group = plan.groups[index]
    if (!group) return [row(index)]
    if (seen.has(group)) return []
    seen.add(group)
    const members = session.exercises.flatMap((__, at) => (plan.groups[at] === group && open(at) > 0 ? [at] : []))
    if (members.length < 2) return [row(index)]
    const rounds = Math.max(...members.map(open))
    return [<View key={group} style={styles.group}>
      <Text style={styles.groupLabel}>{members.length === 2 ? 'Superset' : 'Circuit'} · {rounds} {rounds === 1 ? 'round' : 'rounds'}</Text>
      {members.map(row)}
    </View>]
  })
  return <View style={styles.list}>
    {rows}
    {session.exercises.map((exercise, index) => open(index) <= 0 && plan.before[index]! > plan.done[index]! ? <View key={`skipped:${index}`} accessibilityLabel={`${exercise.name}, skipped today`} style={styles.row}>
      <Text numberOfLines={1} style={[styles.rowName, styles.skippedName]}>{exercise.name}</Text>
      <Text style={[styles.rowMeta, styles.skipped]}>Skipped today</Text>
    </View> : null)}
  </View>
}

const styles = StyleSheet.create({
  body: { gap: 8, paddingBottom: 4 },
  lead: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, fontVariant: ['tabular-nums'], marginTop: -4 },
  time: { flexDirection: 'row', gap: 4 },
  timeButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: 12, backgroundColor: 'rgba(255, 255, 255, 0.07)', boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' },
  timeChecked: { backgroundColor: colors.accent, boxShadow: '0 2px 6px rgba(0, 0, 0, 0.35)' },
  timeText: { color: colors.text, fontFamily: 'InstrumentSans_500Medium', fontSize: 14, fontVariant: ['tabular-nums'] }, timeTextChecked: { color: colors.onPrimary },
  clock: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingLeft: 4 },
  clockLabel: { flex: 1, color: colors.text, fontFamily: 'InstrumentSans_400Regular', fontSize: 14 },
  step: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: 'rgba(255, 255, 255, 0.07)' },
  clockTime: { minWidth: 76, paddingHorizontal: 12 },
  line: { paddingTop: 6, paddingHorizontal: 4, color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, lineHeight: 21, fontVariant: ['tabular-nums'] },
  strong: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold' },
  list: { paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  rowName: { flex: 1, color: colors.text, fontFamily: 'InstrumentSans_400Regular', fontSize: 15 },
  rowMeta: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, fontVariant: ['tabular-nums'] },
  group: { marginLeft: 2, paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: colors.lineStrong },
  groupLabel: { marginTop: 6, color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, lineHeight: 20 },
  skipped: { color: colors.mutedSoft }, skippedName: { color: colors.mutedSoft, textDecorationLine: 'line-through', textDecorationColor: colors.mutedSoft },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44, paddingHorizontal: 4 },
  switchText: { color: colors.text, fontFamily: 'InstrumentSans_400Regular', fontSize: 14 },
  track: { width: 36, height: 20, borderRadius: 999, backgroundColor: colors.surfaceHigh }, trackOn: { backgroundColor: colors.accent },
  thumb: { position: 'absolute', top: 3, left: 3, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.muted }, thumbOn: { backgroundColor: colors.surface, transform: [{ translateX: 16 }] },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  action: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 15, paddingHorizontal: 18 },
  actionPrimary: { backgroundColor: colors.primaryEnd, experimental_backgroundImage: primaryGradient },
  actionQuiet: { flexGrow: 0, flexBasis: 136, backgroundColor: 'rgba(255, 255, 255, 0.09)' },
  actionText: { color: colors.onPrimary, fontFamily: 'InstrumentSans_700Bold', fontSize: 16 }, actionQuietText: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold' },
  pressed: { opacity: 0.82 }, disabled: { opacity: 0.55 },
})
