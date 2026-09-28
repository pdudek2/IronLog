import { useLocalSearchParams } from 'expo-router'
import PlanEditorScreen from '../../../src/PlanEditorScreen'
export default function EditPlan() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <PlanEditorScreen targetId={id ?? null} />
}
