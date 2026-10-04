import { useLocalSearchParams } from 'expo-router'
import WorkoutEditorScreen from '../../src/WorkoutEditorScreen'
export default function EditWorkoutRoute() {
  const params = useLocalSearchParams<{ workoutId: string; action?: string }>()
  return <WorkoutEditorScreen workoutId={String(params.workoutId ?? '')} deleting={params.action === 'delete'} />
}
