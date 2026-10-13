export interface RecentExercisePick {
  id: string
  name: string
  source: 'global' | 'user'
  count: number
}

// The six exercises used most often across the given workouts; ties keep the order they were first seen in.
export function recentExercisePicks(
  workouts: { exercises: { exerciseId?: string; exerciseSource?: string; name: string }[] }[],
): RecentExercisePick[] {
  const picks = new Map<string, RecentExercisePick>()
  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      if (!exercise.exerciseId) continue
      const source = exercise.exerciseSource === 'user' ? 'user' : 'global'
      const key = `${source}:${exercise.exerciseId}`
      const existing = picks.get(key)
      if (existing) existing.count += 1
      else picks.set(key, { id: exercise.exerciseId, name: exercise.name, source, count: 1 })
    }
  }
  return Array.from(picks.values()).sort((a, b) => b.count - a.count).slice(0, 6)
}
