export type WorkoutCover = 'push' | 'pull' | 'legs' | 'plan'

// A plan name picks one of the rendered covers (scripts/covers); anything else gets the default.
export function workoutCover(name: string | null | undefined): WorkoutCover {
  const key = name?.toLowerCase() ?? ''
  if (/\b(push|chest)\b/.test(key)) return 'push'
  if (/\b(pull|back)\b/.test(key)) return 'pull'
  if (/\b(legs?|lower|squat)\b/.test(key)) return 'legs'
  return 'plan'
}
