import { EventEmitter } from 'node:events'
import type { ServerResponse } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadAiUserContext: vi.fn(),
  requireUserId: vi.fn().mockResolvedValue('user-1'),
  assertRateLimit: vi.fn().mockResolvedValue(undefined),
  getUserExercises: vi.fn(),
  limitUserExercises: vi.fn(),
}))

vi.mock('../_lib/aiContextLoader.js', () => ({
  loadAiUserContext: mocks.loadAiUserContext,
}))
vi.mock('../_lib/auth.js', () => ({ requireUserId: mocks.requireUserId }))
vi.mock('../_lib/rateLimit.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../_lib/rateLimit.js')>()
  return { ...actual, assertRateLimit: mocks.assertRateLimit }
})
vi.mock('../_lib/firebaseAdmin.js', () => ({
  adminDb: {
    collection: () => ({
      where: () => ({
        limit: mocks.limitUserExercises,
      }),
    }),
  },
}))

import { AVAILABLE_AI_CONTEXT_SOURCES, buildAiUserContext } from '../../server/aiContext.js'
import handler, { AI_USER_EXERCISE_LIMIT, normalizeGeneratedPlan, serializeAiContextHeader } from '../ai-chat.js'
import { ApiError } from '../_lib/errors.js'
import type { ApiRequest, ApiResponse } from '../_lib/http.js'

function createHandlerDoubles(body: unknown) {
  const events = new EventEmitter()
  const headers = new Map<string, string>()
  let output = ''
  const req = Object.assign(new EventEmitter(), {
    aborted: false,
    body,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  }) as ApiRequest
  const res = Object.assign(events, {
    statusCode: 0,
    writableEnded: false,
    destroyed: false,
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value)
    },
    write(chunk: string) {
      output += chunk
      return true
    },
    end(chunk?: string) {
      if (chunk) output += chunk
      this.writableEnded = true
      events.emit('close')
    },
  }) as unknown as ServerResponse

  return {
    req,
    res: res as ApiResponse,
    header: (name: string) => headers.get(name.toLowerCase()),
    status: () => res.statusCode,
    text: () => output,
    json: () => JSON.parse(output) as unknown,
  }
}

const validBody = {
  apiKey: 'sk-ant-test-key-longer-than-twenty-characters',
  model: 'claude-test',
  messages: [{ role: 'user', content: 'Pomóż' }],
}

const validPlanBody = {
  ...validBody,
  mode: 'plan' as const,
  planRequest: {
    goal: 'strength',
    daysPerWeek: 2,
  },
}

const generatedPlanResponse = {
  ok: true,
  status: 200,
  json: async () => ({
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
        name: 'Plan siłowy',
        summary: 'Dwa days bazowe.',
        days: [
          {
            name: 'Day A',
            exercises: [{ exerciseId: 'bench-press', exerciseSource: 'global', sets: 4, targetReps: 5, targetWeight: 80 }],
          },
          {
            name: 'Day B',
            exercises: [{ exerciseId: 'squat', exerciseSource: 'global', sets: 4, targetReps: 5, targetWeight: 100 }],
          },
        ],
      }),
    } }],
  }),
} as Response

interface CapturedOpenRouterBody {
  model: string
  reasoning: { effort: string }
  messages: Array<{ role: string; content: string }>
}

async function captureChatRequest(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<CapturedOpenRouterBody> {
  mocks.loadAiUserContext.mockResolvedValueOnce(buildAiUserContext({
    profile: { displayName: 'Patryk' },
    readinessEntries: [],
    workouts: [],
    records: [],
  }))
  const encoder = new TextEncoder()
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode([
          'data: {"choices":[{"index":0,"delta":{"content":"Gotowe"}}]}',
          'data: {"choices":[{"index":0,"finish_reason":"stop"}]}\n\ndata: [DONE]',
          '',
        ].join('\n\n')))
        controller.close()
      },
    }),
  } as Response)
  vi.stubGlobal('fetch', fetchMock)

  const captured = createHandlerDoubles({ ...validBody, messages })
  await handler(captured.req, captured.res)

  const [, request] = fetchMock.mock.calls[0] as [string, RequestInit]
  return JSON.parse(String(request.body)) as CapturedOpenRouterBody
}

async function capturePlanRequest(notes = ''): Promise<CapturedOpenRouterBody> {
  mocks.loadAiUserContext.mockResolvedValueOnce(buildAiUserContext({
    profile: null,
    readinessEntries: [],
    workouts: [],
    records: [],
  }))
  const fetchMock = vi.fn().mockResolvedValue(generatedPlanResponse)
  vi.stubGlobal('fetch', fetchMock)

  const captured = createHandlerDoubles({
    ...validPlanBody,
    planRequest: { ...validPlanBody.planRequest, notes },
  })
  await handler(captured.req, captured.res)

  const [, request] = fetchMock.mock.calls[0] as [string, RequestInit]
  return JSON.parse(String(request.body)) as CapturedOpenRouterBody
}

beforeEach(() => {
  mocks.loadAiUserContext.mockReset()
  mocks.requireUserId.mockReset()
  mocks.assertRateLimit.mockReset()
  mocks.getUserExercises.mockReset()
  mocks.limitUserExercises.mockReset().mockReturnValue({ get: mocks.getUserExercises })
  mocks.requireUserId.mockResolvedValue('user-1')
  mocks.assertRateLimit.mockResolvedValue(undefined)
  mocks.getUserExercises.mockResolvedValue({ docs: [] })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AI context response metadata', () => {
  it('serializes full and canonical limited metadata', () => {
    expect(serializeAiContextHeader(AVAILABLE_AI_CONTEXT_SOURCES)).toBe('full')
    expect(serializeAiContextHeader({
      profile: 'available',
      readiness: 'unavailable',
      workouts: 'available',
      records: 'unavailable',
    })).toBe('limited;unavailable=readiness,records')
    expect(serializeAiContextHeader({
      ...AVAILABLE_AI_CONTEXT_SOURCES, workouts: 'limited',
    })).toBe('limited;unavailable=workouts')
  })

  it('does not fetch OpenRouter when context loading rejects with ai_context_unavailable', async () => {
    mocks.loadAiUserContext.mockRejectedValueOnce(new ApiError(
      503,
      'Could not load context. Try again.',
      { code: 'ai_context_unavailable' },
    ))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const captured = createHandlerDoubles(validBody)
    await handler(captured.req, captured.res)

    expect(captured.status()).toBe(503)
    expect(captured.json()).toEqual({
      error: 'Could not load context. Try again.',
      code: 'ai_context_unavailable',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sets limited metadata without changing successful NDJSON frames', async () => {
    mocks.loadAiUserContext.mockResolvedValueOnce(buildAiUserContext({
      sources: { ...AVAILABLE_AI_CONTEXT_SOURCES, readiness: 'unavailable' },
      profile: { displayName: 'Łukasz' },
      readinessEntries: [],
      workouts: [],
      records: [],
    }))
    const encoder = new TextEncoder()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode([
            'data: {"choices":[{"index":0,"delta":{"content":"Gotowe"}}]}',
            'data: {"choices":[{"index":0,"finish_reason":"stop"}]}\n\ndata: [DONE]',
            '',
          ].join('\n\n')))
          controller.close()
        },
      }),
    } as Response))

    const captured = createHandlerDoubles(validBody)
    await handler(captured.req, captured.res)

    const [, request] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    const sent = JSON.parse(String(request.body)) as { model: string; reasoning: { effort: string }; messages: Array<{content:string}> }
    expect(sent.messages[0].content).toContain('If no language can be inferred from the user messages, respond in English.')
    expect(sent.messages[0].content).toContain('User: Łukasz')
    expect(sent.messages.slice(1)).toEqual(validBody.messages)
    expect(sent.model).toBe('openai/gpt-5.6-luna')
    expect(sent.reasoning.effort).toBe('max')
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(request.headers).toMatchObject({ Authorization: `Bearer ${validBody.apiKey}` })
    expect(captured.header('X-IronLog-AI-Context')).toBe('limited;unavailable=readiness')
    expect(captured.text()).toBe('{"type":"chunk","text":"Gotowe"}\n{"type":"done"}\n')
  })

  it('returns a retryable catalog error without calling OpenRouter', async () => {
    mocks.loadAiUserContext.mockResolvedValueOnce(buildAiUserContext({
      sources: AVAILABLE_AI_CONTEXT_SOURCES,
      profile: null,
      readinessEntries: [],
      workouts: [],
      records: [],
    }))
    mocks.getUserExercises.mockRejectedValueOnce(new Error('firestore unavailable'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const captured = createHandlerDoubles(validPlanBody)
    await handler(captured.req, captured.res)

    expect(captured.status()).toBe(503)
    expect(captured.json()).toEqual({
      error: 'Could not load the exercise library. Try again.',
      code: 'ai_catalog_unavailable',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('bounds oversized custom catalogs and rejects truncation before calling OpenRouter', async () => {
    mocks.loadAiUserContext.mockResolvedValueOnce(buildAiUserContext({
      profile: null, readinessEntries: [], workouts: [], records: [],
    }))
    mocks.getUserExercises.mockResolvedValueOnce({
      docs: Array.from({ length: AI_USER_EXERCISE_LIMIT + 1 }, (_, index) => ({
        id: `custom-${index}`, data: () => ({ name: `Custom ${index}` }),
      })),
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const captured = createHandlerDoubles(validPlanBody)

    await handler(captured.req, captured.res)

    expect(mocks.limitUserExercises).toHaveBeenCalledExactlyOnceWith(101)
    expect(captured.status()).toBe(422)
    expect(captured.json()).toMatchObject({ code: 'ai_catalog_too_large', error: expect.stringContaining('100') })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepts a catalog at the cap and validates returned exercises against that catalog', async () => {
    mocks.loadAiUserContext.mockResolvedValueOnce(buildAiUserContext({
      profile: null, readinessEntries: [], workouts: [], records: [],
    }))
    mocks.getUserExercises.mockResolvedValueOnce({
      docs: Array.from({ length: AI_USER_EXERCISE_LIMIT }, (_, index) => ({
        id: `custom-${index}`, data: () => ({ name: `Custom ${index}` }),
      })),
    })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
        name: 'Bounded catalog plan',
        days: [0, 1].map((index) => ({
          name: `Day ${index}`,
          exercises: [
            { exerciseId: 'custom-99', exerciseSource: 'user', name: 'Custom 99' },
            { exerciseId: 'custom-100', exerciseSource: 'user', name: 'Missing custom 100' },
          ],
        })),
      }) } }] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const captured = createHandlerDoubles(validPlanBody)

    await handler(captured.req, captured.res)

    expect(mocks.limitUserExercises).toHaveBeenCalledExactlyOnceWith(101)
    expect(captured.status()).toBe(200)
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { messages: Array<{content:string}> }
    expect(body.messages[0].content).toContain('exerciseId=custom-99')
    expect(body.messages[0].content).not.toContain('exerciseId=custom-100')
    const result = captured.json() as { plan: { days: Array<{ exercises: Array<{ exerciseId: string }> }> } }
    expect(result.plan.days.map((day) => day.exercises.map((exercise) => exercise.exerciseId)))
      .toEqual([['custom-99'], ['custom-99']])
  })

  it.each([
    {
      name: 'available record content',
      sources: AVAILABLE_AI_CONTEXT_SOURCES,
      records: [{ exerciseName: 'Deadlift', maxWeight: 180, maxReps: 3, bestVolume: 3000 }],
      expected: 'Deadlift: max 180 kg, reps 3, volume 3000',
    },
    {
      name: 'unavailable record wording',
      sources: { ...AVAILABLE_AI_CONTEXT_SOURCES, records: 'unavailable' as const },
      records: [],
      expected: 'Records: data temporarily unavailable.',
    },
  ])('includes $name in the plan OpenRouter prompt', async ({ sources, records, expected }) => {
    mocks.loadAiUserContext.mockResolvedValueOnce(buildAiUserContext({
      sources,
      profile: null,
      readinessEntries: [],
      workouts: [],
      records,
    }))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const fetchMock = vi.fn().mockResolvedValue(generatedPlanResponse)
    vi.stubGlobal('fetch', fetchMock)

    const captured = createHandlerDoubles(validPlanBody)
    await handler(captured.req, captured.res)

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const openrouterBody = JSON.parse(String(init.body)) as { model: string; reasoning: { effort: string }; messages: Array<{content:string}> }
    expect(openrouterBody.model).toBe('openai/gpt-5.6-luna')
    expect(openrouterBody.reasoning.effort).toBe('max')
    expect(openrouterBody.messages[0].content).toContain('TOP RECORDS')
    expect(openrouterBody.messages[0].content).toContain("Use the user's free-text Notes as the language cue")
    expect(openrouterBody.messages[0].content).toContain('Preserve exercise names from the supplied catalog.')
    expect(openrouterBody.messages[0].content).toContain(expected)
    expect(captured.status()).toBe(200)
    expect(captured.json()).toEqual({
      plan: {
        name: 'Plan siłowy',
        summary: 'Dwa days bazowe.',
        days: expect.any(Array),
      },
    })
  })

  it('rejects generated plans with the wrong day count', () => {
    expect(() => normalizeGeneratedPlan({
      name: 'Plan',
      days: [
        { name: 'Day A', exercises: [{ exerciseId: 'bench-press', exerciseSource: 'global', sets: 4, targetReps: 5, targetWeight: 80 }] },
      ],
    }, [
      { id: 'bench-press', name: 'Bench Press', source: 'global', equipment: 'barbell', category: 'chest', muscles: ['chest'] },
    ], {
      goal: 'strength',
      daysPerWeek: 2,
      experience: 'intermediate',
      equipment: ['barbell'],
      focus: '',
      notes: '',
    })).toThrow('The generator returned 1 days instead of 2.')
  })

  it('filters exercises outside the requested equipment before accepting a plan', () => {
    expect(() => normalizeGeneratedPlan({
      name: 'Plan',
      days: [
        { name: 'Day A', exercises: [{ exerciseId: 'leg-press', exerciseSource: 'global', sets: 4, targetReps: 8, targetWeight: 120 }] },
      ],
    }, [
      { id: 'leg-press', name: 'Leg Press', source: 'global', equipment: 'machine', category: 'legs', muscles: ['quads'] },
    ], {
      goal: 'strength',
      daysPerWeek: 1,
      experience: 'intermediate',
      equipment: ['barbell'],
      focus: '',
      notes: '',
    })).toThrow('The generator did not return any valid workout days.')
  })

  it('rejects ambiguous name fallbacks regardless of catalog order', () => {
    const collidingCatalog = [
      {
        id: 'bench-press',
        name: 'Bench Press',
        source: 'global' as const,
        equipment: 'barbell',
        category: 'chest',
        muscles: ['chest'],
      },
      {
        id: 'custom-bench',
        name: 'Bench Press',
        source: 'user' as const,
        equipment: 'barbell',
        category: 'chest',
        muscles: ['chest'],
      },
    ]
    const planWithMissingId = {
      name: 'Plan',
      days: [{
        name: 'Day A',
        exercises: [{
          exerciseId: 'missing-bench',
          exerciseSource: 'global',
          name: 'Bench Press',
          sets: 4,
          targetReps: 5,
          targetWeight: 80,
        }],
      }],
    }
    const request = {
      goal: 'strength',
      daysPerWeek: 1,
      experience: 'intermediate',
      equipment: [],
      focus: '',
      notes: '',
    }

    for (const catalog of [collidingCatalog, [...collidingCatalog].reverse()]) {
      expect(() => normalizeGeneratedPlan(planWithMissingId, catalog, request))
        .toThrow('The generator did not return any valid workout days.')
    }
  })

  it('uses the only matching name when a generated exercise ID is missing', () => {
    const plan = normalizeGeneratedPlan({
      name: 'Plan',
      days: [{
        exercises: [{
          exerciseId: 'missing-bench',
          exerciseSource: 'global',
          name: 'Bench Press',
        }],
      }],
    }, [
      { id: 'custom-bench', name: 'Bench Press', source: 'user', equipment: 'barbell', category: 'chest', muscles: ['chest'] },
    ], {
      goal: 'strength',
      daysPerWeek: 1,
      experience: 'intermediate',
      equipment: [],
      focus: '',
      notes: '',
    })

    expect(plan.days[0]?.exercises[0]).toMatchObject({
      exerciseId: 'custom-bench',
      exerciseSource: 'user',
    })
  })

  it('prefers an exact source and ID key over a matching name from another source', () => {
    const plan = normalizeGeneratedPlan({
      name: 'Plan',
      days: [{
        exercises: [{
          exerciseId: 'bench-press',
          exerciseSource: 'global',
          name: 'Bench Press',
        }],
      }],
    }, [
      { id: 'custom-bench', name: 'Bench Press', source: 'user', equipment: 'barbell', category: 'chest', muscles: ['chest'] },
      { id: 'bench-press', name: 'Bench Press', source: 'global', equipment: 'barbell', category: 'chest', muscles: ['chest'] },
    ], {
      goal: 'strength',
      daysPerWeek: 1,
      experience: 'intermediate',
      equipment: [],
      focus: '',
      notes: '',
    })

    expect(plan.days[0]?.exercises[0]).toMatchObject({
      exerciseId: 'bench-press',
      exerciseSource: 'global',
    })
  })
})

describe('AI response language prompt contract', () => {
  it('uses the latest substantive user message after a language switch', async () => {
    const sent = await captureChatRequest([
      { role: 'user', content: 'How should I train this week?' },
      { role: 'assistant', content: 'Start with your main lifts.' },
      { role: 'user', content: 'Jak mam trenować w tym tygodniu?' },
    ])

    expect(sent.messages.slice(1)).toEqual([
      { role: 'user', content: 'How should I train this week?' },
      { role: 'assistant', content: 'Start with your main lifts.' },
      { role: 'user', content: 'Jak mam trenować w tym tygodniu?' },
    ])
    expect(sent.messages[0]?.content).toContain('use the language of the latest substantive user message')
    expect(sent.messages[0]?.content).toContain('If the user explicitly requests a response language, follow that request.')
  })

  it('uses preceding user messages when the latest follow-up is language-neutral', async () => {
    const sent = await captureChatRequest([
      { role: 'user', content: 'Jak ocenić mój ostatni trening?' },
      { role: 'assistant', content: 'Skup się na jakości serii.' },
      { role: 'user', content: 'Dzięki!' },
    ])

    expect(sent.messages[0]?.content).toContain('short, language-neutral follow-up')
    expect(sent.messages.at(-1)).toEqual({ role: 'user', content: 'Dzięki!' })
  })

  it('does not let English context headings or catalog content override user language', async () => {
    const sent = await captureChatRequest([
      { role: 'user', content: 'Czy mój ostatni trening był dobry?' },
    ])

    expect(sent.messages[0]?.content).toContain('English instructions, context headings, quoted text, catalog content, exercise names, identifiers and other user data must not override the chosen language.')
    expect(sent.messages[0]?.content).toContain('USER CONTEXT')
    expect(sent.messages[0]?.content).toContain('No recent workouts.')
    expect(sent.messages[0]?.content).not.toContain('Respond in English.')
  })
})

describe('AI plan language prompt contract', () => {
  it('uses free-text notes for the plan language while preserving the catalog contract', async () => {
    const sent = await capturePlanRequest('Odpowiadaj po polsku. Plan siłowy na trzy dni.')
    const systemPrompt = sent.messages[0]?.content ?? ''

    expect(systemPrompt).toContain("Use the user's free-text Notes as the language cue")
    expect(systemPrompt).toContain('Honor an explicit response-language request in Notes.')
    expect(systemPrompt).toContain('Preserve exercise names from the supplied catalog')
    expect(systemPrompt).toContain('Keep the JSON keys and schema unchanged')
    expect(sent.messages[1]?.content).toContain('Notes: Odpowiadaj po polsku. Plan siłowy na trzy dni.')
  })

  it('defaults plan language to English when notes are absent', async () => {
    const sent = await capturePlanRequest()
    const systemPrompt = sent.messages[0]?.content ?? ''

    expect(systemPrompt).toContain('if Notes are empty, only a placeholder, or no language can be inferred, write in English.')
    expect(systemPrompt).toContain('Do not use the goal, focus, equipment, structured context, English instructions or catalog text as a language cue.')
    expect(sent.messages[1]?.content).toContain('Notes: no additional notes')
  })
})
