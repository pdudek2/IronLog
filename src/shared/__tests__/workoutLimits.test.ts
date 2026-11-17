import { describe, expect, it } from 'vitest'
import { acceptSetInput, clampSetValue, lastSessionBest, needsWeightConfirm, weightSlip } from '../workoutLimits'
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

describe('acceptSetInput', () => {
  it('refuses a keystroke that breaks the rule and keeps a valid one', () => {
    expect(acceptSetInput('8690.25', '86.25', 'weight', 'kg')).toBe(false)
    expect(acceptSetInput('58444', '5844', 'weight', 'kg')).toBe(false)
    expect(acceptSetInput('90', '9', 'weight', 'kg')).toBe(true)
    expect(acceptSetInput('86,25', '86,2', 'weight', 'kg')).toBe(true)
    expect(acceptSetInput('86.255', '86.25', 'weight', 'kg')).toBe(false)
    expect(acceptSetInput('', '', 'weight', 'kg')).toBe(true)
    expect(acceptSetInput('12a', '12', 'weight', 'kg')).toBe(false)
    expect(acceptSetInput('1000', '100', 'reps', 'kg')).toBe(true)
    expect(acceptSetInput('1001', '100', 'reps', 'kg')).toBe(false)
    expect(acceptSetInput('8.', '8', 'reps', 'kg')).toBe(false)
  })

  it('always lets characters be deleted, even from a value the rule would refuse', () => {
    expect(acceptSetInput('90.718', '90.7185', 'weight', 'kg')).toBe(true)
    expect(acceptSetInput('869.25', '8690.25', 'weight', 'kg')).toBe(true)
    expect(acceptSetInput('', '8690.25', 'weight', 'kg')).toBe(true)
  })

  it('checks the limit in kg after converting pounds', () => {
    expect(acceptSetInput('4409.2', '4409.', 'weight', 'lbs')).toBe(true)
    expect(acceptSetInput('4409.3', '4409.', 'weight', 'lbs')).toBe(false)
  })

  it('stops the steppers at the limits', () => {
    expect(clampSetValue(2002.5, 'weight')).toBe(2000)
    expect(clampSetValue(-2.5, 'weight')).toBe(0)
    expect(clampSetValue(1001, 'reps')).toBe(1000)
  })
})

describe('weightSlip', () => {
  const last = [{ sets: [{ weight: 80 }, { weight: 88.75 }] }, { sets: [{ weight: 500 }] }]

  it('asks only above twice the heaviest set of the last session', () => {
    expect(lastSessionBest(last)).toBe(88.75)
    expect(weightSlip('881.75', lastSessionBest(last), 'kg')).toEqual({ title: '881.75 kg?', message: 'Last time 88.75 kg' })
    expect(weightSlip('177.5', lastSessionBest(last), 'kg')).toBeNull()
    expect(weightSlip('100', lastSessionBest(last), 'kg')).toBeNull()
  })

  it('does not ask without history, with a 0 kg reference, or before history loads', () => {
    expect(weightSlip('881.75', lastSessionBest([]), 'kg')).toBeNull()
    expect(weightSlip('881.75', lastSessionBest([{ sets: [{ weight: 0 }] }]), 'kg')).toBeNull()
    expect(weightSlip('881.75', undefined, 'kg')).toBeNull()
  })

  it('compares an edited set with its weight before the edit', () => {
    expect(weightSlip(181, 88.75, 'kg', 'Before')).toEqual({ title: '181 kg?', message: 'Before 88.75 kg' })
    expect(weightSlip(177, 88.75, 'kg', 'Before')).toBeNull()
    expect(weightSlip(181, 88.75, 'lbs')).toEqual({ title: '399 lbs?', message: 'Last time 195.7 lbs' })
  })
})
