import { useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Slider from '@react-native-community/slider'
import Svg, { Circle, Text as SvgText } from 'react-native-svg'
import { computeReadinessScore } from '../../src/shared/readiness'
import type { NextSessionRecommendation } from '../../src/shared/nextSessionRecommendation'
import { kgToDisplayWeight } from '../../src/shared/weightUnits'
import { pluralize } from '../../src/lib/pluralize'
import type { ReadinessController, ReadinessState } from './readiness'

const fields = [
  { key: 'sleep', label: 'Sleep', low: 'Poor', high: 'Great' },
  { key: 'mood', label: 'Mood', low: 'Bad', high: 'Great' },
  { key: 'soreness', label: 'Soreness', low: 'None', high: 'Severe' },
] as const
const color = { text: '#f4f1f2', strong: '#fff', muted: '#a09aa0', accent: '#f0435a', accentText: '#ff7182', line: 'rgba(244,241,242,0.12)' }
const weight = (kg: number, units: 'kg' | 'lbs') => `${kgToDisplayWeight(kg, units).toLocaleString('en-US', { maximumFractionDigits: 1 })} ${units}`

export default function ReadinessHome({ state, controller, recommendation, templateName, units, starting, canStart, onStart, onEdit, onChange, prerequisiteMessage, onRetry }: {
  state: ReadinessState; controller: ReadinessController; recommendation: NextSessionRecommendation | null
  templateName: string; units: 'kg' | 'lbs'; starting: boolean; canStart: boolean; onStart: () => void; onEdit: () => void; onChange: () => void
  prerequisiteMessage: string | null; onRetry: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [preview, setPreview] = useState(false)
  const score = state.entry ? computeReadinessScore(state.entry) : null
  const toneColor = score?.tone === 'mid' ? '#f5a623' : color.accent
  const blocked = state.busy || state.pending
  const start = () => { setPreview(false); onStart() }
  const reduced = recommendation?.exercises.reduce((sum, exercise) => sum + Math.max(0, -exercise.setsDelta), 0) ?? 0
  const changed = recommendation?.exercises.filter(exercise => exercise.weightDelta !== 0).length ?? 0
  const adjustment = [reduced ? `${reduced} fewer ${pluralize(reduced, 'set', 'sets')}` : '', changed ? `${changed} ${pluralize(changed, 'weight', 'weights')} adjusted` : ''].filter(Boolean).join(' · ') || 'Plan unchanged'
  const label = recommendation?.tone === 'mid' ? 'moderate' : recommendation?.tone
  const dateLabel = new Date(`${state.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })
  return <View style={styles.wrap}>
    {state.status === 'loading' ? <View style={styles.card}><ActivityIndicator color={color.accent} accessibilityLabel="Loading readiness" /></View>
      : state.status !== 'ready' ? <View style={styles.error} accessibilityRole="alert"><Text style={styles.title}>{state.status === 'invalid' ? 'Readiness data is invalid' : state.status === 'cached' ? 'Readiness unconfirmed' : 'Could not load readiness'}</Text><Text style={styles.copy}>{state.message}</Text><Pressable accessibilityRole="button" onPress={() => void controller.load(true)} style={styles.link}><Text style={styles.linkText}>Try again</Text></Pressable></View>
      : !state.entry ? <View style={styles.card}>
        <Pressable accessibilityRole="button" accessibilityLabel="Readiness · optional. Adjust today’s workout. Check in" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={[styles.summary, expanded && styles.border]}>
          <View style={styles.flex}><Text style={styles.meta}>Readiness · optional</Text><Text style={styles.title}>Adjust today’s workout</Text><Text style={styles.meta}>Sleep, mood and soreness</Text></View><Text style={styles.meta}>{expanded ? 'Close' : 'Check in'}</Text>
        </Pressable>
        {expanded && state.values && <View style={styles.body}>
          {fields.map(({ key, label, low, high }) => <View key={key} style={styles.field}><View style={styles.row}><Text style={styles.fieldLabel}>{label}</Text><Text style={styles.fieldValue}>{state.values![key]}/5</Text></View><Slider accessibilityLabel={`Readiness: ${label}`} accessibilityValue={{ min: 1, max: 5, now: state.values![key], text: `${state.values![key]} out of 5, from 1 ${low} to 5 ${high}` }} minimumValue={1} maximumValue={5} step={1} value={state.values![key]} disabled={blocked} minimumTrackTintColor={color.accent} maximumTrackTintColor="#37343a" thumbTintColor={color.accent} onValueChange={value => controller.change({ ...state.values!, [key]: value })} style={styles.slider} /><View style={styles.row}><Text style={styles.scale}>{low}</Text><Text style={styles.scale}>{high}</Text></View></View>)}
          <Pressable accessibilityRole="button" disabled={blocked} onPress={() => void controller.save()} style={[styles.primary, blocked && styles.disabled]}><Text style={styles.primaryText}>{state.busy ? 'Saving…' : 'Save score'}</Text></Pressable>
        </View>}
      </View> : !recommendation && score ? <View style={[styles.card, styles.saved]}>
        <Text style={styles.eyebrow}>READINESS</Text><View style={styles.row}>
          <Svg width={62} height={62} viewBox="0 0 100 100" accessibilityLabel={`Readiness ${score.score} out of 100`}><Circle cx={50} cy={50} r={40} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={8} /><Circle cx={50} cy={50} r={40} fill="none" stroke={toneColor} strokeWidth={8} strokeLinecap="round" strokeDasharray={2 * Math.PI * 40} strokeDashoffset={2 * Math.PI * 40 * (1 - score.score / 100)} rotation={-90} origin="50,50" /><SvgText x={50} y={54} textAnchor="middle" fill="white" fontSize={22} fontWeight="700">{score.score}</SvgText></Svg>
          <View style={styles.flex}><Text style={styles.savedTitle}>{score.label}</Text><Text style={styles.meta}>today’s score</Text><View style={styles.values}>{fields.map(({ key, label }) => <View key={key} style={styles.flex}><Text style={styles.meta}>{label}</Text><Text style={styles.fieldLabel}>{state.entry![key]}/5</Text><View style={styles.track}><View style={{ height: 4, width: `${state.entry![key] / 5 * 100}%`, backgroundColor: toneColor }} /></View></View>)}</View></View>
        </View>
      </View> : null}
    {state.message && state.status === 'ready' && <Text accessibilityRole="alert" style={styles.copy}>{state.message}</Text>}
    {state.pending && <Pressable accessibilityRole="button" disabled={state.busy} onPress={() => void controller.reconcile()} style={styles.link}><Text style={styles.linkText}>{state.busy ? 'Checking save…' : 'Check save outcome'}</Text></Pressable>}
    {prerequisiteMessage && <View accessibilityRole="alert"><Text style={styles.copy}>{prerequisiteMessage}</Text><Pressable accessibilityRole="button" onPress={onRetry} style={styles.link}><Text style={styles.linkText}>Retry recommendation</Text></Pressable></View>}
    {recommendation && <View accessibilityLabel="Today’s workout" style={styles.today}>
      <Text style={styles.date}>{dateLabel}</Text><Text style={styles.planName}>From plan · {templateName}</Text><Text accessibilityRole="header" style={styles.day}>{recommendation.dayName}</Text><Text style={styles.copy}>{recommendation.exercises.length} {pluralize(recommendation.exercises.length, 'exercise', 'exercises')}</Text>
      <View accessibilityLabel={`Readiness ${label}, ${recommendation.score} out of 100. ${adjustment}`} style={styles.adjustment}><Text style={styles.meta}>Readiness {label} ·</Text><Text style={[styles.adjustmentText, { color: !reduced && !changed ? color.strong : recommendation.tone === 'high' ? '#a4ceb5' : '#f5a623' }]}>{adjustment}</Text></View>
      <Pressable accessibilityRole="button" disabled={!canStart} onPress={start} style={[styles.primary, !canStart && styles.disabled]}><Text style={styles.primaryText}>{starting ? 'Starting…' : `Start ${recommendation.dayName}`}</Text></Pressable>
      <View style={styles.row}><Pressable accessibilityRole="button" accessibilityLabel="View plan exercises" onPress={() => setPreview(true)} style={styles.link}><Text style={styles.copy}>View exercises  ›</Text></Pressable><Pressable accessibilityRole="button" disabled={starting} onPress={onChange} style={styles.link}><Text style={styles.meta}>Change workout</Text></Pressable></View>
    </View>}
    <Modal transparent animationType="fade" visible={preview && !!recommendation} onRequestClose={() => setPreview(false)}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close plan" style={styles.overlay} onPress={() => setPreview(false)}>
        <Pressable accessible={false} style={styles.dialog} onPress={() => {}}>
          <View style={styles.row}><View style={styles.flex}><Text accessibilityRole="header" style={styles.previewTitle}>{recommendation?.dayName}</Text><Text style={styles.meta}>{recommendation?.exercises.length} exercises</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close plan" onPress={() => setPreview(false)} style={styles.close}><Text style={styles.copy}>×</Text></Pressable></View>
          <ScrollView style={styles.exercises}>{recommendation?.exercises.map((exercise, index) => <View key={`${exercise.exerciseSource}:${exercise.exerciseId}:${index}`} style={styles.exercise}><View style={styles.flex}><Text style={styles.exerciseName}>{exercise.name} <Text style={styles.sets}>{exercise.sets} × {exercise.reps}</Text></Text></View><View><Text style={styles.target}>{exercise.weight > 0 ? weight(exercise.weight, units) : 'no weight'}</Text>{(exercise.weightDelta !== 0 || exercise.setsDelta !== 0) && <Text style={[styles.delta, exercise.weightDelta > 0 && { color: '#a4ceb5' }]}>{[exercise.weightDelta ? `${exercise.weightDelta > 0 ? '+' : '−'}${weight(Math.abs(exercise.weightDelta), units)}` : '', exercise.setsDelta ? `−${Math.abs(exercise.setsDelta)} ${pluralize(Math.abs(exercise.setsDelta), 'set', 'sets')}` : ''].filter(Boolean).join(' · ')}</Text>}</View></View>)}</ScrollView>
          <View style={styles.actions}><Pressable accessibilityRole="button" disabled={!canStart} onPress={start} style={[styles.primary, styles.flex, !canStart && styles.disabled]}><Text style={styles.primaryText}>{starting ? 'Starting…' : 'Start'}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => { setPreview(false); onEdit() }} style={styles.edit}><Text style={styles.primaryText}>Edit</Text></Pressable></View>
        </Pressable>
      </Pressable>
    </Modal>
  </View>
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginTop: 16, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: color.line }, flex: { flex: 1 }, card: { backgroundColor: '#211f23', borderRadius: 14, overflow: 'hidden', minHeight: 76, justifyContent: 'center' },
  summary: { minHeight: 76, paddingVertical: 14.4, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 16 }, border: { borderBottomWidth: 1, borderBottomColor: color.line },
  meta: { color: color.muted, fontSize: 11.5, fontFamily: 'InstrumentSans_600SemiBold', lineHeight: 17 }, title: { color: color.strong, fontSize: 14.4, fontFamily: 'InstrumentSans_700Bold', lineHeight: 20 },
  body: { padding: 16, gap: 12 }, field: { gap: 3 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  fieldLabel: { color: color.strong, fontFamily: 'InstrumentSans_500Medium', fontSize: 14, lineHeight: 22 }, fieldValue: { color: color.accent, fontFamily: 'InstrumentSans_700Bold', fontSize: 14 }, slider: { height: 36, marginHorizontal: -15 }, scale: { color: color.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 12 },
  primary: { minHeight: 48, borderRadius: 8, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, backgroundColor: '#a91f35', experimental_backgroundImage: 'linear-gradient(180deg, #c72e44 0%, #a91f35 100%)' }, primaryText: { color: color.strong, fontFamily: 'InstrumentSans_700Bold', fontSize: 13 }, disabled: { opacity: 0.6 },
  copy: { color: color.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, lineHeight: 18 }, error: { borderRadius: 14, backgroundColor: 'rgba(240,67,90,0.1)', padding: 16, gap: 4 }, link: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 4 }, linkText: { color: color.accentText, fontSize: 13, fontFamily: 'InstrumentSans_700Bold' },
  saved: { padding: 16, gap: 12 }, eyebrow: { color: color.accent, fontFamily: 'InstrumentSans_700Bold', fontSize: 11, letterSpacing: 1.2 }, savedTitle: { color: color.strong, fontFamily: 'InstrumentSans_700Bold', fontSize: 16 }, values: { flexDirection: 'row', gap: 8, marginTop: 12 }, track: { height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.06)', marginTop: 6 },
  today: { padding: 16, borderRadius: 14, backgroundColor: '#211f23', experimental_backgroundImage: 'linear-gradient(135deg, rgba(240,67,90,0.1), transparent 54%)' }, date: { color: color.muted, fontSize: 12, fontFamily: 'InstrumentSans_600SemiBold', marginBottom: 11.2 }, planName: { color: color.accentText, fontSize: 11.5, fontFamily: 'InstrumentSans_700Bold', marginBottom: 7.2 }, day: { color: color.strong, fontSize: 34, lineHeight: 35, fontFamily: 'ArchivoHeading', marginBottom: 7.2 },
  adjustment: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, borderTopWidth: 1, borderTopColor: color.line, marginTop: 16, paddingTop: 13, marginBottom: 14 }, adjustmentText: { fontSize: 12, fontFamily: 'InstrumentSans_700Bold', lineHeight: 17 },
  overlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 80, backgroundColor: 'rgba(5,5,6,0.68)' }, dialog: { width: '100%', maxWidth: 448, maxHeight: '85%', borderRadius: 14, backgroundColor: '#1a191c', borderWidth: 1, borderColor: 'rgba(244,241,242,0.2)', padding: 16 }, previewTitle: { color: color.strong, fontFamily: 'ArchivoHeading', fontSize: 24, lineHeight: 27 }, close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, exercises: { marginTop: 10, borderTopWidth: 1, borderTopColor: color.line }, exercise: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 8, minHeight: 46, borderBottomWidth: 1, borderBottomColor: color.line }, exerciseName: { color: color.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 12, lineHeight: 19 }, sets: { color: color.muted, fontFamily: 'SplineSansMono_600SemiBold', fontSize: 10.5 }, target: { color: color.text, fontFamily: 'SplineSansMono_600SemiBold', fontSize: 11, textAlign: 'right' }, delta: { color: '#f5a623', fontFamily: 'InstrumentSans_600SemiBold', fontSize: 10.5, textAlign: 'right', marginTop: 3 }, actions: { flexDirection: 'row', gap: 8, marginTop: 14 }, edit: { minHeight: 48, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(244,241,242,0.2)', justifyContent: 'center', paddingHorizontal: 16 },
})
