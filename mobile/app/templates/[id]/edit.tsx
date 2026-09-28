import { Stack, useLocalSearchParams } from 'expo-router'
import PlanEditorScreen from '../../../src/PlanEditorScreen'
export default function EditPlan() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <><Stack.Screen options={{ gestureEnabled: false }} /><PlanEditorScreen targetId={id ?? null} /></>
}
