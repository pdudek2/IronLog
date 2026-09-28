import { Stack } from 'expo-router'
import PlanEditorScreen from '../../src/PlanEditorScreen'
export default function NewPlan() { return <><Stack.Screen options={{ gestureEnabled: false }} /><PlanEditorScreen targetId={null} /></> }
