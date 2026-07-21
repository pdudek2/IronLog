import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'

import {
  createClientAbortBridge,
  encodeChatStreamFrame,
  pipeAnthropicStream,
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
})

describe('createClientAbortBridge', () => {
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
