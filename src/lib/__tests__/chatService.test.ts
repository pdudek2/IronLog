import { afterEach, describe, expect, it, vi } from 'vitest'

const { auth } = vi.hoisted(() => ({
  auth: { currentUser: { getIdToken: vi.fn().mockResolvedValue('id-token') } },
}))

vi.mock('../firebase', () => ({ auth, db: {} }))
vi.mock('../aiKeyStorage', () => ({ getClaudeModel: () => 'claude-test' }))

import { streamChatReply } from '../chatService'

const encoder = new TextEncoder()

function ndjsonResponse(frames: string): Response {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(frames))
      controller.close()
    },
  })

  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
  })
}

const options = () => ({
  apiKey: 'sk-ant-test-key-longer-than-twenty-characters',
  messages: [{ role: 'user' as const, content: 'Pomóż' }],
  signal: new AbortController().signal,
  onChunk: vi.fn(),
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  auth.currentUser = { getIdToken: vi.fn().mockResolvedValue('id-token') }
})

describe('streamChatReply', () => {
  it('forwards the exact abort signal and reads terminal NDJSON frames', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn().mockResolvedValue(ndjsonResponse(
      '{"type":"chunk","text":"Gotowe"}\n{"type":"done"}\n',
    ))
    vi.stubGlobal('fetch', fetchMock)
    const onChunk = vi.fn()

    await expect(streamChatReply({
      ...options(),
      signal: controller.signal,
      onChunk,
    })).resolves.toBe('Gotowe')

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/ai-chat'),
      expect.objectContaining({ signal: controller.signal }))
    expect(onChunk).toHaveBeenCalledWith('Gotowe')
  })

  it('preserves JSON HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: 'Limit AI został osiągnięty.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } },
    )))

    await expect(streamChatReply(options())).rejects.toThrow('Limit AI został osiągnięty.')
  })

  it('rejects a successful response without a body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200, headers: {
      'Content-Type': 'application/x-ndjson',
    } })))

    await expect(streamChatReply(options())).rejects.toThrow('Stream AI nie zwrócił danych.')
  })

  it('rejects a successful response with a non-NDJSON content type', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Gotowe', { status: 200, headers: {
      'Content-Type': 'text/plain',
    } })))

    await expect(streamChatReply(options())).rejects.toThrow('Stream AI zwrócił niepoprawny format odpowiedzi.')
  })

  it('rejects a content type that only starts with the NDJSON media type', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Gotowe', { status: 200, headers: {
      'Content-Type': 'application/x-ndjson-extra; charset=utf-8',
    } })))

    await expect(streamChatReply(options())).rejects.toThrow('Stream AI zwrócił niepoprawny format odpowiedzi.')
  })

  it('propagates AbortError instead of replacing it with local backend guidance', async () => {
    const aborted = new DOMException('Przerwano', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(aborted))

    await expect(streamChatReply(options())).rejects.toBe(aborted)
  })
})
