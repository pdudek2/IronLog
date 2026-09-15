import { describe, expect, it } from 'vitest'

import { parseSaveTemplateRequest } from '../templateService.js'

function exercise() {
  return {
    exerciseId: 'bench-press',
    exerciseSource: 'global',
    name: 'Bench Press',
    sets: 4,
    targetReps: 8,
    targetWeight: 80,
  }
}

function request() {
  return {
    name: ' Plan A ',
    days: [{ name: ' Push ', exercises: [exercise()] }],
  }
}

describe('template validation', () => {
  it('accepts and trims the complete boundary-sized template contract', () => {
    const raw = {
      id: 'template-1',
      name: ' Plan A ',
      days: Array.from({ length: 14 }, (_, day) => ({
        name: `Day ${day + 1}`,
        exercises: Array.from({ length: 20 }, (_, index) => ({
          ...exercise(),
          exerciseId: `exercise-${index}`,
          sets: 20,
          targetReps: 1_000,
          targetWeight: 2_000,
        })),
      })),
    }

    const parsed = parseSaveTemplateRequest(raw)
    expect(parsed).toMatchObject({ id: 'template-1', name: 'Plan A' })
    expect(parsed.days).toHaveLength(14)
    expect(parsed.days[0].exercises).toHaveLength(20)
  })

  it.each([
    ['missing top-level field', { days: request().days }],
    ['extra top-level field', { ...request(), userId: 'attacker' }],
    ['extra day field', { ...request(), days: [{ ...request().days[0], order: 1 }] }],
    ['extra exercise field', { ...request(), days: [{ name: 'Push', exercises: [{ ...exercise(), note: 'x' }] }] }],
    ['empty template name', { ...request(), name: '   ' }],
    ['empty day name', { ...request(), days: [{ name: '', exercises: [] }] }],
    ['long template name', { ...request(), name: 'x'.repeat(121) }],
    ['long day name', { ...request(), days: [{ name: 'x'.repeat(81), exercises: [] }] }],
    ['empty exercise name', { ...request(), days: [{ name: 'Push', exercises: [{ ...exercise(), name: '' }] }] }],
    ['too many days', { ...request(), days: Array.from({ length: 15 }, () => request().days[0]) }],
    ['too many exercises', { ...request(), days: [{ name: 'Push', exercises: Array.from({ length: 21 }, exercise) }] }],
    ['invalid exercise id', { ...request(), days: [{ name: 'Push', exercises: [{ ...exercise(), exerciseId: 'bad/id' }] }] }],
    ['invalid exercise source', { ...request(), days: [{ name: 'Push', exercises: [{ ...exercise(), exerciseSource: 'shared' }] }] }],
    ['invalid sets', { ...request(), days: [{ name: 'Push', exercises: [{ ...exercise(), sets: 0 }] }] }],
    ['fractional sets', { ...request(), days: [{ name: 'Push', exercises: [{ ...exercise(), sets: 1.5 }] }] }],
    ['invalid reps', { ...request(), days: [{ name: 'Push', exercises: [{ ...exercise(), targetReps: 1_001 }] }] }],
    ['invalid weight', { ...request(), days: [{ name: 'Push', exercises: [{ ...exercise(), targetWeight: -1 }] }] }],
  ])('rejects %s', (_name, raw) => {
    expect(() => parseSaveTemplateRequest(raw)).toThrow()
  })
})
