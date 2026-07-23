import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { verifyIdToken } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
}))

vi.mock('../firebaseAdmin.js', () => ({
  adminAuth: { verifyIdToken },
}))

import { requireUserId } from '../auth.js'
import type { ApiRequest } from '../http.js'

function makeRequest(authorization?: string): ApiRequest {
  return Object.assign(Readable.from([]), {
    headers: authorization ? { authorization } : {},
  }) as ApiRequest
}

describe('requireUserId', () => {
  beforeEach(() => {
    verifyIdToken.mockReset()
  })

  it('throws a public 401 error when the bearer token is missing', async () => {
    await expect(requireUserId(makeRequest())).rejects.toMatchObject({
      status: 401,
      message: 'Brak tokenu autoryzacji.',
    })
  })

  it('throws a public 401 error without leaking Firebase token details', async () => {
    verifyIdToken.mockRejectedValueOnce(new Error('Firebase ID token has expired. Get a fresh ID token.'))

    await expect(requireUserId(makeRequest('Bearer expired-token'))).rejects.toMatchObject({
      status: 401,
      message: 'Nieprawidłowy lub wygasły token autoryzacji.',
    })
  })

  it('returns uid for a valid bearer token', async () => {
    verifyIdToken.mockResolvedValueOnce({ uid: 'user-123' })

    await expect(requireUserId(makeRequest('Bearer valid-token'))).resolves.toBe('user-123')
    expect(verifyIdToken).toHaveBeenCalledWith('valid-token')
  })
})
