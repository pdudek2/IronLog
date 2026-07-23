import type { ServerResponse } from 'node:http'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../_lib/errors.js'
import type { ApiRequest, ApiResponse } from '../_lib/http.js'

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  finalizeWorkoutForUser: vi.fn(),
  discardSessionForUser: vi.fn(),
  parseFinalizeWorkoutInput: vi.fn((body: unknown) => body),
}))

vi.mock('../_lib/auth.js', () => ({ requireUserId: mocks.requireUserId }))
vi.mock('../_lib/workoutClosure.js', () => ({
  finalizeWorkoutForUser: mocks.finalizeWorkoutForUser,
  discardSessionForUser: mocks.discardSessionForUser,
}))
vi.mock('../_lib/workoutValidation.js', () => ({
  parseFinalizeWorkoutInput: mocks.parseFinalizeWorkoutInput,
}))

import discardHandler from '../discard-session.js'
import finalizeHandler from '../finalize-workout.js'

function request(body: unknown): ApiRequest {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  } as ApiRequest
}

function captureResponse(): { res: ApiResponse; status: () => number; body: () => unknown } {
  let payload = ''
  const response = {
    statusCode: 0,
    setHeader() {},
    end(chunk?: string) { payload = chunk ?? '' },
  } as unknown as ServerResponse
  return {
    res: response,
    status: () => response.statusCode,
    body: () => JSON.parse(payload) as unknown,
  }
}

describe('workout closure handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserId.mockResolvedValue('user-1')
  })

  it.each([
    ['finalize', finalizeHandler, mocks.finalizeWorkoutForUser, 'Nie udało się zakończyć treningu.'],
    ['discard', discardHandler, mocks.discardSessionForUser, 'Nie udało się odrzucić sesji.'],
  ] as const)('maps an unexpected %s transaction error to a non-sensitive 500', async (
    _name,
    handler,
    operation,
    fallbackMessage,
  ) => {
    operation.mockRejectedValue(new Error('secret Admin SDK detail'))
    const captured = captureResponse()

    await handler(request({ sessionId: 'session-1' }), captured.res)

    expect(captured.status()).toBe(500)
    expect(captured.body()).toEqual({ error: fallbackMessage })
  })

  it('preserves typed ApiError status and code', async () => {
    mocks.discardSessionForUser.mockRejectedValue(new ApiError(409, 'Konflikt.', {
      code: 'session_mismatch',
    }))
    const captured = captureResponse()

    await discardHandler(request({ sessionId: 'session-1' }), captured.res)

    expect(captured.status()).toBe(409)
    expect(captured.body()).toEqual({ error: 'Konflikt.', code: 'session_mismatch' })
  })
})
