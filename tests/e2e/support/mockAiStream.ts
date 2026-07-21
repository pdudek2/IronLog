import type { Page } from '../fixtures'

export type MockAiFrame =
  | { delayMs: number; frame: { type: 'chunk'; text: string } }
  | { delayMs: number; frame: { type: 'done' } }
  | { delayMs: number; frame: { type: 'error'; message: string } }

export interface MockAiAttempt {
  frames: MockAiFrame[]
  holdOpen?: boolean
}

export function installMockAiRuntime(page: Page, attempts: MockAiAttempt[]): Promise<void> {
  return page.addInitScript((configuredAttempts: MockAiAttempt[]) => {
    const runtimeWindow = window as typeof window & {
      __ironlogMockAiAbortCount: number
    }
    const originalFetch = window.fetch.bind(window)
    const encoder = new TextEncoder()
    let nextAttempt = 0

    const isRecord = (value: unknown): value is Record<string, unknown> => (
      typeof value === 'object' && value !== null && !Array.isArray(value)
    )
    const hasExactKeys = (value: Record<string, unknown>, keys: string[]) => (
      Object.keys(value).length === keys.length && keys.every((key) => key in value)
    )
    const isNonEmptyString = (value: unknown): value is string => (
      typeof value === 'string' && value.trim().length > 0
    )
    const contractViolation = (pathname: string, requirement: string): Error => (
      new Error(`Mock AI request contract violation: ${pathname} requires ${requirement}.`)
    )
    const readJsonRequest = async (request: Request, pathname: string): Promise<unknown> => {
      if (request.method !== 'POST') throw contractViolation(pathname, 'POST')

      const authorization = request.headers.get('Authorization')?.trim() ?? ''
      if (!/^Bearer \S+$/.test(authorization)) {
        throw contractViolation(pathname, 'Bearer authorization')
      }

      const mediaType = request.headers.get('Content-Type')
        ?.split(';', 1)[0]
        ?.trim()
        .toLowerCase()
      if (mediaType !== 'application/json') {
        throw contractViolation(pathname, 'application/json Content-Type')
      }

      try {
        return await request.json() as unknown
      } catch {
        throw contractViolation(pathname, 'valid JSON')
      }
    }
    const isModelsBody = (value: unknown) => (
      isRecord(value)
      && hasExactKeys(value, ['apiKey'])
      && isNonEmptyString(value.apiKey)
    )
    const isChatBody = (value: unknown) => (
      isRecord(value)
      && hasExactKeys(value, ['apiKey', 'model', 'messages'])
      && isNonEmptyString(value.apiKey)
      && isNonEmptyString(value.model)
      && Array.isArray(value.messages)
      && value.messages.length > 0
      && value.messages.every((message) => (
        isRecord(message)
        && hasExactKeys(message, ['role', 'content'])
        && (message.role === 'user' || message.role === 'assistant')
        && isNonEmptyString(message.content)
      ))
    )

    runtimeWindow.__ironlogMockAiAbortCount = 0
    window.localStorage.setItem('ironlog.claudeApiKey', 'sk-ant-test-only-browser-key')
    window.localStorage.setItem('ironlog.claudeModel', 'claude-test')

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = typeof input === 'string' || input instanceof URL
        ? input.toString()
        : input.url
      const pathname = new URL(requestUrl, window.location.href).pathname

      if (pathname === '/api/ai-models') {
        const body = await readJsonRequest(new Request(input, init), pathname)
        if (!isModelsBody(body)) throw contractViolation(pathname, 'body { apiKey }')

        return new Response(JSON.stringify({
          models: [{ id: 'claude-test', label: 'Claude Test' }],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        })
      }

      if (pathname !== '/api/ai-chat') return originalFetch(input, init)

      const body = await readJsonRequest(new Request(input, init), pathname)
      if (!isChatBody(body)) {
        throw contractViolation(pathname, 'body { apiKey, model, messages }')
      }

      const attempt = configuredAttempts[nextAttempt]
      nextAttempt += 1
      if (!attempt) throw new Error(`Missing mock AI attempt ${nextAttempt}.`)

      const signal = init?.signal ?? (input instanceof Request ? input.signal : null)
      let timerId: number | null = null
      let finished = false
      let abortRecorded = false

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const clearTimer = () => {
            if (timerId === null) return
            window.clearTimeout(timerId)
            timerId = null
          }
          const detachAbortListener = () => signal?.removeEventListener('abort', onAbort)
          const finish = () => {
            if (finished) return
            finished = true
            clearTimer()
            detachAbortListener()
            controller.close()
          }
          const onAbort = () => {
            if (finished) return
            finished = true
            clearTimer()
            detachAbortListener()
            if (!abortRecorded) {
              abortRecorded = true
              runtimeWindow.__ironlogMockAiAbortCount += 1
            }
            controller.error(new DOMException('The operation was aborted.', 'AbortError'))
          }
          const scheduleFrame = (frameIndex: number) => {
            const nextFrame = attempt.frames[frameIndex]
            if (!nextFrame) {
              if (!attempt.holdOpen) finish()
              return
            }

            timerId = window.setTimeout(() => {
              timerId = null
              if (finished) return
              controller.enqueue(encoder.encode(`${JSON.stringify(nextFrame.frame)}\n`))
              scheduleFrame(frameIndex + 1)
            }, nextFrame.delayMs)
          }

          signal?.addEventListener('abort', onAbort, { once: true })
          if (signal?.aborted) onAbort()
          else scheduleFrame(0)
        },
      })

      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
      })
    }
  }, attempts).then(() => undefined)
}
