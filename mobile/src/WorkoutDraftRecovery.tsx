import { useCallback } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { workoutEditorJournal } from './fileWorkoutEditorJournal'
import { useSessionRead } from './useSessionRead'
export default function WorkoutDraftRecovery({ uid, workoutId }: { uid: string; workoutId?: string }) {
  const router = useRouter()
  const load = useCallback(async () => ({ data: await workoutEditorJournal.list(uid), fromCache: false }), [uid])
  const read = useSessionRead(`workout-drafts:${uid}`, load)
  if (read.state.status === 'error') return <Pressable accessibilityRole="button" onPress={read.retry} style={styles.row}><Text style={styles.text}>Could not read saved workout changes. Retry</Text></Pressable>
  if (read.state.status !== 'ready') return null
  return <View>{read.state.data.filter(d => !workoutId || d.workoutId === workoutId).map(d => <Pressable key={d.workoutId} accessibilityRole="button" onPress={() => router.push({ pathname: '/workout-edit/[workoutId]', params: { workoutId: d.workoutId } })} style={styles.row}>
    <Text style={styles.text}>{d.pending ? d.pending.action === 'delete' ? 'Check workout deletion' : 'Check workout save' : 'Resume workout edit'}</Text><Text style={styles.label}>{d.label || 'Workout'}  ›</Text>
  </Pressable>)}</View>
}
const styles = StyleSheet.create({ row: { minHeight: 44, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(244,241,242,0.12)', gap: 4 }, text: { color: '#ff7182', fontFamily: 'InstrumentSans_700Bold', fontSize: 13 }, label: { color: '#a09aa0', fontFamily: 'InstrumentSans_400Regular', fontSize: 12 } })
