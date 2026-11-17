import type { ProgressionSession } from '../../src/shared/progression'

export type ReadResult<T> = { data: T; fromCache: boolean }
export type ReadState<T> = { status: 'loading' } | { status: 'error' } | ({ status: 'ready' } & ReadResult<T>)

// The last result of each read that opts in, by a key that holds the uid, so a screen opened again shows it at once
// and refreshes behind it. A write that changes what these reads show forgets them all.
const memory = new Map<string, ReadResult<unknown>>()
let generation = 0
export function forgetReads() {
  memory.clear()
  generation += 1
}
export function recallRead<T>(remember: string | undefined): ReadResult<T> | undefined {
  return remember === undefined ? undefined : memory.get(remember) as ReadResult<T> | undefined
}
export function rememberRead(remember: string, result: ReadResult<unknown>, since: number) {
  if (since === generation) memory.set(remember, result)
}
export const readGeneration = () => generation

// A disposed request cannot publish data to a different account or exercise.
export function startRead<T>(load: () => Promise<ReadResult<T>>, publish: (state: ReadState<T>) => void, remember?: string) {
  let active = true
  const last = recallRead<T>(remember)
  const since = generation
  publish(last ? { status: 'ready', ...last } : { status: 'loading' })
  void Promise.resolve().then(load).then(
    (result) => {
      // A read that was running when the memory was forgotten may hold data from before the write.
      if (remember !== undefined) rememberRead(remember, result, since)
      if (active) publish({ status: 'ready', ...result })
    },
    // A failed refresh keeps the remembered data, marked as not confirmed by the server.
    () => { if (active) publish(last ? { status: 'ready', ...last, fromCache: true } : { status: 'error' }) },
  )
  return () => { active = false }
}

export function readStateForKey<T>(key: string, stored: { key: string; state: ReadState<T> } | null, remember?: string): ReadState<T> {
  if (stored?.key === key) return stored.state
  const last = recallRead<T>(remember)
  return last ? { status: 'ready', ...last } : { status: 'loading' }
}

export type PreviousSet = { weight: number; reps: number }
export type ExerciseHistory = { sets: PreviousSet[]; sessions: ProgressionSession[] }
export type ExerciseMetadata = { id: string; name: string; category: string; equipment: string; muscles: string[] }
export function parsePreviousSets(data: Record<string, unknown>, uid: string, id: string, source: string): PreviousSet[] {
  if (data.userId !== uid || data.exerciseId !== id || data.exerciseSource !== source || !Array.isArray(data.sets)) {
    throw new Error('Invalid exercise history')
  }
  return data.sets.map((set: unknown) => {
    if (!set || typeof set !== 'object' || !('weight' in set) || !('reps' in set)
      || typeof set.weight !== 'number' || !Number.isFinite(set.weight) || set.weight < 0
      || typeof set.reps !== 'number' || !Number.isInteger(set.reps) || set.reps < 0) throw new Error('Invalid previous set')
    return { weight: set.weight, reps: set.reps }
  })
}

export function parseExerciseHistory(sessions: Record<string, unknown>[], uid: string, id: string, source: string): ExerciseHistory {
  const parsed = sessions.map((session) => ({
    finishedAt: typeof session.finishedAt === 'number' ? session.finishedAt : 0,
    shortened: session.shortened === true,
    sets: parsePreviousSets(session, uid, id, source),
  }))
  return { sets: parsed[0]?.sets ?? [], sessions: parsed }
}
