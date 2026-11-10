import { matchExerciseName, type ExerciseRef, type MatchCandidate, type NameMatch } from './exerciseMatch'
import { kgToDisplayWeight, type WeightUnits } from './weightUnits'
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
  // The written line whose numbers were left unexplained or read by a guess; the preview shows it next to the numbers.
  check: string | null
}

export interface ParsedDay { name: string; line: number | null; exercises: ParsedExercise[] }

export type SkipReason = 'comment' | 'warmUp' | 'emptyDay' | 'tooManyDays' | 'tooManyExercises' | 'outOfRange'
export interface ParsedPlan {
  name: string | null
  days: ParsedDay[]
  skipped: { line: number; source: string; reason: SkipReason }[]
}

interface SetGroup { sets: number; reps: number; weight: number | null; written: boolean }

// The second number of "3x8-12" is not taken when a unit follows it: "3x5 - 100kg" is a weight after a dash.
// Effort, percent, 1RM, rest and tempo stay in the note; without this their number would be read as kilograms.
const GROUP = /(\d{1,3})\s*[x×*]\s*(\d{1,4}(?![\d]|[.,]\d)|(?:amrap|maks|max|failure)\b)(?:\s*[-–]\s*(\d{1,4})(?![\d.,]*\s*(?:kg|lbs?)|\d))?|([1-9]\d?(?:\s*\/\s*[1-9]\d?)+)(?![\d/])/i
const NUM = '\\d+(?:[.,]\\d+)?'
const TIME = '(?:s|sec|secs|sek|seconds?|min|mins|minut[ya]?|minutes?)'
const ASIDE = `@?\\s*(?:rpe|rir)\\s*:?\\s*${NUM}(?:\\s*[-–]\\s*${NUM})?|\\b(?:rest|przerwa|tempo)\\s*:?\\s*\\d[\\d.,:/–-]*(?:\\s*${TIME}\\b)?|@?\\s*${NUM}(?:\\s*[-–]\\s*${NUM})?\\s*(?:%|(?:rpe|rir)\\b)|(?<!@\\s*)\\b${NUM}(?:\\s*[-–]\\s*${NUM})?\\s*${TIME}\\b|\\b\\d{1,2}\\s*rm\\b`
// "2/0/2 tempo" goes before the sets so its slashes are not read as reps per set.
const TEMPO_FIRST = '\\d+(?:[/:–-]\\d+){2,}\\s*tempo\\b'
const TOKEN = new RegExp(`${TEMPO_FIRST}|${GROUP.source}|${ASIDE}|@\\s*(${NUM})\\s*(kg|lbs?)?|(${NUM})\\s*(kg|lbs?)?(?![\\d.,]*\\s*[x×*/])`, 'gi')
const WARM_UP = '(?:warm[\\s-]?ups?|rozgrzewk[aioę]|rozgrzewkowe)'
const NOTE_LINE = new RegExp(`^(?:super\\s?set|superseri[ae]|giant set|rest|przerwa|notes?|uwag[ai]|${WARM_UP})(?![a-z\\u00c0-\\u024f])`, 'i')
// The plan holds working sets only: "Warm-up: Squat 2x10", "Squat warm-up 2x10", "Squat 2x10 40kg (warm-up sets)".
const WARM_UP_NAME = new RegExp(`(?:^|[^a-z])${WARM_UP}(?![a-z\\u00c0-\\u024f])`, 'i')
const WARM_UP_NOTE = new RegExp(`^\\(?${WARM_UP}(?:\\s+(?:sets?|seri[ae]))?\\)?$`, 'i')
// "Week 1/2", "Mon 10/11", "Trening 12/11": a slash pair after a calendar word, or alone, is a heading and not two sets.
// Share text of other apps (Strong, Hevy): the exercise on its own line, then lines like "Set 2: 225 lbs x 5".
// A "W" set (Strong) is a warm-up.
const SET_LINE = /^(?:set\s*\d{1,2}|(w))\s*[:.)-]?\s*(?:\+?(\d+(?:[.,]\d+)?)\s*(kg|lbs?)?\s*[x×]\s*)?(\d{1,3})\s*(?:reps?\b)?(.*)$/i
const SHARE_NOTE = /^(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+(?:\d{1,2}\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|(?:volume|duration|total|czas|objęto[sś][cć])\s*:)/i
const CALENDAR = /^(?:week|wk|tydz(?:ie[nń])?|tyg(?:odni[ae])?|day|dzie[nń]|mon|tue|wed|thu|fri|sat|sun|pon|wt|[śs]r|czw|pt|sob|niedz?|nd|trening|training|workout|session|sesja)[a-z\u00c0-\u024f]*\.?$/i

const round2 = (value: number) => Math.round(value * 100) / 100
const number = (text: string) => Number.parseFloat(text.replace(',', '.'))

function stripComment(text: string): { text: string; comment: boolean } {
  const cut = text.replace(/\/\/.*$/, '').replace(/\s#.*$/, '')
  return { text: cut, comment: cut.trim() !== text.trim() }
}

function cleanLead(text: string): string {
  return text
    // A chat export line: "[11/9/26, 8:03 PM] Coach: …" or "11/9/26, 20:03 - Coach: …".
    .replace(/^\[\d{1,2}[./]\d{1,2}[./]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AP]M)?\]\s*[^:]{1,40}:\s*/i, '')
    .replace(/^\d{1,2}[./]\d{1,2}[./]\d{2,4},\s+\d{1,2}:\d{2}\s*(?:[AP]M)?\s+-\s+[^:]{1,40}:\s*/i, '')
    .replace(/^\s*(?:[-•*–]\s+|\d{1,2}[.)]\s+)+/, '')
    // Superset and tier labels: "A1 Bench", "T1: Squat".
    .replace(/^(?:[a-e][1-9]|t[1-3])[.:)]?\s+/i, '').replace(/\*\*/g, '').trim()
}

function headerName(text: string): string {
  return text.replace(/^#+\s*/, '').replace(/[\s:–—-]+$/, '').trim().slice(0, MAX_NAME_LENGTH)
}

// "3 sets x 8-10 reps", "3 sets of 5", "4 sets, 10 reps", "8 reps x 3 sets", "3 serie po 8" → "3x8"; "3 sets: 10, 8, 6" → "10/8/6".
// Reps before sets do not swap when that "sets" starts its own group: "2 sets of 12 reps, 1 set of 8 reps".
function plainSets(text: string): { text: string; guessed: boolean } {
  let guessed = false
  const out = text
    .replace(/(\d{1,3})\s*(?:sets?|seri[ei]|serii|series)\s*(?:to|do)\s*(?:failure|upadku)/gi, '$1xfailure')
    // "225x5x3" is weight × reps × sets when the first number is too big for sets; "3x5x140" stays sets × reps × weight.
    .replace(/(\d{2,4}(?:[.,]\d+)?)\s*[x×*]\s*(\d{1,2})\s*[x×*]\s*(\d{1,2})(?![\d.,x×*])/gi,
      (all, weight: string, reps: string, sets: string) => (Number.parseFloat(weight) > 20 ? (guessed = true, `${sets}x${reps} ${weight}`) : all))
    // One set written weight first: "405x3", "100kg x5", "65% x5+" (5/3/1), so it is not read as 405 sets.
    .replace(/(?<![\d.,x×*])(\d{2,4}(?:[.,]\d+)?)\s*[x×]\s*(\d{1,2})\+?(?!\d|[.,]\d|\s*[x×*])/gi,
      (all, weight: string, reps: string) => (Number.parseFloat(weight) > 20 ? (guessed = true, `1x${reps} ${weight}`) : all))
    .replace(/(\d+(?:[.,]\d+)?)\s*(kg|lbs?|%)\s*[x×]\s*(\d{1,2})\+?(?!\d|[.,]\d|\s*[x×*])/gi, (_all, weight: string, unit: string, reps: string) =>
      `1x${reps} ${unit === '%' ? '@' : ''}${weight}${unit}`)
    .replace(/(\d{1,2})\s*(?:sets?|seri[ei]|serii|series)\s*:?\s*(\d{1,3}(?:\s*,\s*\d{1,3})+)(?![\d.,]*\s*(?:kg|lbs?))/gi,
      (all, count: string, list: string) => {
        const reps = list.split(',').map((value) => value.trim())
        return reps.length === Number(count) && reps.every((value) => /^[1-9]\d?$/.test(value)) ? reps.join('/') : all
      })
    .replace(/(\d{1,4})\s*reps?\s*[x×*,]?\s*(\d{1,3})\s*sets?(?![a-z\u00c0-\u024f])(?!\s*(?:of|po|[x×*:])\s*\d)/gi, '$2x$1')
    .replace(/(\d{1,3})\s*(?:sets?|seri[ei]|serii|series)(?![a-z\u00c0-\u024f])\s*(?:of|po|[x×*,:–-])?\s*(?!1x)(?=\d|amrap|maks|max|failure)/gi, '$1x')
    .replace(/(\d)\s*(?:reps?|powt(?:[óo]rze(?:[nń]|nia)|\.)?)(?![a-z\u00c0-\u024f])/gi, '$1')
    // "Pull-up 3 sets": sets without a rep target.
    .replace(/(?<![\d.,x×*/])(\d{1,2})\s*(?:sets?|seri[ei]|serii)(?![a-z\u00c0-\u024f])(?!\s*(?:[x×*:,–-]|of|po|to|do)?\s*\d)/gi, '$1x0')
  return { text: out, guessed }
}

function parseSets(rest: string, fallback: 'kg' | 'lb'): { groups: SetGroup[]; leftover: string; check: boolean } | null {
  const groups: SetGroup[] = []
  let unit: 'kg' | 'lb' | null = null
  const bare: SetGroup[] = []
  let leftover = ''
  let check = false
  let cursor = 0
  for (const token of rest.matchAll(TOKEN)) {
    const gap = rest.slice(cursor, token.index)
    if (/\d/.test(gap)) check = true
    leftover += ` ${gap}`
    cursor = token.index! + token[0].length
    const [, sets, reps, top, perSet, atWeight, atUnit, weight, weightUnit] = token
    if (sets !== undefined) {
      const count = Number(reps)
      const group: SetGroup = { sets: Number(sets), reps: Number.isNaN(count) ? 0 : count, weight: null, written: false }
      groups.push(group)
      if (Number.isNaN(count)) leftover += ` ${reps}`
      else if (top !== undefined) {
        // "3x6-15" is a rep range. With spaces, "3x5 - 100" is a weight when the number is too far from the reps to be one.
        const spaced = /\s[-–]|[-–]\s/.test(token[0])
        const far = Number(top) > Math.max(count * 2, count + 4)
        if (spaced && far) { group.weight = Number(top); group.written = true; bare.push(group) }
        else group.reps = Math.max(count, Number(top))
        if (spaced || Number(top) > 30) check = true
      }
    } else if (perSet !== undefined) {
      const list = perSet.split('/').map((value) => Number(value.trim()))
      for (const reps of list) groups.push({ sets: 1, reps, weight: null, written: false })
      if (list.some((reps) => reps > 30)) check = true
    } else if (atWeight === undefined && weight === undefined) {
      leftover += ` ${token[0]}`
      // "DB curl 3x12 25s" is 25 lb dumbbells as often as 25 seconds.
      if (/^\s*\d+\s*s$/i.test(token[0]) && !/\b(?:rest|przerwa|odpoczynek|hold|plank|pause|pauza|pauzą)/i.test(rest)) check = true
    } else {
      const current = groups.at(-1)
      const explicit = (atUnit ?? weightUnit)?.toLowerCase().startsWith('l') ? 'lb' : (atUnit ?? weightUnit) ? 'kg' : null
      unit ??= explicit
      if (!current || current.weight !== null) {
        leftover += ` ${token[0]}`
        check = true
        continue
      }
      // "Squat 3x5 week 2", "3x8, 8": a bare number after a word or a comma may be no weight at all.
      if (!explicit && atWeight === undefined && /[a-wyz\u00c0-\u024f,]/i.test(gap)) check = true
      // "Leg press 4x12 3 plates": a bare number followed by a word may count something else.
      const after = rest.slice(cursor).match(/^\s*([a-z\u00c0-\u024f]+)/i)?.[1]
      if (!explicit && after && !/^(?:rpe|rir|tempo|rest|przerwa|x)$/i.test(after)) check = true
      const kg = number(atWeight ?? weight!)
      current.weight = explicit === 'lb' ? -kg : kg
      current.written = true
      if (!explicit) bare.push(current)
    }
  }
  const tail = rest.slice(cursor)
  if (/\d/.test(tail)) check = true
  leftover += ` ${tail}`
  if (!groups.length) return null
  // A weight without a unit takes the line's unit; pounds are marked negative until then.
  for (const group of groups) {
    if (group.weight === null) continue
    const pounds = group.weight < 0 || (bare.includes(group) && (unit ?? fallback) === 'lb')
    group.weight = round2(Math.abs(group.weight) * (pounds ? LB_KG : 1))
  }
  // "1x10, 1x8, 2x9 57,5kg": a group without a weight takes the next one written, else the previous.
  groups.forEach((group, index) => {
    if (group.weight !== null) return
    group.weight = groups.slice(index + 1).find((next) => next.weight !== null)?.weight
      ?? groups.slice(0, index).reverse().find((previous) => previous.weight !== null)?.weight
      ?? 0
  })
  const words = leftover.split(/[\s,;]+/).filter((word) => !/^(?:[^a-z\d\u00c0-\u024f]*|x)$/i.test(word))
  // "Curl 3x12 2x10kg": a unit left without its number means the weight was read as something else.
  if (words.some((word) => /^(?:kg|lbs?)$/i.test(word))) check = true
  return { groups, leftover: words.join(' '), check }
}

// A pasted table: spreadsheet cells come with tabs, a markdown table with pipes. A row is rewritten into an ordinary
// plan line ("Bench press 5x5 90 kg RPE 8") so one reader handles every notation.
type Column = 'day' | 'name' | 'sets' | 'reps' | 'scheme' | 'weight' | 'rpe' | 'rest' | 'skip'
interface TableState { columns: Column[] | null; unit: string }
type TableRow = { skip: true } | { skip?: false; day: string | null; text: string; check: boolean }

const COLUMN_WORDS: [RegExp, Column][] = [
  [/^(?:day|dzie[nń]|dni)$/, 'day'],
  [/^(?:exercises?|[cć]wiczeni[ea]|name|nazwa|movement|lift)$/, 'name'],
  [/^(?:sets?\s*[x×/]\s*reps?|seri[ei]\s*[x×/]\s*powt[a-zÀ-ɏ]*\.?|sets?\s*(?:and|&|i)\s*reps?)$/, 'scheme'],
  [/^(?:sets?|seri[ei]|serii)$/, 'sets'],
  [/^(?:reps?|repetitions|powt[a-zÀ-ɏ]*\.?)$/, 'reps'],
  [/^(?:weight|load|ci[eę][zż]ar|obci[aą][zż]enie|waga|kg|lbs?)$/, 'weight'],
  [/^(?:rpe|rir)$/, 'rpe'], [/^(?:rest|przerwa|odpoczynek)$/, 'rest'],
]
const NUMBER_CELL = /^\d+(?:[.,]\d+)?$/

function tableCells(raw: string): string[] | null {
  if (raw.split('\t').length >= 3) return raw.split('\t').map((cell) => cell.trim())
  if (raw.split('|').length < 3) return null
  return raw.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim())
}

function tableRow(raw: string, state: TableState): TableRow | null {
  const cells = tableCells(raw)
  if (!cells) return null
  const filled = cells.filter(Boolean)
  // A lone cell is a title or a day name in the sheet; it is read as an ordinary line.
  if (filled.length < 2) return filled.length ? { day: null, text: filled[0]!, check: false } : { skip: true }
  if (filled.every((cell) => /^:?-{2,}:?$/.test(cell))) return { skip: true }

  const header = cells.map((cell) => {
    const word = cell.toLowerCase().replace(/[[(]\s*(?:kg|lbs?)\s*[\])]|[:#*]/g, '').trim()
    return COLUMN_WORDS.find(([pattern]) => pattern.test(word))?.[1]
  })
  if (!cells.some((cell) => /\d/.test(cell)) && header.filter(Boolean).length >= 2) {
    state.columns = header.map((column) => column ?? 'skip')
    const unit = cells[state.columns.indexOf('weight')]?.match(/\b(kg|lbs?)\b/i)?.[1]
    state.unit = unit ? ` ${unit.toLowerCase()}` : ''
    return { skip: true }
  }

  let check = false
  let columns = state.columns
  if (!columns || columns.length < cells.length || !columns.includes('name')) {
    // Without a header row the usual order is assumed: an optional day or index, the name, then sets, reps and weight.
    const name = cells.findIndex((cell, index) => /[a-z\u00c0-\u024f]{3}/i.test(cell) && !NUMBER_CELL.test(cell) && cells.slice(index + 1).some((next) => /^\d/.test(next)))
    if (name < 0) return { day: null, text: filled.join(' '), check: false }
    const numbers = ['sets', 'reps', 'weight'] as Column[]
    columns = cells.map((cell, index) => (index < name ? (cell && !NUMBER_CELL.test(cell) && index === name - 1 ? 'day' : 'skip') : index === name ? 'name' : numbers.shift() ?? 'skip'))
    state.unit = ''
    const [first, second] = [cells[name + 1] ?? '', cells[name + 2] ?? '']
    if (cells.slice(name + 4).some(Boolean) || !second || Number.parseFloat(first) > Number.parseFloat(second)) check = true
  }
  const at = (column: Column) => cells[columns!.indexOf(column)] ?? ''
  const name = at('name')
  if (!name) return { day: at('day') || null, text: filled.join(' '), check: false }

  let scheme = at('scheme')
  const [sets, reps] = [at('sets').replace(/\s*sets?$/i, ''), at('reps').replace(/\s*reps?$/i, '')]
  if (!scheme && sets && reps) {
    const top = sets.match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})$/)
    if (top) check = true
    // "8/8/6" already says how many sets there are.
    scheme = reps.includes('/') ? reps : `${top ? top[2] : sets}x${reps}`
  }
  // Cells that hold their own notation ("3x8", "3 sets of 8") are read as written.
  if (!scheme) return { day: at('day') || null, text: filled.join(' '), check }

  let weight = at('weight')
  const each = weight.match(/^\d\s*[x×]\s*(\d+(?:[.,]\d+)?\s*(?:kg|lbs?)?)$/i)
  if (each) { weight = each[1]!; check = true }
  if (!/^\d/.test(weight)) weight = ''
  else if (NUMBER_CELL.test(weight)) weight += state.unit
  const aside = [
    at('rpe') && `RPE ${at('rpe').replace(/^(?:rpe|rir)\s*/i, '')}`,
    at('rest') && `rest ${at('rest')}`,
  ].filter(Boolean).join(' ')
  return { day: at('day') || null, text: [name, scheme, weight, aside].filter(Boolean).join(' '), check }
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

// A weight without a unit is in the user's units: "Squat 3x5 225" from a pounds user is 225 lb.
export function parsePlanText(text: string, userExercises: MatchCandidate[] = [], units: WeightUnits = 'kg'): ParsedPlan {
  const lines = text.replace(/\r/g, '').split('\n')
  const skipped: ParsedPlan['skipped'] = []
  const blocks: { header: { name: string; line: number } | null; exercises: ParsedExercise[]; overflow: number[] }[] = []
  const groupsOf = new Map<ParsedExercise, SetGroup[]>()
  const linesOf = new Map<ParsedExercise, { line: number; source: string }[]>()
  let lastLine = 0
  let shared: ParsedExercise | null = null
  let pendingCheck: string | null = null
  let dropping = -1

  const table: TableState = { columns: null, unit: '' }
  lines.forEach((raw, index) => {
    const line = index + 1
    const row = tableRow(raw, table)
    // What the preview shows for a row to check: table cells are set apart by tabs, which do not show.
    const written = raw.trim().replace(/\s*\t\s*/g, '  ')
    if (row?.skip) {
      skipped.push({ line, source: raw, reason: 'comment' })
      return
    }
    // A sheet may repeat the day in every row.
    if (row?.day && blocks.at(-1)?.header?.name !== headerName(row.day)) blocks.push({ header: { name: headerName(row.day), line }, exercises: [], overflow: [] })
    const { text: uncommented, comment } = row ? { text: row.text, comment: false } : stripComment(raw)
    const plain = plainSets(cleanLead(uncommented))
    const cleaned = plain.text
    if (!cleaned) {
      if (comment) skipped.push({ line, source: raw, reason: 'comment' })
      return
    }
    if (SHARE_NOTE.test(cleanLead(uncommented))) {
      skipped.push({ line, source: raw, reason: 'comment' })
      return
    }
    const previousLine = lastLine
    lastLine = line
    const set = cleanLead(uncommented).match(SET_LINE)
    if (set) {
      const block = blocks.at(-1)
      const chained = shared !== null && linesOf.get(shared)!.at(-1)!.line === previousLine
      const opens = !chained && Boolean(block?.header) && !block!.exercises.length && block!.header!.line === previousLine
      // A set line that is not kept stays part of its exercise, so the set lines after it still belong there.
      const pass = (reason: SkipReason) => {
        skipped.push({ line, source: raw, reason })
        lastLine = previousLine
        if (reason === 'warmUp') return
        if (chained) shared!.check ??= raw.trim()
        else if (opens) pendingCheck ??= raw.trim()
      }
      if (dropping === previousLine) {
        skipped.push({ line, source: raw, reason: 'tooManyExercises' })
        dropping = line
        return
      }
      if (set[1] || WARM_UP_NAME.test(set[5] ?? '')) return pass('warmUp')
      const pounds = set[3] ? set[3].toLowerCase().startsWith('l') : units === 'lbs'
      const group: SetGroup = { sets: 1, reps: Number(set[4]), weight: set[2] ? round2(number(set[2]) * (pounds ? LB_KG : 1)) : 0, written: true }
      const odd = /\S/.test(set[5] ?? '')
      if ((chained || opens) && (group.reps > MAX_SET_REPS || group.weight! > MAX_SET_WEIGHT_KG)) return pass('outOfRange')
      if (chained) {
        const all = [...groupsOf.get(shared!)!, group]
        const merged = fold(all)
        if (merged.sets > MAX_PLAN_SETS) return pass('outOfRange')
        if (odd) shared!.check ??= raw.trim()
        groupsOf.set(shared!, all)
        linesOf.get(shared!)!.push({ line, source: raw })
        Object.assign(shared!, { sets: merged.sets, targetReps: merged.reps, targetWeight: merged.weight, simplified: merged.simplified })
        return
      }
      if (opens) {
        const { name, line: nameLine } = block!.header!
        blocks.pop()
        if (!blocks.length) blocks.push({ header: null, exercises: [], overflow: [] })
        const host = blocks.at(-1)!
        if (host.exercises.length >= MAX_SESSION_EXERCISES) {
          for (const entry of [nameLine, line]) skipped.push({ line: entry, source: lines[entry - 1]!, reason: 'tooManyExercises' })
          dropping = line
          return
        }
        const match = matchExerciseName(name, userExercises)
        const guessed = odd || (match.status === 'matched' && match.otherEquipment) ? raw.trim() : null
        shared = { line: nameLine, source: lines[nameLine - 1]!, name, note: null, sets: 1, targetReps: group.reps, targetWeight: group.weight!,
          simplified: false, match, duplicate: false, check: pendingCheck ?? guessed }
        pendingCheck = null
        host.exercises.push(shared)
        groupsOf.set(shared, [group])
        linesOf.set(shared, [{ line: nameLine, source: shared.source }, { line, source: raw }])
        return
      }
    }
    pendingCheck = null
    const first = cleaned.match(GROUP)
    if (!first) {
      if (NOTE_LINE.test(cleaned)) skipped.push({ line, source: raw, reason: 'comment' })
      else blocks.push({ header: { name: headerName(cleaned) || `Day ${blocks.length + 1}`, line }, exercises: [], overflow: [] })
      return
    }
    let before = cleaned.slice(0, first.index).replace(/[\s:–—,-]+$/, '').trim()
    let rest = cleaned.slice(first.index)
    // "Squat 100kg 3x5", and "Bench press 60 kg x 8 x 4" where the weight comes first and the sets last.
    const lead = before.match(/^(.*?)[\s:–—,@-]*(\d+(?:[.,]\d+)?\s*(?:kg|lbs?))(?:\s*([x×*]))?$/i)
    if (lead) {
      const group = lead[3] && first[3] === undefined && /^\d+$/.test(first[2] ?? '') ? `${first[2]}x${first[1]}` : first[0]
      rest = `${group} ${lead[2]}${rest.slice(first[0].length)}`
      before = lead[1]!
    }
    if (first[4] !== undefined && (CALENDAR.test(before)
      || (!before && rest.trim() === first[0] && first[4].split('/').length === 2))) {
      blocks.push({ header: { name: headerName(cleaned), line }, exercises: [], overflow: [] })
      return
    }
    const parsed = parseSets(rest, units === 'lbs' ? 'lb' : 'kg')!
    let name = (before || parsed.leftover).slice(0, MAX_NAME_LENGTH)
    const note = before ? parsed.leftover || null : null
    let { groups, check } = parsed
    if (plain.guessed || row?.check) check = true
    if (WARM_UP_NAME.test(name) || WARM_UP_NOTE.test(note ?? '')) {
      // "Squat warm up 2x5 then 3x5 100kg": the sets after "then" are working sets.
      const working = WARM_UP_NAME.test(name) ? rest.split(/\b(?:then|potem|nast[eę]pnie|working|robocze)\b/i)[1] : undefined
      const after = working === undefined ? null : parseSets(working, units === 'lbs' ? 'lb' : 'kg')
      if (!after) {
        skipped.push({ line, source: raw, reason: 'warmUp' })
        return
      }
      groups = after.groups
      name = name.replace(new RegExp(WARM_UP, 'gi'), ' ').replace(/\s+/g, ' ').trim()
      check = true
    }
    const match = matchExerciseName(name, userExercises)
    // "T1", "A2" label the exercise; any other number left in the name was not read.
    if (match.status === 'matched' && /\d/.test((match.variant ?? '').replace(/\b[a-z]\d\b/gi, ''))) check = true
    if (match.status === 'matched' && match.otherEquipment) check = true
    const { sets, reps, weight, simplified } = fold(groups)
    if (!name || sets < 1 || sets > MAX_PLAN_SETS || reps > MAX_SET_REPS || weight > MAX_SET_WEIGHT_KG) {
      skipped.push({ line, source: raw, reason: 'outOfRange' })
      return
    }
    if (!blocks.length) blocks.push({ header: null, exercises: [], overflow: [] })
    const block = blocks.at(-1)!
    // The same exercise on the next line: a clearly lighter line first is its warm-up, anything else is more sets of it.
    const previous = block.exercises.at(-1)
    const same = previous && previous.match.status === 'matched' && match.status === 'matched'
      && previous.match.exercise.exerciseId === match.exercise.exerciseId && previous.match.exercise.exerciseSource === match.exercise.exerciseSource
      && previous.match.variant === match.variant
    if (same && previous.targetWeight > 0 && previous.targetWeight < weight * 0.8) {
      for (const dropped of linesOf.get(previous)!) skipped.push({ ...dropped, reason: 'warmUp' })
      block.exercises.pop()
    } else if (same) {
      const all = [...groupsOf.get(previous)!, ...groups]
      const merged = fold(all)
      if (merged.sets <= MAX_PLAN_SETS) {
        groupsOf.set(previous, all)
        linesOf.get(previous)!.push({ line, source: raw })
        Object.assign(previous, { sets: merged.sets, targetReps: merged.reps, targetWeight: merged.weight, simplified: true, check: previous.check ?? (check ? written : null) })
        return
      }
    }
    if (block.exercises.length >= MAX_SESSION_EXERCISES) {
      skipped.push({ line, source: raw, reason: 'tooManyExercises' })
      return
    }
    const exercise: ParsedExercise = { line, source: raw, name, note, sets, targetReps: reps, targetWeight: weight, simplified, match, duplicate: false, check: check ? written : null }
    groupsOf.set(exercise, groups)
    linesOf.set(exercise, [{ line, source: raw }])
    block.exercises.push(exercise)
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

export function planToText(plan: PlanTextInput, units: WeightUnits = 'kg'): string {
  const weightText = (kg: number) => String(units === 'lbs' ? kgToDisplayWeight(kg, units) : round2(kg))
  const days = plan.days.map((day) => [
    day.name,
    // No rep target is written "3 sets": "3x0" reads as zero reps to the friend the text is sent to.
    ...day.exercises.map((exercise) => `${exercise.name} ${exercise.targetReps > 0 ? `${exercise.sets}x${exercise.targetReps}` : `${exercise.sets} sets`}${exercise.targetWeight > 0 ? ` @${weightText(exercise.targetWeight)} ${units}` : ''}`),
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
