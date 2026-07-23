import { EventEmitter } from 'node:events'
import type { ServerResponse } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createEmptyAiUserContext } from '../../server/aiContext.js'
import type { ApiRequest, ApiResponse } from '../_lib/http.js'

vi.mock('../_lib/firebaseAdmin.js', () => ({ adminDb: {} }))
vi.mock('../_lib/auth.js', () => ({ requireUserId: vi.fn() }))

import { streamChatReply } from '../ai-chat.js'

const encoder = new TextEncoder()
const context = createEmptyAiUserContext()
const messages = [{ role: 'user' as const, content: 'Jak trenować?' }]

function createRequest(aborted = false): ApiRequest {
  return Object.assign(new EventEmitter(), {
    aborted,
    headers: {},
  }) as ApiRequest
}

function createResponse(): {
  res: ApiResponse
  headers: Map<string, string>
  written: () => string
  endCalls: () => number
} {
  const events = new EventEmitter()
  const headers = new Map<string, string>()
  let output = ''
  let ends = 0

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
      ends += 1
      this.writableEnded = true
      events.emit('close')
    },
  }) as unknown as ServerResponse

  return {
    res,
    headers,
    written: () => output,
    endCalls: () => ends,
  }
}

function upstreamError(
  status: number,
  json: () => Promise<unknown>,
): Response {
  return {
    ok: false,
    status,
    json,
  } as unknown as Response
}

function anthropicBody(...events: unknown[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(events
        .map((event) => `data: ${JSON.stringify(event)}\n\n`)
        .join('')))
      controller.close()
    },
  })
}

describe('streamChatReply integration', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('does not fetch Anthropic when the client was already disconnected', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { res, written, endCalls } = createResponse()

    await expect(streamChatReply(
      'sk-ant-test-key-long-enough',
      'claude-test',
      context,
      messages,
      createRequest(true),
      res,
    )).resolves.toBeUndefined()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(written()).toBe('')
    expect(endCalls()).toBe(0)
  })

  it('returns silently when the client disconnects before a non-ok response is classified', async () => {
    const req = createRequest()
    const fetchMock = vi.fn().mockImplementation(async () => {
      req.emit('aborted')
      return upstreamError(429, async () => ({ error: { message: 'private upstream detail' } }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const { res, written, endCalls } = createResponse()

    await expect(streamChatReply(
      'sk-ant-test-key-long-enough',
      'claude-test',
      context,
      messages,
      req,
      res,
    )).resolves.toBeUndefined()

    expect(console.error).not.toHaveBeenCalled()
    expect(written()).toBe('')
    expect(endCalls()).toBe(0)
  })

  it.each([
    {
      status: 401,
      expectedStatus: 401,
      code: 'invalid-key',
      message: 'Claude API odrzuciło klucz. Sprawdź klucz i zapisz go ponownie.',
    },
    {
      status: 429,
      expectedStatus: 429,
      code: 'rate-limited',
      message: 'Claude API zgłosiło limit lub brak środków na kluczu. Odczekaj chwilę albo sprawdź konto Anthropic.',
    },
    {
      status: 404,
      expectedStatus: 400,
      code: 'model-unavailable',
      message: 'Wybrany model Claude nie jest dostępny dla tego klucza. Wybierz inny model w konfiguracji.',
    },
    {
      status: 503,
      expectedStatus: 503,
      code: 'upstream-unavailable',
      message: 'Claude API jest chwilowo niedostępne. Spróbuj ponownie za chwilę.',
    },
  ])('classifies upstream $status without exposing upstream detail', async ({ status, expectedStatus, code, message }) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstreamError(
      status,
      async () => ({ error: { message: 'private upstream detail' } }),
    )))

    const { res } = createResponse()

    await expect(streamChatReply(
      'sk-ant-test-key-long-enough',
      'claude-test',
      context,
      messages,
      createRequest(),
      res,
    )).rejects.toMatchObject({
      name: 'ApiError',
      status: expectedStatus,
      code,
      message,
    })
  })

  it('classifies Anthropic network errors as retryable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private network detail')))

    const { res } = createResponse()

    await expect(streamChatReply(
      'sk-ant-test-key-long-enough',
      'claude-test',
      context,
      messages,
      createRequest(),
      res,
    )).rejects.toMatchObject({
      name: 'ApiError',
      status: 503,
      code: 'network-retryable',
      message: 'Nie udało się połączyć z Claude API. Spróbuj ponownie za chwilę.',
    })
  })

  it('marks the terminal before ending a successful NDJSON response', async () => {
    let upstreamSignal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      upstreamSignal = init?.signal ?? undefined
      return {
        ok: true,
        status: 200,
        body: anthropicBody(
          { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Plan' } },
          { type: 'message_stop' },
        ),
      } as Response
    }))

    const { res, headers, written, endCalls } = createResponse()

    await streamChatReply(
      'sk-ant-test-key-long-enough',
      'claude-test',
      context,
      messages,
      createRequest(),
      res,
    )

    expect(headers.get('content-type')).toBe('application/x-ndjson; charset=utf-8')
    expect(written()).toBe([
      '{"type":"chunk","text":"Plan"}',
      '{"type":"done"}',
      '',
    ].join('\n'))
    expect(endCalls()).toBe(1)
    expect(upstreamSignal?.aborted).toBe(false)
  })
})
