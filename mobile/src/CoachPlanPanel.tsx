import { useEffect, useRef, useState } from 'react'
import { AppState, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { kgToDisplayWeight, type WeightUnits } from '../../src/shared/weightUnits'
import { defaultPlanBrief, generatedPlanDraft, type PlanBrief } from './coachPlan'
import type { CoachController } from './coachController'
import { createSessionRevision, readUnits } from './firebase'
import { planEditorJournal } from './filePlanEditorJournal'

const equipment = [['barbell', 'Barbell'], ['dumbbell', 'Dumbbells'], ['cable', 'Cable'], ['machine', 'Machines'], ['bodyweight', 'Bodyweight'], ['kettlebell', 'Kettlebell']]
const levels = [['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']]
export default function CoachPlanPanel({ uid, controller }: { uid: string; controller: CoachController }) {
  const router = useRouter()
  const [brief, setBrief] = useState(defaultPlanBrief)
  const [day, setDay] = useState(0)
  const [units, setUnits] = useState<WeightUnits>('kg')
  const [goalError, setGoalError] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [collision, setCollision] = useState(false)
  const [busy, setBusy] = useState(false)
  const [imported, setImported] = useState<string | null>(null)
  const importLock = useRef(false)
  const alive = useRef(true)
  const goal = useRef<TextInput>(null)
  const { plan: result, planGeneration, planError } = controller.state
  const plan = result?.plan
  const generating = planGeneration === 'generating'
  useEffect(() => { alive.current = true; void readUnits(uid).then(value => { if (alive.current) setUnits(value) }).catch(() => undefined); return () => { alive.current = false } }, [uid])
  useEffect(() => { setDay(0); setImported(null); setCollision(false); setError(null) }, [result])
  function change<K extends keyof PlanBrief>(key: K, value: PlanBrief[K]) { setBrief(current => ({ ...current, [key]: value })) }
  async function importPlan(save: boolean) {
    if (!plan || importLock.current || imported || generating) return
    importLock.current = true; setBusy(true); setError(null); setCollision(false)
    const current = controller.captureCurrent()
    try {
      const profileUnits = await readUnits(uid)
      if (!current() || !alive.current || AppState.currentState !== 'active') return
      const draft = generatedPlanDraft(plan, profileUnits, createSessionRevision, save)
      const installed = await planEditorJournal.installIfEmpty(uid, draft, createSessionRevision(), current)
      if (!alive.current) return
      if (installed) setImported(draft.draftId)
      if (!current()) return
      if (!installed) { setCollision(true); return }
      router.push({ pathname: '/templates/new', params: save ? { saveImport: draft.draftId } : {} })
    } catch {
      if (current() && alive.current) setError('Could not hand off the plan. Your saved draft was preserved. Open Plans to recover it or try again.')
    } finally { importLock.current = false; if (alive.current) setBusy(false) }
  }
  async function startAnother() {
    if (importLock.current) return
    importLock.current = true; setBusy(true)
    const current = controller.captureCurrent()
    try {
      const existing = await planEditorJournal.load(uid, null)
      if (!current() || !alive.current) return
      if (existing) { setCollision(true); return }
      controller.clearPlan()
    } catch { if (current() && alive.current) setError('Could not check the saved draft. Open Plans to recover it.') }
    finally { importLock.current = false; if (alive.current) setBusy(false) }
  }
  const disabled = busy || generating || !!imported
  const selected = plan?.days[Math.min(day, plan.days.length - 1)]
  return <View>
    <View style={s.section}>
      <Text accessibilityRole="header" style={s.heading}>Workout brief</Text>
      <View style={s.field}><Text style={s.label}>Plan goal</Text><TextInput selectionColor="#ff7182" ref={goal} accessibilityLabel="Plan goal" style={s.input} placeholder="E.g. upper/lower strength plan" placeholderTextColor="#8f8990" value={brief.goal} onChangeText={v => { change('goal', v); setGoalError(false) }} maxLength={400} editable={!disabled} />{goalError && <Text accessibilityRole="alert" style={s.error}>Enter a plan goal to generate a template.</Text>}</View>
      <View style={s.field}><Text style={s.label}>Days per week</Text><View style={s.chips}>{[2,3,4,5,6].map(value => <Chip key={value} active={brief.daysPerWeek === value} disabled={disabled} onPress={() => change('daysPerWeek', value)}>{value} days</Chip>)}</View></View>
      <View style={s.field}><Text style={s.label}>Level</Text><View style={s.levels}>{levels.map(([value, label]) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: brief.experience === value, disabled }} disabled={disabled} onPress={() => change('experience', value)} style={[s.level, brief.experience === value && s.levelActive]}><Text style={[s.choice, brief.experience === value && s.selected]}>{label}</Text></Pressable>)}</View></View>
      <View style={s.field}><Text style={s.label}>Available equipment</Text><View style={s.chips}>{equipment.map(([value,label]) => <Chip key={value} active={brief.equipment.includes(value)} disabled={disabled} onPress={() => change('equipment', brief.equipment.includes(value) ? brief.equipment.filter(item => item !== value) : [...brief.equipment, value])}>{label}</Chip>)}</View></View>
      <View style={s.field}><Text style={s.label}>Focus</Text><TextInput selectionColor="#ff7182" accessibilityLabel="Plan focus" style={s.input} placeholder="E.g. bench press and back" placeholderTextColor="#8f8990" value={brief.focus} onChangeText={v => change('focus',v)} maxLength={160} editable={!disabled} /></View>
      <View style={s.field}><Text style={s.label}>Additional notes</Text><TextInput selectionColor="#ff7182" accessibilityLabel="Additional notes" style={[s.input, s.notes]} textAlignVertical="top" multiline placeholder="E.g. 60 min, no deadlifts" placeholderTextColor="#8f8990" value={brief.notes} onChangeText={v => change('notes',v)} maxLength={400} editable={!disabled} /></View>
      {!!planError && <Text accessibilityRole="alert" style={s.error}>{planError}</Text>}
      {planGeneration === 'interrupted' && <Text style={s.muted}>Generation stopped. Generate again when ready.</Text>}
      <View style={s.actions}><Text style={s.muted}>Coach adds your profile, history and exercise library to the brief.</Text><Action primary disabled={!controller.canSend || disabled} onPress={() => { if (brief.goal.trim().length < 2) { setGoalError(true); goal.current?.focus(); return } setGoalError(false); void controller.generatePlan(brief) }}>{generating ? 'Generating plan…' : 'Generate plan'}</Action></View>
      {generating && <Action onPress={() => controller.cancel()}>Stop generation</Action>}
    </View>
    {plan && selected && <View style={s.section}>
      <Text style={s.label}>Plan preview</Text><Text accessibilityRole="header" style={s.heading}>{plan.name}</Text><Text style={s.muted}>{plan.summary}</Text>
      {result.context.status === 'limited' && <Text style={s.muted}>Plan was created with some data unavailable: {result.context.unavailableSources.join(', ')}.</Text>}
      <View style={s.chips}>{plan.days.map((item,index) => <Chip key={index} active={day === index} onPress={() => setDay(index)}>{item.name}</Chip>)}</View>
      <View style={s.table}>
        <View style={s.tableRow}><Text style={[s.label,s.name]}>Exercise</Text><Text style={[s.label,s.reps]}>Sets × reps</Text><Text style={[s.label,s.weight]}>Start</Text></View>
        {selected.exercises.map(exercise => <View key={`${exercise.exerciseSource}:${exercise.exerciseId}`} style={s.tableRow}><View style={s.name}><Text style={s.exercise}>{exercise.name}</Text><Text style={s.source}>{exercise.exerciseSource === 'user' ? 'My exercise' : 'Shared library'}</Text></View><Text style={[s.exercise,s.reps]}>{exercise.sets} × {exercise.targetReps}</Text><Text style={[s.muted,s.weight]}>{exercise.targetWeight > 0 ? `${kgToDisplayWeight(exercise.targetWeight,units)} ${units}` : 'Auto'}</Text></View>)}
      </View>
      {error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {collision && <View style={s.field}><Text style={s.muted}>A plan draft is already on this device. Finish or discard it before importing this plan.</Text><View style={s.chips}><Action onPress={() => router.push('/templates/new')}>Open existing draft</Action><Action onPress={() => setCollision(false)}>Cancel</Action></View></View>}
      {imported ? <View style={s.field}><Text style={s.muted}>This plan was handed to the editor. Continue there to finish or check the saved plan in Plans.</Text><View style={s.chips}><Action onPress={() => router.push('/templates')}>Open Plans</Action><Action disabled={busy} onPress={() => void startAnother()}>Start another plan</Action></View></View> : <View style={s.chips}><Action disabled={disabled} onPress={() => void importPlan(false)}>Edit before saving</Action><Action primary disabled={disabled} onPress={() => void importPlan(true)}>{busy ? 'Opening editor…' : 'Save as template'}</Action></View>}
      <Action disabled={busy || generating || !!imported} onPress={() => controller.clearPlan()}>Close preview</Action>
    </View>}
  </View>
}
function Chip({ children, active, onPress, disabled = false }: { children: React.ReactNode; active: boolean; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active, disabled }} disabled={disabled} onPress={onPress} style={[s.chip,active && s.chipActive,disabled && s.disabled]}><Text style={[s.choice,active && s.accent]}>{children}</Text></Pressable>
}
function Action({ children, onPress, disabled = false, primary = false }: { children: string; onPress: () => void; disabled?: boolean; primary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[s.action,primary && s.primary,disabled && s.disabled]}><Text style={[s.choice,primary && s.selected]}>{children}</Text></Pressable>
}
const s = StyleSheet.create({
  section: { borderTopWidth:1,borderColor:'rgba(244,241,242,0.18)',paddingVertical:16,gap:16 },
  heading: { fontFamily:'InstrumentSans_700Bold',fontSize:21.12,lineHeight:24,color:'#fff' },
  field: { gap:9 }, label: { fontFamily:'InstrumentSans_600SemiBold',fontSize:12,lineHeight:18,color:'#a09aa0' },
  input: { borderWidth:1,borderColor:'rgba(244,241,242,0.12)',backgroundColor:'rgba(255,255,255,0.043)',borderRadius:0,paddingHorizontal:15.2,paddingVertical:13.6,minHeight:51.2,fontFamily:'InstrumentSans_400Regular',fontSize:14.72,color:'#fff' },
  notes: { minHeight:104 }, chips: { flexDirection:'row',flexWrap:'wrap',gap:8 },
  chip: { borderWidth:1,borderColor:'rgba(244,241,242,0.12)',backgroundColor:'rgba(255,255,255,0.03)',borderRadius:999,minHeight:44,paddingHorizontal:12,paddingVertical:8,justifyContent:'center' },
  chipActive: { backgroundColor:'rgba(244,241,242,0.075)',borderColor:'rgba(240,67,90,0.24)' },
  choice: { fontFamily:'InstrumentSans_700Bold',fontSize:13.76,color:'#a09aa0' }, selected: { color:'#fff' },accent: { color:'#ff7182' },
  levels: { borderWidth:1,borderColor:'rgba(244,241,242,0.12)',borderRadius:8,overflow:'hidden' },
  level: { minHeight:44,paddingHorizontal:13,paddingVertical:11,backgroundColor:'#222125',borderLeftWidth:3,borderLeftColor:'transparent' },levelActive: { backgroundColor:'rgba(244,241,242,0.075)',borderLeftColor:'#ff7182' },
  muted: { fontFamily:'InstrumentSans_400Regular',fontSize:14,lineHeight:24,color:'#a09aa0' },error: { fontFamily:'InstrumentSans_400Regular',fontSize:13,lineHeight:20,color:'#ff7182' },
  actions: { gap:12,alignItems:'flex-start' },action: { minHeight:44,paddingHorizontal:13,paddingVertical:11,borderRadius:8,borderWidth:1,borderColor:'rgba(244,241,242,0.12)',alignItems:'center',justifyContent:'center',alignSelf:'flex-start' },
  primary: { backgroundColor:'#c22b41',borderColor:'transparent',experimental_backgroundImage:'linear-gradient(180deg,#c92d44,#aa1f35)' },disabled: { opacity:0.45 },
  table: { borderTopWidth:1,borderColor:'rgba(244,241,242,0.12)' },tableRow: { flexDirection:'row',gap:8,paddingVertical:12,borderBottomWidth:1,borderColor:'rgba(244,241,242,0.12)' },name: { flex:1 },reps: { width:76,textAlign:'right' },weight: { width:60,textAlign:'right' },
  exercise: { fontFamily:'InstrumentSans_600SemiBold',fontSize:14,lineHeight:21,color:'#fff' },source: { fontFamily:'InstrumentSans_400Regular',fontSize:12,lineHeight:18,color:'#a09aa0',marginTop:4 },
})
