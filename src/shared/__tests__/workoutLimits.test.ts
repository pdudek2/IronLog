import { describe, expect, it } from 'vitest'
import { needsWeightConfirm } from '../workoutLimits'
import { weightStep } from '../weightUnits'

describe('needsWeightConfirm', () => {
  const squat = { exerciseId: 'squat', equipment: 'barbell', category: 'legs' }

  it('asks before logging a loaded exercise at 0 or with no weight', () => {
    for (const weight of ['0', '', '0.0']) expect(needsWeightConfirm({ weight }, squat)).toBe(true)
    for (const equipment of ['dumbbell', 'machine', 'cable', 'kettlebell']) {
      expect(needsWeightConfirm({ weight: '0' }, { exerciseId: 'x', equipment, category: 'arms' })).toBe(true)
    }
  })

  it('logs straight away with a weight, bodyweight, unknown equipment, cardio machines and the assisted pull-up', () => {
    expect(needsWeightConfirm({ weight: '20' }, squat)).toBe(false)
    expect(needsWeightConfirm({ weight: '0' }, { exerciseId: 'pull-up', equipment: 'bodyweight', category: 'back' })).toBe(false)
    expect(needsWeightConfirm({ weight: '0' }, { exerciseId: 'mine' })).toBe(false)
    expect(needsWeightConfirm({ weight: '' }, { exerciseId: 'treadmill', equipment: 'machine', category: 'cardio' })).toBe(false)
    expect(needsWeightConfirm({ weight: '0' }, { exerciseId: 'assisted-pull-up', equipment: 'machine', category: 'back' })).toBe(false)
  })
})

describe('weightStep', () => {
  it('steps 2.5 kg or 5 lb', () => {
    expect(weightStep('kg')).toBe(2.5)
    expect(weightStep('lbs')).toBe(5)
  })
})
