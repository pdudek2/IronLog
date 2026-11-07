// „Jak dziś?” v0: today's version of a plan day for a time budget. Rules and sources: PRODUCT.md, „Specyfikacja punktu 3”.

export type Role = 'main' | 'compound' | 'isolation' | 'unknown' | 'cardio'

export interface DayExercise {
  exerciseId: string
  exerciseSource: 'global' | 'user'
  // After readiness; the plan's own count is in CompressionInput.plannedSets.
  sets: number
  muscles: readonly string[]
  equipment?: string
  category?: string
}

export interface Block { items: { index: number; sets: number }[]; group: string | null }

export interface CompressionInput {
  exercises: DayExercise[]
  budgetMin: number | null
  straight?: boolean
  lowReadiness?: boolean
  // Pace from calibration(); the cold-start pace when omitted.
  factor?: number
  // Keys (`source:id`) that the last workout of this plan day dropped or cut.
  protectedKeys?: ReadonlySet<string>
}

export interface CompressionResult {
  mode: 'full' | 'compressed' | 'straight' | 'maintenance'
  fits: boolean
  blocks: Block[]
  sets: number[]
  shortRest: boolean
  estimateSec: number
  fullEstimateSec: number
}

const WORK = 40
const TRANSITION = 20
const CHANGE = 60
const WARM_UP = 240
const CARDIO_SET = 300
// Real time = overhead + pace × model: a least-squares fit over 28 of Patryk's workouts (3.5 min + 1.2 × model).
export const SESSION_OVERHEAD = 210
export const COLD_FACTOR = 1.2

export const exerciseKey = (exercise: Pick<DayExercise, 'exerciseId' | 'exerciseSource'>) => `${exercise.exerciseSource}:${exercise.exerciseId}`

export function exerciseRoles(exercises: Pick<DayExercise, 'muscles' | 'equipment' | 'category'>[]): Role[] {
  const kind = (exercise: (typeof exercises)[number]): Role => (exercise.category === 'cardio' ? 'cardio'
    : exercise.muscles.length === 0 ? 'unknown' : exercise.muscles.length === 1 ? 'isolation' : 'compound')
  const roles = exercises.map(kind)
  const main = [
    roles.findIndex((role, i) => role === 'compound' && exercises[i]!.equipment === 'barbell'),
    roles.indexOf('compound'),
    roles.findIndex((role) => role !== 'cardio'),
  ].find((index) => index >= 0)
  if (main !== undefined) roles[main] = 'main'
  return roles
}

const known = (role: Role) => role === 'compound' || role === 'isolation'
const nonCompeting = (a: readonly string[], b: readonly string[]) => a.length > 0 && b.length > 0 && !a.some((muscle) => b.includes(muscle))

export function restSec(role: Role, shortRest: boolean, lowReadiness: boolean): number {
  if (role === 'main') return 180
  if (role === 'isolation') return shortRest && !lowReadiness ? 60 : 90
  return 120
}

export function groupRestSec(roles: Role[], shortRest: boolean, lowReadiness: boolean): number {
  if (roles.includes('main')) return 120
  return shortRest && !lowReadiness ? 60 : 90
}

function blockSec(block: Block, roles: Role[], shortRest: boolean, lowReadiness: boolean): number {
  const items = block.items.filter((item) => item.sets > 0)
  if (!items.length) return 0
  if (items.length === 1) {
    const { index, sets } = items[0]!
    if (roles[index] === 'cardio') return sets * CARDIO_SET
    return sets * WORK + (sets - 1) * restSec(roles[index]!, shortRest, lowReadiness)
  }
  const rounds = Math.max(...items.map((item) => item.sets))
  let total = 0
  for (let round = 0; round < rounds; round++) {
    const present = items.filter((item) => item.sets > round).length
    total += present * WORK + (present - 1) * TRANSITION
  }
  return total + (rounds - 1) * groupRestSec(items.map((item) => roles[item.index]!), shortRest, lowReadiness)
}

export function estimateSec(blocks: Block[], roles: Role[], shortRest: boolean, lowReadiness: boolean): number {
  const live = blocks.filter((block) => block.items.some((item) => item.sets > 0))
  if (!live.length) return 0
  const warmUp = live.some((block) => block.items.some((item) => item.sets > 0 && roles[item.index] === 'main')) ? WARM_UP : 0
  return warmUp + live.reduce((sum, block) => sum + blockSec(block, roles, shortRest, lowReadiness), 0) + (live.length - 1) * CHANGE
}

// Seconds from the start to the latest logged set; a set re-ticked late moves the end, which is when the work ended.
export function workoutSeconds(startedAt: number, sets: { completedAt?: number }[]): number | null {
  const ends = sets.flatMap((set) => (Number.isSafeInteger(set.completedAt) ? [set.completedAt!] : []))
  return ends.length ? Math.max(...ends) - startedAt : null
}

export type CalibrationSource = 'day' | 'user' | 'none'
export interface CalibrationSample { realSec: number; estimateSec: number }

// Pace from the user's finished workouts, newest first: this plan day when it has two, else all their days.
export function calibration(day: CalibrationSample[], user: CalibrationSample[]): { factor: number; samples: number; source: CalibrationSource } {
  const ratios = (samples: CalibrationSample[]) => samples
    .filter((sample) => sample.realSec > 0 && sample.realSec <= 3 * 3600 && sample.estimateSec > 0)
    .slice(0, 5)
    .map((sample) => (sample.realSec - SESSION_OVERHEAD) / sample.estimateSec)
    .sort((a, b) => a - b)
  for (const [source, samples] of [['day', day], ['user', user]] as const) {
    const sorted = ratios(samples)
    if (sorted.length < 2) continue
    const mid = sorted.length / 2
    const median = sorted.length % 2 ? sorted[Math.floor(mid)]! : (sorted[mid - 1]! + sorted[mid]!) / 2
    return { factor: Math.min(1.6, Math.max(0.75, median)), samples: sorted.length, source }
  }
  return { factor: COLD_FACTOR, samples: 0, source: 'none' }
}

function straightBlocks(sets: number[]): Block[] {
  return sets.map((count, index) => ({ items: [{ index, sets: count }], group: null }))
}

function groupedBlocks(sets: number[], groups: number[][]): Block[] {
  const groupOf = new Map<number, number>()
  groups.forEach((members, g) => members.forEach((index) => groupOf.set(index, g)))
  const blocks: Block[] = []
  const placed = new Set<number>()
  sets.forEach((_, index) => {
    const g = groupOf.get(index)
    if (g === undefined) { blocks.push({ items: [{ index, sets: sets[index]! }], group: null }); return }
    if (placed.has(g)) return
    placed.add(g)
    blocks.push({ items: groups[g]!.map((member) => ({ index: member, sets: sets[member]! })), group: `g${g + 1}` })
  })
  return blocks
}

function formGroups(exercises: DayExercise[], roles: Role[]): number[][] {
  const accessories = exercises.flatMap((exercise, index) => (known(roles[index]!) && exercise.sets > 0 ? [index] : []))
  const circuit: number[] = []
  for (const index of accessories) {
    if (roles[index] !== 'isolation') continue
    if (circuit.every((other) => nonCompeting(exercises[index]!.muscles, exercises[other]!.muscles))) circuit.push(index)
    if (circuit.length === 3) break
  }
  const groups = circuit.length === 3 ? [circuit] : []
  const paired = new Set(groups.flat())
  for (const a of accessories) {
    if (paired.has(a)) continue
    const b = accessories.find((other) => other > a && !paired.has(other) && nonCompeting(exercises[a]!.muscles, exercises[other]!.muscles))
    if (b === undefined) continue
    groups.push([a, b])
    paired.add(a).add(b)
  }
  return groups
}

export function compressDay(input: CompressionInput): CompressionResult {
  const { exercises, budgetMin } = input
  const low = input.lowReadiness ?? false
  const factor = input.factor ?? COLD_FACTOR
  const protectedKeys = input.protectedKeys ?? new Set<string>()
  const roles = exerciseRoles(exercises)
  const isProtected = (index: number) => protectedKeys.has(exerciseKey(exercises[index]!))
  const fullBlocks = straightBlocks(exercises.map((exercise) => exercise.sets))
  const fullEstimateSec = Math.round(SESSION_OVERHEAD + estimateSec(fullBlocks, roles, false, low) * factor)
  const budgetSec = budgetMin === null ? Infinity : budgetMin * 60

  const sets = exercises.map((exercise) => exercise.sets)
  let groups: number[][] = []
  let shortRest = false
  const blocks = () => (groups.length ? groupedBlocks(sets, groups) : straightBlocks(sets))
  const estimate = () => Math.round(SESSION_OVERHEAD + estimateSec(blocks(), roles, shortRest, low) * factor)
  const fits = () => estimate() <= budgetSec
  const result = (mode: CompressionResult['mode']): CompressionResult => ({
    mode, fits: fits(), blocks: blocks(), sets: [...sets], shortRest, estimateSec: estimate(), fullEstimateSec,
  })

  if (fits()) return result('full')
  const mode = input.straight ? 'straight' : 'compressed'

  // 1. Pairs and the isolation circuit.
  if (!input.straight) groups = formGroups(exercises, roles)
  if (fits()) return result(mode)

  // 2. Shorter isolation and group rests, on a normal day only.
  if (!low) shortRest = true
  if (fits()) return result(mode)

  // 3. Whole accessories that another kept accessory of the same class covers.
  for (;;) {
    const kept = (index: number) => sets[index]! > 0 && known(roles[index]!)
    const candidates = exercises.flatMap((exercise, index) => {
      if (!kept(index)) return []
      const coveredBy = exercises.some((other, o) => o !== index && kept(o) && roles[o] === roles[index]
        && exercise.muscles.every((muscle) => other.muscles.includes(muscle)))
      if (!coveredBy) return []
      const before = estimate()
      const saved = sets[index]!
      sets[index] = 0
      const gain = before - estimate()
      sets[index] = saved
      return [{ index, gain }]
    })
    if (!candidates.length) break
    candidates.sort((a, b) => Number(isProtected(a.index)) - Number(isProtected(b.index)) || b.gain - a.gain || b.index - a.index)
    sets[candidates[0]!.index] = 0
    if (fits()) return result(mode)
  }

  // 4–6. Accessory sets to 2, the main lift to 2, accessory sets to 1. A group loses a whole round at a time.
  const trimAccessories = (floor: number) => {
    for (;;) {
      const units = blocks().flatMap((block, at) => {
        const items = block.items.filter((item) => item.sets > 0 && roles[item.index] !== 'main' && roles[item.index] !== 'cardio')
        if (!items.length) return []
        const count = Math.max(...items.map((item) => item.sets))
        return count > floor ? [{ at, items, count, guarded: items.some((item) => isProtected(item.index)) }] : []
      })
      if (!units.length) return false
      units.sort((a, b) => Number(a.guarded) - Number(b.guarded) || b.count - a.count || b.at - a.at)
      const unit = units[0]!
      for (const item of unit.items) if (item.sets === unit.count) sets[item.index]! -= 1
      if (fits()) return true
    }
  }
  if (trimAccessories(2)) return result(mode)
  const main = roles.indexOf('main')
  while (main >= 0 && sets[main]! > 2) {
    sets[main]! -= 1
    if (fits()) return result(mode)
  }
  if (trimAccessories(1)) return result(mode)

  // 7. Maintenance: the main lift and one non-competing partner, two sets each, then one circuit round if it fits.
  sets.fill(0)
  groups = []
  shortRest = !low
  if (main < 0) return result('maintenance')
  sets[main] = Math.min(2, exercises[main]!.sets)
  const partner = exercises
    .map((exercise, index) => ({ exercise, index }))
    .filter(({ exercise, index }) => index !== main && known(roles[index]!) && exercise.sets > 0 && nonCompeting(exercise.muscles, exercises[main]!.muscles))
    .sort((a, b) => Number(roles[a.index] !== 'compound') - Number(roles[b.index] !== 'compound')
      || Number(isProtected(b.index)) - Number(isProtected(a.index)) || a.index - b.index)[0]
  if (partner) {
    sets[partner.index] = Math.min(2, partner.exercise.sets)
    if (!input.straight) groups = [[Math.min(main, partner.index), Math.max(main, partner.index)]]
  }
  if (!input.straight) {
    const rest = exercises.map((exercise, index) => (index === main || index === partner?.index ? { ...exercise, sets: 0 } : exercise))
    const circuit = formGroups(rest, roles).find((members) => members.length === 3)
    if (circuit) {
      const before = { sets: [...sets], groups }
      circuit.forEach((index) => { sets[index] = 1 })
      groups = [...groups, circuit]
      if (!fits()) { sets.splice(0, sets.length, ...before.sets); groups = before.groups }
    }
  }
  return result('maintenance')
}
