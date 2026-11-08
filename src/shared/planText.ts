import { matchExerciseName, type ExerciseRef, type MatchCandidate, type NameMatch } from './exerciseMatch'
import { MAX_SESSION_EXERCISES, MAX_SET_REPS, MAX_SET_WEIGHT_KG } from './workoutLimits'

// Text format of a plan (PRODUCT.md, „Specyfikacja punktu 4A”). Every line of the input ends up in exactly one place:
// a day, an exercise or `skipped` with a reason.
export const MAX_PLAN_DAYS = 14
export const MAX_PLAN_SETS = 20
const MAX_NAME_LENGTH = 80
const LB_KG = 0.45359237

export interface ParsedExercise {
  line: number
  source: string
  name: string
  // Words the line had besides the name and the sets: a variant, "na łydkę", text after the weight.
  note: string | null
  sets: number
  targetReps: number
  targetWeight: number
  // Several set groups with different reps or weights were folded into one prescription.
  simplified: boolean
  match: NameMatch
  // The same exercise already appears earlier in this day.
  duplicate: boolean
}

export interface ParsedDay { name: string; line: number | null; exercises: ParsedExercise[] }

export type SkipReason = 'comment' | 'emptyDay' | 'tooManyDays' | 'tooManyExercises' | 'outOfRange'
export interface ParsedPlan {
  name: string | null
  days: ParsedDay[]
  skipped: { line: number; source: string; reason: SkipReason }[]
}

interface SetGroup { sets: number; reps: number; weight: number | null; written: boolean }

const GROUP = /(\d{1,3})\s*[x×*]\s*(\d{1,4})(?:\s*[-–]\s*(\d{1,4}))?|([1-9]\d?(?:\s*\/\s*[1-9]\d?)+)(?![\d/])/i
const TOKEN = new RegExp(`${GROUP.source}|@\\s*(\\d+(?:[.,]\\d+)?)\\s*(kg|lbs?)?|(\\d+(?:[.,]\\d+)?)\\s*(kg|lbs?)?(?![\\d.,]*\\s*[x×*/])`, 'gi')

const round2 = (value: number) => Math.round(value * 100) / 100
const number = (text: string) => Number.parseFloat(text.replace(',', '.'))

function stripComment(text: string): { text: string; comment: boolean } {
  const cut = text.replace(/\/\/.*$/, '').replace(/\s#.*$/, '')
  return { text: cut, comment: cut.trim() !== text.trim() }
}

function cleanLead(text: string): string {
  return text.replace(/^\s*(?:[-•*–]\s+|\d{1,2}[.)]\s+)+/, '').replace(/\*\*/g, '').trim()
}

function headerName(text: string): string {
  return text.replace(/^#+\s*/, '').replace(/[\s:–-]+$/, '').trim().slice(0, MAX_NAME_LENGTH)
}

function parseSets(rest: string): { groups: SetGroup[]; leftover: string } | null {
  const groups: SetGroup[] = []
  let unit: 'kg' | 'lb' | null = null
  const bare: SetGroup[] = []
  let leftover = ''
  let cursor = 0
  for (const token of rest.matchAll(TOKEN)) {
    leftover += ` ${rest.slice(cursor, token.index)}`
    cursor = token.index! + token[0].length
    const [, sets, reps, top, perSet, atWeight, atUnit, weight, weightUnit] = token
    if (sets !== undefined) {
      groups.push({ sets: Number(sets), reps: Number(top ?? reps), weight: null, written: false })
    } else if (perSet !== undefined) {
      const list = perSet.split('/').map((value) => Number(value.trim()))
      for (const reps of list) groups.push({ sets: 1, reps, weight: null, written: false })
    } else {
      const current = groups.at(-1)
      const explicit = (atUnit ?? weightUnit)?.toLowerCase().startsWith('l') ? 'lb' : (atUnit ?? weightUnit) ? 'kg' : null
      unit ??= explicit
      if (!current || current.weight !== null) {
        leftover += ` ${token[0]}`
        continue
      }
      const kg = number(atWeight ?? weight!)
      current.weight = explicit === 'lb' ? -kg : kg
      current.written = true
      if (!explicit) bare.push(current)
    }
  }
  leftover += ` ${rest.slice(cursor)}`
  if (!groups.length) return null
  // A weight without a unit takes the line's unit; pounds are marked negative until then.
  for (const group of groups) {
    if (group.weight === null) continue
    const pounds = group.weight < 0 || (bare.includes(group) && unit === 'lb')
    group.weight = round2(Math.abs(group.weight) * (pounds ? LB_KG : 1))
  }
  // "1x10, 1x8, 2x9 57,5kg": a group without a weight takes the next one written, else the previous.
  groups.forEach((group, index) => {
    if (group.weight !== null) return
    group.weight = groups.slice(index + 1).find((next) => next.weight !== null)?.weight
      ?? groups.slice(0, index).reverse().find((previous) => previous.weight !== null)?.weight
      ?? 0
  })
  return { groups, leftover: leftover.replace(/[\s,;]+/g, ' ').trim() }
}

// The plan model has one rep target and one weight per exercise: sets add up, and the group with the most sets
// (then the heavier, then more reps) gives the reps and the weight.
function fold(all: SetGroup[]): { sets: number; reps: number; weight: number; simplified: boolean } {
  // "4x8 2x8 82 kg 2x8 91 kg": a first group that sums the rest is a summary, not more sets.
  const [head, ...tail] = all
  const summary = tail.length >= 2 && !head!.written && tail.every((group) => group.reps === head!.reps)
    && head!.sets === tail.reduce((sum, group) => sum + group.sets, 0)
  const groups = summary ? tail : all
  const main = [...groups].sort((a, b) => b.sets - a.sets || b.weight! - a.weight! || b.reps - a.reps)[0]!
  return {
    sets: groups.reduce((sum, group) => sum + group.sets, 0),
    reps: main.reps,
    weight: main.weight!,
    simplified: groups.some((group) => group.reps !== main.reps || group.weight !== main.weight),
  }
}

export function parsePlanText(text: string, userExercises: MatchCandidate[] = []): ParsedPlan {
  const lines = text.replace(/\r/g, '').split('\n')
  const skipped: ParsedPlan['skipped'] = []
  const blocks: { header: { name: string; line: number } | null; exercises: ParsedExercise[]; overflow: number[] }[] = []

  lines.forEach((raw, index) => {
    const line = index + 1
    const { text: uncommented, comment } = stripComment(raw)
    const cleaned = cleanLead(uncommented)
    if (!cleaned) {
      if (comment) skipped.push({ line, source: raw, reason: 'comment' })
      return
    }
    const first = cleaned.match(GROUP)
    if (!first) {
      blocks.push({ header: { name: headerName(cleaned) || `Day ${blocks.length + 1}`, line }, exercises: [], overflow: [] })
      return
    }
    const before = cleaned.slice(0, first.index).replace(/[\s:–,-]+$/, '').trim()
    const parsed = parseSets(cleaned.slice(first.index))!
    const name = (before || parsed.leftover).slice(0, MAX_NAME_LENGTH)
    const note = before ? parsed.leftover || null : null
    const { sets, reps, weight, simplified } = fold(parsed.groups)
    if (!name || sets < 1 || sets > MAX_PLAN_SETS || reps > MAX_SET_REPS || weight > MAX_SET_WEIGHT_KG) {
      skipped.push({ line, source: raw, reason: 'outOfRange' })
      return
    }
    if (!blocks.length) blocks.push({ header: null, exercises: [], overflow: [] })
    const block = blocks.at(-1)!
    if (block.exercises.length >= MAX_SESSION_EXERCISES) {
      skipped.push({ line, source: raw, reason: 'tooManyExercises' })
      return
    }
    block.exercises.push({
      line, source: raw, name, note, sets, targetReps: reps, targetWeight: weight, simplified,
      match: matchExerciseName(name, userExercises), duplicate: false,
    })
  })

  // Two headers before the first exercise: the first one names the plan.
  let planName: string | null = null
  if (blocks.length >= 2 && blocks[0]!.header && !blocks[0]!.exercises.length && blocks[1]!.header) {
    planName = blocks.shift()!.header!.name
  }
  const days: ParsedDay[] = []
  for (const block of blocks) {
    if (!block.exercises.length) {
      skipped.push({ line: block.header!.line, source: lines[block.header!.line - 1]!, reason: 'emptyDay' })
      continue
    }
    if (days.length >= MAX_PLAN_DAYS) {
      if (block.header) skipped.push({ line: block.header.line, source: lines[block.header.line - 1]!, reason: 'tooManyDays' })
      for (const exercise of block.exercises) skipped.push({ line: exercise.line, source: exercise.source, reason: 'tooManyDays' })
      continue
    }
    const seen = new Set<string>()
    for (const exercise of block.exercises) {
      if (exercise.match.status !== 'matched') continue
      const key = `${exercise.match.exercise.exerciseSource}:${exercise.match.exercise.exerciseId}`
      exercise.duplicate = seen.has(key)
      seen.add(key)
    }
    days.push({ name: block.header?.name ?? `Day ${days.length + 1}`, line: block.header?.line ?? null, exercises: block.exercises })
  }
  skipped.sort((a, b) => a.line - b.line)
  return { name: planName, days, skipped }
}

export interface PlanTextExercise { name: string; sets: number; targetReps: number; targetWeight: number }
export interface PlanTextInput { name: string; days: { name: string; exercises: PlanTextExercise[] }[] }

const weightText = (kg: number) => String(round2(kg))

export function planToText(plan: PlanTextInput): string {
  const days = plan.days.map((day) => [
    day.name,
    ...day.exercises.map((exercise) => `${exercise.name} ${exercise.sets}x${exercise.targetReps}${exercise.targetWeight > 0 ? ` @${weightText(exercise.targetWeight)} kg` : ''}`),
  ].join('\n'))
  return [plan.name, ...days].join('\n\n')
}

export interface ResolvedPlanExercise extends ExerciseRef { sets: number; targetReps: number; targetWeight: number }
// The plan ready for `/api/save-template`, or null while a line still needs the user.
export function resolvedPlan(parsed: ParsedPlan, fallbackName = 'Pasted plan'): { name: string; days: { name: string; exercises: ResolvedPlanExercise[] }[] } | null {
  if (!parsed.days.length) return null
  const days = parsed.days.map((day) => ({
    name: day.name,
    exercises: day.exercises.flatMap((exercise) => (exercise.match.status === 'matched' && !exercise.duplicate
      ? [{ ...exercise.match.exercise, sets: exercise.sets, targetReps: exercise.targetReps, targetWeight: exercise.targetWeight }]
      : [])),
  }))
  const open = parsed.days.some((day) => day.exercises.some((exercise) => exercise.match.status !== 'matched' || exercise.duplicate))
  return open ? null : { name: parsed.name ?? fallbackName, days }
}
