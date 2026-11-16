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
  // Sets already logged; mid-session cut only.
  done?: number
}

export interface Block { items: { index: number; sets: number }[]; group: string | null }

export interface CompressionInput {
  exercises: DayExercise[]
  budgetMin: number | null
  straight?: boolean
  lowReadiness?: boolean
  // Pace from calibration(); the cold-start pace when omitted.
  factor?: number
  // Keys (`source:id`) the last workout of this plan day dropped (2) or cut (1); higher goes later.
  protectedKeys?: ReadonlyMap<string, number>
  // Present for a cut of the rest of an active session (Specyfikacja — skrócenie w trakcie sesji): `sets` is then logged + open.
  session?: SessionState
}

export interface SessionState {
  // Pairs and circuits the session already has, as exercise indexes.
  groups: number[][]
  shortRest: boolean
  // The exercise with the latest logged set and the seconds since, or null before the first set.
  last: { index: number; sinceSec: number } | null
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

// Seconds of the open sets only: no session overhead, the warm-up only before the first main-lift set, the rest still due
// after the latest set, and a change before every other block.
function openSec(blocks: Block[], roles: Role[], done: number[], shortRest: boolean, low: boolean, last: SessionState['last']): number {
  let total = 0
  let warmUp = false
  for (const block of blocks) {
    const items = block.items.filter((item) => item.sets > 0)
    const open = items.filter((item) => item.sets > done[item.index]!)
    if (!open.length) continue
    if (open.some((item) => roles[item.index] === 'main' && done[item.index] === 0)) warmUp = true
    total += last && items.some((item) => item.index === last.index) ? Math.max(0, restDue(items, last.index) - last.sinceSec) : CHANGE
    if (items.length === 1) {
      const { index, sets } = items[0]!
      const count = sets - done[index]!
      total += roles[index] === 'cardio' ? count * CARDIO_SET : count * WORK + (count - 1) * restSec(roles[index]!, shortRest, low)
      continue
    }
    const first = Math.min(...open.map((item) => done[item.index]! + 1))
    const rounds = Math.max(...items.map((item) => item.sets))
    for (let round = first; round <= rounds; round++) {
      const present = items.filter((item) => done[item.index]! < round && round <= item.sets).length
      total += present * WORK + Math.max(0, present - 1) * TRANSITION
      if (round < rounds) total += roundRest(items.filter((item) => item.sets >= round), roles, shortRest, low)
    }
  }
  return total + (warmUp ? WARM_UP : 0)

  // Like restAfterSet: nothing while the latest set's round is open, else the group's or the exercise's rest.
  function restDue(items: Block['items'], index: number): number {
    const round = done[index]!
    const peers = items.filter((item) => item.index !== index && item.sets >= round)
    if (peers.some((item) => done[item.index]! < round)) return 0
    return peers.length ? groupRestSec([roles[index]!, ...peers.map((item) => roles[item.index]!)], shortRest, low) : restSec(roles[index]!, shortRest, low)
  }
}

function roundRest(members: Block['items'], roles: Role[], shortRest: boolean, low: boolean): number {
  return members.length > 1 ? groupRestSec(members.map((item) => roles[item.index]!), shortRest, low) : restSec(roles[members[0]!.index]!, shortRest, low)
}

// Session pace from its own logged sets, first to latest: the model of the work in between (no overhead, warm-up or first
// set), blended with the prior by count so the first sets, usually the main lift, do not decide alone.
export function sessionPace(
  exercises: { group?: string; sets: { done: boolean; completedAt?: number }[] }[],
  roles: Role[],
  shortRest: boolean,
  low: boolean,
  prior: number,
): { factor: number; sets: number } {
  const times = exercises.flatMap((exercise) => exercise.sets.flatMap((set) => (set.done && Number.isSafeInteger(set.completedAt) ? [set.completedAt!] : [])))
  if (times.length < 2) return { factor: prior, sets: times.length }
  const counts = exercises.map((exercise) => exercise.sets.filter((set) => set.done).length)
  const blocks = sessionBlocks(counts, exercises.map((exercise) => exercise.group))
  const model = estimateSec(blocks, roles, shortRest, low) - (blocks.some((block) => block.items.some((item) => item.sets > 0 && roles[item.index] === 'main')) ? WARM_UP : 0) - WORK
  const real = (Math.max(...times) - Math.min(...times)) / 1000
  if (model <= 0) return { factor: prior, sets: times.length }
  const n = times.length
  return { factor: Math.min(1.6, Math.max(0.75, ((n * real) / model + 5 * prior) / (n + 5))), sets: n }
}

// A session's exercises as blocks: members of one group share a block at the first member's place.
export function sessionBlocks(counts: number[], groups: (string | undefined)[]): Block[] {
  const blocks: Block[] = []
  const byGroup = new Map<string, Block>()
  counts.forEach((sets, index) => {
    const group = groups[index]
    const existing = group ? byGroup.get(group) : undefined
    if (existing) { existing.items.push({ index, sets }); return }
    const block: Block = { items: [{ index, sets }], group: group ?? null }
    if (group) byGroup.set(group, block)
    blocks.push(block)
  })
  return blocks
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

// Pairs and the circuit from accessories outside `skip` (started or already grouped mid-session).
function formGroups(exercises: DayExercise[], roles: Role[], skip: ReadonlySet<number> = new Set()): number[][] {
  const accessories = exercises.flatMap((exercise, index) => (known(roles[index]!) && exercise.sets > 0 && !skip.has(index) ? [index] : []))
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
  const protectedKeys = input.protectedKeys ?? new Map<string, number>()
  const roles = exerciseRoles(exercises)
  const protection = (index: number) => protectedKeys.get(exerciseKey(exercises[index]!)) ?? 0
  const session = input.session
  const done = exercises.map((exercise) => (session ? exercise.done ?? 0 : 0))
  const existing = session?.groups ?? []
  const budgetSec = budgetMin === null ? Infinity : budgetMin * 60

  const sets = exercises.map((exercise) => exercise.sets)
  let groups: number[][] = [...existing]
  let shortRest = session?.shortRest ?? false
  const blocks = () => (groups.length ? groupedBlocks(sets, groups) : straightBlocks(sets))
  const estimate = () => Math.round(session
    ? openSec(blocks(), roles, done, shortRest, low, session.last) * factor
    : SESSION_OVERHEAD + estimateSec(blocks(), roles, shortRest, low) * factor)
  const fullEstimateSec = estimate()
  const fits = () => estimate() <= budgetSec
  const result = (mode: CompressionResult['mode']): CompressionResult => ({
    mode, fits: fits(), blocks: blocks(), sets: [...sets], shortRest, estimateSec: estimate(), fullEstimateSec,
  })

  if (fits()) return result('full')
  const mode = input.straight ? 'straight' : 'compressed'

  // 1. Pairs and the isolation circuit.
  if (!input.straight) groups = [...existing, ...formGroups(exercises, roles, new Set([...existing.flat(), ...done.flatMap((count, index) => (count > 0 ? [index] : []))]))]
  if (fits()) return result(mode)

  // 2. Shorter isolation and group rests, on a normal day only.
  if (!low) shortRest = true
  if (fits()) return result(mode)

  // 3. Whole accessories that another kept accessory of the same class covers; mid-session only ones not started.
  for (;;) {
    const kept = (index: number) => sets[index]! > 0 && known(roles[index]!)
    const candidates = exercises.flatMap((exercise, index) => {
      if (!kept(index) || done[index]! > 0) return []
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
    candidates.sort((a, b) => protection(a.index) - protection(b.index) || b.gain - a.gain || b.index - a.index)
    sets[candidates[0]!.index] = 0
    if (fits()) return result(mode)
  }

  // 4–6. Accessory sets to 2, the main lift to 2, accessory sets to 1. A group loses a whole round at a time; logged sets stay.
  const trimAccessories = (floor: number) => {
    for (;;) {
      const units = blocks().flatMap((block, at) => {
        const items = block.items.filter((item) => item.sets > done[item.index]! && roles[item.index] !== 'main' && roles[item.index] !== 'cardio')
        if (!items.length) return []
        const count = Math.max(...items.map((item) => item.sets))
        return count > floor ? [{ at, items, count, guarded: Math.max(...items.map((item) => protection(item.index))) }] : []
      })
      if (!units.length) return false
      units.sort((a, b) => a.guarded - b.guarded || b.count - a.count || b.at - a.at)
      const unit = units[0]!
      for (const item of unit.items) if (item.sets === unit.count) sets[item.index]! -= 1
      if (fits()) return true
    }
  }
  if (trimAccessories(2)) return result(mode)
  const main = roles.indexOf('main')
  while (main >= 0 && sets[main]! > Math.max(2, done[main]!)) {
    sets[main]! -= 1
    if (fits()) return result(mode)
  }
  if (trimAccessories(1)) return result(mode)

  // 7. Maintenance: the main lift and one non-competing partner, two sets each, then one circuit round if it fits.
  // Cardio stays as planned here too.
  if (session) return shortestRest()
  exercises.forEach((exercise, index) => { sets[index] = roles[index] === 'cardio' ? exercise.sets : 0 })
  groups = []
  shortRest = !low
  if (main < 0) return result('maintenance')
  sets[main] = Math.min(2, exercises[main]!.sets)
  const partner = exercises
    .map((exercise, index) => ({ exercise, index }))
    .filter(({ exercise, index }) => index !== main && known(roles[index]!) && exercise.sets > 0 && nonCompeting(exercise.muscles, exercises[main]!.muscles))
    .sort((a, b) => Number(roles[a.index] !== 'compound') - Number(roles[b.index] !== 'compound')
      || protection(b.index) - protection(a.index) || a.index - b.index)[0]
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

  // Mid-session: open sets only for the main lift and one partner (a started one first), two sets in all; a new pair only
  // when neither has started.
  function shortestRest(): CompressionResult {
    exercises.forEach((exercise, index) => { sets[index] = roles[index] === 'cardio' ? exercise.sets : done[index]! })
    groups = [...existing]
    shortRest = shortRest || !low
    if (main < 0) return result('maintenance')
    sets[main] = Math.max(done[main]!, Math.min(2, exercises[main]!.sets))
    const partner = exercises
      .map((exercise, index) => ({ exercise, index }))
      .filter(({ exercise, index }) => index !== main && known(roles[index]!) && exercise.sets > 0 && nonCompeting(exercise.muscles, exercises[main]!.muscles))
      .sort((a, b) => Number(done[a.index] === 0) - Number(done[b.index] === 0) || Number(roles[a.index] !== 'compound') - Number(roles[b.index] !== 'compound')
        || protection(b.index) - protection(a.index) || a.index - b.index)[0]
    if (partner) {
      sets[partner.index] = Math.max(done[partner.index]!, Math.min(2, partner.exercise.sets))
      const grouped = new Set(existing.flat())
      if (!input.straight && done[main] === 0 && done[partner.index] === 0 && !grouped.has(main) && !grouped.has(partner.index)) {
        groups = [...existing, [Math.min(main, partner.index), Math.max(main, partner.index)]]
      }
    }
    return result('maintenance')
  }
}
