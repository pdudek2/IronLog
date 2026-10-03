import { Stack, useLocalSearchParams } from 'expo-router'
import PlanEditorScreen from '../../src/PlanEditorScreen'
export default function NewPlan() { const { saveImport } = useLocalSearchParams<{ saveImport?: string }>(); return <><Stack.Screen options={{ gestureEnabled: false }} /><PlanEditorScreen targetId={null} saveImport={saveImport} /></> }
