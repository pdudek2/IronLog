import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { exercises } from '../../../data/exercises'
import { catalogueCandidates } from '../exerciseMatch'
import { historyCsv, historyNames, importRequestWorkouts, localDay, readHistoryCsv, startedAtOf, type ParsedHistory } from '../historyCsv'

const notion = readFileSync(join(__dirname, '../__fixtures__/notionHistory.csv'), 'utf8')
const read = (text: string, units: 'kg' | 'lbs' = 'kg'): ParsedHistory => {
  const result = readHistoryCsv(text, units)
  if (!result.ok) throw new Error(result.error)
  return result.history
}
const sets = (history: ParsedHistory) => history.workouts.flatMap((workout) => workout.exercises.flatMap((exercise) => exercise.sets))

describe('readHistoryCsv: Patryk\'s Notion history', () => {
  const history = read(notion)

  it('reads every row into a workout or a skipped line with a reason', () => {
    expect(history.workouts).toHaveLength(44)
    expect(sets(history)).toHaveLength(742)
    expect(sets(history).filter((set) => set.check)).toHaveLength(9)
    expect(history.skipped.map((entry) => [entry.line, entry.reason])).toEqual([[547, 'notDone'], [548, 'notDone'], [549, 'notDone']])
    expect(sets(history).length + history.skipped.length).toBe(notion.trim().split('\n').length - 1)
  })

  it('groups a workout by date and number, names it from the type, keeps consecutive sets together', () => {
    const last = history.workouts.at(-1)!
    expect([last.key, last.date, last.label]).toEqual(['2026-04-10|130', '2026-04-10', 'Lower'])
    expect(last.exercises.map((exercise) => [exercise.name, exercise.sets.length])).toEqual([
      ['Przysiad', 4], ['Leg press', 6], ['Leg curls', 3], ['Przywodziciele', 3], ['Odwodziciele', 3],
    ])
    expect(last.exercises[1]!.sets.every((set) => set.check)).toBe(true)
  })

  it('lists each name once, and sends muscle names to the user', () => {
    const names = historyNames(history)
    expect(names).toHaveLength(19)
    const status = Object.fromEntries(names.map((entry) => [entry.name, entry.match.status === 'matched' ? entry.match.exercise.exerciseId : entry.match.status]))
    expect(status).toMatchObject({ 'Przysiad': 'squat', 'Wyciskanie na ławce': 'bench-press', 'Biceps': 'generic', 'Triceps': 'generic', 'Przywodziciele': 'generic' })
  })

  it('marks the day SHEAR already has as already in SHEAR', () => {
    const existing = new Set([localDay(new Date(2026, 3, 10, 17, 5).getTime()), localDay(new Date(2026, 3, 9, 17, 30).getTime())])
    expect(history.workouts.filter((workout) => existing.has(localDay(startedAtOf(workout)))).map((workout) => workout.key)).toEqual(['2026-04-10|130'])
  })
})

describe('readHistoryCsv: notations', () => {
  it('detects the delimiter, reads quotes, date formats, a unit in the header and the account unit', () => {
    const text = 'Date,Exercise,Reps,"Weight (lbs)",Notes\n10.04.2026,"Bench press, paused",5,225,"said ""easy"""\n2026-04-11 18:05:00,Squat,5,"135",\n'
    const history = read(text)
    expect(history.workouts.map((workout) => [workout.date, workout.time, workout.exercises.map((exercise) => [exercise.name, exercise.sets[0]!.weightKg])]))
      .toEqual([['2026-04-10', null, [['Bench press, paused', 102.06]]], ['2026-04-11', '18:05', [['Squat', 61.23]]]])
    expect(history.notes).toEqual([{ line: 2, text: 'said "easy"' }])
    expect(read('Data\tĆwiczenie\tPowt.\tCiężar\n2026-04-10\tPrzysiad\t5\t225', 'lbs').workouts[0]!.exercises[0]!.sets[0]!.weightKg).toBe(102.06)
  })

  it('lists rows it cannot read, skips sets not done, and asks about any other status', () => {
    const history = read('Date;Exercise;Reps;Weight;Status\n31.02.2026;Squat;5;100;\n2026-04-10;;5;100;\n2026-04-10;Squat;five;100;\n2026-04-10;Squat;5;100;Not done\n2026-04-10;Squat;5;BW;Done\n2026-04-10;Squat;5;100;felt off')
    expect(history.skipped.map((entry) => [entry.line, entry.reason])).toEqual([[2, 'unread'], [3, 'unread'], [4, 'unread'], [5, 'notDone']])
    expect(sets(history).map((set) => [set.weightKg, set.check])).toEqual([[0, false], [100, true]])
  })

  it('refuses a file without the columns it needs and says which', () => {
    expect(readHistoryCsv('Exercise;Weight\nSquat;100', 'kg')).toEqual({ ok: false, error: expect.stringContaining('date, reps') })
  })
})

describe('historyCsv', () => {
  it('writes a file the import reads back into the same workouts', () => {
    let seed = 11
    const random = (max: number) => { seed = (seed * 48271) % 2147483647; return seed % max }
    const names = exercises.slice(0, 40).map((exercise) => exercise.name)
    const workouts = Array.from({ length: 30 }, (_, index) => ({
      startedAt: new Date(2025, random(12), 1 + random(28), 6 + random(14), random(60)).getTime() + index * 60_000 * 0,
      label: random(3) ? ['Upper', 'Lower, heavy', 'Day "A"'][random(3)]! : null,
      exercises: Array.from({ length: 1 + random(6) }, () => ({
        name: names[random(names.length)]!,
        sets: Array.from({ length: 1 + random(5) }, () => ({ weight: random(4) ? random(800) / 4 : 0, reps: random(25) })),
      })).filter((exercise, position, all) => position === 0 || exercise.name !== all[position - 1]!.name),
    }))
    const byName = new Map(catalogueCandidates.map((candidate) => [candidate.name, candidate]))
    const back = importRequestWorkouts(read(historyCsv(workouts), 'lbs'), (name) => byName.get(name) ?? null, () => ({ include: true, withChecks: false }))
    const sorted = [...workouts].sort((a, b) => a.startedAt - b.startedAt)
    expect(back.map((workout) => ({ startedAt: workout.startedAt, label: workout.label, exercises: workout.exercises.map(({ name, sets }) => ({ name, sets })) }))).toEqual(sorted)
  })

  it('sends only chosen workouts, and sets to check only when asked', () => {
    const history = read('Date;Workout #;Exercise;Reps;Weight;Status\n2026-04-10;1;Squat;5;100;\n2026-04-10;1;Squat;5;110;Check\n2026-04-11;2;Bench Press;5;80;')
    const squat = catalogueCandidates.find((candidate) => candidate.exerciseId === 'squat')!
    const requests = importRequestWorkouts(history, (name) => (name === 'Squat' ? squat : null), (workout) => ({ include: workout.date === '2026-04-10', withChecks: false }))
    expect(requests.map((workout) => [workout.key, workout.exercises.map((exercise) => exercise.sets.map((set) => set.weight))])).toEqual([['2026-04-10|1', [[100]]]])
  })
})
