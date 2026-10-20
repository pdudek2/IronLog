import { afterEach, describe, expect, it, vi } from 'vitest'

const { auth } = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'user-1', getIdToken: async () => 'token' } as unknown },
}))

vi.mock('../firebase', () => ({ auth }))

import { callAuthedApi } from '../authedApi'

describe('callAuthedApi', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('gives up on a server that never answers instead of leaving the operation pending forever', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_path: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))

    const request = callAuthedApi('/api/delete-workout', { workoutId: 'w-1' })
    const outcome = expect(request).rejects.toThrow('The server did not answer in time. Try again.')
    await vi.advanceTimersByTimeAsync(15_000)
    await outcome
  })
})
