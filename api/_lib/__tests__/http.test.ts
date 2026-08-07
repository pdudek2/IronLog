import { Readable } from 'node:stream'
import type { ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'

import { ApiError } from '../errors.js'
import { readJsonBody, sendApiError, type ApiRequest, type ApiResponse } from '../http.js'

function makeRequest(chunks: string[], headers: Record<string, string> = {}): ApiRequest {
  return Object.assign(Readable.from(chunks), { headers }) as ApiRequest
}

function captureResponse(): { res: ApiResponse; body: () => unknown } {
  let payload = ''
  const response = {
    statusCode: 0,
    setHeader() {},
    end(chunk?: string) {
      payload = chunk ?? ''
    },
  } as unknown as ServerResponse

  return { res: response, body: () => JSON.parse(payload) as unknown }
}

describe('readJsonBody', () => {
  it('rejects bodies larger than the configured limit', async () => {
    const req = makeRequest(['{"payload":"abcdef"}'], { 'content-type': 'application/json' })

    await expect(readJsonBody(req, { maxBytes: 8 })).rejects.toMatchObject({
      status: 413,
      message: 'Body requestu jest zbyt duże.',
    })
  })

  it('rejects non-json content types when a body is present', async () => {
    const req = makeRequest(['{"ok":true}'], { 'content-type': 'text/plain' })

    await expect(readJsonBody(req)).rejects.toMatchObject({
      status: 415,
      message: 'Content-Type musi być application/json.',
    })
  })

  it('wraps malformed JSON as a public 400 error', async () => {
    const req = makeRequest(['{"broken":'], { 'content-type': 'application/json' })

    await expect(readJsonBody(req)).rejects.toMatchObject({
      status: 400,
      message: 'Niepoprawny JSON w body requestu.',
    })
  })
})

describe('sendApiError', () => {
  it('serializes a machine-readable code when ApiError provides one', () => {
    const captured = captureResponse()

    sendApiError(
      captured.res,
      new ApiError(409, 'Ta sesja nie jest aktywna.', { code: 'session_mismatch' }),
      { fallbackMessage: 'Fallback.' },
    )

    expect(captured.res.statusCode).toBe(409)
    expect(captured.body()).toEqual({
      error: 'Ta sesja nie jest aktywna.',
      code: 'session_mismatch',
    })
  })

  it('keeps the existing response shape when ApiError has no code', () => {
    const captured = captureResponse()

    sendApiError(captured.res, new ApiError(400, 'Niepoprawny request.'), {
      fallbackMessage: 'Fallback.',
    })

    expect(captured.body()).toEqual({ error: 'Niepoprawny request.' })
  })

  it('treats an unknown failure as a server error by default', () => {
    const captured = captureResponse()

    sendApiError(captured.res, new Error('Firestore unavailable'), {
      fallbackMessage: 'Operacja nie powiodła się.',
    })

    expect(captured.res.statusCode).toBe(500)
    expect(captured.body()).toEqual({ error: 'Operacja nie powiodła się.' })
  })
})
