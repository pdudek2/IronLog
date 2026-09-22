export type ReadResult<T> = { data: T; fromCache: boolean }
export type ReadState<T> = { status: 'loading' } | { status: 'error' } | ({ status: 'ready' } & ReadResult<T>)

// A disposed request cannot publish data to a different account or exercise.
export function startRead<T>(load: () => Promise<ReadResult<T>>, publish: (state: ReadState<T>) => void) {
  let active = true
  publish({ status: 'loading' })
  void Promise.resolve().then(load).then(
    (result) => { if (active) publish({ status: 'ready', ...result }) },
    () => { if (active) publish({ status: 'error' }) },
  )
  return () => { active = false }
}

export function readStateForKey<T>(key: string, stored: { key: string; state: ReadState<T> } | null): ReadState<T> {
  return stored?.key === key ? stored.state : { status: 'loading' }
}

export type PreviousSet = { weight: number; reps: number }
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
