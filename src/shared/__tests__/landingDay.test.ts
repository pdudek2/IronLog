import { describe, expect, it } from 'vitest'
import { EXAMPLE_DAY, landingDays, landingToday } from '../landingDay'
import { parsePlanText } from '../planText'

const minutes = (sec: number) => Math.round(sec / 60)

describe('landing day', () => {
  it('shortens the example Upper day the way the hero says: pairs and a circuit first, then sets, never the weights', () => {
    const at = (budget: number | null) => landingToday(EXAMPLE_DAY, budget, false)
    expect([null, 45, 30].map((budget) => minutes(at(budget).estimateSec))).toEqual([69, 41, 29])
    const short = at(45)
    expect(short.sets).toEqual([4, 3, 0, 3, 2, 2, 2])
    expect(short.blocks.filter((block) => block.group).map((block) => block.items.length).sort()).toEqual([2, 3])
    expect(at(30).sets[0]).toBe(2)
  })

  it('reads a pasted plan into days, keeping lines the catalogue does not know', () => {
    const days = landingDays(parsePlanText('Push\nWyciskanie na ławce 3x5 @100\nMy machine press 3x10\nFrench press 3x12 30\n\nPull\nPodciąganie 4x6'))
    expect(days.map((day) => [day.name, day.exercises.map((exercise) => [exercise.name, exercise.sets, exercise.exerciseSource])])).toEqual([
      ['Push', [['Bench Press', 3, 'global'], ['My machine press', 3, 'user'], ['French press', 3, 'user']]],
      ['Pull', [['Pull-up', 4, 'global']]],
    ])
    const push = days[0]!
    expect(landingToday(push, null, false).estimateSec).toBeGreaterThan(landingToday({ ...push, exercises: push.exercises.slice(0, 1) }, null, false).estimateSec)
  })
})
