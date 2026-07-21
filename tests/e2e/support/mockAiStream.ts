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

    runtimeWindow.__ironlogMockAiAbortCount = 0
    window.localStorage.setItem('ironlog.claudeApiKey', 'sk-ant-test-only-browser-key')
    window.localStorage.setItem('ironlog.claudeModel', 'claude-test')

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = typeof input === 'string' || input instanceof URL
        ? input.toString()
        : input.url
      const pathname = new URL(requestUrl, window.location.href).pathname

      if (pathname === '/api/ai-models') {
        return new Response(JSON.stringify({
          models: [{ id: 'claude-test', label: 'Claude Test' }],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        })
      }

      if (pathname !== '/api/ai-chat') return originalFetch(input, init)

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
