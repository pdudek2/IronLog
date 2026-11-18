import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { NextSessionRecommendation } from '../../src/shared/nextSessionRecommendation'
import type { ReadinessController, ReadinessState, ReadinessValues } from './readiness'
import { colors } from './theme'
import { Icon } from './icons'

const TIME_BUDGETS = [45, 30, 20] as const
const minutes = (sec: number) => Math.round(sec / 60)

// Answers saved by the one-tap rough day and its Undo: the same entry the scales wrote, so Coach and the plan read it as before.
const ROUGH: ReadinessValues = { sleep: 2, mood: 2, soreness: 4 }
const NORMAL: ReadinessValues = { sleep: 3, mood: 3, soreness: 3 }

// A quiet line under the plan instead of a survey: one tap takes a set off each exercise, one tap brings it back.
export function RoughDay({ state, controller, rough }: { state: ReadinessState; controller: ReadinessController; rough: boolean }) {
  if (state.status === 'loading') return null
  if (state.status !== 'ready') return <View accessibilityRole="alert" style={styles.rough}>
    <Text style={styles.roughSoft}>{state.message ?? 'Could not load today’s check-in.'}</Text>
    <Pressable accessibilityRole="button" onPress={() => void controller.load(true)} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable>
  </View>
  const busy = state.busy
  return <View style={styles.rough}>
    <Pressable accessibilityRole="button" disabled={busy} accessibilityState={{ disabled: busy }} accessibilityLabel={rough ? 'Rough day. Undo' : 'Rough day? Ease the session'}
      onPress={() => void controller.choose(rough ? NORMAL : ROUGH)} style={({ pressed }) => [styles.roughButton, pressed && styles.pressed]}>
      <Text style={styles.roughSoft}>{rough ? 'Rough day · ' : 'Rough day? '}<Text style={styles.roughAction}>{busy ? 'Saving…' : rough ? 'Undo' : 'Ease the session'}</Text></Text>
      {!rough && !busy && <Icon name="chevron-right" size={14} color={colors.text} />}
    </Pressable>
    {state.message && <Text accessibilityRole="alert" style={styles.roughSoft}>{state.message}</Text>}
    {state.pending && !busy && <Pressable accessibilityRole="button" onPress={() => void controller.reconcile()} style={styles.retry}><Text style={styles.retryText}>Check save outcome</Text></Pressable>}
  </View>
}

// Today's time choice, its line and the switches, in the page above the plan: what Start launches, before it is pressed.
export function TrainTime({ today, plannedSets, budgetMin, straight, fullSets, onBudget, onStraight, onFullSets }: {
  today: NextSessionRecommendation; plannedSets: number; budgetMin: number | null; straight: boolean; fullSets: boolean
  onBudget: (budgetMin: number | null) => void; onStraight: (straight: boolean) => void; onFullSets: (fullSets: boolean) => void
}) {
  const approx = today.calibration.source === 'none' ? '~' : ''
  const { compression } = today
  const usual = minutes(compression.fullEstimateSec)
  const shorter = TIME_BUDGETS.filter((budget) => budget < usual)
  const kept = compression.sets.reduce((sum, sets) => sum + sets, 0)
  const grouped = compression.blocks.some((block) => block.group && block.items.filter((item) => item.sets > 0).length > 1)
  // After a break the start weights stay the usual day's and the session's first set tests them.
  const weights = today.breakDays !== null && today.exercises.some((exercise) => exercise.trial) ? 'First set is a test' : 'Same weights'
  return <>
    {today.breakDays !== null && <Text style={styles.todayLine}>{today.breakDays} days since your last workout{fullSets ? '' : ' · fewer sets today'}</Text>}
    {(shorter.length > 0 || budgetMin !== null) && <View accessibilityRole="radiogroup" accessibilityLabel="Time today" style={styles.time}>
      <Pressable accessibilityRole="radio" accessibilityState={{ checked: budgetMin === null }} onPress={() => onBudget(null)} style={[styles.timeButton, styles.timeUsual, budgetMin === null && styles.timeChecked]}>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={[styles.timeText, budgetMin === null && styles.timeTextChecked]}>Usual <Text style={budgetMin === null ? styles.timeSoftChecked : styles.timeSoft}>{approx}{usual} min</Text></Text>
      </Pressable>
      {shorter.map((budget) => <Pressable key={budget} accessibilityRole="radio" accessibilityState={{ checked: budgetMin === budget }} onPress={() => onBudget(budget)} style={[styles.timeButton, budgetMin === budget && styles.timeChecked]}>
        <Text style={[styles.timeText, budgetMin === budget && styles.timeTextChecked]}>{budget} min</Text>
      </Pressable>)}
    </View>}
    {budgetMin !== null && !compression.fits
      ? <Text accessibilityLiveRegion="polite" style={styles.todayLine}><Text style={styles.todayStrong}>Doesn’t fit in {budgetMin} min.</Text> The shortest version takes {approx}{minutes(compression.estimateSec)} min.</Text>
      : today.record ? <Text style={styles.todayLine}><Text style={styles.todayStrong}>{approx}{minutes(compression.estimateSec)} min</Text> · {kept} of {plannedSets} sets · {today.tone === 'low' && !fullSets ? 'rough day' : weights}</Text>
        : <Text style={styles.todayLine}><Text style={styles.todayStrong}>{approx}{usual} min</Text> · {plannedSets} sets · plan as written</Text>}
    {today.breakDays !== null && <Pressable accessibilityRole="switch" accessibilityState={{ checked: fullSets }} accessibilityLabel="Full sets" onPress={() => onFullSets(!fullSets)} style={styles.switchRow}>
      <Text style={styles.switchText}>Full sets</Text>
      <View style={[styles.track, fullSets && styles.trackOn]}><View style={[styles.thumb, fullSets && styles.thumbOn]} /></View>
    </Pressable>}
    {budgetMin !== null && compression.fits && (grouped || straight) && <Pressable accessibilityRole="switch" accessibilityState={{ checked: straight }} accessibilityLabel="Without supersets" onPress={() => onStraight(!straight)} style={styles.switchRow}>
      <Text style={styles.switchText}>Without supersets</Text>
      <View style={[styles.track, straight && styles.trackOn]}><View style={[styles.thumb, straight && styles.thumbOn]} /></View>
    </Pressable>}
  </>
}

const styles = StyleSheet.create({
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 4 }, retryText: { color: colors.accentText, fontFamily: 'InstrumentSans_700Bold', fontSize: 13 },
  rough: { gap: 2 },
  roughButton: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, alignSelf: 'flex-start' },
  roughSoft: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, lineHeight: 20 },
  roughAction: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold' },
  pressed: { opacity: 0.6 },
  time: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 12, backgroundColor: 'rgba(255, 255, 255, 0.05)' },
  timeButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: 9 },
  timeUsual: { flex: 1.6, paddingHorizontal: 4 }, timeChecked: { backgroundColor: colors.choiceSelected },
  timeText: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 14, fontVariant: ['tabular-nums'] }, timeTextChecked: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold' },
  timeSoft: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular' }, timeSoftChecked: { color: colors.text, fontFamily: 'InstrumentSans_400Regular' },
  todayLine: { paddingTop: 10, color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, lineHeight: 21, fontVariant: ['tabular-nums'] },
  todayStrong: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44 },
  switchText: { color: colors.text, fontFamily: 'InstrumentSans_400Regular', fontSize: 14 },
  track: { width: 36, height: 20, borderRadius: 999, backgroundColor: colors.surfaceHigh }, trackOn: { backgroundColor: colors.accent },
  thumb: { position: 'absolute', top: 3, left: 3, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.muted }, thumbOn: { backgroundColor: colors.surface, transform: [{ translateX: 16 }] },
})
