import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiRequest, ApiResponse } from '../_lib/http.js'
vi.mock('../_lib/auth.js', () => ({ requireUserId: vi.fn().mockResolvedValue('user-1') }))
vi.mock('../_lib/rateLimit.js', () => ({
  assertRateLimit: vi.fn().mockResolvedValue(undefined),
  RateLimitError: class extends Error {},
}))
import handler from '../ai-models.js'

afterEach(() => vi.unstubAllGlobals())
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
    if (status === 200) expect(JSON.parse(output)).toEqual({ models: [{ id: 'openai/gpt-5.6-luna', label: 'GPT-5.6 Luna · Max reasoning' }] })
  })
})
