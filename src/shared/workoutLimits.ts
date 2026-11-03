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

export function completedSetError(set: { weight: string; reps: string }, otherDoneSets: number): string | null {
  if (!isValidCompletedSet(set)) {
    return isValidCompletedSet({ ...set, weight: '0' })
      ? 'Weight cannot be negative or above 2000 kg (4409 lbs).'
      : `Enter whole reps from 1 to ${MAX_SET_REPS} before marking this set as complete.`
  }
  return otherDoneSets >= MAX_DONE_SETS_PER_EXERCISE ? `An exercise can hold up to ${MAX_DONE_SETS_PER_EXERCISE} completed sets.` : null
}
