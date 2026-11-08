import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import type { NextSessionRecommendation } from '../../src/shared/nextSessionRecommendation'
import type { ReadinessController, ReadinessState, ReadinessValues } from './readiness'
import { colors } from './theme'
import { Icon } from './icons'

const TIME_BUDGETS = [45, 30, 20] as const
const minutes = (sec: number) => Math.round(sec / 60)

// Soreness runs the other way from sleep and mood, so every step names its meaning.
const FIELDS: { key: keyof ReadinessValues; label: string; words: [string, string, string, string, string] }[] = [
  { key: 'sleep', label: 'Sleep', words: ['Poor', 'Restless', 'Okay', 'Good', 'Great'] },
  { key: 'mood', label: 'Mood', words: ['Bad', 'Low', 'Okay', 'Good', 'Great'] },
  { key: 'soreness', label: 'Soreness', words: ['None', 'Light', 'Some', 'Sore', 'Severe'] },
]

// Each tap saves today's entry, so the check-in never stands between the user and Start.
export function TrainCheckIn({ state, controller, open, onToggle }: { state: ReadinessState; controller: ReadinessController; open: boolean; onToggle: () => void }) {
  if (state.status === 'loading') return <View style={styles.loading}><ActivityIndicator color={colors.muted} accessibilityLabel="Loading check-in" /></View>
  if (state.status !== 'ready') return <View accessibilityRole="alert" style={styles.error}>
    <Text style={styles.note}>{state.message ?? 'Could not load the check-in.'}</Text>
    <Pressable accessibilityRole="button" onPress={() => void controller.load(true)} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable>
  </View>
  const { entry, values } = state
  const act = open ? 'Close' : entry ? 'Change' : 'Check in'
  return <View>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${entry ? `Sleep ${entry.sleep}, Mood ${entry.mood}, Soreness ${entry.soreness}` : 'How’s today? Sleep, mood, soreness'}. ${act}`} onPress={onToggle} style={styles.summary}>
      <Text numberOfLines={1} style={styles.line}>{entry ? `Sleep ${entry.sleep} · Mood ${entry.mood} · Soreness ${entry.soreness}` : <>How’s today? <Text style={styles.lineSoft}>Sleep, mood, soreness</Text></>}</Text>
      <Text style={styles.act}>{act}</Text>
      <Icon name={open ? 'chevron-down' : 'chevron-up'} size={16} color={colors.muted} />
    </Pressable>
    {open && values && <View style={styles.body}>
      {FIELDS.map(({ key, label, words }) => <View key={key} style={styles.scale}>
        <View style={styles.legend}><Text style={styles.legendLabel}>{label}</Text><Text style={styles.legendWord}>{words[values[key] - 1]}</Text></View>
        <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.keys}>
          {words.map((word, index) => {
            const checked = values[key] === index + 1
            return <Pressable key={word} accessibilityRole="radio" accessibilityState={{ checked }} accessibilityLabel={`${label} ${index + 1} of 5, ${word}`} onPress={() => void controller.choose({ ...values, [key]: index + 1 })} style={[styles.key, checked && styles.keyChecked]}>
              <Text style={[styles.keyText, checked && styles.keyTextChecked]}>{index + 1}</Text>
            </Pressable>
          })}
        </View>
      </View>)}
      <Text accessibilityLiveRegion="polite" style={styles.note}>{state.busy ? 'Saving…' : state.message ?? (entry ? 'Saved for today' : 'Tap to save for today')}</Text>
      {state.pending && !state.busy && <Pressable accessibilityRole="button" onPress={() => void controller.reconcile()} style={styles.retry}><Text style={styles.retryText}>Check save outcome</Text></Pressable>}
    </View>}
  </View>
}

// The dock's time row, today's line and the switch: what Start launches, before it is pressed.
export function TrainTime({ today, plannedSets, budgetMin, straight, onBudget, onStraight }: {
  today: NextSessionRecommendation; plannedSets: number; budgetMin: number | null; straight: boolean
  onBudget: (budgetMin: number | null) => void; onStraight: (straight: boolean) => void
}) {
  const approx = today.calibration.source === 'none' ? '~' : ''
  const { compression } = today
  const usual = minutes(compression.fullEstimateSec)
  const shorter = TIME_BUDGETS.filter((budget) => budget < usual)
  const kept = compression.sets.reduce((sum, sets) => sum + sets, 0)
  const grouped = compression.blocks.some((block) => block.group && block.items.filter((item) => item.sets > 0).length > 1)
  return <>
    {(shorter.length > 0 || budgetMin !== null) && <View accessibilityRole="radiogroup" accessibilityLabel="Time today" style={styles.time}>
      <Pressable accessibilityRole="radio" accessibilityState={{ checked: budgetMin === null }} onPress={() => onBudget(null)} style={[styles.timeButton, styles.timeUsual, budgetMin === null && styles.timeChecked]}>
        <Text style={[styles.timeText, budgetMin === null && styles.timeTextChecked]}>Usual <Text style={budgetMin === null ? styles.timeSoftChecked : styles.timeSoft}>{approx}{usual} min</Text></Text>
      </Pressable>
      {shorter.map((budget) => <Pressable key={budget} accessibilityRole="radio" accessibilityState={{ checked: budgetMin === budget }} onPress={() => onBudget(budget)} style={[styles.timeButton, budgetMin === budget && styles.timeChecked]}>
        <Text style={[styles.timeText, budgetMin === budget && styles.timeTextChecked]}>{budget} min</Text>
      </Pressable>)}
    </View>}
    {budgetMin !== null && !compression.fits
      ? <Text accessibilityLiveRegion="polite" style={styles.todayLine}><Text style={styles.todayStrong}>Doesn’t fit in {budgetMin} min.</Text> The shortest version takes {approx}{minutes(compression.estimateSec)} min.</Text>
      : today.record && <Text style={styles.todayLine}><Text style={styles.todayStrong}>{approx}{minutes(compression.estimateSec)} min</Text> · {kept} of {plannedSets} sets · Same weights</Text>}
    {budgetMin !== null && compression.fits && (grouped || straight) && <Pressable accessibilityRole="switch" accessibilityState={{ checked: straight }} accessibilityLabel="Without supersets" onPress={() => onStraight(!straight)} style={styles.switchRow}>
      <Text style={styles.switchText}>Without supersets</Text>
      <View style={[styles.track, straight && styles.trackOn]}><View style={[styles.thumb, straight && styles.thumbOn]} /></View>
    </Pressable>}
  </>
}

const styles = StyleSheet.create({
  loading: { minHeight: 44, justifyContent: 'center' },
  error: { padding: 12, borderRadius: 15, backgroundColor: 'rgba(255, 255, 255, 0.06)', gap: 4 },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 4 }, retryText: { color: colors.accentText, fontFamily: 'InstrumentSans_700Bold', fontSize: 13 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 4 },
  line: { flex: 1, minWidth: 0, color: colors.text, fontFamily: 'InstrumentSans_500Medium', fontSize: 14, fontVariant: ['tabular-nums'] },
  lineSoft: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular' },
  act: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14 },
  body: { gap: 6, paddingTop: 4 },
  scale: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4 },
  legend: { flex: 1, minWidth: 0 }, legendLabel: { color: colors.text, fontFamily: 'InstrumentSans_500Medium', fontSize: 14, lineHeight: 18 }, legendWord: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, lineHeight: 15 },
  keys: { flexDirection: 'row', gap: 4 },
  key: { width: 44, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: 'rgba(255, 255, 255, 0.09)', boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' },
  keyChecked: { backgroundColor: 'rgba(255, 255, 255, 0.2)', boxShadow: `inset 0 0 0 1.5px ${colors.text}, 0 2px 6px rgba(0, 0, 0, 0.35)` },
  keyText: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 13, fontVariant: ['tabular-nums'] }, keyTextChecked: { color: colors.textStrong },
  note: { marginTop: 2, color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, lineHeight: 20 },
  time: { flexDirection: 'row', gap: 4 },
  timeButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: 12, backgroundColor: 'rgba(255, 255, 255, 0.07)', boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' },
  timeUsual: { flex: 1.6 }, timeChecked: { backgroundColor: colors.accent, boxShadow: '0 2px 6px rgba(0, 0, 0, 0.35)' },
  timeText: { color: colors.text, fontFamily: 'InstrumentSans_500Medium', fontSize: 14, fontVariant: ['tabular-nums'] }, timeTextChecked: { color: colors.onPrimary },
  timeSoft: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular' }, timeSoftChecked: { color: colors.onPrimary, opacity: 0.72, fontFamily: 'InstrumentSans_400Regular' },
  todayLine: { paddingTop: 6, paddingHorizontal: 4, color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, lineHeight: 21, fontVariant: ['tabular-nums'] },
  todayStrong: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44, paddingHorizontal: 4 },
  switchText: { color: colors.text, fontFamily: 'InstrumentSans_400Regular', fontSize: 14 },
  track: { width: 36, height: 20, borderRadius: 999, backgroundColor: colors.surfaceHigh }, trackOn: { backgroundColor: colors.accent },
  thumb: { position: 'absolute', top: 3, left: 3, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.muted }, thumbOn: { backgroundColor: colors.surface, transform: [{ translateX: 16 }] },
})
