import type { IncomingMessage, ServerResponse } from 'node:http'

export type ServerChatStreamFrame =
  | { type: 'chunk'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

export type ChatStreamFailureReason =
  | 'upstream-error'
  | 'invalid-event'
  | 'reader-error'
  | 'unexpected-eof'
  | 'empty-response'

export type AnthropicStreamResult =
  | { status: 'done' }
  | { status: 'error'; reason: ChatStreamFailureReason }
  | { status: 'aborted' }

export interface PipeAnthropicStreamOptions {
  body: ReadableStream<Uint8Array>
  signal: AbortSignal
  isClientOpen: () => boolean
  writeFrame: (frame: ServerChatStreamFrame) => void
}

export interface ClientAbortBridge {
  signal: AbortSignal
  markTerminal: () => void
  dispose: () => void
}

const GENERIC_STREAM_ERROR = 'Nie udało się dokończyć odpowiedzi.'

export function encodeChatStreamFrame(frame: ServerChatStreamFrame): string {
  return `${JSON.stringify(frame)}\n`
}

export function writeChatStreamFrame(
  res: ServerResponse,
  frame: ServerChatStreamFrame,
): boolean {
  if (res.writableEnded || res.destroyed) return false

  res.write(encodeChatStreamFrame(frame))
  return true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function takeSseBlock(buffer: string): { block: string; rest: string } | null {
  const separator = /\r?\n\r?\n/.exec(buffer)
  if (!separator || separator.index === undefined) return null

  return {
    block: buffer.slice(0, separator.index),
    rest: buffer.slice(separator.index + separator[0].length),
  }
}

function getSseData(block: string): string | null {
  const dataLines = block
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = /^data:(?: )?(.*)$/.exec(line)
      return match ? [match[1] ?? ''] : []
    })

  return dataLines.length > 0 ? dataLines.join('\n') : null
}

export async function pipeAnthropicStream({
  body,
  signal,
  isClientOpen,
  writeFrame,
}: PipeAnthropicStreamOptions): Promise<AnthropicStreamResult> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let hasContent = false
  let terminalSent = false
  let cancelPromise: Promise<void> | null = null

  const isDisconnected = () => signal.aborted || !isClientOpen()
  const cancelReader = () => {
    cancelPromise ??= reader.cancel('client-disconnected').catch(() => undefined)
    return cancelPromise
  }
  const onAbort = () => {
    void cancelReader()
  }
  const abortStream = async (): Promise<AnthropicStreamResult> => {
    await cancelReader()
    return { status: 'aborted' }
  }
  const writeSafely = async (
    frame: ServerChatStreamFrame,
    isTerminal = false,
  ): Promise<boolean> => {
    if (isDisconnected()) {
      await cancelReader()
      return false
    }

    try {
      writeFrame(frame)
    } catch (error) {
      if (isDisconnected()) {
        await cancelReader()
        return false
      }
      throw error
    }

    if (isTerminal) terminalSent = true
    return true
  }
  const fail = async (reason: ChatStreamFailureReason): Promise<AnthropicStreamResult> => {
    if (!terminalSent) {
      const written = await writeSafely(
        { type: 'error', message: GENERIC_STREAM_ERROR },
        true,
      )
      if (!written) return { status: 'aborted' }
    }

    return { status: 'error', reason }
  }

  signal.addEventListener('abort', onAbort, { once: true })

  try {
    if (isDisconnected()) return await abortStream()

    while (!terminalSent) {
      let readResult: ReadableStreamReadResult<Uint8Array>
      try {
        readResult = await reader.read()
      } catch {
        if (isDisconnected()) return await abortStream()
        return await fail('reader-error')
      }

      if (isDisconnected()) return await abortStream()

      if (readResult.done) {
        buffer += decoder.decode()
        return await fail('unexpected-eof')
      }

      buffer += decoder.decode(readResult.value, { stream: true })

      let nextBlock = takeSseBlock(buffer)
      while (nextBlock) {
        buffer = nextBlock.rest
        const data = getSseData(nextBlock.block)

        if (data !== null) {
          let event: unknown
          try {
            event = JSON.parse(data)
          } catch {
            return await fail('invalid-event')
          }

          if (!isRecord(event) || typeof event.type !== 'string') {
            return await fail('invalid-event')
          }

          if (event.type === 'error') {
            return await fail('upstream-error')
          }

          if (event.type === 'message_stop') {
            if (!hasContent) return await fail('empty-response')
            const written = await writeSafely({ type: 'done' }, true)
            if (!written) return { status: 'aborted' }
            return { status: 'done' }
          }

          if (event.type === 'content_block_delta') {
            if (!isRecord(event.delta) || typeof event.delta.type !== 'string') {
              return await fail('invalid-event')
            }

            if (event.delta.type === 'text_delta') {
              if (typeof event.delta.text !== 'string') {
                return await fail('invalid-event')
              }

              if (event.delta.text.length > 0) {
                const written = await writeSafely({ type: 'chunk', text: event.delta.text })
                if (!written) return { status: 'aborted' }
                hasContent = true
              }
            }
          }
        }

        nextBlock = takeSseBlock(buffer)
      }
    }

    return { status: 'done' }
  } finally {
    signal.removeEventListener('abort', onAbort)
    reader.releaseLock()
  }
}

export function createClientAbortBridge(
  req: IncomingMessage,
  res: ServerResponse,
): ClientAbortBridge {
  const controller = new AbortController()
  let terminal = false
  const onDisconnect = () => {
    if (!terminal) controller.abort('client-disconnected')
  }

  req.once('aborted', onDisconnect)
  res.once('close', onDisconnect)

  return {
    signal: controller.signal,
    markTerminal: () => {
      terminal = true
    },
    dispose: () => {
      req.off('aborted', onDisconnect)
      res.off('close', onDisconnect)
    },
  }
}
