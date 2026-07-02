import { adminDb } from './lib/firebaseAdmin.js'
import { requireUserId } from './lib/auth.js'
import { type ApiRequest, type ApiResponse, readJsonBody, sendApiError, sendJson } from './lib/http.js'
import { RateLimitError, assertRateLimit } from './lib/rateLimit.js'
import {
  buildAiUserContext,
  buildChatContextSections,
  createEmptyAiUserContext,
  type AiUserContext,
} from '../server/aiContext.js'

export const config = {
  maxDuration: 30,
}

interface IncomingChatMessage {
  role?: string
  content?: string
}

interface AiChatBody {
  apiKey?: string
  messages?: IncomingChatMessage[]
  model?: string
  mode?: 'chat' | 'plan'
  planRequest?: {
    goal?: string
    daysPerWeek?: number
    experience?: string
    equipment?: string[]
    focus?: string
    notes?: string
  }
}

interface NormalizedMessage {
  role: 'user' | 'assistant'
  content: string
}

interface PlanExercise {
  exerciseId: string
  exerciseSource: 'global' | 'user'
  name: string
  sets: number
  targetReps: number
  targetWeight: number
}

interface GeneratedPlan {
  name: string
  summary: string
  days: Array<{
    name: string
    exercises: PlanExercise[]
  }>
}

interface AvailableExercise {
  id: string
  name: string
  source: 'global' | 'user'
  equipment: string
  category: string
  muscles: string[]
}

async function loadGlobalExercises() {
  const module = await import('../data/exercises.js')
  return module.exercises
}

function getClientIp(req: ApiRequest): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() ?? 'unknown'
  }

  const realIp = req.headers['x-real-ip']
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim()

  return 'unknown'
}

function sanitizeMessages(raw: IncomingChatMessage[] | undefined): NormalizedMessage[] {
  if (!Array.isArray(raw)) return []

  return raw
    .flatMap((message) => {
      const role: NormalizedMessage['role'] | null =
        message.role === 'assistant' ? 'assistant' : message.role === 'user' ? 'user' : null
      const content = typeof message.content === 'string' ? message.content.trim() : ''

      if (!role || !content) return []

      return [{
        role,
        content: content.slice(0, 4000),
      }]
    })
    .slice(-12)
}

function normalizePlanRequest(raw: AiChatBody['planRequest']) {
  const goal = typeof raw?.goal === 'string' ? raw.goal.trim() : ''
  const daysPerWeek = clampInteger(raw?.daysPerWeek, 3, 2, 6)
  const experience = typeof raw?.experience === 'string' && raw.experience.trim()
    ? raw.experience.trim().slice(0, 40)
    : 'intermediate'
  const focus = typeof raw?.focus === 'string' ? raw.focus.trim().slice(0, 160) : ''
  const notes = typeof raw?.notes === 'string' ? raw.notes.trim().slice(0, 400) : ''
  const equipment = Array.isArray(raw?.equipment)
    ? raw.equipment
        .flatMap((value) => typeof value === 'string' ? [value.trim().toLowerCase()] : [])
        .filter(Boolean)
        .slice(0, 8)
    : []

  if (goal.length < 2) {
    throw new Error('Podaj cel planu, żeby wygenerować szablon.')
  }

  return { goal, daysPerWeek, experience, focus, notes, equipment }
}

async function fetchUserContext(uid: string): Promise<AiUserContext> {
  const readinessRefs = recentReadinessDateKeys(Date.now(), 32)
    .map((dateKey) => adminDb.collection('readiness').doc(`${uid}_${dateKey}`))
  const [profileSnap, readinessSnap, workoutsSnap, recordsSnap] = await Promise.all([
    adminDb.collection('users').doc(uid).get(),
    Promise.all(readinessRefs.map((ref) => ref.get())),
    adminDb.collection('workouts').where('userId', '==', uid).orderBy('startedAt', 'desc').limit(60).get(),
    adminDb.collection('records').where('userId', '==', uid).limit(100).get(),
  ])

  const profile = profileSnap.exists ? profileSnap.data() : null

  return buildAiUserContext({
    profile: {
      displayName: typeof profile?.displayName === 'string' ? profile.displayName : null,
      primaryGoal: typeof profile?.primaryGoal === 'string' ? profile.primaryGoal : null,
      weeklyGoal: typeof profile?.weeklyGoal === 'number' ? profile.weeklyGoal : null,
      units: typeof profile?.units === 'string' ? profile.units : null,
    },
    readinessEntries: readinessSnap.flatMap((docSnap) => {
      if (!docSnap.exists) return []
      const data = docSnap.data() ?? {}
      return [{
        date: typeof data.date === 'string' ? data.date : '',
        createdAt: Number(data.createdAt ?? 0),
        sleep: Number(data.sleep ?? 3),
        mood: Number(data.mood ?? 3),
        soreness: Number(data.soreness ?? 3),
      }]
    }),
    workouts: workoutsSnap.docs.map((docSnap) => {
      const data = docSnap.data()
      return {
        label: typeof data.label === 'string' ? data.label : null,
        startedAt: Number(data.startedAt ?? 0),
        exercises: Array.isArray(data.exercises) ? data.exercises : [],
      }
    }),
    records: recordsSnap.docs.map((docSnap) => {
      const data = docSnap.data()
      return {
        exerciseName: typeof data.exerciseName === 'string' ? data.exerciseName : 'Ćwiczenie',
        maxWeight: Number(data.maxWeight ?? 0),
        maxReps: Number(data.maxReps ?? 0),
        bestVolume: Number(data.bestVolume ?? 0),
        lastPerformedAt: Number(data.lastPerformedAt ?? 0),
      }
    }),
  })
}

function recentReadinessDateKeys(now: number, days: number): string[] {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(now - index * 24 * 60 * 60 * 1000)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  })
}

async function fetchAvailableExercises(uid: string): Promise<AvailableExercise[]> {
  const userExercisesSnap = await adminDb.collection('userExercises').where('userId', '==', uid).get()
  const globalExercises = await loadGlobalExercises()

  const fromGlobal = globalExercises.map((exercise) => ({
    id: exercise.id,
    name: exercise.name,
    source: 'global' as const,
    equipment: exercise.equipment,
    category: exercise.category,
    muscles: exercise.muscles,
  }))

  const fromUser = userExercisesSnap.docs.flatMap((docSnap) => {
    const data = docSnap.data()
    const name = typeof data.name === 'string' ? data.name.trim() : ''
    if (!name) return []

    return [{
      id: docSnap.id,
      name,
      source: 'user' as const,
      equipment: typeof data.equipment === 'string' ? data.equipment : 'bodyweight',
      category: typeof data.category === 'string' ? data.category : 'core',
      muscles: Array.isArray(data.muscles) ? data.muscles.flatMap((muscle) => typeof muscle === 'string' ? [muscle] : []) : [],
    }]
  })

  return [...fromGlobal, ...fromUser]
}

async function fetchUserContextSafe(uid: string): Promise<AiUserContext> {
  try {
    return await fetchUserContext(uid)
  } catch (error) {
    console.error('[ai-chat context error]', error)
    return createEmptyAiUserContext()
  }
}

async function fetchAvailableExercisesSafe(uid: string): Promise<AvailableExercise[]> {
  try {
    return await fetchAvailableExercises(uid)
  } catch (error) {
    console.error('[ai-chat exercise catalog error]', error)
    const globalExercises = await loadGlobalExercises().catch(() => [])
    return globalExercises.map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      source: 'global' as const,
      equipment: exercise.equipment,
      category: exercise.category,
      muscles: exercise.muscles,
    }))
  }
}

function buildSystemPrompt(context: AiUserContext): string {
  const sections = buildChatContextSections(context)

  return [
    'Jesteś AI Coachem aplikacji IronLog.',
    'Odpowiadasz po polsku, konkretnie, wspierająco i bez lania wody.',
    'Bazuj wyłącznie na danych z kontekstu, a jeśli czegoś brakuje, powiedz to wprost.',
    'Nie diagnozuj medycznie i nie udawaj lekarza. Przy bólu, kontuzji lub niepokojących objawach kieruj do specjalisty.',
    'Jeśli użytkownik pyta o plan lub progres, odnoś się do jego celu, readiness i ostatnich sesji.',
    'Jeśli w sekcji OSTATNIE 4 TRENINGI widzisz ćwiczenia i sety, traktuj to jako dostęp do szczegółów sesji i nie proś ponownie o listę ćwiczeń.',
    'Jeśli użytkownik pyta o miesiąc, spadki formy lub gorsze momenty, korzystaj z sekcji SYGNAŁY Z OSTATNICH 30 DNI.',
    'Nie streszczaj samych danych. Każda odpowiedź ma prowadzić do wniosku, decyzji albo poprawki na kolejny trening.',
    'Używaj krótkiego markdownu: krótkie nagłówki, zwięzłe bullet pointy, bez ściany tekstu.',
    'Gdy użytkownik pyta, czy ostatni trening był dobry, odpowiedz w strukturze:',
    '## Werdykt',
    '1-2 zdania oceny ogólnej.',
    '## Co było dobre',
    '2-4 konkretne punkty z nazwami ćwiczeń lub objętością.',
    '## Co poprawić',
    '2-4 konkretne punkty dotyczące doboru ćwiczeń, balansu, objętości albo intensywności.',
    '## Kolejny krok',
    '2-3 konkretne rekomendacje na następną sesję.',
    'Jeśli pytanie dotyczy jednej sesji, odnoś się do ćwiczeń z nazwy, nie tylko do całego wolumenu.',
    'Jeśli readiness jest umiarkowane lub niskie, oceń czy intensywność i objętość były adekwatne do tego stanu.',
    '',
    'KONTEKST UŻYTKOWNIKA',
    sections.profileLine,
    sections.readinessLine,
    '',
    sections.workoutsHeading,
    sections.workoutsLine,
    '',
    sections.monthlyHeading,
    sections.monthlyLine,
    '',
    sections.recordsHeading,
    sections.recordsLine,
  ].join('\n')
}

function buildPlanSystemPrompt(
  context: AiUserContext,
  request: ReturnType<typeof normalizePlanRequest>,
  catalog: AvailableExercise[],
): string {
  const sections = buildChatContextSections(context)

  const recentContext = context.recentWorkouts.length > 0
    ? context.recentWorkouts
        .map((workout) => `${workout.label}: ${workout.exerciseCount} ćwiczeń, ${workout.totalVolume} kg`)
        .join('\n')
    : 'Brak historii treningów.'

  const catalogLines = catalog
    .map((exercise) => [
      `exerciseId=${exercise.id}`,
      `exerciseSource=${exercise.source}`,
      `name=${exercise.name}`,
      `category=${exercise.category}`,
      `equipment=${exercise.equipment}`,
      `muscles=${exercise.muscles.join(',') || 'none'}`,
    ].join(' | '))
    .join('\n')

  return [
    'Jesteś generatorem planów treningowych dla aplikacji IronLog.',
    'Tworzysz praktyczne szablony treningowe zapisane w JSON.',
    'Odpowiadasz WYŁĄCZNIE poprawnym JSON-em bez markdownu, bez komentarzy i bez dodatkowego tekstu.',
    'Używaj tylko ćwiczeń z podanego katalogu i zawsze zwracaj poprawne exerciseId oraz exerciseSource.',
    'Jeśli nie znasz sensownego ciężaru startowego, ustaw targetWeight na 0.',
    `Zwróć dokładnie ${request.daysPerWeek} dni treningowe.`,
    'Każdy dzień powinien mieć zwykle 4-6 ćwiczeń, chyba że kontekst sugeruje mniej.',
    'Dobieraj plan do celu użytkownika, readiness i ostatnich sesji, ale nie wymyślaj nieistniejących danych.',
    'JSON ma mieć shape:',
    '{"name":"string","summary":"string","days":[{"name":"string","exercises":[{"exerciseId":"string","exerciseSource":"global|user","sets":4,"targetReps":8,"targetWeight":0}]}]}',
    '',
    'KONTEKST UŻYTKOWNIKA',
    sections.profileLine,
    context.readiness
      ? `Readiness: ${context.readiness.score}/100 (${context.readiness.label})`
      : 'Readiness: brak danych.',
    'OSTATNIE 4 TRENINGI',
    recentContext,
    'SYGNAŁY Z OSTATNICH 30 DNI',
    sections.monthlyLine,
    '',
    'DOSTĘPNE ĆWICZENIA',
    catalogLines,
  ].join('\n')
}

function buildPlanUserPrompt(
  request: ReturnType<typeof normalizePlanRequest>,
  context: AiUserContext,
): string {
  const equipmentLine = request.equipment.length > 0
    ? request.equipment.join(', ')
    : 'brak ograniczeń sprzętowych'

  return [
    `Cel planu: ${request.goal}`,
    `Liczba dni w tygodniu: ${request.daysPerWeek}`,
    `Poziom: ${request.experience}`,
    `Dostępny sprzęt: ${equipmentLine}`,
    `Fokus: ${request.focus || 'brak dodatkowego fokusu'}`,
    `Uwagi: ${request.notes || 'brak dodatkowych uwag'}`,
    `Priorytet wynikający z profilu: ${context.primaryGoal || 'brak danych'}`,
  ].join('\n')
}

async function readAnthropicError(response: Response): Promise<{ status: number; message: string }> {
  const fallback = response.status === 401
    ? 'Nie udało się uwierzytelnić z Claude API. Sprawdź swój klucz.'
    : response.status === 429
      ? 'Claude API odrzuciło żądanie przez limit lub brak środków na kluczu.'
      : response.status === 404
        ? 'Wybrany model Claude nie istnieje albo nie jest dostępny dla tego klucza.'
      : 'Claude API zwróciło błąd i nie udało się wygenerować odpowiedzi.'

  const payload = await response.json().catch(() => null) as
    | { error?: { message?: string } }
    | null

  return {
    status: response.status,
    message: payload?.error?.message?.trim() || fallback,
  }
}

function readAnthropicTextPayload(payload: unknown): string {
  const record = asRecord(payload)
  const content = Array.isArray(record.content) ? record.content : []

  return content
    .flatMap((block) => {
      const blockRecord = asRecord(block)
      return blockRecord.type === 'text' && typeof blockRecord.text === 'string'
        ? [blockRecord.text]
        : []
    })
    .join('\n')
    .trim()
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim()

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed

  const withoutFence = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  const firstBrace = withoutFence.indexOf('{')
  const lastBrace = withoutFence.lastIndexOf('}')

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return withoutFence.slice(firstBrace, lastBrace + 1)
  }

  throw new Error('Generator planu nie zwrócił poprawnego JSON-a.')
}

function normalizeExerciseName(value: string) {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .trim()
}

function normalizeGeneratedPlan(raw: unknown, catalog: AvailableExercise[], goal: string): GeneratedPlan {
  const record = asRecord(raw)
  const catalogByKey = new Map(catalog.map((exercise) => [`${exercise.source}:${exercise.id}`, exercise]))
  const catalogByName = new Map(catalog.map((exercise) => [normalizeExerciseName(exercise.name), exercise]))

  const daysRaw = Array.isArray(record.days) ? record.days : []
  const days = daysRaw.flatMap((day, dayIndex) => {
    const dayRecord = asNullableRecord(day)
    if (!dayRecord) return []

    const exercisesRaw = Array.isArray(dayRecord.exercises) ? dayRecord.exercises : []
    const exercises = exercisesRaw.flatMap((exercise) => {
      const exerciseRecord = asNullableRecord(exercise)
      if (!exerciseRecord) return []

      const requestedSource = exerciseRecord.exerciseSource === 'user' ? 'user' : 'global'
      const requestedId = typeof exerciseRecord.exerciseId === 'string' ? exerciseRecord.exerciseId.trim() : ''
      const requestedName = typeof exerciseRecord.name === 'string' ? exerciseRecord.name.trim() : ''

      const matchedExercise = catalogByKey.get(`${requestedSource}:${requestedId}`)
        ?? (requestedName ? catalogByName.get(normalizeExerciseName(requestedName)) : undefined)

      if (!matchedExercise) return []

      return [{
        exerciseId: matchedExercise.id,
        exerciseSource: matchedExercise.source,
        name: matchedExercise.name,
        sets: clampInteger(exerciseRecord.sets, 4, 2, 6),
        targetReps: clampInteger(exerciseRecord.targetReps, 8, 3, 20),
        targetWeight: clampNumber(exerciseRecord.targetWeight, 0, 0, 999),
      }]
    })

    if (exercises.length === 0) return []

    return [{
      name: typeof dayRecord.name === 'string' && dayRecord.name.trim()
        ? dayRecord.name.trim().slice(0, 80)
        : `Dzień ${dayIndex + 1}`,
      exercises,
    }]
  })

  if (days.length === 0) {
    throw new Error('Generator nie zwrócił żadnego poprawnego dnia treningowego.')
  }

  const fallbackName = goal.trim().length > 1 ? `Plan: ${goal.trim()}` : 'Nowy plan'
  const name = typeof record.name === 'string' && record.name.trim()
    ? record.name.trim().slice(0, 80)
    : fallbackName
  const summary = typeof record.summary === 'string' && record.summary.trim()
    ? record.summary.trim().slice(0, 280)
    : 'Plan wygenerowany na podstawie celu, dostępnego sprzętu i historii treningowej.'

  return { name, summary, days }
}

async function generatePlan(
  apiKey: string,
  model: string,
  context: AiUserContext,
  request: ReturnType<typeof normalizePlanRequest>,
  catalog: AvailableExercise[],
): Promise<GeneratedPlan> {
  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1600,
      stream: false,
      system: buildPlanSystemPrompt(context, request, catalog),
      messages: [{
        role: 'user',
        content: buildPlanUserPrompt(request, context),
      }],
    }),
  })

  if (!upstream.ok) {
    const error = await readAnthropicError(upstream)
    console.error('[plan-generator upstream error]', {
      status: error.status,
      model,
      message: error.message,
    })
    throw Object.assign(new Error(error.message), { status: error.status })
  }

  const payload = await upstream.json().catch(() => null)
  const text = readAnthropicTextPayload(payload)
  const parsed = JSON.parse(extractJsonObject(text)) as unknown
  return normalizeGeneratedPlan(parsed, catalog, request.goal)
}

async function streamChatReply(
  apiKey: string,
  model: string,
  context: AiUserContext,
  messages: NormalizedMessage[],
  res: ApiResponse,
): Promise<void> {
  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      stream: true,
      system: buildSystemPrompt(context),
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    }),
  })

  if (!upstream.ok) {
    const error = await readAnthropicError(upstream)
    console.error('[ai-chat upstream error]', {
      status: error.status,
      model,
      message: error.message,
    })
    throw Object.assign(new Error(error.message), { status: error.status })
  }

  const body = upstream.body
  if (!body) {
    throw new Error('Claude API nie zwróciło treści odpowiedzi.')
  }

  res.statusCode = 200
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')

  const reader = (body as ReadableStream<Uint8Array>).getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let hasContent = false

  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      for (;;) {
        const eventEnd = buffer.indexOf('\n\n')
        if (eventEnd === -1) break

        const eventBlock = buffer.slice(0, eventEnd)
        buffer = buffer.slice(eventEnd + 2)

        for (const line of eventBlock.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (!data || data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data) as Record<string, unknown>
            const delta = parsed.delta as Record<string, unknown> | undefined
            if (
              parsed.type === 'content_block_delta' &&
              delta?.type === 'text_delta' &&
              typeof delta.text === 'string'
            ) {
              res.write(delta.text)
              hasContent = true
            }
          } catch {
            // skip malformed SSE event
          }
        }
      }
    }
  } catch (streamError) {
    console.error('[ai-chat stream error]', streamError)
  }

  if (!hasContent) {
    res.write('Claude API nie zwróciło treści odpowiedzi.')
  }

  res.end()
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function asNullableRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value))
  if (!Number.isFinite(parsed)) return fallback
  const normalized = Math.round(parsed * 10) / 10
  return Math.min(max, Math.max(min, normalized))
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' })
    return
  }

  try {
    const userId = await requireUserId(req)
    const ip = getClientIp(req)
    await assertRateLimit({ key: `${userId}:${ip}` })

    const body = await readJsonBody<AiChatBody>(req, { maxBytes: 128 * 1024 })
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
    const mode = body.mode === 'plan' ? 'plan' : 'chat'
    const messages = sanitizeMessages(body.messages)

    if (apiKey.length < 20) {
      sendJson(res, 400, { error: 'Brak poprawnego Claude API key.' })
      return
    }

    if (mode === 'chat' && messages.length === 0) {
      sendJson(res, 400, { error: 'Brak wiadomości do wysłania.' })
      return
    }

    const context = await fetchUserContextSafe(userId)
    const requestedModel = typeof body.model === 'string' ? body.model.trim() : ''
    const model = requestedModel || process.env.CLAUDE_CHAT_MODEL || 'claude-sonnet-4-20250514'

    if (mode === 'plan') {
      const request = normalizePlanRequest(body.planRequest)
      const catalog = await fetchAvailableExercisesSafe(userId)
      const plan = await generatePlan(apiKey, model, context, request, catalog)
      sendJson(res, 200, { plan })
      return
    }

    await streamChatReply(apiKey, model, context, messages, res)
    return
  } catch (error) {
    if (error instanceof RateLimitError) {
      res.setHeader('Retry-After', String(error.retryAfterSeconds))
      sendJson(res, 429, { error: error.message })
      return
    }

    sendApiError(res, error, { fallbackMessage: 'Nie udało się połączyć z AI Coachem.' })
  }
}
