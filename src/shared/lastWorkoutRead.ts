import { workoutTitle } from '../lib/workoutCopy'
import { formatCompactVolume, kgToDisplayWeight, type WeightUnits } from './weightUnits'

interface ReadWorkout {
  label?: string | null
  startedAt: number
  exercises: { name: string; sets: { weight: number; reps: number }[] }[]
}

export function lastWorkoutRead(workout: ReadWorkout, units: WeightUnits) {
  const started = new Date(workout.startedAt)
  const day = `${started.toLocaleDateString('en-US', { weekday: 'short' })} ${started.getDate()}`
  const sets = workout.exercises.flatMap(({ name, sets: exerciseSets }) => exerciseSets.map((set) => ({ ...set, name })))
  const top = sets.reduce<(typeof sets)[number] | null>((best, set) => (
    !best || set.weight > best.weight || (set.weight === best.weight && set.reps > best.reps) ? set : best
  ), null)
  const volume = sets.reduce((sum, set) => sum + set.weight * set.reps, 0)
  return {
    eyebrow: `Last workout · ${workoutTitle(workout)}, ${day}`,
    title: top ? `${top.name}: ${kgToDisplayWeight(top.weight, units)} ${units} × ${top.reps}` : workoutTitle(workout),
    body: `${sets.length} ${sets.length === 1 ? 'set' : 'sets'} across ${workout.exercises.length} ${workout.exercises.length === 1 ? 'exercise' : 'exercises'}, ${formatCompactVolume(volume, units)} in total.`,
  }
}
