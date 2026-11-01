import { useCallback } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { kgStringToDisplayWeight, type WeightUnits } from '../../src/shared/weightUnits'
import { mainExercise, stepsNote, workoutSteps } from '../../src/shared/workoutMoments'
import { readExerciseSteps } from './firebase'
import type { SavedWorkout } from './history'
import { colors } from './theme'
import { useSessionRead } from './useSessionRead'

export function WorkoutSteps({ uid, workout, units }: { uid: string, workout: SavedWorkout, units: WeightUnits }) {
  const exercise = mainExercise(workout)
  const exerciseId = exercise?.exerciseId
  const source = exercise?.exerciseSource ?? 'global'
  const loader = useCallback(() => readExerciseSteps(uid, exerciseId ?? '', source), [exerciseId, source, uid])
  const read = useSessionRead(`exercise-steps:${uid}:${source}:${exerciseId}`, loader, Boolean(exerciseId))

  if (!exerciseId) return null
  if (read.state.status === 'loading') return <View accessibilityElementsHidden style={styles.steps} />
  // The steps only add to the result, so a failed read leaves the rest of the screen as it is.
  const steps = read.state.status === 'ready' ? workoutSteps(workout, read.state.data) : null
  if (!steps) return null

  const formatWeight = (kg: number) => `${kgStringToDisplayWeight(String(kg), units)} ${units}`
  return <View style={styles.steps}>
    <View style={styles.head}>
      <Text numberOfLines={1} style={styles.name}>{steps.exerciseName}</Text>
      <Text style={styles.top}>{formatWeight(steps.top.weight)} × {steps.top.reps}</Text>
    </View>
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Top weight in the last ${steps.bars.length} sessions: ${steps.bars.map((bar) => formatWeight(bar.weight)).join(', ')}`}
      style={styles.bars}
    >
      {steps.bars.map((bar) => <View
        key={bar.key}
        style={[styles.bar, { height: `${bar.height * 100}%` }, bar.current && styles.current, bar.current && steps.best && styles.record]}
      />)}
    </View>
    <Text style={styles.note}>{stepsNote(steps, formatWeight)}</Text>
  </View>
}

const styles = StyleSheet.create({
  steps: { gap: 8, minHeight: 120, marginBottom: 16 },
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  name: { flex: 1, color: colors.text, fontFamily: 'InstrumentSans_500Medium', fontSize: 15 },
  top: { color: colors.text, fontFamily: 'InstrumentSans_500Medium', fontSize: 15, fontVariant: ['tabular-nums'] },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 56 },
  bar: { flex: 1, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: colors.surfaceHigh },
  current: { backgroundColor: 'transparent', experimental_backgroundImage: `linear-gradient(180deg, ${colors.accent}, ${colors.accent}73)` },
  record: { borderTopWidth: 2.5, borderTopColor: colors.seam },
  note: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14 },
})
