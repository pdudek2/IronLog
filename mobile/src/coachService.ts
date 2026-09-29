import { parseAiContextHeader, type AiContextMetadata } from '../../src/lib/aiContext'
import { readChatStream } from '../../src/lib/chatStreamProtocol'

export type CoachMessage = { id: number; role: 'user' | 'assistant'; content: string; context?: AiContextMetadata }
export class CoachApiError extends Error {
  constructor(message: string, readonly code?: string) { super(message) }
}
export type CoachRequest = {
  key: string; messages: CoachMessage[]; signal: AbortSignal
  onContext: (context: AiContextMetadata) => void; onChunk: (text: string) => void
}
export function coachRequestBody(key: string, messages: CoachMessage[]): string {
  const recent = messages.map(({ role, content }) => ({ role, content: content.trim().slice(0, 4000) }))
    .filter(({ content }) => content).slice(-12)
  let body = JSON.stringify({ apiKey: key, messages: recent })
  while (new TextEncoder().encode(body).length > 128 * 1024 && recent.length > 1) {
    recent.shift()
    body = JSON.stringify({ apiKey: key, messages: recent })
  }
  if (new TextEncoder().encode(body).length > 128 * 1024) throw new Error('The message is too large. Shorten it and try again.')
  return body
}

export async function coachPost(baseUrl: string, path: 'ai-chat' | 'ai-models', body: string,
  signal: AbortSignal, token: () => Promise<string>, transport: typeof fetch): Promise<Response> {
  const idToken = await token()
  if (signal.aborted) throw new Error('Request cancelled.')
  let response: Response
  try {
    response = await transport(`${baseUrl}/api/${path}`, { method: 'POST', signal,
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' }, body })
  } catch { throw new Error('Could not connect to AI Coach. Check your connection and retry.') }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { code?: unknown } | null
    const code = typeof payload?.code === 'string' ? payload.code : undefined
    // Do not display arbitrary provider text: it can include request details or the key.
    const message = code === 'invalid-key'
      ? 'OpenRouter rejected this key. Update it in settings.'
      : response.status === 402 ? 'Your OpenRouter account needs credits.'
        : response.status === 429 ? 'A request limit or credit limit was reached. Wait or check your OpenRouter account.'
          : response.status === 401 ? 'Your sign-in expired. Sign in again.'
            : 'AI Coach could not complete the request. Try again.'
    throw new CoachApiError(message, code)
  }
  return response
}

export async function consumeCoachReply(response: Response, request: CoachRequest): Promise<string> {
  const context = parseAiContextHeader(response.headers)
  if (!response.body || !response.headers.get('Content-Type')?.includes('application/x-ndjson')) {
    throw new Error('AI Coach returned an invalid stream.')
  }
  request.onContext(context)
  return readChatStream(response.body, { signal: request.signal, onChunk: request.onChunk })
}
