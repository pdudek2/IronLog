export type ChatStreamFrame =
  | { type: 'chunk'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

export interface ReadChatStreamOptions {
  signal: AbortSignal
  onChunk: (chunk: string) => void
}

export class ChatStreamProtocolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ChatStreamProtocolError'
  }
}

export class ChatStreamRemoteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ChatStreamRemoteError'
  }
}

export function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error
    && error.name === 'AbortError'
}

function hasExactKeys(frame: Record<string, unknown>, keys: string[]): boolean {
  const frameKeys = Object.keys(frame)
  return frameKeys.length === keys.length && keys.every((key) => key in frame)
}

function parseFrame(line: string): ChatStreamFrame {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    throw new ChatStreamProtocolError('Stream AI zwrócił niepoprawne dane.')
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ChatStreamProtocolError('Stream AI zwrócił niepoprawną ramkę.')
  }

  const frame = value as Record<string, unknown>
  if (frame.type === 'chunk' && hasExactKeys(frame, ['type', 'text']) && typeof frame.text === 'string') {
    return { type: 'chunk', text: frame.text }
  }
  if (frame.type === 'done' && hasExactKeys(frame, ['type'])) return { type: 'done' }
  if (frame.type === 'error' && hasExactKeys(frame, ['type', 'message'])
    && typeof frame.message === 'string' && frame.message.trim()) {
    return { type: 'error', message: frame.message.trim() }
  }
  throw new ChatStreamProtocolError('Stream AI zwrócił nieznany typ ramki.')
}

function createAbortError(): Error {
  const error = new Error('Odczyt streamu AI został anulowany.')
  error.name = 'AbortError'
  return error
}

export async function readChatStream(
  body: ReadableStream<Uint8Array>,
  options: ReadChatStreamOptions,
): Promise<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let response = ''
  let didFinish = false
  let cancelPromise: Promise<void> | null = null

  const cancelReader = () => {
    cancelPromise ??= reader.cancel().catch(() => undefined)
    return cancelPromise
  }

  const onAbort = () => {
    void cancelReader()
  }

  const processLines = () => {
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex)
      buffer = buffer.slice(newlineIndex + 1)

      if (didFinish) {
        if (line.trim()) {
          throw new ChatStreamProtocolError('Stream AI zwrócił dane po zakończeniu.')
        }
      } else {
        const frame = parseFrame(line)
        if (frame.type === 'chunk') {
          response += frame.text
          options.onChunk(frame.text)
        } else if (frame.type === 'error') {
          throw new ChatStreamRemoteError(frame.message)
        } else {
          if (!response) {
            throw new ChatStreamProtocolError('Stream AI zakończył się bez odpowiedzi.')
          }
          didFinish = true
        }
      }

      newlineIndex = buffer.indexOf('\n')
    }
  }

  options.signal.addEventListener('abort', onAbort, { once: true })

  try {
    if (options.signal.aborted) {
      onAbort()
      throw createAbortError()
    }

    while (true) {
      let readResult: ReadableStreamReadResult<Uint8Array>
      try {
        readResult = await reader.read()
      } catch (error) {
        if (options.signal.aborted) throw createAbortError()
        throw error
      }

      if (options.signal.aborted) throw createAbortError()
      if (readResult.done) break

      buffer += decoder.decode(readResult.value, { stream: true })
      processLines()
    }

    buffer += decoder.decode()
    processLines()

    if (!didFinish) {
      throw new ChatStreamProtocolError('Stream AI zakończył się bez potwierdzenia.')
    }
    if (buffer.trim()) {
      throw new ChatStreamProtocolError('Stream AI zwrócił dane po zakończeniu.')
    }
    return response
  } catch (error) {
    await cancelReader()
    if (options.signal.aborted) throw createAbortError()
    throw error
  } finally {
    options.signal.removeEventListener('abort', onAbort)
    reader.releaseLock()
  }
}
