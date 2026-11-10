import { exercises as catalogue, normalizeExerciseName, type Exercise, type MuscleGroup } from '../../data/exercises'

export interface ExerciseRef { exerciseId: string; exerciseSource: 'global' | 'user'; name: string }
export interface MatchCandidate extends ExerciseRef { muscles?: readonly string[]; aliases?: readonly string[]; equipment?: string }

export type NameMatch =
  // otherEquipment: the variant names equipment the exercise does not use ("Bench Press (Dumbbell)"), so the row needs a look.
  | { status: 'matched'; exercise: ExerciseRef; via: 'name' | 'variant' | 'typo'; variant: string | null; otherEquipment?: true }
  | { status: 'generic' | 'unknown'; suggestions: ExerciseRef[] }

// Muscle names say which muscle, not which exercise: these always go to the user with suggestions.
const GENERIC_NAMES: Record<string, MuscleGroup[]> = {
  biceps: ['biceps'], bicepsy: ['biceps'], triceps: ['triceps'], tricepsy: ['triceps'],
  barki: ['shoulders'], bark: ['shoulders'], shoulders: ['shoulders'], plecy: ['back'], back: ['back'],
  klatka: ['chest'], 'klatka piersiowa': ['chest'], klata: ['chest'], chest: ['chest'],
  nogi: ['quads', 'hamstrings', 'glutes'], legs: ['quads', 'hamstrings', 'glutes'], uda: ['quads', 'hamstrings'],
  czworoglowe: ['quads'], dwuglowe: ['hamstrings'], quads: ['quads'], hamstrings: ['hamstrings'],
  posladki: ['glutes'], glutes: ['glutes'], lydki: ['calves'], calves: ['calves'],
  przywodziciele: ['adductors'], przywodziciel: ['adductors'], adductors: ['adductors'],
  odwodziciele: ['glutes'], odwodziciel: ['glutes'], abductors: ['glutes'],
  brzuch: ['core'], abs: ['core'], core: ['core'], przedramiona: ['forearms'], forearms: ['forearms'],
}

// A variant naming other equipment is another exercise: "wyciskanie na skosie hantle" is not the barbell press.
const EQUIPMENT_WORDS: [RegExp, string][] = [
  [/^(?:db|dbs|dumbbells?|hantl\w*|hantel\w*)$/, 'dumbbell'], [/^(?:bb|barbell|sztang\w*)$/, 'barbell'],
  [/^(?:cable|cables|wyciag\w*|link\w*)$/, 'cable'], [/^(?:machine|maszyn\w*)$/, 'machine'], [/^smith$/, 'smith'], [/^(?:kb|kettlebells?|kettl\w*)$/, 'kettlebell'],
]
const equipmentOf = (word: string) => EQUIPMENT_WORDS.find(([pattern]) => pattern.test(word))?.[1]
const otherEquipment = (candidate: MatchCandidate, variant: string | null) => normalizeExerciseName(variant ?? '').split(' ')
  .some((word) => { const equipment = equipmentOf(word); return Boolean(equipment && candidate.equipment && equipment !== candidate.equipment) })
const matched = (candidate: MatchCandidate, via: 'name' | 'variant' | 'typo', variant: string | null): NameMatch => ({
  status: 'matched', exercise: toRef(candidate), via, variant, ...(otherEquipment(candidate, variant) ? { otherEquipment: true as const } : {}),
})

const toRef = (exercise: MatchCandidate): ExerciseRef => ({ exerciseId: exercise.exerciseId, exerciseSource: exercise.exerciseSource, name: exercise.name })

export const catalogueCandidates: MatchCandidate[] = catalogue.map((exercise: Exercise) => ({
  exerciseId: exercise.id, exerciseSource: 'global', name: exercise.name, muscles: exercise.muscles, aliases: exercise.aliases, equipment: exercise.equipment,
}))

function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    previous = current
  }
  return previous[b.length]!
}

function namesOf(candidate: MatchCandidate): string[] {
  return [candidate.name, ...(candidate.aliases ?? [])].map(normalizeExerciseName)
}

// User exercises first: a name the user gave their own exercise is what they mean by it.
function exact(name: string, groups: MatchCandidate[][]): MatchCandidate | null {
  for (const group of groups) {
    const hit = group.find((candidate) => namesOf(candidate).includes(name))
    if (hit) return hit
  }
  return null
}

// typo: edit distance to the closest name; rank also counts a name that contains the other, for suggestions.
function nearest(name: string, candidates: MatchCandidate[], limit: number): { candidate: MatchCandidate; typo: number; rank: number }[] {
  const scored = candidates.map((candidate) => {
    const names = namesOf(candidate)
    const typo = Math.min(...names.map((known) => distance(name, known)))
    const contains = Math.min(...names.map((known) => (known.includes(name) || name.includes(known) ? Math.abs(known.length - name.length) / 4 : Infinity)))
    return { candidate, typo, rank: Math.min(typo, contains) }
  })
  return scored.sort((a, b) => a.rank - b.rank || a.typo - b.typo).slice(0, limit)
}

export function matchExerciseName(raw: string, userExercises: MatchCandidate[] = [], candidates = catalogueCandidates): NameMatch {
  const groups = [userExercises, candidates]
  const all = [...userExercises, ...candidates]
  const paren = raw.match(/^(.*?)\s*\(([^)]*)\)\s*(.*)$/)
  const base = paren ? `${paren[1]} ${paren[3]}` : raw
  const variantInParens = paren ? paren[2]!.trim() || null : null
  const full = normalizeExerciseName(raw)
  const name = normalizeExerciseName(base)
  if (!name) return { status: 'unknown', suggestions: [] }

  const direct = exact(full, groups)
  if (direct) return { status: 'matched', exercise: toRef(direct), via: 'name', variant: null }
  const generic = GENERIC_NAMES[name]
  if (generic) {
    const named = (candidate: MatchCandidate) => (namesOf(candidate).some((known) => known.split(' ').includes(name)) ? 0 : 1)
    const suggestions = all
      .filter((candidate) => candidate.muscles?.[0] && generic.includes(candidate.muscles[0] as MuscleGroup))
      .sort((a, b) => named(a) - named(b))
    return { status: 'generic', suggestions: suggestions.slice(0, 6).map(toRef) }
  }
  const named = exact(name, groups)
  if (named) return matched(named, variantInParens ? 'variant' : 'name', variantInParens)

  // Extra words keep an exercise only when no other exercise explains them: "Squat hack" is Hack Squat,
  // "Leg press skośny" is Leg Press with a variant, "Leg press calf raise" goes to the user.
  const words = name.split(' ')
  const claims = all.flatMap((candidate) => namesOf(candidate)
    .filter((known) => !GENERIC_NAMES[known])
    .map((known) => known.split(' '))
    .filter((known) => known.every((word) => words.includes(word)))
    .map((known) => ({ candidate, known })))
  // A leading modifier usually names another exercise ("Smith machine squat"), so the claim must hold the first word.
  const leading = claims.filter((claim) => claim.known.includes(words[0]!))
  const size = Math.max(0, ...leading.map((claim) => claim.known.length))
  const largest = leading.filter((claim) => claim.known.length === size)
  const winner = largest[0]?.candidate
  if (winner && !largest.some((claim) => claim.candidate !== winner && claim.candidate.exerciseSource === winner.exerciseSource)) {
    const covered = new Set(claims.filter((claim) => claim.candidate === winner).flatMap((claim) => claim.known))
    if (!claims.some((claim) => claim.candidate.exerciseId !== winner.exerciseId && claim.known.some((word) => !covered.has(word)))) {
      const rest = base.trim().split(/\s+/)
        .filter((word) => normalizeExerciseName(word).split(' ').some((part) => part && !covered.has(part))).join(' ')
      const variant = [rest, variantInParens].filter(Boolean).join(', ') || null
      return matched(winner, variant ? 'variant' : 'name', variant)
    }
  }

  // A typo is accepted only when one exercise is clearly closest.
  const allowed = name.length >= 12 ? 2 : name.length >= 5 ? 1 : 0
  const [best, runnerUp] = [...all].map((candidate) => ({ candidate, typo: Math.min(...namesOf(candidate).map((known) => distance(name, known))) }))
    .sort((a, b) => a.typo - b.typo)
  if (best && best.typo <= allowed && (!runnerUp || runnerUp.typo > best.typo)) {
    return matched(best.candidate, 'typo', variantInParens)
  }
  const ranked = nearest(name, all, 6)
  return { status: 'unknown', suggestions: ranked.filter((entry) => entry.rank <= Math.max(3, name.length / 2)).map((entry) => toRef(entry.candidate)) }
}
