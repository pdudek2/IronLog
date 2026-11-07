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
  calibration: 'day' | 'user' | 'none'
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

export const GROUP_PATTERN = /^[A-Za-z0-9_-]{1,16}$/
const MODES: readonly string[] = ['readiness', 'compressed', 'straight', 'maintenance']
const SOURCES: readonly string[] = ['day', 'user', 'none']
const READINESS: readonly string[] = ['low', 'mid', 'high']
const MAX_ENTRIES = 20
const MAX_PROPOSALS = 12

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const int = (value: unknown, min: number, max: number): value is number => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max
const num = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
const budget = (value: unknown): value is number | null => value === null || int(value, 1, 240)

// Anything malformed becomes null: the workout still saves, only the record is lost.
export function parseCompressionRecord(raw: unknown): CompressionRecord | null {
  if (!isRecord(raw) || raw.v !== 1 || !budget(raw.budgetMin) || !MODES.includes(raw.mode as string) || typeof raw.shortRest !== 'boolean'
    || !num(raw.estimateMin, 0, 600) || !num(raw.fullEstimateMin, 0, 600) || !num(raw.factor, 0.5, 2) || !int(raw.samples, 0, 5)
    || !SOURCES.includes(raw.calibration as string) || !(raw.readiness === null || READINESS.includes(raw.readiness as string))
    || !Array.isArray(raw.exercises) || raw.exercises.length > MAX_ENTRIES) return null
  const exercises: CompressionEntry[] = []
  for (const entry of raw.exercises) {
    if (!isRecord(entry) || !int(entry.dayExerciseIndex, 0, MAX_ENTRIES - 1) || typeof entry.exerciseId !== 'string' || !entry.exerciseId || entry.exerciseId.length > 160
      || (entry.exerciseSource !== 'global' && entry.exerciseSource !== 'user') || !int(entry.plannedSets, 0, 20) || !int(entry.sets, 0, 20)) return null
    exercises.push({ dayExerciseIndex: entry.dayExerciseIndex, exerciseId: entry.exerciseId, exerciseSource: entry.exerciseSource, plannedSets: entry.plannedSets, sets: entry.sets })
  }
  return {
    v: 1, budgetMin: raw.budgetMin, mode: raw.mode as CompressionMode, shortRest: raw.shortRest, estimateMin: raw.estimateMin, fullEstimateMin: raw.fullEstimateMin,
    factor: raw.factor, samples: raw.samples, calibration: raw.calibration as CompressionRecord['calibration'], readiness: raw.readiness as CompressionRecord['readiness'], exercises,
  }
}

export function parseProposals(raw: unknown): CompressionProposal[] | null {
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_PROPOSALS) return null
  const proposals: CompressionProposal[] = []
  for (const item of raw) {
    if (!isRecord(item) || !budget(item.budgetMin) || !(item.mode === 'usual' || MODES.includes(item.mode as string))) return null
    proposals.push({ budgetMin: item.budgetMin, mode: item.mode as CompressionProposal['mode'] })
  }
  return proposals
}

export const parseGroup = (raw: unknown): string | null => (typeof raw === 'string' && GROUP_PATTERN.test(raw) ? raw : null)

// Today's version of a plan day, in session order. Exercises the day drops today are absent.
export interface LaunchItem { dayExerciseIndex: number; sets: number; weight: number; reps: number; group?: string }

export function isValidLaunchList(day: readonly { sets: number }[], items: readonly LaunchItem[]): boolean {
  const seen = new Set<number>()
  return items.length > 0 && items.every((item) => {
    if (!int(item.dayExerciseIndex, 0, day.length - 1) || seen.has(item.dayExerciseIndex)) return false
    seen.add(item.dayExerciseIndex)
    return int(item.sets, 1, Math.max(1, day[item.dayExerciseIndex]!.sets)) && int(item.reps, 0, 1000) && num(item.weight, 0, 2000)
      && (item.group === undefined || GROUP_PATTERN.test(item.group))
  })
}
