import { EventEmitter } from 'node:events'
import type { ServerResponse } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadAiUserContext: vi.fn(),
  requireUserId: vi.fn(),
  reserveCoachUnits: vi.fn(),
  refundCoachUnits: vi.fn(),
  getUserExercises: vi.fn(),
}))

vi.mock('../_lib/aiContextLoader.js', () => ({ loadAiUserContext: mocks.loadAiUserContext }))
vi.mock('../_lib/auth.js', () => ({ requireUserId: mocks.requireUserId }))
vi.mock('../_lib/rateLimit.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../_lib/rateLimit.js')>(),
  assertRateLimit: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../_lib/coachQuota.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../_lib/coachQuota.js')>(),
  reserveCoachUnits: mocks.reserveCoachUnits,
  refundCoachUnits: mocks.refundCoachUnits,
}))
vi.mock('../_lib/firebaseAdmin.js', () => ({
  adminDb: { collection: () => ({ where: () => ({ limit: () => ({ get: mocks.getUserExercises }) }) }) },
}))

import { buildAiUserContext } from '../../server/aiContext.js'
import { CoachLimitError } from '../_lib/coachQuota.js'
import handler from '../ai-chat.js'
import type { ApiRequest, ApiResponse } from '../_lib/http.js'

const SERVER_KEY = 'sk-or-server-key-long-enough-for-tests'
const OWN_KEY = 'sk-or-own-key-long-enough-for-tests'
const chatBody = { messages: [{ role: 'user', content: 'Czy progresuję?' }] }
const planBody = { mode: 'plan', planRequest: { goal: 'strength', daysPerWeek: 2 } }
const reservation = (cost: number) => ({ uid: 'user-1', day: '2026-11-16', cost, used: cost })

function doubles(body: unknown) {
  const events = new EventEmitter()
  const headers = new Map<string, string>()
  let output = ''
  const req = Object.assign(new EventEmitter(), { aborted: false, body, method: 'POST', headers: { 'content-type': 'application/json' } }) as ApiRequest
  const res = Object.assign(events, {
    statusCode: 0, writableEnded: false, destroyed: false,
    setHeader(name: string, value: string) { headers.set(name.toLowerCase(), value) },
    write(chunk: string) { output += chunk; return true },
    end(chunk?: string) { if (chunk) output += chunk; this.writableEnded = true; events.emit('close') },
  }) as unknown as ServerResponse
  return { req, res: res as ApiResponse, header: (name: string) => headers.get(name.toLowerCase()), status: () => res.statusCode, json: () => JSON.parse(output) as Record<string, unknown> }
}

async function call(body: unknown, fetchImpl?: (call: ReturnType<typeof doubles>) => ReturnType<typeof vi.fn>) {
  const call = doubles(body)
  const fetchMock = fetchImpl ? fetchImpl(call) : vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  await handler(call.req, call.res)
  return { ...call, fetchMock }
}

const streamed = () => vi.fn().mockResolvedValue({
  ok: true, status: 200,
  body: new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Tak."},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'))
    controller.close()
  } }),
})
const status = (code: number) => vi.fn().mockResolvedValue({ ok: false, status: code })

beforeEach(() => {
  vi.stubEnv('OPENROUTER_API_KEY', SERVER_KEY)
  mocks.requireUserId.mockReset().mockResolvedValue('user-1')
  mocks.loadAiUserContext.mockReset().mockResolvedValue(buildAiUserContext({ profile: { displayName: 'Patryk' }, readinessEntries: [], workouts: [], records: [] }))
  mocks.reserveCoachUnits.mockReset().mockImplementation(async (_uid: string, cost: number) => reservation(cost))
  mocks.refundCoachUnits.mockReset().mockResolvedValue(undefined)
  mocks.getUserExercises.mockReset().mockResolvedValue({ docs: [] })
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('Coach on the shared key', () => {
  it('is unavailable without a server key and never calls OpenRouter', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '')
    const result = await call(chatBody)
    expect(result.status()).toBe(503)
    expect(result.json()).toMatchObject({ code: 'coach-unavailable' })
    expect(result.fetchMock).not.toHaveBeenCalled()
    expect(mocks.reserveCoachUnits).not.toHaveBeenCalled()
  })

  it('answers on the server key, checks revocation, reserves 1 for chat and reports the allowance', async () => {
    const result = await call(chatBody, streamed)
    expect(result.status()).toBe(200)
    expect(mocks.requireUserId).toHaveBeenCalledWith(result.req, { checkRevoked: true })
    expect(mocks.reserveCoachUnits).toHaveBeenCalledWith('user-1', 1)
    expect(result.fetchMock.mock.calls[0]![1].headers.Authorization).toBe(`Bearer ${SERVER_KEY}`)
    expect(result.header('X-IronLog-AI-Quota')).toBe('used=1;limit=20')
    expect(mocks.refundCoachUnits).not.toHaveBeenCalled()
  })

  it('reserves 5 for a plan', async () => {
    await call(planBody, streamed)
    expect(mocks.reserveCoachUnits).toHaveBeenCalledWith('user-1', 5)
  })

  it('refuses a spent allowance with its code and reset time, without calling OpenRouter', async () => {
    mocks.reserveCoachUnits.mockRejectedValueOnce(new CoachLimitError('daily-limit-all', '2026-11-17T00:00:00.000Z'))
    const result = await call(chatBody)
    expect(result.status()).toBe(429)
    expect(result.json()).toEqual({ error: "Coach has reached today's limit for everyone.", code: 'daily-limit-all', resetAt: '2026-11-17T00:00:00.000Z' })
    expect(result.fetchMock).not.toHaveBeenCalled()
  })

  it('reserves nothing when the context or catalogue fails first', async () => {
    mocks.loadAiUserContext.mockRejectedValueOnce(new Error('firestore down'))
    await call(chatBody)
    mocks.getUserExercises.mockRejectedValueOnce(new Error('firestore down'))
    await call(planBody)
    expect(mocks.reserveCoachUnits).not.toHaveBeenCalled()
  })

  it.each([
    ['chat', chatBody],
    ['plan', planBody],
  ])('gives the units back when OpenRouter never accepted the %s request', async (_mode, body) => {
    await call(body, () => status(500))
    await call(body, () => vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    expect(mocks.refundCoachUnits).toHaveBeenCalledTimes(2)
  })

  it('reports a spent or rejected server key as unavailable and gives the units back', async () => {
    const result = await call(chatBody, () => status(402))
    expect(result.status()).toBe(503)
    expect(result.json()).toMatchObject({ code: 'coach-unavailable' })
    expect(mocks.refundCoachUnits).toHaveBeenCalledOnce()
  })

  it.each([
    ['chat', chatBody],
    ['plan', planBody],
  ])('keeps the units when the client leaves the %s request', async (_mode, body) => {
    await call(body, ({ req }) => vi.fn().mockImplementation(() => {
      req.emit('aborted')
      return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'))
    }))
    expect(mocks.refundCoachUnits).not.toHaveBeenCalled()
  })

  it('keeps the units for a plan OpenRouter answered but that is unusable', async () => {
    const result = await call(planBody, () => vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'not json' } }] }) }))
    expect(result.status()).toBe(502)
    expect(mocks.refundCoachUnits).not.toHaveBeenCalled()
  })

  it('refuses a revoked token on the shared key', async () => {
    const { ApiError } = await import('../_lib/errors.js')
    mocks.requireUserId.mockImplementation(async (_req: unknown, options?: { checkRevoked?: boolean }) => {
      if (options?.checkRevoked) throw new ApiError(401, 'Invalid or expired authentication token.')
      return 'user-1'
    })
    const result = await call(chatBody)
    expect(result.status()).toBe(401)
    expect(mocks.reserveCoachUnits).not.toHaveBeenCalled()
  })

  it('leaves the allowance alone with the user’s own key', async () => {
    const result = await call({ ...chatBody, apiKey: OWN_KEY }, streamed)
    expect(result.fetchMock.mock.calls[0]![1].headers.Authorization).toBe(`Bearer ${OWN_KEY}`)
    expect(result.header('X-IronLog-AI-Quota')).toBeUndefined()
    expect(mocks.reserveCoachUnits).not.toHaveBeenCalled()
  })

  it('still refuses a key that is too short instead of falling back to the server key', async () => {
    const result = await call({ ...chatBody, apiKey: 'short' })
    expect(result.status()).toBe(400)
    expect(mocks.reserveCoachUnits).not.toHaveBeenCalled()
  })
})
