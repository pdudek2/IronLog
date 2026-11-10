import { describe, expect, it } from 'vitest'
import fixture from '../__fixtures__/notionUpperLower.json'
import { exercises, normalizeExerciseName, searchExercises } from '../../../data/exercises'
import { matchExerciseName } from '../exerciseMatch'
import { parsePlanText, planToText, resolvedPlan, type PlanTextInput } from '../planText'
import { STARTER_PLAN_TEXT } from '../starterPlan'

const one = (line: string) => {
  const plan = parsePlanText(line)
  expect(plan.days).toHaveLength(1)
  return plan.days[0]!.exercises[0]!
}
const matchedId = (line: string) => {
  const exercise = one(line)
  return exercise.match.status === 'matched' ? exercise.match.exercise.exerciseId : exercise.match.status
}

describe('parsePlanText: set notation', () => {
  it.each([
    ['Squat 3x5', 3, 5, 0],
    ['Squat 3×5', 3, 5, 0],
    ['Squat 3 x 5', 3, 5, 0],
    ['Przysiad 4x8 55 kg', 4, 8, 55],
    ['Squat 3x5 @80', 3, 5, 80],
    ['Squat 3x5 80kg', 3, 5, 80],
    ['Squat 3x8-12', 3, 12, 0],
    ['Squat 5/5/5', 3, 5, 0],
    ['Wznosy bokiem 3x10 12,5 kg', 3, 10, 12.5],
    ['Squat 3x5 @225 lbs', 3, 5, 102.06],
    ['Squat 3X5 100 LB', 3, 5, 45.36],
    ['- Squat 3x5', 3, 5, 0],
    ['2) Squat 3x5', 3, 5, 0],
    ['Face pull 3x15 10 kg // nie zrobilem', 3, 15, 10],
    ['Squat 3x5 - 100kg', 3, 5, 100],
    ['Bench press 4x8 – 60 kg', 4, 8, 60],
    ['Squat 3x5 - 100', 3, 5, 100],
    ['Squat 3x8-12 60kg', 3, 12, 60],
    ['Squat 100kg 3x5', 3, 5, 100],
    ['Bench press 60 kg x 8 x 4', 4, 8, 60],
    ['Bench Press: 3 sets x 8-10 reps', 3, 10, 0],
    ['Squat 3 sets of 5', 3, 5, 0],
    ['Barbell Row - 4 sets, 10 reps', 4, 10, 0],
    ['Deadlift 5 reps x 3 sets', 3, 5, 0],
    ['Przysiad 3 serie po 8 powtórzeń 60 kg', 3, 8, 60],
    ['Pull-ups: 3 x AMRAP', 3, 0, 0],
    ['Squat 3x5 @80%', 3, 5, 0],
    ['Bench press 3x8 RPE 8', 3, 8, 0],
    ['Deadlift 3x5 @ RPE 8', 3, 5, 0],
    ['Barbell row 3x10, 90s rest', 3, 10, 0],
    ['Overhead press 3x8 rest 2 min', 3, 8, 0],
    ['Squat 3x5 100kg RPE 8', 3, 5, 100],
    ['Squat 5x5 @ 75% 1RM', 5, 5, 0],
    ['Squat 3x5 5RM', 3, 5, 0],
    ['Bench press 3x6-15', 3, 15, 0],
    ['Bench press 3x8 tempo 3/1/1', 3, 8, 0],
    ['Bench press 3x8 2/0/2 tempo', 3, 8, 0],
    ['Squat 5 reps x 3 sets 100kg', 3, 5, 100],
    ['Barbell row 10 reps, 3 sets', 3, 10, 0],
  ])('%s → %i × %i @ %f', (line, sets, reps, weight) => {
    expect(one(line)).toMatchObject({ sets, targetReps: reps, targetWeight: weight, simplified: false })
  })

  it('folds mixed groups into one prescription and says so', () => {
    expect(one('Biceps 1x6 15kg, 2x10 12,5 kg')).toMatchObject({ sets: 3, targetReps: 10, targetWeight: 12.5, simplified: true })
    expect(one('Wyciskanie szeroko 1x10, 1x8, 2x9 57,5kg')).toMatchObject({ sets: 4, targetReps: 9, targetWeight: 57.5, simplified: true })
    expect(one('Wiosłowanie 2x12 25kg 2x8 35 kg')).toMatchObject({ sets: 4, targetReps: 8, targetWeight: 35, simplified: true })
    expect(one('Ściąganie drążka 1x8 42,5, 2x10 42,5 kg')).toMatchObject({ sets: 3, targetReps: 10, targetWeight: 42.5 })
    expect(one('Leg press 4x8 2x8 82 kg 2x8 91 kg')).toMatchObject({ sets: 4, targetReps: 8, targetWeight: 91 })
    expect(one('Leg press skośny 2x8 110kg, 1x10 130kg, 1x15 130 kg')).toMatchObject({ sets: 4, targetReps: 8, targetWeight: 110 })
    expect(one('Squat 2x5, 1x5 100 kg')).toMatchObject({ sets: 3, targetReps: 5, targetWeight: 100, simplified: false })
    expect(one('Bench press 2 sets of 12 reps, 1 set of 8 reps')).toMatchObject({ sets: 3, targetReps: 12, targetWeight: 0, simplified: true })
    expect(one('Bench press 3 sets: 10, 8, 6')).toMatchObject({ sets: 3, targetReps: 10, targetWeight: 0, simplified: true })
  })

  it('marks a row whose numbers were read by a guess, and leaves plain rows unmarked', () => {
    const check = (line: string) => one(line).check !== null
    expect(['Squat 3x5 - 100', 'Squat 3x5-100', 'Bench press 3 sets: 8, 6', 'Squat 3x5 week 2', 'Dumbbell curl 3x12 2x10kg', 'Squat 100 3x5',
      'Squat warm up 2x5 then 3x5 100kg'].filter((line) => !check(line))).toEqual([])
    expect(['Squat 3x5', 'Squat 3x5 - 100kg', 'Squat 3x5 100', 'Bench press 4x8 60 kg', 'Squat 3x5 @80%', 'Biceps 1x6 15kg, 2x10 12,5 kg',
      'Lateral raise 3x12-15 (light)', 'Pull-ups: 3 x AMRAP'].filter(check)).toEqual([])
    expect(one('Squat warm up 2x5 then 3x5 100kg')).toMatchObject({ name: 'Squat', sets: 3, targetReps: 5, targetWeight: 100 })
    expect(one('Squat 3x5 100kg\nSquat 3x5 week 2').check).toBe('Squat 3x5 week 2')
  })

  it('reads a weight without a unit in the user\'s units', () => {
    const weights = (units: 'kg' | 'lbs') => parsePlanText('Squat 3x5 225\nBench 3x8 @135\nRow 3x10 60 kg', [], units).days[0]!.exercises.map((exercise) => exercise.targetWeight)
    expect(weights('lbs')).toEqual([102.06, 61.23, 60])
    expect(weights('kg')).toEqual([225, 135, 60])
  })

  it('keeps the words around the sets as a note', () => {
    expect(one('Łydki 3x15 24 kg na łydkę').note).toBe('na łydkę')
    expect(one('Leg press 3x10 80 kg leg press ziemny')).toMatchObject({ name: 'Leg press', note: 'leg press ziemny' })
    expect(one('3x5 Squat')).toMatchObject({ name: 'Squat', note: null })
    expect(one('Squat 100kg 3x5')).toMatchObject({ name: 'Squat', note: null })
    expect(one('Squat 3x5 - 100kg')).toMatchObject({ name: 'Squat', note: null })
    expect(one('Lat pulldown 3x12 RIR 2').note).toBe('RIR 2')
    expect(one('Squat 3x5 @80%').note).toBe('@80%')
  })
})

describe('parsePlanText: days, title and skipped lines', () => {
  it('reads headers in several styles, a plan title and an implicit first day', () => {
    const plan = parsePlanText('Upper / Lower\n\n## Upper:\nBench 3x8\n\nDzień 2 –\n• Squat 3x5\n\nLOWER\nLeg curl 3x10 // later\n')
    expect(plan.name).toBe('Upper / Lower')
    expect(plan.days.map((day) => day.name)).toEqual(['Upper', 'Dzień 2', 'LOWER'])
    expect(parsePlanText('Squat 3x5\nPush\nBench 3x5').days.map((day) => day.name)).toEqual(['Day 1', 'Push'])
  })

  it('puts every line somewhere: a day, an exercise or a skipped line with a reason', () => {
    const text = 'Plan\nWeek 1\nPush\nBench 3x5\n// only a comment\nSquat 30x5\nExtras\n'
    const plan = parsePlanText(text)
    expect(plan.name).toBe('Plan')
    expect(plan.skipped.map(({ line, reason }) => [line, reason])).toEqual([[2, 'emptyDay'], [5, 'comment'], [6, 'outOfRange'], [7, 'emptyDay']])
    expect(plan.days).toEqual([expect.objectContaining({ name: 'Push', line: 3 })])
    const noted = parsePlanText('Push\nSuperset:\nBench 3x8\nRest 2 min between sets\nDips 3x10\nNotes')
    expect(noted.days.map((day) => [day.name, day.exercises.length])).toEqual([['Push', 2]])
    expect(noted.skipped.map(({ line, reason }) => [line, reason])).toEqual([[2, 'comment'], [4, 'comment'], [6, 'comment']])
  })

  it('keeps at most 14 days and 20 exercises a day, and marks a repeated exercise', () => {
    const days = Array.from({ length: 15 }, (_, index) => `Day ${index + 1}\nSquat 3x5`).join('\n')
    const plan = parsePlanText(days)
    expect(plan.days).toHaveLength(14)
    expect(plan.skipped.filter((entry) => entry.reason === 'tooManyDays')).toHaveLength(2)
    const long = parsePlanText(Array.from({ length: 21 }, (_, index) => `Custom ${index} 3x5`).join('\n'))
    expect(long.days[0]!.exercises).toHaveLength(20)
    expect(long.skipped).toEqual([expect.objectContaining({ line: 21, reason: 'tooManyExercises' })])
    const repeated = parsePlanText('Squat 3x5\nBench 3x8\nPrzysiad 2x8')
    expect(repeated.days[0]!.exercises.map((exercise) => exercise.duplicate)).toEqual([false, false, true])
    expect(resolvedPlan(repeated)).toBeNull()
  })

  it('folds the same exercise on the next line into one row and leaves warm-ups out', () => {
    const rows = (text: string) => {
      const plan = parsePlanText(text)
      return [plan.days[0]!.exercises.map((exercise) => [exercise.sets, exercise.targetReps, exercise.targetWeight, exercise.simplified]), plan.skipped.map((entry) => [entry.line, entry.reason])]
    }
    expect(rows('Squat 3x5\nPrzysiad 2x8')).toEqual([[[5, 5, 0, true]], []])
    expect(rows('Squat 2x10 40kg\nSquat 3x5 100kg')).toEqual([[[3, 5, 100, false]], [[1, 'warmUp']]])
    expect(rows('Squat 1x10 20kg\nSquat 1x8 24kg\nSquat 3x5 100kg')).toEqual([[[3, 5, 100, false]], [[1, 'warmUp'], [2, 'warmUp']]])
    expect(rows('Squat 3x5 100kg\nSquat 2x12 60kg')).toEqual([[[5, 5, 100, true]], []])
    const variants = parsePlanText('Leg press (single leg) 3x12 50kg\nLeg press 3x10 120kg')
    expect(variants.days[0]!.exercises.map((exercise) => [exercise.sets, exercise.duplicate])).toEqual([[3, false], [3, true]])
    expect(variants.skipped).toEqual([])
    expect(rows('Warm-up\nWarm-up: Squat 2x10\nSquat 1x8 60kg (warm-up)\nRozgrzewka przysiad 1x5\nSquat 3x5 100kg + 2 warm-up sets'))
      .toEqual([[[3, 5, 100, false]], [[1, 'comment'], [2, 'warmUp'], [3, 'warmUp'], [4, 'warmUp']]])
  })

  it('does not read a date as sets', () => {
    expect(parsePlanText('Trening 10/04/2026\nSquat 3x5').days.map((day) => day.name)).toEqual(['Trening 10/04/2026'])
    const dated = parsePlanText('Week 1/2\nMon 10/11\nSquat 8/8\n12/11\nBiceps 8/8\nTydzień 2/4')
    expect(dated.days.map((day) => [day.name, day.exercises.map((exercise) => exercise.name)])).toEqual([['Mon 10/11', ['Squat']], ['12/11', ['Biceps']]])
    expect(dated.skipped.map((entry) => [entry.line, entry.reason])).toEqual([[6, 'emptyDay']])
    expect(dated.name).toBe('Week 1/2')
    expect(parsePlanText('Push\nBench 3x8\nMoje cwiczenie 10/8\nDips 3x10').days.map((day) => day.exercises.length)).toEqual([3])
    const first = parsePlanText('Push\nCable woodchop 12/10\nBench press 3x8')
    expect([first.name, first.days.map((day) => [day.name, day.exercises.length])]).toEqual([null, [['Push', 2]]])
  })
})

describe('matchExerciseName', () => {
  it('matches Polish and English names, variants and clear typos', () => {
    expect(matchedId('Przysiad 3x5')).toBe('squat')
    expect(matchedId('Martwy ciąg 3x5')).toBe('deadlift')
    expect(matchedId('OHP 3x5')).toBe('ohp')
    expect(matchedId('Wyciskanie na ławce 3x5')).toBe('bench-press')
    expect(matchedId('Ciąganie drążka 3x8')).toBe('lat-pulldown')
    expect(one('Leg press (ziemny) 3x10').match).toMatchObject({ status: 'matched', via: 'variant', variant: 'ziemny', exercise: { exerciseId: 'leg-press' } })
    expect(one('Leg curls tyłem 3x10').match).toMatchObject({ status: 'matched', variant: 'tyłem', exercise: { exerciseId: 'leg-curl' } })
    expect(one('Pull-up negative 3x5').match).toMatchObject({ status: 'matched', variant: 'negative', exercise: { exerciseId: 'pull-up' } })
  })

  it('does not swap an exercise for another one that shares its first words', () => {
    expect(matchedId('Squat hack 3x8')).toBe('hack-squat')
    expect(matchedId('Deadlift sumo 3x5')).toBe('sumo-deadlift')
    expect(matchedId('Bench press close grip 3x8')).toBe('close-grip-bench')
    expect(matchedId('Leg press calf raise 3x15')).toBe('unknown')
    expect(matchedId('Bench dip 3x12')).toBe('unknown')
    expect(matchedId('Squat sumo 3x8')).toBe('unknown')
    expect(matchedId('Smith machine squat 3x8')).toBe('unknown')
  })

  it('never picks an exercise for a muscle name, but suggests the likely ones first', () => {
    expect(matchExerciseName('Biceps')).toMatchObject({ status: 'generic', suggestions: expect.arrayContaining([expect.objectContaining({ exerciseId: 'db-curl' })]) })
    expect(matchExerciseName('Przywodziciele')).toMatchObject({ status: 'generic', suggestions: [expect.objectContaining({ exerciseId: 'hip-adduction' })] })
    expect(matchExerciseName('Odwodziciele')).toMatchObject({ status: 'generic' })
    expect((matchExerciseName('Odwodziciele') as { suggestions: { exerciseId: string }[] }).suggestions[0]?.exerciseId).toBe('hip-abduction')
    expect(matchExerciseName('Biceps (hantle)').status).toBe('generic')
    expect(matchExerciseName('Wiosłowanie').status).toBe('unknown')
  })

  it('prefers the user\'s own exercise of that name', () => {
    const own = { exerciseId: 'u1', exerciseSource: 'user' as const, name: 'Biceps' }
    expect(matchExerciseName('biceps', [own])).toMatchObject({ status: 'matched', exercise: { exerciseId: 'u1', exerciseSource: 'user' } })
  })
})

describe('the Notion corpus', () => {
  const entries = fixture as unknown as { type: string; line: string; sets: [number, number][] }[]

  it('reads every line as an exercise with the logged sets, or flags it; none disappears', () => {
    const outcomes = entries.map((entry) => {
      const plan = parsePlanText(`${entry.type}\n${entry.line}`)
      const exercise = plan.days[0]?.exercises[0]
      if (!exercise) {
        expect(plan.skipped).toContainEqual(expect.objectContaining({ line: 2, reason: 'outOfRange' }))
        return 'skipped'
      }
      expect(exercise.sets).toBe(entry.sets.length)
      expect(entry.sets.map(([reps]) => reps)).toContain(exercise.targetReps)
      expect(entry.sets.map(([, weight]) => weight)).toContain(exercise.targetWeight)
      return exercise.match.status
    })
    const count = (status: string) => outcomes.filter((outcome) => outcome === status).length
    expect(count('skipped')).toBe(1)
    expect(count('matched')).toBeGreaterThanOrEqual(158)
    expect(count('generic') + count('unknown') + count('matched') + count('skipped')).toBe(entries.length)
  })
})

describe('planToText', () => {
  const plan: PlanTextInput = {
    name: 'Upper / Lower',
    days: [
      { name: 'Upper', exercises: [
        { name: 'Bench Press', sets: 4, targetReps: 8, targetWeight: 57.5 },
        { name: 'Lateral Raise', sets: 3, targetReps: 12, targetWeight: 0 },
        { name: 'Dumbbell Curl', sets: 3, targetReps: 10, targetWeight: 12.25 },
      ] },
      { name: 'Lower', exercises: [
        { name: 'Squat', sets: 4, targetReps: 8, targetWeight: 102.06 },
        { name: 'Hip Adduction', sets: 3, targetReps: 0, targetWeight: 59 },
      ] },
    ],
  }
  const back = (input: PlanTextInput) => {
    const resolved = resolvedPlan(parsePlanText(planToText(input)))!
    return { name: resolved.name, days: resolved.days.map((day) => ({ name: day.name, exercises: day.exercises.map(({ name, sets, targetReps, targetWeight }) => ({ name, sets, targetReps, targetWeight })) })) }
  }

  it('writes one day per block and reads back into the same plan', () => {
    expect(planToText(plan)).toBe('Upper / Lower\n\nUpper\nBench Press 4x8 @57.5 kg\nLateral Raise 3x12\nDumbbell Curl 3x10 @12.25 kg\n\nLower\nSquat 4x8 @102.06 kg\nHip Adduction 3x0 @59 kg')
    expect(back(plan)).toEqual(plan)
  })

  it('writes pounds for a pounds user, and the text reads back to the same displayed weight', () => {
    const text = planToText(plan, 'lbs')
    expect(text).toContain('Bench Press 4x8 @126.8 lbs\nLateral Raise 3x12\nDumbbell Curl 3x10 @27 lbs')
    expect(planToText(resolvedPlan(parsePlanText(text))!, 'lbs')).toBe(text)
  })

  it('round-trips random plans over the whole catalogue', () => {
    let seed = 7
    const random = (max: number) => { seed = (seed * 48271) % 2147483647; return seed % max }
    for (let run = 0; run < 200; run++) {
      const pool = [...exercises]
      const input: PlanTextInput = {
        name: `Plan ${run}`,
        days: Array.from({ length: 1 + random(6) }, (_, day) => ({
          name: ['Push', 'Pull', 'Legs', 'Day A', 'Full body', 'Upper'][day]!,
          exercises: Array.from({ length: 1 + random(8) }, () => {
            const exercise = pool.splice(random(pool.length), 1)[0]!
            return { name: exercise.name, sets: 1 + random(20), targetReps: random(30), targetWeight: random(4) ? random(4000) / 4 : 0 }
          }),
        })),
      }
      expect(back(input)).toEqual(input)
    }
  })
})

describe('catalogue', () => {
  it('has unique ids, names and aliases, complete metadata, and no muscle name as an alias', () => {
    const ids = exercises.map((exercise) => exercise.id)
    expect(new Set(ids).size).toBe(ids.length)
    const names = exercises.flatMap((exercise) => [exercise.name, ...(exercise.aliases ?? [])].map(normalizeExerciseName))
    expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([])
    for (const exercise of exercises) {
      expect(exercise.category && exercise.equipment && exercise.aliases?.length).toBeTruthy()
      if (exercise.category !== 'cardio') expect(exercise.muscles.length).toBeGreaterThan(0)
      for (const alias of exercise.aliases ?? []) expect(matchExerciseName(alias).status).toBe('matched')
    }
  })

  it('keeps every id the app already stores', () => {
    const existing = ['bench-press', 'incline-bench', 'db-fly', 'cable-crossover', 'push-up', 'deadlift', 'pull-up', 'barbell-row', 'lat-pulldown',
      'seated-cable-row', 'db-row', 'squat', 'romanian-dl', 'leg-press', 'leg-curl', 'leg-extension', 'lunge', 'calf-raise', 'ohp',
      'db-lateral-raise', 'face-pull', 'db-shoulder-press', 'front-raise', 'barbell-curl', 'db-curl', 'hammer-curl', 'tricep-pushdown',
      'skull-crusher', 'overhead-tri-ext', 'plank', 'crunch', 'hanging-leg-raise', 'ab-wheel', 'treadmill', 'rowing-machine', 'jump-rope']
    expect(exercises.map((exercise) => exercise.id)).toEqual(expect.arrayContaining(existing))
  })

  it('finds an exercise by a Polish name in search', () => {
    expect(searchExercises('przysiad').map((exercise) => exercise.id)).toContain('squat')
    expect(searchExercises('push-up').map((exercise) => exercise.id)).toContain('push-up')
  })
})

describe('starter plan', () => {
  it('parses fully into two days without weights', () => {
    const plan = resolvedPlan(parsePlanText(STARTER_PLAN_TEXT))!
    expect(plan.name).toBe('Full body A/B')
    expect(plan.days.map((day) => [day.name, day.exercises.map((exercise) => exercise.exerciseId)])).toEqual([
      ['Day A', ['squat', 'bench-press', 'barbell-row', 'db-lateral-raise', 'hanging-leg-raise']],
      ['Day B', ['romanian-dl', 'ohp', 'lat-pulldown', 'leg-curl', 'db-curl']],
    ])
    expect(plan.days.flatMap((day) => day.exercises).every((exercise) => exercise.targetWeight === 0)).toBe(true)
  })
})
