import { Stack, useLocalSearchParams } from 'expo-router'
import PlanEditorScreen from '../../src/PlanEditorScreen'
export default function NewPlan() { const { saveImport, returnTo } = useLocalSearchParams<{ saveImport?: string; returnTo?: string }>(); return <><Stack.Screen options={{ gestureEnabled: false }} /><PlanEditorScreen targetId={null} saveImport={saveImport} returnTo={returnTo === 'dashboard' ? 'dashboard' : undefined} /></> }
