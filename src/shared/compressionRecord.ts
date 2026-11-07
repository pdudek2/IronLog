// No runtime imports: the API imports this file. Rules: PRODUCT.md, „Specyfikacja punktu 3”.
export type CompressionMode = 'readiness' | 'compressed' | 'straight' | 'maintenance'

export interface CompressionEntry {
  dayExerciseIndex: number
  exerciseId: string
  exerciseSource: 'global' | 'user'
  plannedSets: number
  sets: number
}

export interface CompressionRecord {
  v: 1
  budgetMin: number | null
  mode: CompressionMode
  shortRest: boolean
  estimateMin: number
  fullEstimateMin: number
  factor: number
  samples: number
  readiness: 'low' | 'mid' | 'high' | null
  exercises: CompressionEntry[]
}

export interface CompressionProposal { budgetMin: number | null; mode: CompressionMode | 'usual' }

const SAME = 0.01

// Working sets share the top weight; lighter sets under 80% of it are warm-ups, anything between is ambiguous.
export function workingSets<T extends { weight: number }>(sets: T[]): T[] | 'ambiguous' {
  if (!sets.length) return []
  const top = Math.max(...sets.map((set) => set.weight))
  if (sets.some((set) => set.weight < top - SAME && set.weight >= top * 0.8)) return 'ambiguous'
  return sets.filter((set) => set.weight >= top - SAME)
}

// Occurrences of one exercise are summed, because the projection merges them into one session.
export function isShortened(
  record: Pick<CompressionRecord, 'exercises'> | null | undefined,
  exerciseId: string,
  exerciseSource: string,
  doneSets: { weight: number; reps: number }[],
): boolean {
  const entries = record?.exercises.filter((entry) => entry.exerciseId === exerciseId && entry.exerciseSource === exerciseSource) ?? []
  if (!entries.length) return false
  const planned = entries.reduce((sum, entry) => sum + entry.plannedSets, 0)
  const launched = entries.reduce((sum, entry) => sum + entry.sets, 0)
  if (launched >= planned) return false
  const valid = doneSets.filter((set) => Number.isFinite(set.weight) && set.weight >= 0 && set.reps > 0)
  const working = workingSets(valid)
  return (working === 'ambiguous' ? valid.length : working.length) < planned
}
