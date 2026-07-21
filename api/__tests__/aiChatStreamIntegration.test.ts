import { EventEmitter } from 'node:events'
import type { ServerResponse } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createEmptyAiUserContext } from '../../server/aiContext.js'
import type { ApiRequest, ApiResponse } from '../lib/http.js'

vi.mock('../lib/firebaseAdmin.js', () => ({ adminDb: {} }))
vi.mock('../lib/auth.js', () => ({ requireUserId: vi.fn() }))

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

  it('returns silently when the client disconnects while reading a non-ok response', async () => {
    const req = createRequest()
    const fetchMock = vi.fn().mockResolvedValue(upstreamError(429, async () => {
      req.emit('aborted')
      throw new Error('response body cancelled')
    }))
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
    { status: 401, message: 'Klucz Claude jest nieprawidłowy.' },
    { status: 429, message: 'Limit Claude został osiągnięty.' },
  ])('preserves upstream $status as an ApiError with its public message', async ({ status, message }) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstreamError(
      status,
      async () => ({ error: { message } }),
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
      status,
      message,
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
