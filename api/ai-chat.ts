import { adminDb } from './lib/firebaseAdmin.js'
import { requireUserId } from './lib/auth.js'
import { type ApiRequest, type ApiResponse, readJsonBody, sendJson } from './lib/http.js'
import { RateLimitError, assertRateLimit } from './lib/rateLimit.js'

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

interface UserContext {
  displayName: string | null
  primaryGoal: string | null
  weeklyGoal: number | null
  units: string | null
  readiness: {
    score: number
    label: string
    date: string
  } | null
  recentWorkouts: Array<{
    label: string
    startedAt: number
    exerciseCount: number
    totalVolume: number
    exercises: Array<{
      name: string
      setCount: number
      totalVolume: number
      setsSummary: string
    }>
  }>
  topRecords: Array<{
    exerciseName: string
    maxWeight: number
    maxReps: number
    bestVolume: number
  }>
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

function createEmptyUserContext(): UserContext {
  return {
    displayName: null,
    primaryGoal: null,
    weeklyGoal: null,
    units: null,
    readiness: null,
    recentWorkouts: [],
    topRecords: [],
  }
}

async function loadGlobalExercises() {
  const module = await import('../data/exercises.ts')
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

function computeReadinessScore(entry: { sleep: number; mood: number; soreness: number }) {
  const raw = entry.sleep * 0.4 + entry.mood * 0.3 + (6 - entry.soreness) * 0.3
  const score = Math.round(((raw - 1) / 4) * 100)

  if (score >= 70) return { score, label: 'Gotowy' }
  if (score >= 40) return { score, label: 'Umiarkowany' }
  return { score, label: 'Odpoczynek' }
}

function calcWorkoutVolume(exercises: unknown): number {
  if (!Array.isArray(exercises)) return 0

  return exercises.reduce((total, exercise) => {
    if (typeof exercise !== 'object' || exercise === null) return total

    const record = exercise as Record<string, unknown>
    const sets = Array.isArray(record.sets) ? record.sets : []

    return total + sets.reduce((sum, set) => {
      if (typeof set !== 'object' || set === null) return sum
      const setRecord = set as Record<string, unknown>
      const weight = typeof setRecord.weight === 'number' ? setRecord.weight : Number(setRecord.weight ?? 0)
      const reps = typeof setRecord.reps === 'number' ? setRecord.reps : Number(setRecord.reps ?? 0)
      return sum + (Number.isFinite(weight) ? weight : 0) * (Number.isFinite(reps) ? reps : 0)
    }, 0)
  }, 0)
}

function summarizeWorkoutExercises(exercises: unknown) {
  if (!Array.isArray(exercises)) return []

  return exercises.flatMap((exercise) => {
    if (typeof exercise !== 'object' || exercise === null) return []

    const record = exercise as Record<string, unknown>
    const name = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : ''
    const sets = Array.isArray(record.sets) ? record.sets : []

    if (!name || sets.length === 0) return []

    const normalizedSets = sets.flatMap((set) => {
      if (typeof set !== 'object' || set === null) return []
      const setRecord = set as Record<string, unknown>
      const weight = typeof setRecord.weight === 'number' ? setRecord.weight : Number(setRecord.weight ?? 0)
      const reps = typeof setRecord.reps === 'number' ? setRecord.reps : Number(setRecord.reps ?? 0)
      const safeWeight = Number.isFinite(weight) ? Math.max(0, weight) : 0
      const safeReps = Number.isFinite(reps) ? Math.max(0, reps) : 0

      if (safeReps <= 0) return []

      return [{ weight: safeWeight, reps: safeReps }]
    })

    if (normalizedSets.length === 0) return []

    const totalVolume = normalizedSets.reduce((sum, set) => sum + set.weight * set.reps, 0)

    return [{
      name,
      setCount: normalizedSets.length,
      totalVolume,
      setsSummary: normalizedSets
        .map((set) => `${set.weight} x ${set.reps}`)
        .join(', '),
    }]
  })
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

async function fetchUserContext(uid: string): Promise<UserContext> {
  const [profileSnap, readinessSnap, workoutsSnap, recordsSnap] = await Promise.all([
    adminDb.collection('users').doc(uid).get(),
    adminDb.collection('readiness').where('userId', '==', uid).get(),
    adminDb.collection('workouts').where('userId', '==', uid).get(),
    adminDb.collection('records').where('userId', '==', uid).get(),
  ])

  const profile = profileSnap.exists ? profileSnap.data() : null

  const latestReadiness = readinessSnap.docs
    .map((docSnap) => docSnap.data())
    .sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0))[0]

  const readiness = latestReadiness
    ? {
        ...computeReadinessScore({
          sleep: Number(latestReadiness.sleep ?? 3),
          mood: Number(latestReadiness.mood ?? 3),
          soreness: Number(latestReadiness.soreness ?? 3),
        }),
        date: String(latestReadiness.date ?? ''),
      }
    : null

  const recentWorkouts = workoutsSnap.docs
    .map((docSnap) => {
      const data = docSnap.data()
      const label = typeof data.label === 'string' && data.label.trim() ? data.label.trim() : 'Sesja'
      const startedAt = Number(data.startedAt ?? 0)
      const exercises = Array.isArray(data.exercises) ? data.exercises : []

      return {
        label,
        startedAt,
        exerciseCount: exercises.length,
        totalVolume: calcWorkoutVolume(exercises),
        exercises: summarizeWorkoutExercises(exercises),
      }
    })
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 3)

  const topRecords = recordsSnap.docs
    .map((docSnap) => {
      const data = docSnap.data()
      return {
        exerciseName: typeof data.exerciseName === 'string' ? data.exerciseName : 'Ćwiczenie',
        maxWeight: Number(data.maxWeight ?? 0),
        maxReps: Number(data.maxReps ?? 0),
        bestVolume: Number(data.bestVolume ?? 0),
      }
    })
    .sort((a, b) => b.maxWeight - a.maxWeight)
    .slice(0, 4)

  return {
    displayName: typeof profile?.displayName === 'string' ? profile.displayName : null,
    primaryGoal: typeof profile?.primaryGoal === 'string' ? profile.primaryGoal : null,
    weeklyGoal: typeof profile?.weeklyGoal === 'number' ? profile.weeklyGoal : null,
    units: typeof profile?.units === 'string' ? profile.units : null,
    readiness,
    recentWorkouts,
    topRecords,
  }
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

async function fetchUserContextSafe(uid: string): Promise<UserContext> {
  try {
    return await fetchUserContext(uid)
  } catch (error) {
    console.error('[ai-chat context error]', error)
    return createEmptyUserContext()
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

function buildSystemPrompt(context: UserContext): string {
  const profileLine = [
    context.displayName ? `Użytkownik: ${context.displayName}` : null,
    context.primaryGoal ? `Cel główny: ${context.primaryGoal}` : null,
    context.weeklyGoal ? `Cel tygodniowy: ${context.weeklyGoal} sesje` : null,
    context.units ? `Jednostki: ${context.units}` : null,
  ].filter(Boolean).join(' | ')

  const readinessLine = context.readiness
    ? `Readiness: ${context.readiness.score}/100 (${context.readiness.label}), dzień ${context.readiness.date}`
    : 'Readiness: brak dzisiejszego lub ostatniego wpisu.'

  const workoutsLine = context.recentWorkouts.length > 0
    ? context.recentWorkouts
        .map((workout) => {
          const date = new Date(workout.startedAt).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })
          const exerciseLines = workout.exercises.length > 0
            ? workout.exercises
                .map((exercise) => `  - ${exercise.name}: ${exercise.setCount} serie, ${exercise.totalVolume} kg volume, sety [${exercise.setsSummary}]`)
                .join('\n')
            : '  - brak szczegółów ćwiczeń'

          return [
            `${date} — ${workout.label} — ${workout.exerciseCount} ćwiczeń — ${workout.totalVolume} kg`,
            exerciseLines,
          ].join('\n')
        })
        .join('\n')
    : 'Brak ostatnich treningów.'

  const recordsLine = context.topRecords.length > 0
    ? context.topRecords
        .map((record) => `${record.exerciseName}: max ${record.maxWeight} kg, reps ${record.maxReps}, volume ${record.bestVolume}`)
        .join('\n')
    : 'Brak rekordów.'

  return [
    'Jesteś AI Coachem aplikacji IronLog.',
    'Odpowiadasz po polsku, konkretnie, wspierająco i bez lania wody.',
    'Bazuj wyłącznie na danych z kontekstu, a jeśli czegoś brakuje, powiedz to wprost.',
    'Nie diagnozuj medycznie i nie udawaj lekarza. Przy bólu, kontuzji lub niepokojących objawach kieruj do specjalisty.',
    'Jeśli użytkownik pyta o plan lub progres, odnoś się do jego celu, readiness i ostatnich sesji.',
    'Jeśli w sekcji OSTATNIE TRENINGI widzisz ćwiczenia i sety, traktuj to jako dostęp do szczegółów sesji i nie proś ponownie o listę ćwiczeń.',
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
    profileLine || 'Profil: brak danych.',
    readinessLine,
    '',
    'OSTATNIE TRENINGI',
    workoutsLine,
    '',
    'TOP REKORDY',
    recordsLine,
  ].join('\n')
}

function buildPlanSystemPrompt(
  context: UserContext,
  request: ReturnType<typeof normalizePlanRequest>,
  catalog: AvailableExercise[],
): string {
  const profileLine = [
    context.displayName ? `Użytkownik: ${context.displayName}` : null,
    context.primaryGoal ? `Cel główny: ${context.primaryGoal}` : null,
    context.weeklyGoal ? `Cel tygodniowy: ${context.weeklyGoal} sesje` : null,
    context.units ? `Jednostki: ${context.units}` : null,
  ].filter(Boolean).join(' | ')

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
    profileLine || 'Profil: brak danych.',
    context.readiness
      ? `Readiness: ${context.readiness.score}/100 (${context.readiness.label})`
      : 'Readiness: brak danych.',
    'OSTATNIE TRENINGI',
    recentContext,
    '',
    'DOSTĘPNE ĆWICZENIA',
    catalogLines,
  ].join('\n')
}

function buildPlanUserPrompt(
  request: ReturnType<typeof normalizePlanRequest>,
  context: UserContext,
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
  context: UserContext,
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
  context: UserContext,
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
    assertRateLimit({ key: `${userId}:${ip}` })

    const body = await readJsonBody<AiChatBody>(req)
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

    const message = error instanceof Error ? error.message : 'Nie udało się połączyć z AI Coachem.'
    const status = typeof (error as { status?: unknown })?.status === 'number'
      ? (error as { status: number }).status
      : message === 'Brak tokenu autoryzacji.'
        ? 401
        : 400
    sendJson(res, status, { error: message })
  }
}
