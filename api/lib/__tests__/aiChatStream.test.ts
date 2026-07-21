import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'

import {
  createClientAbortBridge,
  encodeChatStreamFrame,
  pipeAnthropicStream,
  writeChatStreamFrame,
  type ServerChatStreamFrame,
} from '../aiChatStream'

const encoder = new TextEncoder()

function anthropicEvent(event: unknown): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

function anthropicStream(...events: unknown[]): ReadableStream<Uint8Array> {
  return streamFrom(events.map(anthropicEvent).join(''))
}

function streamFrom(...chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)))
      controller.close()
    },
  })
}

function streamThatErrors(error: Error): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.error(error)
    },
  })
}

function createHttpDoubles(): {
  req: IncomingMessage
  res: ServerResponse
  requestEvents: EventEmitter
  responseEvents: EventEmitter
} {
  const requestEvents = new EventEmitter()
  const responseEvents = new EventEmitter()

  return {
    req: requestEvents as unknown as IncomingMessage,
    res: responseEvents as unknown as ServerResponse,
    requestEvents,
    responseEvents,
  }
}

describe('encodeChatStreamFrame', () => {
  it('encodes one newline-delimited JSON frame', () => {
    expect(encodeChatStreamFrame({ type: 'done' })).toBe('{"type":"done"}\n')
  })
})

describe('writeChatStreamFrame', () => {
  it('writes one NDJSON frame while the response is open', () => {
    let written = ''
    const response = {
      writableEnded: false,
      destroyed: false,
      write: (chunk: string) => {
        written += chunk
      },
    } as unknown as ServerResponse

    expect(writeChatStreamFrame(response, { type: 'done' })).toBe(true)
    expect(written).toBe('{"type":"done"}\n')
  })

  it.each([
    { writableEnded: true, destroyed: false },
    { writableEnded: false, destroyed: true },
  ])('does not write after the response is closed (%o)', (state) => {
    let written = ''
    const response = {
      ...state,
      write: (chunk: string) => {
        written += chunk
      },
    } as unknown as ServerResponse

    expect(writeChatStreamFrame(response, { type: 'error', message: 'x' })).toBe(false)
    expect(written).toBe('')
  })
})

describe('pipeAnthropicStream', () => {
  it('emits chunks and exactly one done after message_stop', async () => {
    const frames: ServerChatStreamFrame[] = []
    const result = await pipeAnthropicStream({
      body: anthropicStream(
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Plan' } },
        { type: 'message_stop' },
        { type: 'message_stop' },
      ),
      signal: new AbortController().signal,
      isClientOpen: () => true,
      writeFrame: (frame) => frames.push(frame),
    })

    expect(result).toEqual({ status: 'done' })
    expect(frames).toEqual([
      { type: 'chunk', text: 'Plan' },
      { type: 'done' },
    ])
  })

  it('reassembles SSE events split across transport chunks', async () => {
    const frames: ServerChatStreamFrame[] = []
    const result = await pipeAnthropicStream({
      body: streamFrom(
        'data: {"type":"content_block_delta","delta":{"type":"text_delta",',
        '"text":"Cześć"}}\n\ndata: {"type":"message_stop"}\n',
        '\n',
      ),
      signal: new AbortController().signal,
      isClientOpen: () => true,
      writeFrame: (frame) => frames.push(frame),
    })

    expect(result).toEqual({ status: 'done' })
    expect(frames).toEqual([
      { type: 'chunk', text: 'Cześć' },
      { type: 'done' },
    ])
  })

  it('parses CRLF-delimited SSE events', async () => {
    const frames: ServerChatStreamFrame[] = []
    const result = await pipeAnthropicStream({
      body: streamFrom(
        'event: content_block_delta\r\n',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Plan"}}\r\n\r\n',
        'event: message_stop\r\ndata: {"type":"message_stop"}\r\n\r\n',
      ),
      signal: new AbortController().signal,
      isClientOpen: () => true,
      writeFrame: (frame) => frames.push(frame),
    })

    expect(result).toEqual({ status: 'done' })
    expect(frames).toEqual([
      { type: 'chunk', text: 'Plan' },
      { type: 'done' },
    ])
  })

  it('joins multiple data lines within one SSE event', async () => {
    const frames: ServerChatStreamFrame[] = []
    const result = await pipeAnthropicStream({
      body: streamFrom(
        'data: {"type":"content_block_delta",\n',
        'data: "delta":{"type":"text_delta","text":"Plan"}}\n\n',
        'data: {"type":"message_stop"}\n\n',
      ),
      signal: new AbortController().signal,
      isClientOpen: () => true,
      writeFrame: (frame) => frames.push(frame),
    })

    expect(result).toEqual({ status: 'done' })
    expect(frames).toEqual([
      { type: 'chunk', text: 'Plan' },
      { type: 'done' },
    ])
  })

  it('turns an upstream error after content into an error terminal', async () => {
    const frames: ServerChatStreamFrame[] = []
    const result = await pipeAnthropicStream({
      body: anthropicStream(
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Część' } },
        { type: 'error', error: { message: 'connection lost' } },
      ),
      signal: new AbortController().signal,
      isClientOpen: () => true,
      writeFrame: (frame) => frames.push(frame),
    })

    expect(result).toEqual({ status: 'error', reason: 'upstream-error' })
    expect(frames.at(-1)).toEqual({
      type: 'error',
      message: 'Nie udało się dokończyć odpowiedzi.',
    })
    expect(frames.some((frame) => frame.type === 'done')).toBe(false)
    expect(JSON.stringify(frames)).not.toContain('connection lost')
  })

  it('turns malformed Anthropic JSON into an invalid-event terminal', async () => {
    const frames: ServerChatStreamFrame[] = []
    const result = await pipeAnthropicStream({
      body: streamFrom('data: {not-json}\n\n'),
      signal: new AbortController().signal,
      isClientOpen: () => true,
      writeFrame: (frame) => frames.push(frame),
    })

    expect(result).toEqual({ status: 'error', reason: 'invalid-event' })
    expect(frames).toEqual([{
      type: 'error',
      message: 'Nie udało się dokończyć odpowiedzi.',
    }])
  })

  it('turns a reader exception into a reader-error terminal', async () => {
    const frames: ServerChatStreamFrame[] = []
    const result = await pipeAnthropicStream({
      body: streamThatErrors(new Error('private upstream detail')),
      signal: new AbortController().signal,
      isClientOpen: () => true,
      writeFrame: (frame) => frames.push(frame),
    })

    expect(result).toEqual({ status: 'error', reason: 'reader-error' })
    expect(frames).toEqual([{
      type: 'error',
      message: 'Nie udało się dokończyć odpowiedzi.',
    }])
    expect(JSON.stringify(frames)).not.toContain('private upstream detail')
  })

  it('turns EOF without message_stop into an unexpected-eof terminal', async () => {
    const frames: ServerChatStreamFrame[] = []
    const result = await pipeAnthropicStream({
      body: anthropicStream(
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Urwane' } },
      ),
      signal: new AbortController().signal,
      isClientOpen: () => true,
      writeFrame: (frame) => frames.push(frame),
    })

    expect(result).toEqual({ status: 'error', reason: 'unexpected-eof' })
    expect(frames).toEqual([
      { type: 'chunk', text: 'Urwane' },
      { type: 'error', message: 'Nie udało się dokończyć odpowiedzi.' },
    ])
  })

  it('turns message_stop without text into an empty-response terminal', async () => {
    const frames: ServerChatStreamFrame[] = []
    const result = await pipeAnthropicStream({
      body: anthropicStream({ type: 'message_stop' }),
      signal: new AbortController().signal,
      isClientOpen: () => true,
      writeFrame: (frame) => frames.push(frame),
    })

    expect(result).toEqual({ status: 'error', reason: 'empty-response' })
    expect(frames).toEqual([{
      type: 'error',
      message: 'Nie udało się dokończyć odpowiedzi.',
    }])
  })

  it('ignores unknown nonterminal events', async () => {
    const frames: ServerChatStreamFrame[] = []
    const result = await pipeAnthropicStream({
      body: anthropicStream(
        { type: 'future_progress_event', progress: 0.5 },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Plan' } },
        { type: 'message_stop' },
      ),
      signal: new AbortController().signal,
      isClientOpen: () => true,
      writeFrame: (frame) => frames.push(frame),
    })

    expect(result).toEqual({ status: 'done' })
    expect(frames).toEqual([
      { type: 'chunk', text: 'Plan' },
      { type: 'done' },
    ])
  })

  it('returns aborted without writing when the signal is already aborted', async () => {
    const controller = new AbortController()
    const frames: ServerChatStreamFrame[] = []
    controller.abort('client-disconnected')

    const result = await pipeAnthropicStream({
      body: anthropicStream({ type: 'message_stop' }),
      signal: controller.signal,
      isClientOpen: () => true,
      writeFrame: (frame) => frames.push(frame),
    })

    expect(result).toEqual({ status: 'aborted' })
    expect(frames).toEqual([])
  })

  it('returns aborted without writing when the client is closed', async () => {
    const frames: ServerChatStreamFrame[] = []
    const result = await pipeAnthropicStream({
      body: anthropicStream(
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Ukryte' } },
        { type: 'message_stop' },
      ),
      signal: new AbortController().signal,
      isClientOpen: () => false,
      writeFrame: (frame) => frames.push(frame),
    })

    expect(result).toEqual({ status: 'aborted' })
    expect(frames).toEqual([])
  })

  it.each([
    {
      target: 'chunk' as const,
      events: [
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Plan' } },
      ],
    },
    {
      target: 'done' as const,
      events: [
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Plan' } },
        { type: 'message_stop' },
      ],
    },
    {
      target: 'error' as const,
      events: [
        { type: 'error', error: { message: 'upstream detail' } },
      ],
    },
  ])('returns aborted when a $target write loses the client and throws', async ({ target, events }) => {
    const controller = new AbortController()
    const writtenFrames: ServerChatStreamFrame[] = []
    let clientOpen = true

    const resultPromise = pipeAnthropicStream({
      body: anthropicStream(...events),
      signal: controller.signal,
      isClientOpen: () => clientOpen,
      writeFrame: (frame) => {
        if (frame.type === target) {
          clientOpen = false
          controller.abort('client-disconnected')
          throw new Error('socket write failed')
        }
        writtenFrames.push(frame)
      },
    })

    await expect(resultPromise).resolves.toEqual({ status: 'aborted' })
    expect(writtenFrames.some((frame) => frame.type === target)).toBe(false)
  })

  it('rethrows a writer exception while the signal and client remain open', async () => {
    const writeError = new Error('writer programming failure')

    await expect(pipeAnthropicStream({
      body: anthropicStream(
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Plan' } },
      ),
      signal: new AbortController().signal,
      isClientOpen: () => true,
      writeFrame: () => {
        throw writeError
      },
    })).rejects.toBe(writeError)
  })

  it('cancels a pending reader when the signal aborts', async () => {
    const controller = new AbortController()
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      pull() {
        return new Promise(() => undefined)
      },
      cancel,
    })

    const resultPromise = pipeAnthropicStream({
      body,
      signal: controller.signal,
      isClientOpen: () => true,
      writeFrame: vi.fn(),
    })
    controller.abort('client-disconnected')

    await expect(resultPromise).resolves.toEqual({ status: 'aborted' })
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('removes the abort listener and releases the reader lock after completion', async () => {
    const controller = new AbortController()
    const addEventListener = vi.spyOn(controller.signal, 'addEventListener')
    const removeEventListener = vi.spyOn(controller.signal, 'removeEventListener')
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      start(streamController) {
        streamController.enqueue(encoder.encode([
          anthropicEvent({
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'Plan' },
          }),
          anthropicEvent({ type: 'message_stop' }),
        ].join('')))
      },
      cancel,
    })

    await expect(pipeAnthropicStream({
      body,
      signal: controller.signal,
      isClientOpen: () => true,
      writeFrame: vi.fn(),
    })).resolves.toEqual({ status: 'done' })

    const abortListener = addEventListener.mock.calls.find(([type]) => type === 'abort')?.[1]
    expect(abortListener).toBeDefined()
    expect(removeEventListener).toHaveBeenCalledWith('abort', abortListener)
    expect(body.locked).toBe(false)

    controller.abort('after-terminal')
    await Promise.resolve()
    expect(cancel).not.toHaveBeenCalled()
  })
})

describe('createClientAbortBridge', () => {
  it('starts aborted when the request is already disconnected', () => {
    const { req, res } = createHttpDoubles()
    Object.assign(req, { aborted: true })

    const bridge = createClientAbortBridge(req, res)

    expect(bridge.signal.aborted).toBe(true)
    expect(bridge.signal.reason).toBe('client-disconnected')
    bridge.dispose()
  })

  it.each([
    { writableEnded: true, destroyed: false },
    { writableEnded: false, destroyed: true },
  ])('starts aborted when the response is already closed (%o)', (state) => {
    const { req, res } = createHttpDoubles()
    Object.assign(res, state)

    const bridge = createClientAbortBridge(req, res)

    expect(bridge.signal.aborted).toBe(true)
    expect(bridge.signal.reason).toBe('client-disconnected')
    bridge.dispose()
  })

  it('aborts when the request emits aborted', () => {
    const { req, res, requestEvents } = createHttpDoubles()
    const bridge = createClientAbortBridge(req, res)

    requestEvents.emit('aborted')

    expect(bridge.signal.aborted).toBe(true)
    expect(bridge.signal.reason).toBe('client-disconnected')
  })

  it('aborts when the response closes prematurely', () => {
    const { req, res, responseEvents } = createHttpDoubles()
    const bridge = createClientAbortBridge(req, res)

    responseEvents.emit('close')

    expect(bridge.signal.aborted).toBe(true)
    expect(bridge.signal.reason).toBe('client-disconnected')
  })

  it('does not abort when the response closes after a terminal frame', () => {
    const { req, res, responseEvents } = createHttpDoubles()
    const bridge = createClientAbortBridge(req, res)

    bridge.markTerminal()
    responseEvents.emit('close')

    expect(bridge.signal.aborted).toBe(false)
  })

  it('removes disconnect listeners when disposed', () => {
    const { req, res, requestEvents, responseEvents } = createHttpDoubles()
    const bridge = createClientAbortBridge(req, res)

    bridge.dispose()
    requestEvents.emit('aborted')
    responseEvents.emit('close')

    expect(bridge.signal.aborted).toBe(false)
  })
})
