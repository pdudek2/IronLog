import type { ExerciseMutation } from './exerciseCatalogue'

export type MutationAttempt = { operation: ExerciseMutation; result: Promise<void>; status: 'pending' | 'saved' | 'failed'; error?: unknown }
export function startExerciseMutation(operation: ExerciseMutation, write: (operation: ExerciseMutation) => Promise<void>): MutationAttempt {
  const attempt: MutationAttempt = { operation, result: Promise.resolve(), status: 'pending' }
  attempt.result = Promise.resolve().then(() => write(operation)).then(() => { attempt.status = 'saved' }, error => { attempt.status = 'failed'; attempt.error = error })
  return attempt
}

// Keep the actual promise: a timeout does not cancel a Firestore commit or authorize a second write.
export async function waitForExerciseMutation(attempt: MutationAttempt, milliseconds = 15_000) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([attempt.result, new Promise<void>(resolve => { timeout = setTimeout(resolve, milliseconds) })])
    return attempt.status
  } finally { clearTimeout(timeout) }
}
