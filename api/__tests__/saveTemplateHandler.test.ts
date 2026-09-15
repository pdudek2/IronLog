import type { ServerResponse } from 'node:http'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../_lib/errors.js'
import type { ApiRequest, ApiResponse } from '../_lib/http.js'

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  saveTemplateForUser: vi.fn(),
}))

vi.mock('../_lib/auth.js', () => ({ requireUserId: mocks.requireUserId }))
vi.mock('../_lib/templateService.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../_lib/templateService.js')>()
  return { ...original, saveTemplateForUser: mocks.saveTemplateForUser }
})

import handler from '../save-template.js'

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

describe('save-template handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserId.mockResolvedValue('user-1')
  })

  it('authenticates, validates and returns a saved template', async () => {
    const input = { name: 'Plan A', days: [{ name: 'Rest', exercises: [] }] }
    const template = { id: 'template-1', userId: 'user-1', createdAt: 10, updatedAt: 10, ...input }
    mocks.saveTemplateForUser.mockResolvedValue(template)
    const captured = captureResponse()

    await handler(request(input), captured.res)

    expect(mocks.saveTemplateForUser).toHaveBeenCalledWith('user-1', input)
    expect(captured.status()).toBe(200)
    expect(captured.body()).toEqual({ template })
  })

  it('rejects unauthenticated requests before persistence', async () => {
    mocks.requireUserId.mockRejectedValue(new ApiError(401, 'Missing authentication token.'))
    const captured = captureResponse()

    await handler(request({}), captured.res)

    expect(captured.status()).toBe(401)
    expect(mocks.saveTemplateForUser).not.toHaveBeenCalled()
  })

  it('rejects malformed JSON before persistence', async () => {
    const captured = captureResponse()

    await handler(request('{not-json'), captured.res)

    expect(captured.status()).toBe(400)
    expect(captured.body()).toEqual({ error: 'Invalid JSON in request body.' })
    expect(mocks.saveTemplateForUser).not.toHaveBeenCalled()
  })

  it('rejects an oversized request before persistence', async () => {
    const captured = captureResponse()

    await handler(request(JSON.stringify({ name: 'x'.repeat(129 * 1024) })), captured.res)

    expect(captured.status()).toBe(413)
    expect(mocks.saveTemplateForUser).not.toHaveBeenCalled()
  })

  it('preserves ownership failures from the persistence boundary', async () => {
    mocks.saveTemplateForUser.mockRejectedValue(new ApiError(403, 'Template belongs to another user.'))
    const captured = captureResponse()

    await handler(request({ id: 'template-1', name: 'Plan', days: [{ name: 'Rest', exercises: [] }] }), captured.res)

    expect(captured.status()).toBe(403)
    expect(captured.body()).toEqual({ error: 'Template belongs to another user.' })
  })
})
