import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { verifyIdToken } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
}))

vi.mock('../firebaseAdmin.js', () => ({
  adminAuth: { verifyIdToken },
}))

import { requireRecentUserId, requireUserId } from '../auth.js'
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
      message: 'Missing authentication token.',
    })
  })

  it('throws a public 401 error without leaking Firebase token details', async () => {
    verifyIdToken.mockRejectedValueOnce(new Error('Firebase ID token has expired. Get a fresh ID token.'))

    await expect(requireUserId(makeRequest('Bearer expired-token'))).rejects.toMatchObject({
      status: 401,
      message: 'Invalid or expired authentication token.',
    })
  })

  it('returns uid for a valid bearer token', async () => {
    verifyIdToken.mockResolvedValueOnce({ uid: 'user-123' })

    await expect(requireUserId(makeRequest('Bearer valid-token'))).resolves.toBe('user-123')
    expect(verifyIdToken).toHaveBeenCalledWith('valid-token', false)
  })

  it('checks revocation when asked', async () => {
    verifyIdToken.mockResolvedValueOnce({ uid: 'user-123' })
    await expect(requireUserId(makeRequest('Bearer valid-token'), { checkRevoked: true })).resolves.toBe('user-123')
    expect(verifyIdToken).toHaveBeenCalledWith('valid-token', true)
  })
})

describe('requireRecentUserId', () => {
  beforeEach(() => {
    verifyIdToken.mockReset()
  })
  const now = 1_800_000_000

  it('checks revocation and accepts a sign-in from the last five minutes', async () => {
    verifyIdToken.mockResolvedValueOnce({ uid: 'user-123', auth_time: now - 299 })
    await expect(requireRecentUserId(makeRequest('Bearer fresh'), now)).resolves.toBe('user-123')
    expect(verifyIdToken).toHaveBeenCalledWith('fresh', true)
  })

  it('refuses an older sign-in with a 403 that asks to sign in again', async () => {
    verifyIdToken.mockResolvedValueOnce({ uid: 'user-123', auth_time: now - 301 })
    await expect(requireRecentUserId(makeRequest('Bearer old'), now)).rejects.toMatchObject({ status: 403, message: 'Sign in again to delete your account.' })
  })

  it('refuses a missing or revoked token with a 401', async () => {
    await expect(requireRecentUserId(makeRequest(), now)).rejects.toMatchObject({ status: 401 })
    verifyIdToken.mockRejectedValueOnce(Object.assign(new Error('revoked'), { code: 'auth/id-token-revoked' }))
    await expect(requireRecentUserId(makeRequest('Bearer revoked'), now)).rejects.toMatchObject({ status: 401 })
  })
})
