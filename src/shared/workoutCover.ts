export const WORKOUT_COVERS = ['push', 'pull', 'legs', 'upper', 'plan'] as const
export type WorkoutCover = (typeof WORKOUT_COVERS)[number]

// A plan name picks one of the rendered covers (scripts/covers); anything else gets the default.
export function workoutCover(name: string | null | undefined): WorkoutCover {
  const key = name?.toLowerCase() ?? ''
  if (/\b(push|chest)\b/.test(key)) return 'push'
  if (/\b(pull|back)\b/.test(key)) return 'pull'
  if (/\b(legs?|lower|squat)\b/.test(key)) return 'legs'
  if (/\bupper\b/.test(key)) return 'upper'
  return 'plan'
}
