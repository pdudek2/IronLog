import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'

import { readJsonBody, type ApiRequest } from '../http.js'

function makeRequest(chunks: string[], headers: Record<string, string> = {}): ApiRequest {
  return Object.assign(Readable.from(chunks), { headers }) as ApiRequest
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
