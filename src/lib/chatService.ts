import { auth } from './firebase'
import { getClaudeModel } from './aiKeyStorage'
import { isAbortError, readChatStream } from './chatStreamProtocol'

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
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

export interface ClaudeModelOption {
  id: string
  label: string
}

export interface StreamChatReplyOptions {
  apiKey: string
  messages: Array<Pick<ChatMessage, 'role' | 'content'>>
  signal: AbortSignal
  onChunk: (chunk: string) => void
}

function getChatApiUrl(): string {
  if (!import.meta.env.DEV || typeof window === 'undefined') return '/api/ai-chat'

  const host = window.location.hostname || 'localhost'
  return `http://${host}:3000/api/ai-chat`
}

async function getAuthenticatedUserToken() {
  const user = auth.currentUser
  if (!user) throw new Error('Brak aktywnej sesji użytkownika.')
  return user.getIdToken()
}

export async function streamChatReply({
  apiKey,
  messages,
  signal,
  onChunk,
}: StreamChatReplyOptions): Promise<string> {
  const idToken = await getAuthenticatedUserToken()
  let response: Response

  const chatApiUrl = getChatApiUrl()

  try {
    response = await fetch(chatApiUrl, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiKey,
        model: getClaudeModel() || undefined,
        messages,
      }),
    })
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new Error(
      `Lokalnie endpoint AI nie jest dostępny pod ${chatApiUrl}. Uruchom \`npm run dev:api\` obok \`npm run dev:web\`, albo po prostu \`npm run dev:all\`.`,
    )
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null

    if (
      response.status === 404 &&
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
      payload?.error?.includes('Nie znaleziono lokalnego endpointu')
    ) {
      throw new Error(
        `Frontend działa lokalnie, ale backend AI zwrócił 404 pod ${chatApiUrl}. Uruchom \`npm run dev:api\` albo \`npm run dev:all\`.`,
      )
    }
    throw new Error(payload?.error ?? 'AI Coach nie odpowiedział poprawnie.')
  }

  if (!response.body) {
    throw new Error('Stream AI nie zwrócił danych.')
  }

  const contentType = response.headers.get('Content-Type')?.toLowerCase() ?? ''
  if (!contentType.includes('application/x-ndjson')) {
    throw new Error('Stream AI zwrócił niepoprawny format odpowiedzi.')
  }

  return readChatStream(response.body, { signal, onChunk })
}

export async function generateTrainingPlan({
  apiKey,
  request,
}: {
  apiKey: string
  request: TrainingPlanRequest
}): Promise<GeneratedTrainingPlan> {
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
        apiKey,
        model: getClaudeModel() || undefined,
        mode: 'plan',
        planRequest: request,
      }),
    })
  } catch {
    throw new Error(
      `Lokalnie endpoint AI nie jest dostępny pod ${chatApiUrl}. Uruchom \`npm run dev:api\` obok \`npm run dev:web\`, albo po prostu \`npm run dev:all\`.`,
    )
  }

  const payload = await response.json().catch(() => null) as
    | { error?: string; plan?: GeneratedTrainingPlan }
    | null

  if (!response.ok) {
    throw new Error(payload?.error ?? 'Nie udało się wygenerować planu.')
  }

  if (!payload?.plan) {
    throw new Error('Generator planu nie zwrócił poprawnych danych.')
  }

  return payload.plan
}

export async function fetchAvailableClaudeModels(apiKey: string): Promise<ClaudeModelOption[]> {
  const idToken = await getAuthenticatedUserToken()
  const host = typeof window !== 'undefined' ? window.location.hostname || 'localhost' : 'localhost'
  const url = !import.meta.env.DEV || typeof window === 'undefined'
    ? '/api/ai-models'
    : `http://${host}:3000/api/ai-models`

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
    throw new Error('Nie udało się pobrać listy modeli Claude.')
  }

  const payload = await response.json().catch(() => null) as
    | { error?: string; models?: ClaudeModelOption[] }
    | null

  if (!response.ok) {
    throw new Error(payload?.error ?? 'Nie udało się pobrać listy modeli Claude.')
  }

  return Array.isArray(payload?.models) ? payload.models : []
}
