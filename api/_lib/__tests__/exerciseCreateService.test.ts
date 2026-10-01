import { describe, expect, it } from 'vitest'
import { parseCreateExerciseRequest } from '../exerciseCreateService'

const body = { id: 'native-exercise-1', operationId: 'native-exercise-1', source: 'user', input: { name: ' Żółć 💪 ', category: 'back', equipment: 'cable', muscles: ['back', 'biceps', 'back'] } }
describe('exercise create boundary', () => {
  it('normalizes the complete request before binding its receipt', () => {
    expect(parseCreateExerciseRequest(body)).toEqual({ ...body, input: { ...body.input, name: 'Żółć 💪', muscles: ['back', 'biceps'] } })
  })
  it('rejects ownership injection, unsafe IDs, global source and invalid metadata', () => {
    for (const invalid of [null, { ...body, userId: 'other' }, { ...body, source: 'global' },
      { ...body, id: '../other' }, { ...body, operationId: 'short' },
      { ...body, input: { ...body.input, name: 'a' } }, { ...body, input: { ...body.input, category: 'other' } },
      { ...body, input: { ...body.input, muscles: ['other'] } }, { ...body, input: { ...body.input, nameClaimId: 'injected' } }]) {
      expect(() => parseCreateExerciseRequest(invalid)).toThrow()
    }
  })
})
