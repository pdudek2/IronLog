import type { ServerResponse } from 'node:http'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../_lib/errors.js'
import type { ApiRequest, ApiResponse } from '../_lib/http.js'

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  updateFinishedWorkoutForUser: vi.fn(),
  deleteFinishedWorkoutForUser: vi.fn(),
}))

vi.mock('../_lib/auth.js', () => ({ requireUserId: mocks.requireUserId }))
vi.mock('../_lib/workoutProjection.js', () => ({
  updateFinishedWorkoutForUser: mocks.updateFinishedWorkoutForUser,
  deleteFinishedWorkoutForUser: mocks.deleteFinishedWorkoutForUser,
}))

import deleteHandler from '../delete-workout.js'
import updateHandler from '../update-workout.js'

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

describe('workout mutation handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserId.mockResolvedValue('user-1')
  })

  it.each([
    ['materialized', updateHandler, mocks.updateFinishedWorkoutForUser],
    ['projection_pending', updateHandler, mocks.updateFinishedWorkoutForUser],
    ['deleted', deleteHandler, mocks.deleteFinishedWorkoutForUser],
    ['cleanup_pending', deleteHandler, mocks.deleteFinishedWorkoutForUser],
  ] as const)('returns the exact %s mutation status', async (status, handler, operation) => {
    operation.mockResolvedValue({ status })
    const captured = captureResponse()

    await handler(request({ workoutId: 'workout-1', label: 'Updated', exercises: [] }), captured.res)

    expect(captured.status()).toBe(200)
    expect(captured.body()).toEqual({ status })
  })

  it.each([
    [updateHandler, mocks.updateFinishedWorkoutForUser, 'Nie udało się zaktualizować treningu.'],
    [deleteHandler, mocks.deleteFinishedWorkoutForUser, 'Nie udało się usunąć treningu.'],
  ] as const)('maps an unexpected mutation error to its sanitized 500 response', async (
    handler,
    operation,
    fallbackMessage,
  ) => {
    operation.mockRejectedValue(new Error('secret Admin SDK detail'))
    const captured = captureResponse()

    await handler(request({ workoutId: 'workout-1' }), captured.res)

    expect(captured.status()).toBe(500)
    expect(captured.body()).toEqual({ error: fallbackMessage })
  })

  it('preserves typed ApiError status and code', async () => {
    mocks.deleteFinishedWorkoutForUser.mockRejectedValue(new ApiError(409, 'Konflikt.', {
      code: 'workout_mismatch',
    }))
    const captured = captureResponse()

    await deleteHandler(request({ workoutId: 'workout-1' }), captured.res)

    expect(captured.status()).toBe(409)
    expect(captured.body()).toEqual({ error: 'Konflikt.', code: 'workout_mismatch' })
  })
})
