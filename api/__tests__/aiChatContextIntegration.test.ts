import { EventEmitter } from 'node:events'
import type { ServerResponse } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadAiUserContext: vi.fn(),
  requireUserId: vi.fn().mockResolvedValue('user-1'),
  assertRateLimit: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/aiContextLoader.js', () => ({
  loadAiUserContext: mocks.loadAiUserContext,
}))
vi.mock('../lib/auth.js', () => ({ requireUserId: mocks.requireUserId }))
vi.mock('../lib/rateLimit.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/rateLimit.js')>()
  return { ...actual, assertRateLimit: mocks.assertRateLimit }
})
vi.mock('../lib/firebaseAdmin.js', () => ({ adminDb: {} }))

import { AVAILABLE_AI_CONTEXT_SOURCES, buildAiUserContext } from '../../server/aiContext.js'
import handler, { serializeAiContextHeader } from '../ai-chat.js'
import { ApiError } from '../lib/errors.js'
import type { ApiRequest, ApiResponse } from '../lib/http.js'

function createHandlerDoubles(body: unknown) {
  const events = new EventEmitter()
  const headers = new Map<string, string>()
  let output = ''
  const req = Object.assign(new EventEmitter(), {
    aborted: false,
    body,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  }) as ApiRequest
  const res = Object.assign(events, {
    statusCode: 0,
    writableEnded: false,
    destroyed: false,
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value)
    },
    write(chunk: string) {
      output += chunk
      return true
    },
    end(chunk?: string) {
      if (chunk) output += chunk
      this.writableEnded = true
      events.emit('close')
    },
  }) as unknown as ServerResponse

  return {
    req,
    res: res as ApiResponse,
    header: (name: string) => headers.get(name.toLowerCase()),
    status: () => res.statusCode,
    text: () => output,
    json: () => JSON.parse(output) as unknown,
  }
}

const validBody = {
  apiKey: 'sk-ant-test-key-longer-than-twenty-characters',
  model: 'claude-test',
  messages: [{ role: 'user', content: 'Pomóż' }],
}

beforeEach(() => {
  mocks.loadAiUserContext.mockReset()
  mocks.requireUserId.mockReset()
  mocks.assertRateLimit.mockReset()
  mocks.requireUserId.mockResolvedValue('user-1')
  mocks.assertRateLimit.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AI context response metadata', () => {
  it('serializes full and canonical limited metadata', () => {
    expect(serializeAiContextHeader(AVAILABLE_AI_CONTEXT_SOURCES)).toBe('full')
    expect(serializeAiContextHeader({
      profile: 'available',
      readiness: 'unavailable',
      workouts: 'available',
      records: 'unavailable',
    })).toBe('limited;unavailable=readiness,records')
  })

  it('does not fetch Anthropic when context loading rejects with ai_context_unavailable', async () => {
    mocks.loadAiUserContext.mockRejectedValueOnce(new ApiError(
      503,
      'Nie udało się załadować kontekstu. Spróbuj ponownie.',
      { code: 'ai_context_unavailable' },
    ))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const captured = createHandlerDoubles(validBody)
    await handler(captured.req, captured.res)

    expect(captured.status()).toBe(503)
    expect(captured.json()).toEqual({
      error: 'Nie udało się załadować kontekstu. Spróbuj ponownie.',
      code: 'ai_context_unavailable',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sets limited metadata without changing successful NDJSON frames', async () => {
    mocks.loadAiUserContext.mockResolvedValueOnce(buildAiUserContext({
      sources: { ...AVAILABLE_AI_CONTEXT_SOURCES, readiness: 'unavailable' },
      profile: null,
      readinessEntries: [],
      workouts: [],
      records: [],
    }))
    const encoder = new TextEncoder()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode([
            'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Gotowe"}}',
            'data: {"type":"message_stop"}',
            '',
          ].join('\n\n')))
          controller.close()
        },
      }),
    } as Response))

    const captured = createHandlerDoubles(validBody)
    await handler(captured.req, captured.res)

    expect(captured.header('X-IronLog-AI-Context')).toBe('limited;unavailable=readiness')
    expect(captured.text()).toBe('{"type":"chunk","text":"Gotowe"}\n{"type":"done"}\n')
  })
})
