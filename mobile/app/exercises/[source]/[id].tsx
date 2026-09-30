import { useLocalSearchParams } from 'expo-router'
import { ExerciseDetailScreen } from '../../../src/ExerciseLibraryScreen'
export default function ExerciseDetailRoute() {
  const { source, id } = useLocalSearchParams<{ source: string; id: string }>()
  return <ExerciseDetailScreen source={source ?? ''} id={id ?? ''} />
}
