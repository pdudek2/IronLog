import { matchExerciseName, type ExerciseRef, type MatchCandidate, type NameMatch } from './exerciseMatch'
import type { WeightUnits } from './weightUnits'
import { MAX_DONE_SETS_PER_EXERCISE, MAX_SESSION_EXERCISES, MAX_SET_REPS, MAX_SET_WEIGHT_KG } from './workoutLimits'

// Workout history as CSV, one row per set (PRODUCT.md, „Specyfikacja punktu 4B”). Every data row of the file ends up
// in a workout or in `skipped` with a reason.
const LB_KG = 0.45359237

type Column = 'date' | 'time' | 'number' | 'label' | 'exercise' | 'set' | 'reps' | 'weight' | 'status' | 'notes'
// Tried in order on the lower-cased header with underscores as spaces: "Workout #" is a number, "Workout" a name.
const COLUMN_WORDS: [RegExp, Column][] = [
  [/^(?:data|date|dzie[nń]|day)$/, 'date'],
  [/^(?:godzina|time|start(?:\s*time)?|hour)$/, 'time'],
  [/numer|^(?:workout|session|training|trening)\s*(?:#|no\.?|nr|number|id)$|^#$/, 'number'],
  [/exercise|[cć]wiczeni/, 'exercise'],
  [/^(?:typ|type|workout|workout name|session|session name|trening|nazwa treningu|day name)$/, 'label'],
  [/^(?:set|seria|set order|set no\.?|set #|nr serii|numer serii)$/, 'set'],
  [/^(?:reps?|repetitions|powt[a-zÀ-ɏ]*\.?)$/, 'reps'],
  [/weight|ci[eę][zż]ar|\bload\b|obci[aą][zż]/, 'weight'],
  [/^status$/, 'status'],
  [/^(?:uwagi|notes?|komentarz|comments?)$/, 'notes'],
]

export type SkipReason = 'notDone' | 'unread' | 'tooMany'
export interface ImportSet { line: number; reps: number; weightKg: number; check: boolean }
export interface ImportExercise { name: string; sets: ImportSet[] }
export interface ImportWorkout {
  // Stable across re-reads of the same file: the server builds the workout id from it, so a second import adds nothing.
  key: string
  date: string
  time: string | null
  label: string | null
  exercises: ImportExercise[]
}
export interface ParsedHistory {
  workouts: ImportWorkout[]
  skipped: { line: number; source: string; reason: SkipReason }[]
  notes: { line: number; text: string }[]
}
export type HistoryReadResult = { ok: true; history: ParsedHistory } | { ok: false; error: string }

// RFC 4180: quoted fields may hold the delimiter, line breaks and doubled quotes.
function readRows(text: string, delimiter: string): { line: number; cells: string[]; source: string }[] {
  const rows: { line: number; cells: string[]; source: string }[] = []
  let cells: string[] = []
  let cell = ''
  let quoted = false
  let line = 1
  let start = 1
  let source = ''
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; source += '""'; index++; continue }
      if (char === '"') { quoted = false; source += char; continue }
      if (char === '\n') line++
      cell += char
      source += char
      continue
    }
    if (char === '"' && cell === '') { quoted = true; source += char; continue }
    if (char === delimiter) { cells.push(cell); cell = ''; source += char; continue }
    if (char === '\r') continue
    if (char === '\n') {
      cells.push(cell)
      rows.push({ line: start, cells, source })
      cells = []; cell = ''; source = ''
      line++; start = line
      continue
    }
    cell += char
    source += char
  }
  if (cell !== '' || cells.length) { cells.push(cell); rows.push({ line: start, cells, source }) }
  return rows.filter((row) => row.cells.some((value) => value.trim()))
}

function detectDelimiter(header: string): string {
  const counts = [';', ',', '\t'].map((delimiter) => [delimiter, header.split(delimiter).length] as const)
  return counts.sort((a, b) => b[1] - a[1])[0]![0]
}

const pad = (value: number) => String(value).padStart(2, '0')

// "2026-04-10", "2026-04-10 18:05:00" (Strong), "10.04.2026", "10/04/2026".
function readDate(cell: string): { date: string; time: string | null } | null {
  const iso = cell.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2}))?/)
  const local = cell.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/)
  const [year, month, day, hour, minute] = iso
    ? [iso[1], iso[2], iso[3], iso[4], iso[5]]
    : local ? [local[3], local[2], local[1], local[4], local[5]] : []
  if (!year) return null
  const value = new Date(Number(year), Number(month) - 1, Number(day))
  if (value.getFullYear() !== Number(year) || value.getMonth() !== Number(month) - 1 || value.getDate() !== Number(day)) return null
  return { date: `${year}-${pad(Number(month))}-${pad(Number(day))}`, time: hour ? `${pad(Number(hour))}:${minute}` : null }
}

function readTime(cell: string): string | null {
  const match = cell.match(/^(\d{1,2}):(\d{2})/)
  return match && Number(match[1]) < 24 && Number(match[2]) < 60 ? `${pad(Number(match[1]))}:${match[2]}` : null
}

function readStatus(cell: string): 'done' | 'skip' | 'check' {
  const value = cell.trim().toLowerCase()
  if (!value || /^(?:wykonano|zrobione|done|completed?|ok|tak|yes)$/.test(value)) return 'done'
  if (/^(?:nie wykonano|niewykonane|pomini[eę]t[aeo]?|not done|skipped|missed|no|nie)$/.test(value)) return 'skip'
  return 'check'
}

const titleCase = (text: string) => (/^[A-ZĄĆĘŁŃÓŚŹŻ\s]+$/.test(text) ? text.charAt(0) + text.slice(1).toLowerCase() : text)

export function readHistoryCsv(text: string, units: WeightUnits): HistoryReadResult {
  const clean = text.replace(/^﻿/, '')
  const firstLine = clean.split('\n', 1)[0] ?? ''
  const rows = readRows(clean, detectDelimiter(firstLine))
  if (rows.length < 2) return { ok: false, error: 'The file has no rows after its header.' }
  const header = rows[0]!.cells.map((cell) => cell.trim())
  const columns = new Map<Column, number>()
  header.forEach((cell, index) => {
    const word = cell.toLowerCase().replace(/_/g, ' ').replace(/[[(][^\])]*[\])]/g, '').replace(/\s+/g, ' ').trim()
    const column = COLUMN_WORDS.find(([pattern]) => pattern.test(word))?.[1]
    if (column && !columns.has(column)) columns.set(column, index)
  })
  const missing = (['date', 'exercise', 'reps'] as Column[]).filter((column) => !columns.has(column))
  if (missing.length) {
    return { ok: false, error: `The file needs a column for the ${missing.join(', ')}; it has ${header.filter(Boolean).join(', ')}.` }
  }
  const weightHeader = columns.has('weight') ? header[columns.get('weight')!]! : ''
  const pounds = /\blbs?\b|pound|funt/i.test(weightHeader) || (!/\bkg\b/i.test(weightHeader) && units === 'lbs')

  const history: ParsedHistory = { workouts: [], skipped: [], notes: [] }
  const byKey = new Map<string, ImportWorkout>()
  for (const row of rows.slice(1)) {
    const at = (column: Column) => (columns.has(column) ? (row.cells[columns.get(column)!] ?? '').trim() : '')
    const unread = () => history.skipped.push({ line: row.line, source: row.source, reason: 'unread' })
    const when = readDate(at('date'))
    const name = at('exercise').replace(/\s+/g, ' ')
    const repsText = at('reps').replace(',', '.')
    const reps = Number(repsText)
    const weightText = at('weight').replace(',', '.').replace(/\s*(?:kgs?|lbs?)$/i, '')
    const weight = !weightText || /^(?:bw|body\s?weight|-)$/i.test(weightText) ? 0 : Number(weightText)
    if (!when || !name || !repsText || !Number.isInteger(reps) || reps < 0 || reps > MAX_SET_REPS || !Number.isFinite(weight) || weight < 0) { unread(); continue }
    const weightKg = Math.round(weight * (pounds ? LB_KG : 1) * 100) / 100
    if (weightKg > MAX_SET_WEIGHT_KG) { unread(); continue }
    const status = readStatus(at('status'))
    if (status === 'skip') { history.skipped.push({ line: row.line, source: row.source, reason: 'notDone' }); continue }
    if (at('notes')) history.notes.push({ line: row.line, text: at('notes') })

    const time = readTime(at('time')) ?? when.time
    const number = at('number')
    const label = at('label') ? titleCase(at('label')).slice(0, 120) : null
    // One workout per date and number; without a number per date, name and start time.
    const key = [when.date, number || `${label ?? ''}|${time ?? ''}`].join('|')
    let workout = byKey.get(key)
    if (!workout) {
      workout = { key, date: when.date, time, label, exercises: [] }
      byKey.set(key, workout)
      history.workouts.push(workout)
    }
    let exercise = workout.exercises.at(-1)
    if (exercise?.name !== name) {
      if (workout.exercises.length >= MAX_SESSION_EXERCISES) { history.skipped.push({ line: row.line, source: row.source, reason: 'tooMany' }); continue }
      exercise = { name, sets: [] }
      workout.exercises.push(exercise)
    }
    if (exercise.sets.length >= MAX_DONE_SETS_PER_EXERCISE) { history.skipped.push({ line: row.line, source: row.source, reason: 'tooMany' }); continue }
    exercise.sets.push({ line: row.line, reps, weightKg, check: status === 'check' })
  }
  history.workouts.sort((a, b) => (a.date + (a.time ?? '12:00')).localeCompare(b.date + (b.time ?? '12:00')))
  return { ok: true, history }
}

export interface HistoryName { name: string; sets: number; match: NameMatch }
// Each name of the file once, so the user maps "Biceps" one time for all its sets.
export function historyNames(history: ParsedHistory, userExercises: MatchCandidate[] = []): HistoryName[] {
  const counts = new Map<string, number>()
  for (const workout of history.workouts) for (const exercise of workout.exercises) counts.set(exercise.name, (counts.get(exercise.name) ?? 0) + exercise.sets.length)
  return [...counts].map(([name, sets]) => ({ name, sets, match: matchExerciseName(name, userExercises) }))
}

export const localDay = (time: number) => {
  const date = new Date(time)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function startedAtOf(workout: Pick<ImportWorkout, 'date' | 'time'>): number {
  const [year, month, day] = workout.date.split('-').map(Number)
  const [hour, minute] = (workout.time ?? '12:00').split(':').map(Number)
  return new Date(year!, month! - 1, day!, hour, minute).getTime()
}

export interface ImportRequestWorkout {
  key: string
  startedAt: number
  label: string | null
  exercises: { exerciseId: string; exerciseSource: 'global' | 'user'; name: string; sets: { weight: number; reps: number }[] }[]
}

// The workouts to send: chosen ones, each name through its exercise, sets to check only where the user took them.
export function importRequestWorkouts(
  history: ParsedHistory,
  exerciseFor: (name: string) => ExerciseRef | null,
  chosen: (workout: ImportWorkout) => { include: boolean; withChecks: boolean },
): ImportRequestWorkout[] {
  return history.workouts.flatMap((workout) => {
    const choice = chosen(workout)
    if (!choice.include) return []
    const exercises = workout.exercises.flatMap((exercise) => {
      const ref = exerciseFor(exercise.name)
      const sets = exercise.sets.filter((set) => choice.withChecks || !set.check).map((set) => ({ weight: set.weightKg, reps: set.reps }))
      return ref && sets.length ? [{ exerciseId: ref.exerciseId, exerciseSource: ref.exerciseSource, name: ref.name, sets }] : []
    })
    return exercises.length ? [{ key: workout.key, startedAt: startedAtOf(workout), label: workout.label, exercises }] : []
  })
}

export interface ExportWorkout { startedAt: number; label: string | null; exercises: { name: string; sets: { weight: number; reps: number }[] }[] }

const csvField = (value: string) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)

// The import reads this file back: same columns, kg in the header so the account's units do not apply.
export function historyCsv(workouts: ExportWorkout[]): string {
  const rows = [['Date', 'Time', 'Workout', 'Exercise', 'Set', 'Reps', 'Weight (kg)']]
  for (const workout of [...workouts].sort((a, b) => a.startedAt - b.startedAt)) {
    const date = new Date(workout.startedAt)
    const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
    for (const exercise of workout.exercises) {
      exercise.sets.forEach((set, index) => {
        rows.push([localDay(workout.startedAt), time, workout.label ?? '', exercise.name, String(index + 1), String(set.reps), String(Math.round(set.weight * 100) / 100)])
      })
    }
  }
  return `﻿${rows.map((row) => row.map(csvField).join(',')).join('\r\n')}\r\n`
}
