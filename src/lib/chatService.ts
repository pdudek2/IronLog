import { auth } from './firebase'
import { getOpenRouterModel } from './aiKeyStorage'
import { isAbortError, readChatStream } from './chatStreamProtocol'
import { AI_QUOTA_HEADER, parseQuotaHeader, type CoachQuotaUsage } from '../shared/coachQuota'

import { parseAiContextHeader, type AiContextMetadata, type AiContextSource } from './aiContext'
export { AI_CONTEXT_SOURCES, parseAiContextHeader, type AiContextMetadata, type AiContextSource } from './aiContext'

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  contextUnavailableSources?: AiContextSource[]
}

export interface TrainingPlanExercise {
  exerciseId: string
  exerciseSource: 'global' | 'user'
  name: string
  sets: number
  targetReps: number
  targetWeight: number
}

export interface TrainingPlanDay {
  name: string
  exercises: TrainingPlanExercise[]
}

export interface GeneratedTrainingPlan {
  name: string
  summary: string
  days: TrainingPlanDay[]
}

export interface TrainingPlanRequest {
  goal: string
  daysPerWeek: number
  experience: string
  equipment: string[]
  focus: string
  notes: string
}

export interface OpenRouterModelOption {
  id: string
  label: string
}

export class AiApiError extends Error {
  readonly code?: string
  readonly resetAt?: string

  constructor(message: string, code?: string, resetAt?: string) {
    super(message)
    this.name = 'AiApiError'
    this.code = code
    this.resetAt = resetAt
  }
}

export interface CoachQuota extends CoachQuotaUsage {
  resetAt: string
  shared: boolean
}

type ErrorPayload = { error?: string; code?: string; resetAt?: string } | null

function apiError(payload: ErrorPayload, fallback: string): AiApiError {
  return new AiApiError(payload?.error ?? fallback, payload?.code, payload?.resetAt)
}

export interface StreamChatReplyOptions {
  // Empty means Coach on the shared server key.
  apiKey: string
  messages: Array<Pick<ChatMessage, 'role' | 'content'>>
  signal: AbortSignal
  onContext: (context: AiContextMetadata) => void
  onChunk: (chunk: string) => void
  onQuota?: (usage: CoachQuotaUsage) => void
}

function getChatApiUrl(): string {
  if (!import.meta.env.DEV || typeof window === 'undefined') return '/api/ai-chat'

  const host = window.location.hostname || 'localhost'
  return `http://${host}:3000/api/ai-chat`
}

function aiConnectionError(chatApiUrl: string): Error {
  return new Error(import.meta.env.DEV
    ? `The local AI endpoint is unavailable at ${chatApiUrl}. Uruchom \`npm run dev:api\` obok \`npm run dev:web\`, albo po prostu \`npm run dev:all\`.`
    : 'Could not connect to AI Coach. Check your connection and try again.')
}

async function getAuthenticatedUserToken() {
  const user = auth.currentUser
  if (!user) throw new Error('No active user session.')
  return user.getIdToken()
}

export async function streamChatReply({
  apiKey,
  messages,
  signal,
  onContext,
  onChunk,
  onQuota,
}: StreamChatReplyOptions): Promise<string> {
  const idToken = await getAuthenticatedUserToken()
  let response: Response

  const chatApiUrl = getChatApiUrl()
  // Match the server's recent-message contract without sending the full UI history.
  const recentMessages = messages
    .filter(({ content }) => content.trim())
    .slice(-12)
    .map(({ role, content }) => ({ role, content: content.trim().slice(0, 4000) }))
  const requestBody = { ...(apiKey ? { apiKey } : {}), model: getOpenRouterModel() || undefined, messages: recentMessages }
  let body = JSON.stringify(requestBody)
  const encoder = new TextEncoder()
  while (encoder.encode(body).byteLength > 128 * 1024 && recentMessages.length > 1) {
    recentMessages.shift()
    body = JSON.stringify(requestBody)
  }
  if (encoder.encode(body).byteLength > 128 * 1024) {
    throw new Error('The AI Coach request is too large. Check your API key and message.')
  }

  try {
    response = await fetch(chatApiUrl, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body,
    })
  } catch (error) {
    if (isAbortError(error)) throw error
    throw aiConnectionError(chatApiUrl)
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as ErrorPayload

    if (
      response.status === 404 &&
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
      payload?.error?.includes('Local endpoint not found')
    ) {
      throw new Error(
        `The frontend is running locally, but the AI backend returned 404 at ${chatApiUrl}. Start it with \`npm run dev:api\` or \`npm run dev:all\`.`,
      )
    }
    throw apiError(payload, 'AI Coach returned an invalid response.')
  }

  const context = parseAiContextHeader(response.headers)
  onContext(context)
  const usage = parseQuotaHeader(response.headers.get(AI_QUOTA_HEADER))
  if (usage) onQuota?.(usage)

  if (!response.body) {
    throw new Error('The AI stream returned no data.')
  }

  const mediaType = response.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (mediaType !== 'application/x-ndjson') {
    throw new Error('The AI stream returned an invalid response format.')
  }

  return readChatStream(response.body, { signal, onChunk })
}

export async function generateTrainingPlan({
  apiKey,
  request,
  signal,
}: {
  apiKey: string
  request: TrainingPlanRequest
  signal?: AbortSignal
}): Promise<{ plan: GeneratedTrainingPlan; context: AiContextMetadata; quota: CoachQuotaUsage | null }> {
  const idToken = await getAuthenticatedUserToken()
  const chatApiUrl = getChatApiUrl()

  let response: Response

  try {
    response = await fetch(chatApiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...(apiKey ? { apiKey } : {}),
        model: getOpenRouterModel() || undefined,
        mode: 'plan',
        planRequest: request,
      }),
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw aiConnectionError(chatApiUrl)
  }

  const payload = await response.json().catch(() => null) as
    | { error?: string; code?: string; resetAt?: string; plan?: GeneratedTrainingPlan }
    | null

  if (!response.ok) {
    throw apiError(payload, 'Could not generate a plan.')
  }

  if (!payload?.plan) {
    throw new Error('The plan generator returned invalid data.')
  }

  return {
    plan: payload.plan,
    context: parseAiContextHeader(response.headers),
    quota: parseQuotaHeader(response.headers.get(AI_QUOTA_HEADER)),
  }
}

function getModelsApiUrl(): string {
  const host = typeof window !== 'undefined' ? window.location.hostname || 'localhost' : 'localhost'
  return !import.meta.env.DEV || typeof window === 'undefined'
    ? '/api/ai-models'
    : `http://${host}:3000/api/ai-models`
}

// Today's shared-key allowance, and whether the server has a key at all.
export async function fetchCoachQuota(): Promise<CoachQuota> {
  const idToken = await getAuthenticatedUserToken()
  const response = await fetch(getModelsApiUrl(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ quota: true }),
  })
  const payload = await response.json().catch(() => null) as (CoachQuota & { error?: string; code?: string }) | null
  if (!response.ok || !payload || typeof payload.used !== 'number') throw apiError(payload, 'Could not read the Coach allowance.')
  return { used: payload.used, limit: payload.limit, resetAt: payload.resetAt, shared: payload.shared === true }
}

export async function fetchAvailableOpenRouterModels(apiKey: string): Promise<OpenRouterModelOption[]> {
  const idToken = await getAuthenticatedUserToken()
  const url = getModelsApiUrl()

  let response: Response

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ apiKey }),
    })
  } catch {
    throw new Error('Could not load the OpenRouter model list.')
  }

  const payload = await response.json().catch(() => null) as
    | { error?: string; code?: string; models?: OpenRouterModelOption[] }
    | null

  if (!response.ok) {
    throw new AiApiError(payload?.error ?? 'Could not load the OpenRouter model list.', payload?.code)
  }

  return Array.isArray(payload?.models) ? payload.models : []
}
