// The finish endpoint rejects a workout outside these limits and Firestore rules cap the active session at
// MAX_SESSION_EXERCISES, so both clients check them before a set counts as done.
export const MAX_SESSION_EXERCISES = 20
export const MAX_DONE_SETS_PER_EXERCISE = 20
export const MAX_SET_WEIGHT_KG = 2_000
export const MAX_SET_REPS = 1_000

export function isValidCompletedSet(set: { weight: string; reps: string }): boolean {
  const weight = Number(set.weight)
  const reps = Number(set.reps)
  return Number.isFinite(weight) && weight >= 0 && weight <= MAX_SET_WEIGHT_KG
    && Number.isInteger(reps) && reps >= 1 && reps <= MAX_SET_REPS
}
