export function workoutTitle(workout: { label?: string | null; exercises: { name: string }[] }): string {
  if (workout.label?.trim()) return workout.label.trim()
  const names = workout.exercises.map((exercise) => exercise.name.trim()).filter(Boolean)
  if (!names.length) return 'Workout'
  if (names.length <= 2) return names.join(' + ')
  return `${names[0]} +${names.length - 1}`
}

// Past the weekly goal the count stands alone: "4 of 3" reads like a mistake.
export function weekCountLabel(done: number, goal: number): string {
  return done > goal ? String(done) : `${done} of ${goal}`
}
