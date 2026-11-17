import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiRequest, ApiResponse } from '../_lib/http.js'
vi.mock('../_lib/auth.js', () => ({ requireUserId: vi.fn().mockResolvedValue('user-1') }))
const rateLimit = vi.hoisted(() => ({ assertRateLimit: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../_lib/rateLimit.js', () => ({
  assertRateLimit: rateLimit.assertRateLimit,
  RateLimitError: class extends Error {},
}))
vi.mock('../_lib/coachQuota.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../_lib/coachQuota.js')>(),
  readCoachQuota: vi.fn().mockResolvedValue({ used: 3, limit: 20, resetAt: '2026-11-17T00:00:00.000Z' }),
}))
import handler from '../ai-models.js'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
describe('OpenRouter key verification', () => {
  it.each([200, 401, 402, 429])('handles upstream %i without returning key data', async (status) => {
    const key = 'sk-or-v1-test-only-key-long-enough'
    const fetchMock = vi.fn().mockResolvedValue({ ok: status === 200, status })
    vi.stubGlobal('fetch', fetchMock)
    let output = ''
    const req = { method: 'POST', headers: { 'content-type': 'application/json' }, body: { apiKey: key } } as ApiRequest
    const res = { statusCode: 0, setHeader: vi.fn(), end: (body: string) => { output = body } } as unknown as ApiResponse
    await handler(req, res)
    expect(fetchMock).toHaveBeenCalledWith('https://openrouter.ai/api/v1/key', {
      method: 'GET', headers: { Authorization: `Bearer ${key}` },
    })
    expect(res.statusCode).toBe(status === 402 ? 429 : status)
    expect(output).not.toContain(key)
    if (status === 200) expect(JSON.parse(output)).toEqual({ models: [{ id: 'openai/gpt-5.6-luna', label: 'GPT-5.6 Luna' }] })
  })

  it('reads the shared-key allowance without a key, and still refuses an empty body', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-server-key-long-enough')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const call = async (body: unknown) => {
      let output = ''
      const res = { statusCode: 0, setHeader: vi.fn(), end: (text: string) => { output = text } } as unknown as ApiResponse
      await handler({ method: 'POST', headers: { 'content-type': 'application/json' }, body } as ApiRequest, res)
      return { status: res.statusCode, body: JSON.parse(output) as unknown }
    }
    rateLimit.assertRateLimit.mockClear()
    expect(await call({ quota: true })).toEqual({ status: 200, body: { used: 3, limit: 20, resetAt: '2026-11-17T00:00:00.000Z', shared: true } })
    // Reading the allowance must not spend the budget for key checks against OpenRouter.
    expect(rateLimit.assertRateLimit).toHaveBeenCalledWith(expect.objectContaining({ key: expect.stringMatching(/^quota:/), limit: 60 }))
    expect((await call({})).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
