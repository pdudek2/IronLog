import { describe, expect, it, vi } from 'vitest'

import {
  ChatStreamProtocolError,
  isAbortError,
  readChatStream,
} from '../chatStreamProtocol'

const encoder = new TextEncoder()

function streamFrom(...chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)))
      controller.close()
    },
  })
}

describe('readChatStream', () => {
  it('reassembles NDJSON frames split across transport chunks', async () => {
    const onChunk = vi.fn()
    const controller = new AbortController()
    const body = streamFrom(
      '{"type":"chunk","te',
      'xt":"Cześć"}\n{"type":"chunk","text":"!"}\n',
      '{"type":"done"}\n',
    )

    await expect(readChatStream(body, { signal: controller.signal, onChunk }))
      .resolves.toBe('Cześć!')
    expect(onChunk).toHaveBeenNthCalledWith(1, 'Cześć')
    expect(onChunk).toHaveBeenNthCalledWith(2, '!')
  })

  it('rejects an error terminal after exposing temporary chunks', async () => {
    const onChunk = vi.fn()
    const body = streamFrom(
      '{"type":"chunk","text":"Część"}\n',
      '{"type":"error","message":"Stream przerwany."}\n',
    )

    await expect(readChatStream(body, {
      signal: new AbortController().signal,
      onChunk,
    })).rejects.toMatchObject({ name: 'ChatStreamRemoteError', message: 'Stream przerwany.' })
    expect(onChunk).toHaveBeenCalledWith('Część')
  })

  it('rejects EOF without a terminal frame', async () => {
    await expect(readChatStream(streamFrom('{"type":"chunk","text":"Cześć"}\n'), {
      signal: new AbortController().signal,
      onChunk: vi.fn(),
    })).rejects.toMatchObject({
      name: 'ChatStreamProtocolError',
      message: 'Stream AI zakończył się bez potwierdzenia.',
    })
  })

  it('rejects malformed JSON frames', async () => {
    await expect(readChatStream(streamFrom('{not-json}\n'), {
      signal: new AbortController().signal,
      onChunk: vi.fn(),
    })).rejects.toBeInstanceOf(ChatStreamProtocolError)
  })

  it('rejects unknown frames', async () => {
    await expect(readChatStream(streamFrom('{"type":"ping"}\n'), {
      signal: new AbortController().signal,
      onChunk: vi.fn(),
    })).rejects.toBeInstanceOf(ChatStreamProtocolError)
  })

  it('rejects done when no text was accumulated', async () => {
    await expect(readChatStream(streamFrom('{"type":"done"}\n'), {
      signal: new AbortController().signal,
      onChunk: vi.fn(),
    })).rejects.toBeInstanceOf(ChatStreamProtocolError)
  })

  it('rejects a done frame that is not newline-delimited at EOF', async () => {
    await expect(readChatStream(streamFrom(
      '{"type":"chunk","text":"Cześć"}\n{"type":"done"}',
    ), {
      signal: new AbortController().signal,
      onChunk: vi.fn(),
    })).rejects.toMatchObject({
      name: 'ChatStreamProtocolError',
      message: 'Stream AI zakończył się bez potwierdzenia.',
    })
  })

  it.each([
    ['chunk', '{"type":"chunk","text":"Cześć","extra":true}\n{"type":"done"}\n'],
    ['done', '{"type":"chunk","text":"Cześć"}\n{"type":"done","extra":true}\n'],
    ['error', '{"type":"error","message":"Niepowodzenie","extra":true}\n'],
  ])('rejects surplus fields on %s frames', async (_type, body) => {
    await expect(readChatStream(streamFrom(body), {
      signal: new AbortController().signal,
      onChunk: vi.fn(),
    })).rejects.toBeInstanceOf(ChatStreamProtocolError)
  })

  it('rejects non-whitespace data after a terminal frame', async () => {
    await expect(readChatStream(streamFrom(
      '{"type":"chunk","text":"Cześć"}\n{"type":"done"}\n',
      '{"type":"chunk","text":"!"}\n',
    ), {
      signal: new AbortController().signal,
      onChunk: vi.fn(),
    })).rejects.toBeInstanceOf(ChatStreamProtocolError)
  })

  it('rejects an already-aborted signal with an AbortError', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(readChatStream(streamFrom('{"type":"done"}\n'), {
      signal: controller.signal,
      onChunk: vi.fn(),
    })).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('isAbortError', () => {
  it('recognizes only errors with the AbortError name', () => {
    expect(isAbortError({ name: 'AbortError' })).toBe(true)
    expect(isAbortError(new Error('AbortError'))).toBe(false)
    expect(isAbortError({ name: 'OtherError' })).toBe(false)
    expect(isAbortError(null)).toBe(false)
  })
})
