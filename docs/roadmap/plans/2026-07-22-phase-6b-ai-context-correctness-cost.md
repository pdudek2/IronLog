# Phase 6B AI Context Correctness and Cost Implementation Plan

**Status:** COMPLETED — VERIFIED — AWAITING INTEGRATION

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zachować poprawnie załadowane części kontekstu AI przy częściowej awarii, pokazać ograniczenia przy konkretnym wyniku, ograniczyć podstawowy kontekst do 69 odczytów dokumentów i liczyć serie readiness wyłącznie po kolejnych datach kalendarzowych.

**Architecture:** Cztery niezależne readery Firestore składają `AiUserContext` przez `Promise.allSettled`, zapisując status każdego źródła w istniejącym modelu kontekstu. API przekazuje metadane jednym nagłówkiem HTTP bez zmiany NDJSON ani body planu; klient parsuje nagłówek przed streamem i przypisuje ostrzeżenie do właściwej odpowiedzi lub podglądu planu.

**Tech Stack:** TypeScript 5.9, Node.js Vercel Functions, Firebase Admin SDK 13, Firestore, React 19, Vitest 4, Testing Library, Playwright 1.59, natywne `Promise.allSettled`, `fetch`, `Headers` i `Intl.ListFormat`.

**Approved design:** `docs/roadmap/specs/2026-07-22-phase-6b-ai-context-correctness-cost-design.md`

**Route:** Planned — settled Medium/coordinated

**Risk:** Elevated — poprawność danych, koszt Firestore i odzyskiwanie po częściowej lub całkowitej awarii

**Simplicity posture:** Lean / Ponytail lite

**Scope lineage:** `docs/roadmap/ROADMAP.md` → Faza 6B (`AI-01`, `AI-09`, `AI-10`, `AI-11`) → implementacja, weryfikacja, review i lokalna integracja. Fazy 2B, 6C, S oraz `RELEASE-08` pozostają osobnymi obowiązkami.

## Global Constraints

- Nie zmieniać zatwierdzonego kontraktu częściowej awarii: rozmowa i plan działają, jeżeli co najmniej jedno z czterech źródeł jest dostępne.
- Poprawnie pusty odczyt ma status `available`; wyłącznie odrzucony odczyt ma status `unavailable`.
- Cztery niedostępne źródła kończą request przed wywołaniem Anthropic komunikatem `Nie udało się załadować kontekstu. Spróbuj ponownie.`.
- Budżet podstawowego kontekstu wynosi najwyżej 69 odczytów: profil 1, readiness 31, workouty 31, rekordy 6.
- Budżet nie obejmuje istniejącego katalogu `userExercises` generatora planu; nie zwiększać jego liczby odczytów.
- Zachować protokół NDJSON Fazy 6A z dokładnie trzema typami `chunk | done | error` i body planu `{ plan }`.
- Używać jednego nagłówka `X-IronLog-AI-Context`: `full` albo na przykład `limited;unavailable=readiness,records`.
- Brak lub niepoprawny nagłówek sukcesu jest błędem kontraktu klienta, nigdy domyślnym `full`.
- Pełny kontekst nie dodaje komunikatu UI; ograniczony używa `role="status"`; całkowita awaria używa istniejącego `role="alert"` i retry.
- Nie logować UID, e-maila, dokumentów, promptu, wiadomości, odpowiedzi ani klucza Claude API.
- Nie dodawać cache'a, agregatów, nowej kolekcji, feature flagi, compatibility layer ani zależności.
- Serwisy Firestore pozostają poza komponentami React; UI nie wykonuje bezpośrednich odczytów bazy.
- Nie ustawiać stanu synchronicznie na początku `useEffect`; projekt jest Vite SPA, więc nie dodawać `'use client'`.
- Nie stage'ować ani nie commitować należącego do użytkownika `docs/audits/2026-07-14-senior-design-review.md`.
- Nie wykonywać pushu, deployu, publikacji indeksów ani czynności `RELEASE-08` bez osobnej zgody.
- Implementację rozpocząć na osobnym branchu/worktree `phase-6b-ai-context-integrity` przez `superpowers:using-git-worktrees`; bez automatycznego prefiksu brancha.

---

## File Structure

### Nowy plik

| Plik | Odpowiedzialność |
|---|---|
| `api/lib/aiContextLoader.ts` | Query Firestore, limity odczytów, `Promise.allSettled`, bezpieczne logowanie i całkowita awaria kontekstu |
| `api/lib/__tests__/aiContextLoader.test.ts` | Niezależne awarie źródeł, empty-vs-unavailable, budżet 69 i brak wrażliwych logów |
| `api/__tests__/aiChatContextIntegration.test.ts` | Nagłówek HTTP, brak wywołania Anthropic przy całkowitej awarii i zachowanie NDJSON |

### Modyfikowane pliki

| Plik | Odpowiedzialność zmiany |
|---|---|
| `server/aiContext.ts` | Statusy źródeł, gating analiz pochodnych, jawne teksty niedostępności i kalendarzowa seria readiness |
| `server/__tests__/aiContext.test.ts` | Regresje promptu i kolejnych dat |
| `api/ai-chat.ts` | Użycie loadera, serializacja nagłówka i usunięcie all-or-nothing fallbacku |
| `api/__tests__/aiChatStreamIntegration.test.ts` | Zachowanie istniejącego streamu z nowym nagłówkiem |
| `scripts/dev-api.ts` | `Access-Control-Expose-Headers` dla lokalnego cross-origin API |
| `firestore.indexes.json` | Indeksy readiness i records wymagane przez ograniczone query |
| `src/lib/chatService.ts` | Typy metadanych, ścisły parser nagłówka, callback streamu i wynik generatora planu |
| `src/lib/__tests__/chatService.test.ts` | `full`, `limited`, błędne nagłówki i plan |
| `src/pages/ChatPage.tsx` | Ostrzeżenie aktywnego streamu, wiadomości asystenta i podglądu planu |
| `src/pages/__tests__/ChatPageStreamLifecycle.test.tsx` | Przypisanie statusu do generation ID, reset, abort, retry i sukces |
| `src/pages/__tests__/ChatPageAccessibility.test.tsx` | `role="status"`, pełny kontekst bez szumu i ostrzeżenie planu |
| `tests/e2e/support/mockAiStream.ts` | Deterministyczny nagłówek, plan JSON i HTTP error bez prawdziwego Claude API |
| `tests/e2e/chat.spec.ts` | Ograniczony czat, ograniczony plan i retry po całkowitej awarii |
| `docs/roadmap/ROADMAP.md` | Status dopiero po pełnej weryfikacji |
| `docs/roadmap/specs/2026-07-22-phase-6b-ai-context-correctness-cost-design.md` | Wynik wdrożenia i dowody |
| `docs/roadmap/plans/2026-07-22-phase-6b-ai-context-correctness-cost.md` | Checklisty, wyniki testów i status wykonania |

---

### Task 1: Source-aware context and calendar streak semantics

**Risk closed:** prompt nie może przedstawiać awarii źródła jako prawidłowego braku danych ani wyprowadzać „dni z rzędu” z niekolejnych wpisów.

**Files:**
- Modify: `server/aiContext.ts:1-390`
- Test: `server/__tests__/aiContext.test.ts:1-110`

**Interfaces:**
- Produces: `AiContextSource`, `AiContextSourceStatus`, `AiContextSourceStatuses`, `AVAILABLE_AI_CONTEXT_SOURCES`
- Produces: `AiUserContext.sources`
- Produces: `buildAiUserContext(input)` z opcjonalnym `sources`
- Produces: `buildChatContextSections(context)` rozróżniające empty i unavailable
- Consumes later: Task 2 składa statusy i przekazuje je do `buildAiUserContext`

- [x] **Step 1: Add failing tests for available-empty versus unavailable**

Dodaj importy nowych typów i test:

```ts
import {
  AVAILABLE_AI_CONTEXT_SOURCES,
  buildAiUserContext,
  buildChatContextSections,
  type AiContextSourceStatuses,
} from '../aiContext'

it('distinguishes available empty data from an unavailable source', () => {
  const sources: AiContextSourceStatuses = {
    ...AVAILABLE_AI_CONTEXT_SOURCES,
    records: 'unavailable',
  }
  const context = buildAiUserContext({
    now: NOW,
    sources,
    profile: null,
    readinessEntries: [],
    workouts: [],
    records: [],
  })

  const sections = buildChatContextSections(context)

  expect(sections.profileLine).toBe('Profil: brak danych.')
  expect(sections.workoutsLine).toBe('Brak ostatnich treningów.')
  expect(sections.recordsLine).toBe('Rekordy: dane chwilowo niedostępne.')
  expect(sections.monthlyLine).toContain('Brak treningów w ostatnich 30 dniach.')
})

it('does not derive workout insights when workouts are unavailable', () => {
  const context = buildAiUserContext({
    now: NOW,
    sources: { ...AVAILABLE_AI_CONTEXT_SOURCES, workouts: 'unavailable' },
    profile: { weeklyGoal: 3 },
    readinessEntries: [readiness(0, 2, 2, 5), readiness(1, 2, 2, 5)],
    workouts: [],
    records: [],
  })

  const sections = buildChatContextSections(context)
  expect(sections.workoutsLine).toBe('Historia treningów: dane chwilowo niedostępne.')
  expect(sections.monthlyLine).toBe('Analiza treningów: dane chwilowo niedostępne.')
  expect(sections.monthlyLine).not.toContain('Brak treningów')
})
```

- [x] **Step 2: Add failing calendar-streak tests**

```ts
it('does not call non-consecutive low readiness entries days in a row', () => {
  const context = buildAiUserContext({
    now: NOW,
    profile: { weeklyGoal: 3 },
    readinessEntries: [
      readiness(0, 2, 2, 5),
      readiness(2, 2, 2, 5),
    ],
    workouts: [workout(1, 'Upper', 1200)],
    records: [],
  })

  expect(context.monthlyInsights.signals.join('\n')).not.toContain('dni z rzędu')
})

it('detects consecutive low readiness across a calendar boundary', () => {
  const first = readiness(0, 2, 2, 5)
  const second = readiness(0, 2, 2, 5)
  first.date = '2025-12-31'
  first.createdAt = Date.UTC(2025, 11, 31, 12)
  second.date = '2026-01-01'
  second.createdAt = Date.UTC(2026, 0, 1, 12)

  const context = buildAiUserContext({
    now: Date.UTC(2026, 0, 2, 12),
    profile: { weeklyGoal: 3 },
    readinessEntries: [first, second],
    workouts: [workout(1, 'Upper', 1200)],
    records: [],
  })

  expect(context.monthlyInsights.signals.join('\n')).toContain('2 dni z rzędu')
})

it.each([
  {
    name: 'a high score',
    middle: readiness(1, 5, 5, 1),
  },
  {
    name: 'an invalid calendar date',
    middle: { ...readiness(1, 2, 2, 5), date: '2026-02-31' },
  },
])('treats $name as a streak break', ({ middle }) => {
  const context = buildAiUserContext({
    now: NOW,
    profile: { weeklyGoal: 3 },
    readinessEntries: [
      readiness(2, 2, 2, 5),
      middle,
      readiness(0, 2, 2, 5),
    ],
    workouts: [workout(1, 'Upper', 1200)],
    records: [],
  })

  expect(context.monthlyInsights.signals.join('\n')).not.toContain('dni z rzędu')
})
```

- [x] **Step 3: Run the focused test and verify RED**

Run:

```bash
npx vitest run server/__tests__/aiContext.test.ts
```

Expected: FAIL because source status exports do not exist and non-consecutive low entries still form a streak.

- [x] **Step 4: Add source status to the context model**

Dodaj przy stałych:

```ts
export const AI_CONTEXT_SOURCES = ['profile', 'readiness', 'workouts', 'records'] as const
export type AiContextSource = typeof AI_CONTEXT_SOURCES[number]
export type AiContextSourceStatus = 'available' | 'unavailable'
export type AiContextSourceStatuses = Record<AiContextSource, AiContextSourceStatus>

export const AVAILABLE_AI_CONTEXT_SOURCES: AiContextSourceStatuses = {
  profile: 'available',
  readiness: 'available',
  workouts: 'available',
  records: 'available',
}
```

Rozszerz kontrakty:

```ts
export interface AiUserContext {
  sources: AiContextSourceStatuses
  displayName: string | null
  primaryGoal: string | null
  weeklyGoal: number | null
  units: string | null
  readiness: {
    score: number
    label: string
    date: string
  } | null
  recentWorkouts: AiWorkoutSummary[]
  topRecords: Array<{
    exerciseName: string
    maxWeight: number
    maxReps: number
    bestVolume: number
  }>
  monthlyInsights: AiMonthlyInsights
}

export interface BuildAiUserContextInput {
  now?: number
  sources?: AiContextSourceStatuses
  profile: AiContextProfileInput | null
  readinessEntries: AiReadinessInput[]
  workouts: AiContextWorkoutInput[]
  records: AiContextRecordInput[]
}
```

W `createEmptyAiUserContext` ustaw kopię statusów:

```ts
sources: { ...AVAILABLE_AI_CONTEXT_SOURCES },
```

Na początku `buildAiUserContext` znormalizuj statusy:

```ts
const resolvedSources = sources
  ? { ...sources }
  : { ...AVAILABLE_AI_CONTEXT_SOURCES }
```

Zwróć `sources: resolvedSources` w wyniku i przekaż `resolvedSources` do `buildMonthlyInsights`.

- [x] **Step 5: Gate derived insights and prompt sections by source status**

Rozszerz argument `buildMonthlyInsights` o `sources: AiContextSourceStatuses`. Przed obliczeniami workoutów dodaj:

```ts
if (sources.workouts === 'unavailable') {
  return {
    windowDays: MONTH_WINDOW_DAYS,
    workoutCount: 0,
    totalVolume: 0,
    averageWorkoutVolume: 0,
    signals: [],
    recommendations: [],
  }
}
```

Słabsze tygodnie licz tylko przy dostępnym profilu, a readiness streak tylko przy dostępnym readiness:

```ts
const weakBuckets = sources.profile === 'available'
  ? weeklyBuckets.filter((bucket) => {
      if (bucket.workouts === 0) return false
      const belowGoal = bucket.workouts < goal
      const strongerNeighbor = weeklyBuckets.some((candidate) => (
        candidate.workouts >= goal || candidate.volume >= bucket.volume * 1.6
      ))
      return belowGoal && strongerNeighbor
    })
  : []

const lowReadinessStreak = sources.readiness === 'available'
  ? findLowReadinessStreak(readinessEntries, since, now)
  : []
```

W `buildChatContextSections` wybierz jawne teksty niedostępności przed logiką pustego wyniku:

```ts
const profileLine = context.sources.profile === 'unavailable'
  ? 'Profil: dane chwilowo niedostępne.'
  : [
      context.displayName ? `Użytkownik: ${context.displayName}` : null,
      context.primaryGoal ? `Cel główny: ${context.primaryGoal}` : null,
      context.weeklyGoal ? `Cel tygodniowy: ${context.weeklyGoal} sesje` : null,
      context.units ? `Jednostki: ${context.units}` : null,
    ].filter(Boolean).join(' | ') || 'Profil: brak danych.'

const readinessLine = context.sources.readiness === 'unavailable'
  ? 'Readiness: dane chwilowo niedostępne.'
  : context.readiness
    ? `Readiness: ${context.readiness.score}/100 (${context.readiness.label}), dzień ${context.readiness.date}`
    : 'Readiness: brak dzisiejszego lub ostatniego wpisu.'

const workoutsLine = context.sources.workouts === 'unavailable'
  ? 'Historia treningów: dane chwilowo niedostępne.'
  : formatRecentWorkouts(context.recentWorkouts)

const recordsLine = context.sources.records === 'unavailable'
  ? 'Rekordy: dane chwilowo niedostępne.'
  : formatRecords(context.topRecords)

const monthlyLine = context.sources.workouts === 'unavailable'
  ? 'Analiza treningów: dane chwilowo niedostępne.'
  : formatMonthlyInsights(context.monthlyInsights)
```

Użyj lokalnych funkcji zachowujących istniejący poprawny output:

```ts
function formatRecentWorkouts(workouts: AiWorkoutSummary[]): string {
  if (workouts.length === 0) return 'Brak ostatnich treningów.'
  return workouts.map((workout) => {
    const date = new Date(workout.startedAt).toLocaleDateString('pl-PL', {
      day: 'numeric',
      month: 'short',
    })
    const exerciseLines = workout.exercises.length > 0
      ? workout.exercises
          .map((exercise) => `  - ${exercise.name}: ${exercise.setCount} serie, ${exercise.totalVolume} kg volume, sety [${exercise.setsSummary}]`)
          .join('\n')
      : '  - brak szczegółów ćwiczeń'
    return `${date} — ${workout.label} — ${workout.exerciseCount} ćwiczeń — ${workout.totalVolume} kg\n${exerciseLines}`
  }).join('\n')
}

function formatRecords(records: AiUserContext['topRecords']): string {
  if (records.length === 0) return 'Brak rekordów.'
  return records
    .map((record) => `${record.exerciseName}: max ${record.maxWeight} kg, reps ${record.maxReps}, volume ${record.bestVolume}`)
    .join('\n')
}

function formatMonthlyInsights(insights: AiMonthlyInsights): string {
  return [
    `${insights.workoutCount} treningów / ${insights.totalVolume} kg w ostatnich ${insights.windowDays} dniach.`,
    `Średnio ${insights.averageWorkoutVolume} kg na trening.`,
    ...insights.signals.map((signal) => `- ${signal}`),
    ...insights.recommendations.map((recommendation) => `Rekomendacja: ${recommendation}`),
  ].join('\n')
}
```

- [x] **Step 6: Replace entry adjacency with calendar-day adjacency**

Dodaj helper:

```ts
function calendarDayNumber(value: string | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null

  const [year, month, day] = value.split('-').map(Number)
  const timestamp = Date.UTC(year, month - 1, day)
  const parsed = new Date(timestamp)
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) return null

  return Math.floor(timestamp / DAY_MS)
}
```

Zastąp `findLowReadinessStreak`:

```ts
function findLowReadinessStreak(entries: AiReadinessInput[], since: number, now: number): AiReadinessInput[] {
  const chronological = entries
    .filter((entry) => entry.createdAt >= since && entry.createdAt <= now)
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)

  let best: AiReadinessInput[] = []
  let current: Array<{ entry: AiReadinessInput; dayNumber: number }> = []

  for (const entry of chronological) {
    const dayNumber = calendarDayNumber(entry.date)
    if (dayNumber === null || computeReadinessScore(entry).score >= 55) {
      current = []
      continue
    }

    const previous = current.at(-1)
    const item = { entry, dayNumber }
    current = previous && dayNumber === previous.dayNumber + 1 ? [...current, item] : [item]

    if (current.length > best.length) best = current.map((candidate) => candidate.entry)
  }

  return best
}
```

- [x] **Step 7: Run focused tests and commit**

Run:

```bash
npx vitest run server/__tests__/aiContext.test.ts
```

Expected: PASS, including empty-vs-unavailable and calendar-boundary cases.

Commit:

```bash
git add server/aiContext.ts server/__tests__/aiContext.test.ts
git commit -m "fix: distinguish unavailable AI context"
```

---

### Task 2: Independent Firestore readers and the 69-read budget

**Risk closed:** pojedynczy błąd Firestore nie może zerować całego kontekstu, a query nie mogą wrócić do kosztu 193 dokumentów.

**Files:**
- Create: `api/lib/aiContextLoader.ts`
- Create: `api/lib/__tests__/aiContextLoader.test.ts`
- Modify: `firestore.indexes.json`

**Interfaces:**
- Consumes: `buildAiUserContext`, `AiContextSourceStatuses` z Task 1
- Produces: `AI_CONTEXT_READ_LIMITS`, `AI_CONTEXT_DOCUMENT_READ_BUDGET`
- Produces: `AiContextReaders`, `createFirestoreAiContextReaders(database)`, `loadAiUserContext(uid, readers?)`
- Consumes later: Task 3 zastępuje `fetchUserContextSafe` przez `loadAiUserContext`

- [x] **Step 1: Write failing tests for budget, partial failure and total failure**

Utwórz test z lokalnym reader double:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AI_CONTEXT_DOCUMENT_READ_BUDGET,
  AI_CONTEXT_READ_LIMITS,
  loadAiUserContext,
  type AiContextReaders,
} from '../aiContextLoader'

const emptyReaders = (): AiContextReaders => ({
  profile: vi.fn().mockResolvedValue(null),
  readiness: vi.fn().mockResolvedValue([]),
  workouts: vi.fn().mockResolvedValue([]),
  records: vi.fn().mockResolvedValue([]),
})

describe('loadAiUserContext', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('keeps the accepted document-read budget at or below 70', () => {
    expect(AI_CONTEXT_READ_LIMITS).toEqual({ profile: 1, readiness: 31, workouts: 31, records: 6 })
    expect(AI_CONTEXT_DOCUMENT_READ_BUDGET).toBe(69)
    expect(AI_CONTEXT_DOCUMENT_READ_BUDGET).toBeLessThanOrEqual(70)
  })

  it('keeps fulfilled empty sources available', async () => {
    const context = await loadAiUserContext('user-1', emptyReaders())

    expect(context.sources).toEqual({
      profile: 'available',
      readiness: 'available',
      workouts: 'available',
      records: 'available',
    })
  })

  it.each(['profile', 'readiness', 'workouts', 'records'] as const)(
    'keeps the other fulfilled sources when %s fails',
    async (source) => {
      const readers = emptyReaders()
      vi.mocked(readers[source]).mockRejectedValueOnce(new Error('private source error'))
      vi.spyOn(console, 'error').mockImplementation(() => undefined)

      const context = await loadAiUserContext('user-secret', readers)

      expect(context.sources[source]).toBe('unavailable')
      for (const otherSource of ['profile', 'readiness', 'workouts', 'records'] as const) {
        if (otherSource !== source) expect(context.sources[otherSource]).toBe('available')
      }
      expect(console.error).toHaveBeenCalledWith('[ai-chat context source unavailable]', {
        source,
        errorName: 'Error',
      })
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('user-secret')
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('private source error')
    },
  )

  it('preserves the remaining sources when several readers fail', async () => {
    const readers = emptyReaders()
    vi.mocked(readers.profile).mockRejectedValueOnce(new Error('private'))
    vi.mocked(readers.records).mockRejectedValueOnce(new Error('private'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const context = await loadAiUserContext('user-1', readers)

    expect(context.sources).toEqual({
      profile: 'unavailable',
      readiness: 'available',
      workouts: 'available',
      records: 'unavailable',
    })
  })

  it('throws a retryable 503 before model work when every source fails', async () => {
    const failure = () => Promise.reject(new Error('private'))
    const readers: AiContextReaders = {
      profile: failure,
      readiness: failure,
      workouts: failure,
      records: failure,
    }
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(loadAiUserContext('user-1', readers)).rejects.toMatchObject({
      name: 'ApiError',
      status: 503,
      code: 'ai_context_unavailable',
      message: 'Nie udało się załadować kontekstu. Spróbuj ponownie.',
    })
  })
})
```

- [x] **Step 2: Run the loader test and verify RED**

Run:

```bash
npx vitest run api/lib/__tests__/aiContextLoader.test.ts
```

Expected: FAIL because `aiContextLoader.ts` does not exist.

- [x] **Step 3: Define limits and the reader boundary**

Utwórz `api/lib/aiContextLoader.ts` z kontraktem:

```ts
import type { Firestore } from 'firebase-admin/firestore'
import {
  buildAiUserContext,
  type AiContextProfileInput,
  type AiContextRecordInput,
  type AiContextSource,
  type AiContextSourceStatuses,
  type AiContextWorkoutInput,
  type AiReadinessInput,
  type AiUserContext,
} from '../../server/aiContext.js'
import { ApiError } from './errors.js'
import { adminDb } from './firebaseAdmin.js'

export const AI_CONTEXT_READ_LIMITS = {
  profile: 1,
  readiness: 31,
  workouts: 31,
  records: 6,
} as const

export const AI_CONTEXT_DOCUMENT_READ_BUDGET = Object.values(AI_CONTEXT_READ_LIMITS)
  .reduce((sum, limit) => sum + limit, 0)

export interface AiContextReaders {
  profile(uid: string): Promise<AiContextProfileInput | null>
  readiness(uid: string): Promise<AiReadinessInput[]>
  workouts(uid: string): Promise<AiContextWorkoutInput[]>
  records(uid: string): Promise<AiContextRecordInput[]>
}
```

Eksportuj `AiContextProfileInput` z `server/aiContext.ts`, ponieważ reader używa tego istniejącego wejścia zamiast tworzenia równoległego typu.

- [x] **Step 4: Implement the four bounded Firestore readers**

```ts
export function createFirestoreAiContextReaders(database: Firestore = adminDb): AiContextReaders {
  return {
    async profile(uid) {
      const snapshot = await database.collection('users').doc(uid).get()
      const data = snapshot.exists ? snapshot.data() : null
      return data ? {
        displayName: typeof data.displayName === 'string' ? data.displayName : null,
        primaryGoal: typeof data.primaryGoal === 'string' ? data.primaryGoal : null,
        weeklyGoal: typeof data.weeklyGoal === 'number' ? data.weeklyGoal : null,
        units: typeof data.units === 'string' ? data.units : null,
      } : null
    },
    async readiness(uid) {
      const snapshot = await database.collection('readiness')
        .where('userId', '==', uid)
        .orderBy('date', 'desc')
        .limit(AI_CONTEXT_READ_LIMITS.readiness)
        .get()
      return snapshot.docs.map((document) => {
        const data = document.data()
        return {
          date: typeof data.date === 'string' ? data.date : '',
          createdAt: Number(data.createdAt ?? 0),
          sleep: Number(data.sleep ?? 3),
          mood: Number(data.mood ?? 3),
          soreness: Number(data.soreness ?? 3),
        }
      })
    },
    async workouts(uid) {
      const snapshot = await database.collection('workouts')
        .where('userId', '==', uid)
        .orderBy('startedAt', 'desc')
        .limit(AI_CONTEXT_READ_LIMITS.workouts)
        .get()
      return snapshot.docs.map((document) => {
        const data = document.data()
        return {
          label: typeof data.label === 'string' ? data.label : null,
          startedAt: Number(data.startedAt ?? 0),
          exercises: Array.isArray(data.exercises) ? data.exercises : [],
        }
      })
    },
    async records(uid) {
      const snapshot = await database.collection('records')
        .where('userId', '==', uid)
        .orderBy('maxWeight', 'desc')
        .limit(AI_CONTEXT_READ_LIMITS.records)
        .get()
      return snapshot.docs.map((document) => {
        const data = document.data()
        return {
          exerciseName: typeof data.exerciseName === 'string' ? data.exerciseName : 'Ćwiczenie',
          maxWeight: Number(data.maxWeight ?? 0),
          maxReps: Number(data.maxReps ?? 0),
          bestVolume: Number(data.bestVolume ?? 0),
          lastPerformedAt: Number(data.lastPerformedAt ?? 0),
        }
      })
    },
  }
}
```

- [x] **Step 5: Implement independent settlement and safe logging**

```ts
const SOURCE_ORDER: AiContextSource[] = ['profile', 'readiness', 'workouts', 'records']

export async function loadAiUserContext(
  uid: string,
  readers: AiContextReaders = createFirestoreAiContextReaders(),
): Promise<AiUserContext> {
  const settled = await Promise.allSettled([
    readers.profile(uid),
    readers.readiness(uid),
    readers.workouts(uid),
    readers.records(uid),
  ] as const)

  const sources = Object.fromEntries(settled.map((result, index) => {
    const source = SOURCE_ORDER[index]
    if (result.status === 'rejected') {
      console.error('[ai-chat context source unavailable]', {
        source,
        errorName: result.reason instanceof Error ? result.reason.name : 'UnknownError',
      })
    }
    return [source, result.status === 'fulfilled' ? 'available' : 'unavailable']
  })) as AiContextSourceStatuses

  if (SOURCE_ORDER.every((source) => sources[source] === 'unavailable')) {
    throw new ApiError(503, 'Nie udało się załadować kontekstu. Spróbuj ponownie.', {
      code: 'ai_context_unavailable',
    })
  }

  const [profile, readiness, workouts, records] = settled
  return buildAiUserContext({
    sources,
    profile: profile.status === 'fulfilled' ? profile.value : null,
    readinessEntries: readiness.status === 'fulfilled' ? readiness.value : [],
    workouts: workouts.status === 'fulfilled' ? workouts.value : [],
    records: records.status === 'fulfilled' ? records.value : [],
  })
}
```

- [x] **Step 6: Add the two required indexes**

Dopisz do tablicy `indexes` w `firestore.indexes.json`:

```json
{
  "collectionGroup": "readiness",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "userId", "order": "ASCENDING" },
    { "fieldPath": "date", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "records",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "userId", "order": "ASCENDING" },
    { "fieldPath": "maxWeight", "order": "DESCENDING" }
  ]
}
```

- [x] **Step 7: Run focused tests and commit**

Run:

```bash
npx vitest run server/__tests__/aiContext.test.ts api/lib/__tests__/aiContextLoader.test.ts
```

Expected: PASS; budget equals 69, empty snapshots stay available, every single-source and multi-source failure preserves fulfilled sources, and all-source failure returns coded 503.

Commit:

```bash
git add server/aiContext.ts api/lib/aiContextLoader.ts api/lib/__tests__/aiContextLoader.test.ts firestore.indexes.json
git commit -m "feat: bound AI context reads"
```

---

### Task 3: HTTP context metadata and the API failure gate

**Risk closed:** klient musi otrzymać jednoznaczny status jakości kontekstu bez naruszenia protokołu streamu, a całkowita awaria nie może zużyć requestu Anthropic.

**Files:**
- Modify: `api/ai-chat.ts:1-680`
- Create: `api/__tests__/aiChatContextIntegration.test.ts`
- Modify: `api/__tests__/aiChatStreamIntegration.test.ts:1-205`
- Modify: `scripts/dev-api.ts:23-33`

**Interfaces:**
- Consumes: `loadAiUserContext(uid)` i `AiUserContext.sources`
- Produces: `AI_CONTEXT_HEADER`, `serializeAiContextHeader(sources)`
- Produces: success header `full | limited;unavailable=...`
- Consumes later: Task 4 implementuje ścisły parser tego kontraktu

- [x] **Step 1: Write failing serializer and API integration tests**

Utwórz plik z kompletnym setupem handlera:

```ts
import { EventEmitter } from 'node:events'
import type { ServerResponse } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadAiUserContext: vi.fn(),
  requireUserId: vi.fn().mockResolvedValue('user-1'),
  assertRateLimit: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/aiContextLoader.js', () => ({
  loadAiUserContext: mocks.loadAiUserContext,
}))
vi.mock('../lib/auth.js', () => ({ requireUserId: mocks.requireUserId }))
vi.mock('../lib/rateLimit.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/rateLimit.js')>()
  return { ...actual, assertRateLimit: mocks.assertRateLimit }
})
vi.mock('../lib/firebaseAdmin.js', () => ({ adminDb: {} }))

import { AVAILABLE_AI_CONTEXT_SOURCES, buildAiUserContext } from '../../server/aiContext.js'
import handler, { serializeAiContextHeader } from '../ai-chat.js'
import { ApiError } from '../lib/errors.js'
import type { ApiRequest, ApiResponse } from '../lib/http.js'

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

beforeEach(() => {
  mocks.loadAiUserContext.mockReset()
  mocks.requireUserId.mockReset()
  mocks.assertRateLimit.mockReset()
  mocks.requireUserId.mockResolvedValue('user-1')
  mocks.assertRateLimit.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
```

Dodaj testy:

```ts
describe('AI context response metadata', () => {
  it('serializes full and canonical limited metadata', () => {
    expect(serializeAiContextHeader(AVAILABLE_AI_CONTEXT_SOURCES)).toBe('full')
    expect(serializeAiContextHeader({
      profile: 'available',
      readiness: 'unavailable',
      workouts: 'available',
      records: 'unavailable',
    })).toBe('limited;unavailable=readiness,records')
  })

  it('does not fetch Anthropic when context loading rejects with ai_context_unavailable', async () => {
    mocks.loadAiUserContext.mockRejectedValueOnce(new ApiError(
      503,
      'Nie udało się załadować kontekstu. Spróbuj ponownie.',
      { code: 'ai_context_unavailable' },
    ))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const captured = createHandlerDoubles(validBody)
    await handler(captured.req, captured.res)

    expect(captured.status()).toBe(503)
    expect(captured.json()).toEqual({
      error: 'Nie udało się załadować kontekstu. Spróbuj ponownie.',
      code: 'ai_context_unavailable',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
```

Dodaj również test sukcesu, używając lokalnego Anthropic SSE body:

```ts
it('sets limited metadata without changing successful NDJSON frames', async () => {
  mocks.loadAiUserContext.mockResolvedValueOnce(buildAiUserContext({
    sources: { ...AVAILABLE_AI_CONTEXT_SOURCES, readiness: 'unavailable' },
    profile: null,
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
          'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Gotowe"}}',
          'data: {"type":"message_stop"}',
          '',
        ].join('\n\n')))
        controller.close()
      },
    }),
  } as Response))

  const captured = createHandlerDoubles(validBody)
  await handler(captured.req, captured.res)

  expect(captured.header('X-IronLog-AI-Context')).toBe('limited;unavailable=readiness')
  expect(captured.text()).toBe('{"type":"chunk","text":"Gotowe"}\n{"type":"done"}\n')
})
```

- [x] **Step 2: Run the integration test and verify RED**

Run:

```bash
npx vitest run api/__tests__/aiChatContextIntegration.test.ts
```

Expected: FAIL because serializer and loader integration do not exist.

- [x] **Step 3: Replace the all-or-nothing loader in `api/ai-chat.ts`**

Usuń `fetchUserContext`, `recentReadinessDateKeys` i `fetchUserContextSafe`. Dodaj import:

```ts
import { loadAiUserContext } from './lib/aiContextLoader.js'
import {
  AI_CONTEXT_SOURCES,
  type AiContextSourceStatuses,
} from '../server/aiContext.js'
```

Dodaj stałą i serializer:

```ts
export const AI_CONTEXT_HEADER = 'X-IronLog-AI-Context'

export function serializeAiContextHeader(sources: AiContextSourceStatuses): string {
  const unavailable = AI_CONTEXT_SOURCES.filter((source) => sources[source] === 'unavailable')
  return unavailable.length === 0
    ? 'full'
    : `limited;unavailable=${unavailable.join(',')}`
}
```

W handlerze zastąp fallback:

```ts
const context = await loadAiUserContext(userId)
res.setHeader(AI_CONTEXT_HEADER, serializeAiContextHeader(context.sources))
```

Linia musi pozostać przed rozgałęzieniem `mode === 'plan'`, aby identyczny nagłówek obowiązywał oba tryby.

- [x] **Step 4: Make prompts consume source-aware sections**

W `buildPlanSystemPrompt` usuń lokalne komunikaty, które ponownie interpretują puste tablice jako brak danych. Użyj sekcji:

```ts
const recentContext = context.sources.workouts === 'unavailable'
  ? sections.workoutsLine
  : context.recentWorkouts.length > 0
    ? context.recentWorkouts
        .map((workout) => `${workout.label}: ${workout.exerciseCount} ćwiczeń, ${workout.totalVolume} kg`)
        .join('\n')
    : 'Brak historii treningów.'
```

W tablicy promptu zastąp bezpośredni ternary readiness przez:

```ts
sections.readinessLine,
```

W `buildPlanUserPrompt` ustaw priorytet:

```ts
context.sources.profile === 'unavailable'
  ? 'Priorytet wynikający z profilu: dane chwilowo niedostępne'
  : `Priorytet wynikający z profilu: ${context.primaryGoal || 'brak danych'}`,
```

Dodaj do systemowych instrukcji obu trybów:

```text
Źródło oznaczone jako chwilowo niedostępne nie dowodzi braku aktywności ani braku danych użytkownika; nie wyciągaj z niego wniosków.
```

- [x] **Step 5: Expose the custom header in the local API server**

W `applyCors` dodaj:

```ts
res.setHeader('Access-Control-Expose-Headers', 'X-IronLog-AI-Context')
```

Nie zmieniaj production headers ani Vite proxy; produkcja jest same-origin, a proxy nie wymaga CORS.

- [x] **Step 6: Preserve the stream protocol in existing integration tests**

W teście sukcesu `streamChatReply integration` pozostaw dokładny output:

```ts
expect(written()).toBe([
  '{"type":"chunk","text":"Plan"}',
  '{"type":"done"}',
  '',
].join('\n'))
```

Dodaj asercję na serializer w nowym teście zamiast dodawania czwartej ramki NDJSON.

- [x] **Step 7: Run API tests and commit**

Run:

```bash
npx vitest run api/lib/__tests__/aiContextLoader.test.ts api/__tests__/aiChatContextIntegration.test.ts api/__tests__/aiChatStreamIntegration.test.ts api/lib/__tests__/aiChatStream.test.ts
```

Expected: PASS; brak fetch przy total failure, kanoniczny header, niezmienione ramki NDJSON.

Commit:

```bash
git add api/ai-chat.ts api/lib/aiContextLoader.ts api/__tests__/aiChatContextIntegration.test.ts api/__tests__/aiChatStreamIntegration.test.ts scripts/dev-api.ts
git commit -m "feat: expose AI context availability"
```

---

### Task 4: Strict client header parsing

**Risk closed:** brak lub uszkodzone metadane transportowe nie mogą zostać po cichu uznane za pełny kontekst.

**Files:**
- Modify: `src/lib/chatService.ts:1-175`
- Test: `src/lib/__tests__/chatService.test.ts:1-150`

**Interfaces:**
- Consumes: header `X-IronLog-AI-Context` z Task 3
- Produces: `AiContextSource`, `AiContextMetadata`, `parseAiContextHeader(headers)`
- Extends: `StreamChatReplyOptions.onContext(metadata)`
- Changes: `generateTrainingPlan()` → `Promise<{ plan: GeneratedTrainingPlan; context: AiContextMetadata }>`
- Consumes later: Task 5 przechowuje metadane w stanie właściwej generacji

- [x] **Step 1: Update response helpers and write failing parser tests**

Zmień helper testowy:

```ts
function ndjsonResponse(frames: string, context = 'full'): Response {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(frames))
      controller.close()
    },
  })

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'X-IronLog-AI-Context': context,
    },
  })
}
```

W istniejących testach ręcznie tworzonych odpowiedzi sukcesu bez body albo ze złym `Content-Type` dodaj poprawny nagłówek kontekstu, aby nadal testowały zamierzony błąd:

```ts
headers: {
  'Content-Type': 'application/x-ndjson',
  'X-IronLog-AI-Context': 'full',
}
```

Dodaj testy:

```ts
it('reports limited context before reading stream chunks', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ndjsonResponse(
    '{"type":"chunk","text":"Gotowe"}\n{"type":"done"}\n',
    'limited;unavailable=readiness,records',
  )))
  const onContext = vi.fn()
  const onChunk = vi.fn(() => {
    expect(onContext).toHaveBeenCalledWith({
      status: 'limited',
      unavailableSources: ['readiness', 'records'],
    })
  })

  await streamChatReply({ ...options(), onContext, onChunk })
  expect(onContext).toHaveBeenCalledOnce()
})

it.each([
  null,
  '',
  'limited',
  'limited;unavailable=',
  'limited;unavailable=unknown',
  'limited;unavailable=records,records',
  'full;unavailable=records',
])('rejects invalid AI context metadata %s', async (context) => {
  const response = ndjsonResponse('{"type":"done"}\n')
  if (context === null) response.headers.delete('X-IronLog-AI-Context')
  else response.headers.set('X-IronLog-AI-Context', context)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))

  await expect(streamChatReply({ ...options(), onContext: vi.fn() }))
    .rejects.toThrow('AI Coach zwrócił niepoprawny status kontekstu.')
})
```

- [x] **Step 2: Run the client service test and verify RED**

Run:

```bash
npx vitest run src/lib/__tests__/chatService.test.ts
```

Expected: FAIL because `onContext` and strict metadata parsing do not exist.

- [x] **Step 3: Add the client metadata types and strict parser**

W `src/lib/chatService.ts` dodaj:

```ts
export const AI_CONTEXT_SOURCES = ['profile', 'readiness', 'workouts', 'records'] as const
export type AiContextSource = typeof AI_CONTEXT_SOURCES[number]

export interface AiContextMetadata {
  status: 'full' | 'limited'
  unavailableSources: AiContextSource[]
}

const AI_CONTEXT_HEADER = 'X-IronLog-AI-Context'
const INVALID_CONTEXT_MESSAGE = 'AI Coach zwrócił niepoprawny status kontekstu.'

export function parseAiContextHeader(headers: Headers): AiContextMetadata {
  const value = headers.get(AI_CONTEXT_HEADER)
  if (value === 'full') return { status: 'full', unavailableSources: [] }

  const prefix = 'limited;unavailable='
  if (!value?.startsWith(prefix)) throw new Error(INVALID_CONTEXT_MESSAGE)

  const rawSources = value.slice(prefix.length).split(',')
  const unavailableSources = rawSources.filter(
    (source): source is AiContextSource => AI_CONTEXT_SOURCES.includes(source as AiContextSource),
  )
  const canonical = AI_CONTEXT_SOURCES.filter((source) => unavailableSources.includes(source))
  if (
    unavailableSources.length === 0
    || unavailableSources.length > 3
    || unavailableSources.length !== rawSources.length
    || new Set(unavailableSources).size !== unavailableSources.length
    || canonical.join(',') !== rawSources.join(',')
  ) throw new Error(INVALID_CONTEXT_MESSAGE)

  return { status: 'limited', unavailableSources }
}
```

- [x] **Step 4: Parse metadata before streaming and return it with plans**

Rozszerz opcje:

```ts
export interface StreamChatReplyOptions {
  apiKey: string
  messages: Array<Pick<ChatMessage, 'role' | 'content'>>
  signal: AbortSignal
  onContext: (context: AiContextMetadata) => void
  onChunk: (chunk: string) => void
}
```

Po `response.ok`, przed sprawdzeniem body i czytaniem streamu:

```ts
const context = parseAiContextHeader(response.headers)
onContext(context)
```

W `generateTrainingPlan`, po `response.ok` i walidacji `payload.plan`:

```ts
return {
  plan: payload.plan,
  context: parseAiContextHeader(response.headers),
}
```

Zmień return type na:

```ts
Promise<{ plan: GeneratedTrainingPlan; context: AiContextMetadata }>
```

- [x] **Step 5: Add a plan-response contract test**

```ts
it('returns plan data with the same parsed context metadata', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    plan: { name: 'Plan', summary: 'Opis', days: [] },
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-IronLog-AI-Context': 'limited;unavailable=profile',
    },
  })))

  await expect(generateTrainingPlan({
    apiKey: 'sk-ant-test-key-longer-than-twenty-characters',
    request: {
      goal: 'Siła', daysPerWeek: 3, experience: 'intermediate',
      equipment: [], focus: '', notes: '',
    },
  })).resolves.toEqual({
    plan: { name: 'Plan', summary: 'Opis', days: [] },
    context: { status: 'limited', unavailableSources: ['profile'] },
  })
})
```

- [x] **Step 6: Run client tests and commit**

Run:

```bash
npx vitest run src/lib/__tests__/chatService.test.ts
```

Expected: PASS for full, limited, invalid metadata, abort and plan response.

Commit:

```bash
git add src/lib/chatService.ts src/lib/__tests__/chatService.test.ts
git commit -m "feat: parse AI context metadata"
```

---

### Task 5: Context notices bound to the correct chat generation and plan

**Risk closed:** ostrzeżenie nie może zniknąć, zostać przy złej odpowiedzi ani wrócić po reset, abort lub supersede.

**Files:**
- Modify: `src/pages/ChatPage.tsx:1-1050`
- Test: `src/pages/__tests__/ChatPageStreamLifecycle.test.tsx:1-260`
- Test: `src/pages/__tests__/ChatPageAccessibility.test.tsx:1-220`

**Interfaces:**
- Consumes: `AiContextMetadata`, `AiContextSource`, `onContext` i wynik planu z Task 4
- Extends: `ChatMessage.contextUnavailableSources?: AiContextSource[]`
- Produces: lokalny `ContextAvailabilityNotice`

- [x] **Step 1: Update mock return types and write failing chat lifecycle tests**

Rozszerz `PendingReply.options` automatycznie przez aktualny `streamChatReply`. Pozostaw promise zwracający tekst, ale w teście wywołuj callback:

```ts
it('shows limited context during streaming and keeps it on the completed answer', async () => {
  render(<ChatPage />)
  await sendPrompt('Czy progresuję?')
  const pending = pendingReplies[0]

  act(() => {
    pending.options.onContext({ status: 'limited', unavailableSources: ['readiness', 'records'] })
    pending.options.onChunk('Odpowiedź')
  })
  expect(screen.getByRole('status')).toHaveTextContent(
    'Odpowiedź powstała bez części danych: gotowości i rekordów.',
  )

  await act(async () => pending.resolve('Odpowiedź'))
  expect(screen.getByRole('status')).toHaveTextContent(
    'Odpowiedź powstała bez części danych: gotowości i rekordów.',
  )
})

it('ignores stale context metadata after Reset', async () => {
  render(<ChatPage />)
  await sendPrompt('Czy progresuję?')
  const pending = pendingReplies[0]
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

  act(() => pending.options.onContext({ status: 'limited', unavailableSources: ['records'] }))
  expect(screen.queryByText(/bez części danych/)).not.toBeInTheDocument()
})
```

Dodaj mały helper i wywołuj go przed `resolve` wyłącznie w happy-path testach:

```ts
function reportFullContext(reply: PendingReply) {
  act(() => reply.options.onContext({ status: 'full', unavailableSources: [] }))
}
```

Limited test wywołuje tylko własny callback `limited`; nie wysyłaj po nim drugiego `full`.

- [x] **Step 2: Write failing plan accessibility tests**

Zmień istniejący mock w teście wybranego dnia na nowy return shape:

```ts
mocks.generateTrainingPlan.mockResolvedValueOnce({
  plan: {
    name: 'Plan testowy',
    summary: 'Dwa dni',
    days: [
      { name: 'Upper', exercises: [] },
      { name: 'Lower', exercises: [] },
    ],
  },
  context: { status: 'full', unavailableSources: [] },
})
```

Dodaj test:

```ts
it('announces limited context on the generated plan without marking the form invalid', async () => {
  mocks.generateTrainingPlan.mockResolvedValueOnce({
    plan: { name: 'Plan testowy', summary: 'Dwa dni', days: [] },
    context: { status: 'limited', unavailableSources: ['profile', 'workouts'] },
  })
  render(<ChatPage />)

  await screen.findByRole('combobox', { name: 'Model Claude' })
  fireEvent.click(screen.getByRole('button', { name: /^Plan/ }))
  const goal = screen.getByRole('textbox', { name: 'Cel planu' })
  fireEvent.change(goal, { target: { value: 'Siła' } })
  fireEvent.click(screen.getByRole('button', { name: 'Generuj plan' }))

  expect(await screen.findByRole('status')).toHaveTextContent(
    'Plan powstał bez części danych: profilu i treningów.',
  )
  expect(goal).not.toHaveAttribute('aria-invalid')
})
```

- [x] **Step 3: Run component tests and verify RED**

Run:

```bash
npx vitest run src/pages/__tests__/ChatPageStreamLifecycle.test.tsx src/pages/__tests__/ChatPageAccessibility.test.tsx
```

Expected: FAIL because context callbacks and notices are not rendered.

- [x] **Step 4: Add message metadata and the local notice component**

W `src/lib/chatService.ts` rozszerz `ChatMessage`:

```ts
contextUnavailableSources?: AiContextSource[]
```

W `ChatPage.tsx` zaimportuj typ i dodaj lokalny formatter wykorzystujący platformę:

```ts
const CONTEXT_SOURCE_LABELS: Record<AiContextSource, string> = {
  profile: 'profilu',
  readiness: 'gotowości',
  workouts: 'treningów',
  records: 'rekordów',
}
const polishList = new Intl.ListFormat('pl-PL', { style: 'long', type: 'conjunction' })

function ContextAvailabilityNotice({
  subject,
  unavailableSources,
}: {
  subject: 'Odpowiedź' | 'Plan'
  unavailableSources: AiContextSource[]
}) {
  if (unavailableSources.length === 0) return null
  const labels = unavailableSources.map((source) => CONTEXT_SOURCE_LABELS[source])
  return (
    <div className="coach-generation-feedback" role="status">
      {subject} powstał{subject === 'Odpowiedź' ? 'a' : ''} bez części danych: {polishList.format(labels)}.
    </div>
  )
}
```

Jeżeli powyższa odmiana utrudnia czytelność JSX, użyj pełnych dwóch zdań w mapie `subject`; nie dodawaj biblioteki do copy.

- [x] **Step 5: Bind streaming metadata to `generationId`**

Dodaj stan:

```ts
const [streamUnavailableSources, setStreamUnavailableSources] = useState<AiContextSource[]>([])
const [planUnavailableSources, setPlanUnavailableSources] = useState<AiContextSource[]>([])
```

Przy rozpoczęciu, anulowaniu, błędzie i resetowaniu generacji czyść wyłącznie tymczasową listę streamu. W `runChatGeneration` zachowaj lokalną kopię:

```ts
let generationUnavailableSources: AiContextSource[] = []

const reply = await streamChatReply({
  apiKey,
  messages: requestMessages.map(({ role, content }) => ({ role, content })),
  signal: controller.signal,
  onContext: (context) => {
    if (activeGenerationRef.current?.generationId !== generationId) return
    generationUnavailableSources = context.unavailableSources
    setStreamUnavailableSources(context.unavailableSources)
  },
  onChunk: (chunk) => {
    if (activeGenerationRef.current?.generationId !== generationId) return
    setStreamText((current) => current + chunk)
  },
})
```

Przy poprawnym `done` dopisz do wiadomości:

```ts
contextUnavailableSources: generationUnavailableSources,
```

Po zapisaniu wiadomości wyczyść `streamUnavailableSources`. Stale callback pozostaje zablokowany przez istniejący `generationId`.

- [x] **Step 6: Store plan metadata with the preview**

Zmień wywołanie:

```ts
const { plan, context } = await generateTrainingPlan({
  apiKey,
  request: {
    goal: planGoal,
    daysPerWeek: planDays,
    experience: planExperience,
    equipment: planEquipment,
    focus: planFocus,
    notes: planNotes,
  },
})

setPlanPreview(plan)
setPlanUnavailableSources(context.unavailableSources)
```

Przed nową generacją i w każdej ścieżce `setPlanPreview(null)` dodaj `setPlanUnavailableSources([])`. Nie dodawaj `useEffect` tylko do synchronizacji tych dwóch stanów.

- [x] **Step 7: Render notices next to their exact result**

Pod każdą ukończoną wiadomością asystenta:

```tsx
{message.role === 'assistant' && (
  <ContextAvailabilityNotice
    subject="Odpowiedź"
    unavailableSources={message.contextUnavailableSources ?? []}
  />
)}
```

W tymczasowej wiadomości streamu:

```tsx
<ContextAvailabilityNotice
  subject="Odpowiedź"
  unavailableSources={streamUnavailableSources}
/>
```

W `coach-plan-preview`, bezpośrednio po nagłówku podglądu:

```tsx
<ContextAvailabilityNotice
  subject="Plan"
  unavailableSources={planUnavailableSources}
/>
```

Nie dodawaj notice do bocznego raila ani pełnych odpowiedzi.

- [x] **Step 8: Run component tests and commit**

Run:

```bash
npx vitest run src/lib/__tests__/chatService.test.ts src/pages/__tests__/ChatPageStreamLifecycle.test.tsx src/pages/__tests__/ChatPageAccessibility.test.tsx
```

Expected: PASS; limited status jest przy właściwym wyniku, full jest cichy, stale callback po reset nie wraca.

Commit:

```bash
git add src/lib/chatService.ts src/lib/__tests__/chatService.test.ts src/pages/ChatPage.tsx src/pages/__tests__/ChatPageStreamLifecycle.test.tsx src/pages/__tests__/ChatPageAccessibility.test.tsx
git commit -m "feat: show limited AI context"
```

---

### Task 6: Deterministic browser coverage for chat, plan and retry

**Risk closed:** kontrakt musi działać w prawdziwym przepływie przeglądarki bez prawdziwego klucza Claude, produkcyjnego konta i niestabilnej sieci.

**Files:**
- Modify: `tests/e2e/support/mockAiStream.ts:1-170`
- Modify: `tests/e2e/chat.spec.ts:1-360`

**Interfaces:**
- Consumes: klient i UI z Tasks 4–5
- Produces: mock success header, plan response i kontrolowany HTTP error
- Produces: deterministyczne E2E dla trzech zaakceptowanych failure paths

- [x] **Step 1: Extend the mock attempt contract**

Zachowaj istniejące chat attempts bez obowiązkowej migracji wszystkich call sites:

```ts
interface MockAiChatAttempt {
  kind?: 'chat'
  frames: MockAiFrame[]
  holdOpen?: boolean
  contextHeader?: string
}

interface MockAiPlanAttempt {
  kind: 'plan'
  plan: {
    name: string
    summary: string
    days: Array<{
      name: string
      exercises: Array<{
        exerciseId: string
        exerciseSource: 'global' | 'user'
        name: string
        sets: number
        targetReps: number
        targetWeight: number
      }>
    }>
  }
  contextHeader?: string
}

interface MockAiErrorAttempt {
  kind: 'error'
  status: number
  message: string
}

export type MockAiAttempt = MockAiChatAttempt | MockAiPlanAttempt | MockAiErrorAttempt
```

- [x] **Step 2: Support plan request validation and successful metadata headers**

Dodaj walidator wymagający dokładnie `apiKey`, `model`, `mode`, `planRequest`:

```ts
const isPlanBody = (value: unknown) => (
  isRecord(value)
  && hasExactKeys(value, ['apiKey', 'model', 'mode', 'planRequest'])
  && isNonEmptyString(value.apiKey)
  && isNonEmptyString(value.model)
  && value.mode === 'plan'
  && isRecord(value.planRequest)
)
```

Po pobraniu attempt:

```ts
if (attempt.kind === 'error') {
  return new Response(JSON.stringify({ error: attempt.message }), {
    status: attempt.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

if (attempt.kind === 'plan') {
  if (!isPlanBody(body)) throw contractViolation(pathname, 'plan request body')
  return new Response(JSON.stringify({ plan: attempt.plan }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-IronLog-AI-Context': attempt.contextHeader ?? 'full',
    },
  })
}

if (!isChatBody(body)) throw contractViolation(pathname, 'body { apiKey, model, messages }')
```

W istniejącej odpowiedzi streamu dodaj:

```ts
'X-IronLog-AI-Context': attempt.contextHeader ?? 'full',
```

- [x] **Step 3: Add a limited-chat E2E test**

```ts
test('attaches limited context to the completed answer', async ({ page }) => {
  await openChatWithMock(page, [{
    contextHeader: 'limited;unavailable=readiness,records',
    frames: [
      { delayMs: 20, frame: { type: 'chunk', text: 'Odpowiedź z częściowym kontekstem' } },
      { delayMs: 20, frame: { type: 'done' } },
    ],
  }])

  await sendQuestion(page)
  await expect(page.getByRole('status')).toContainText(
    'Odpowiedź powstała bez części danych: gotowości i rekordów.',
  )
  await expect(page.getByText('Odpowiedź z częściowym kontekstem', { exact: true })).toBeVisible()
})
```

- [x] **Step 4: Add a limited-plan E2E test**

```ts
test('attaches limited context to the generated plan preview', async ({ page }) => {
  await installMockAiRuntime(page, [{
    kind: 'plan',
    contextHeader: 'limited;unavailable=profile,workouts',
    plan: {
      name: 'Plan testowy',
      summary: 'Plan z ograniczonym kontekstem',
      days: [{ name: 'Upper', exercises: [] }],
    },
  }])
  await page.goto('/chat')
  await expectAppReady(page, '/chat')
  await page.getByRole('button', { name: /^Plan/ }).click()
  await page.getByRole('textbox', { name: 'Cel planu' }).fill('Budowa siły')
  await page.getByRole('button', { name: 'Generuj plan' }).click()

  await expect(page.getByRole('heading', { name: 'Plan testowy' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText(
    'Plan powstał bez części danych: profilu i treningów.',
  )
})
```

- [x] **Step 5: Add total-failure retry E2E**

```ts
test('retries after total context failure without duplicating the question', async ({ page }) => {
  await openChatWithMock(page, [
    { kind: 'error', status: 503, message: 'Nie udało się załadować kontekstu. Spróbuj ponownie.' },
    {
      frames: [
        { delayMs: 20, frame: { type: 'chunk', text: 'Odpowiedź po ponowieniu' } },
        { delayMs: 20, frame: { type: 'done' } },
      ],
    },
  ])

  await sendQuestion(page)
  await expect(page.getByRole('alert')).toContainText('Nie udało się załadować kontekstu.')
  await page.getByRole('button', { name: 'Ponów odpowiedź AI' }).click()

  await expect(page.getByText('Odpowiedź po ponowieniu', { exact: true })).toBeVisible()
  await expect(page.getByText(QUESTION, { exact: true })).toHaveCount(1)
})
```

- [x] **Step 6: Run deterministic E2E and commit**

Run:

```bash
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "npx playwright test tests/e2e/chat.spec.ts --project=desktop --retries=0"
```

Expected: PASS for the full chat suite, including limited chat, limited plan and total-failure retry. No real Anthropic request or secret leaves the browser.

Commit:

```bash
git add tests/e2e/support/mockAiStream.ts tests/e2e/chat.spec.ts
git commit -m "test: cover degraded AI context"
```

---

### Task 7: Elevated-risk verification, runtime observation, review and phase handoff

**Risk closed:** Phase 6B cannot be marked complete from isolated unit tests while build, browser behavior, privacy, rollout order or lifecycle documentation remains unverified.

**Files:**
- Modify after successful gates: `docs/roadmap/ROADMAP.md`
- Modify after successful gates: `docs/roadmap/specs/2026-07-22-phase-6b-ai-context-correctness-cost-design.md`
- Modify: `docs/roadmap/plans/2026-07-22-phase-6b-ai-context-correctness-cost.md`

**Interfaces:**
- Consumes: Tasks 1–6 and all acceptance criteria from the approved spec
- Produces: verified implementation state, focused review, runtime evidence and truthful handoff

- [x] **Step 1: Run the complete focused test matrix**

Run:

```bash
npx vitest run \
  server/__tests__/aiContext.test.ts \
  api/lib/__tests__/aiContextLoader.test.ts \
  api/__tests__/aiChatContextIntegration.test.ts \
  api/__tests__/aiChatStreamIntegration.test.ts \
  api/lib/__tests__/aiChatStream.test.ts \
  src/lib/__tests__/chatService.test.ts \
  src/pages/__tests__/ChatPageStreamLifecycle.test.tsx \
  src/pages/__tests__/ChatPageAccessibility.test.tsx
```

Expected: PASS with no retries, unhandled rejections or private error details in output.

- [x] **Step 2: Run full unit/support, lint and build**

Run serially:

```bash
npm run test:unit
npm run lint
npm run build
```

Expected: all commands exit 0. Existing non-blocking Vite chunk warning may remain; no new warning from Phase 6B is accepted.

- [x] **Step 3: Re-run deterministic browser coverage on fresh emulators**

Run:

```bash
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "npx playwright test tests/e2e/chat.spec.ts --project=desktop --retries=0"
```

Expected: PASS; browser diagnostics remain clean and no external Anthropic request occurs.

- [x] **Step 4: Perform one serial direct runtime observation**

Przed obserwacją przeczytaj `project-convergence/references/visual-observation.md` i wybierz jedną podstawową powierzchnię browserową. Uruchom lokalny runtime:

```bash
npm run dev:all
```

Na żywej stronie `/chat`, z deterministycznym interception `/api/ai-chat`, bez polegania na zapisanym screenshotcie:

1. wyślij pytanie z `limited;unavailable=readiness,records`;
2. potwierdź status podczas streamu i pod ukończoną odpowiedzią;
3. wygeneruj plan z `limited;unavailable=profile,workouts` i potwierdź status nad podglądem;
4. zwróć 503 dla wszystkich źródeł, potwierdź alert, użyj retry i sprawdź pojedyncze pytanie;
5. sprawdź desktop oraz wąski viewport dla zawijania komunikatu, bez redesignu ekranu.

Zapisz wynik jako `Observed` wyłącznie po bezpośrednim walkthrough. Jeżeli powierzchnia nie jest dostępna, zapisz `Pending` i nie zamykaj fazy.

- [x] **Step 5: Perform one focused review for Elevated risk**

Przejrzyj pełny diff od base commita brancha do HEAD pod kątem:

1. każdej pojedynczej i całkowitej awarii;
2. empty-vs-unavailable;
3. sumy limitów i faktycznych query;
4. braku czwartej ramki NDJSON i niezmienionego `{ plan }`;
5. generation ID, abort, reset i stale callbacks;
6. prywatności logów;
7. indeksów oraz kolejności rollout/recovery;
8. braku zmian Fazy 6C, `userExercises`, pushu i `RELEASE-08`.

Każde realne znalezisko popraw przez TDD i powtórz dotknięte bramki. Nie uruchamiaj kolejnego review bez nowego diffu zamykającego nazwane ryzyko.

- [x] **Step 6: Verify scoped diff and repository hygiene**

Run:

```bash
git diff --check
git status --short
PHASE6B_BASE=$(git merge-base HEAD puls-rebrand)
git diff --stat "$PHASE6B_BASE"..HEAD
git diff "$PHASE6B_BASE"..HEAD -- firestore.indexes.json api/ server/ src/lib/chatService.ts src/pages/ChatPage.tsx tests/e2e/
```

Expected:

- tylko pliki objęte planem;
- brak sekretów, promptów i danych użytkownika w logach/test fixtures;
- `docs/audits/2026-07-14-senior-design-review.md` pozostaje poza diffem brancha;
- brak pushu, deployu i publikacji indeksów.

Zapisz wartość `PHASE6B_BASE` w `Final Results`, aby dowód końcowy wskazywał konkretny SHA.

- [x] **Step 7: Update lifecycle documents only after every gate passes**

W `docs/roadmap/ROADMAP.md`:

- ustaw Fazę 6B `DONE` wyłącznie po zielonych gate'ach i `Observed` runtime;
- zapisz rzeczywiste wyniki testów, lint, build, E2E i focused review;
- pozostaw 2B oraz 6C `READY`, Fazę S bez zmian i `RELEASE-08` otwarte;
- nie uznawaj indeksów za opublikowane.

W specu ustaw status:

```text
zaimplementowany i zweryfikowany — oczekuje na integrację
```

W tym planie ustaw:

```text
COMPLETED — VERIFIED — AWAITING INTEGRATION
```

Zaznacz tylko rzeczywiście wykonane checkboxy i zapisz dokładne komendy/wyniki w sekcji `Final Results`.

- [x] **Step 8: Commit documentation closeout**

Run:

```bash
git add \
  docs/roadmap/ROADMAP.md \
  docs/roadmap/specs/2026-07-22-phase-6b-ai-context-correctness-cost-design.md \
  docs/roadmap/plans/2026-07-22-phase-6b-ai-context-correctness-cost.md
git commit -m "docs: close phase 6b AI context integrity"
```

Expected: commit contains only lifecycle documentation. Integration do `puls-rebrand`, cleanup worktree, push, deploy and `RELEASE-08` wymagają osobnego kroku oraz właściwej zgody.

- [ ] **Step 9: Save the truthful pre-integration memory state**

Przeczytaj i użyj `memory-save` po commicie dokumentacji. Zapisz:

- current focus: Faza 6B zaimplementowana i zweryfikowana na feature branchu, oczekuje na decyzję integracyjną;
- passing: dokładne wyniki focused tests, pełnego unit/support, lint, build, Playwright, runtime observation i review;
- broken: puste;
- untested: produkcyjna publikacja indeksów, deploy i `RELEASE-08`;
- next actions: uzyskać zgodę na lokalną integrację do `puls-rebrand`, potem wykonać bounded closeout integracji;
- zachować Fazę 2B oraz 6C jako niezależne `READY`.

Po zapisie uruchom:

```bash
node /Users/patryk/.agent-memory-scripts/drift-check.js "$(pwd)"
```

Potwierdź, że pamięć wskazuje HEAD commita dokumentacyjnego oraz nie traktuje audytu użytkownika jako własnej zmiany.

## Final Results

- `PHASE6B_BASE=21b15d35af99cd221dfcff0b677dcc577a562084` (`git merge-base HEAD puls-rebrand`).
- Focused matrix:

  ```bash
  npx vitest run \
    server/__tests__/aiContext.test.ts \
    api/lib/__tests__/aiContextLoader.test.ts \
    api/__tests__/aiChatContextIntegration.test.ts \
    api/__tests__/aiChatStreamIntegration.test.ts \
    api/lib/__tests__/aiChatStream.test.ts \
    src/lib/__tests__/chatService.test.ts \
    src/pages/__tests__/ChatPageStreamLifecycle.test.tsx \
    src/pages/__tests__/ChatPageAccessibility.test.tsx
  ```

  PASS po final review — 8 plików, 90/90 testów, exit 0; bez retry, unhandled rejection i prywatnych szczegółów w output.
- `npm run test:unit`: PASS po final review — 59 plików, 460/460 testów, exit 0.
- `npm run lint`: PASS — `eslint .`, exit 0 bez uwag.
- `npm run build`: PASS — `tsc -b && vite build`, 878 modułów, exit 0 bez ostrzeżenia.
- Fresh-emulator desktop chat E2E:

  ```bash
  E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "npx playwright test tests/e2e/chat.spec.ts --project=desktop --retries=0"
  ```

  PASS — 12/12 testów, exit 0. Mock instalowany w przeglądarce przejął cały `/api/ai-chat`, więc nie wykonano prawdziwego requestu Anthropic. Narzędzia wypisały ostrzeżenie emulatora Node `DEP0169 url.parse()` oraz ostrzeżenia Playwright/WebServer o `NO_COLOR` ignorowanym przy `FORCE_COLOR`; nie powstało nowe ostrzeżenie Fazy 6B.
- Visual evidence: Observed — surface: Browser; proof: completed Browser DOM events returned limited status before first chunk, attached after done, plan status, 503 alert and successful one-question retry; emitted narrow and desktop screenshots showed clean wrapping/layout, with final browser logs `[]`.
- Szczegóły obserwacji: przed pierwszym chunkiem DOM pokazał `Analizuję kontekst...` i status `Odpowiedź powstała bez części danych: gotowości i rekordów.`; ukończona odpowiedź `Druga odpowiedź obserwacyjna` zachowała ten status. Plan `Plan obserwacyjny` pokazał `Plan powstał bez części danych: profilu i treningów.`. Całkowita awaria pokazała alert `Nie udało się załadować kontekstu. Spróbuj ponownie.` i retry; wynik retry zawierał `questionCount: 1` oraz `Odpowiedź po ponowieniu`. Screenshoty 390×844 i desktop potwierdziły czyste zawijanie/layout.
- Obserwacja początkowo wykryła brak statusu przed pierwszym chunkiem. Poprawka `7d9586a` ma focused coverage 18/18 i została ponownie przejrzana bez znalezisk.
- E2E 12/12 i powyższa obserwacja Browser nie były ponawiane po `83941fe`, ponieważ final-review fix nie dotknął kodu UI ani transportu klienta; zachowane dowody nadal pokrywają niezmienione zachowanie runtime.
- Caveat operacyjny: reload HMR wysłał walidacyjny `/api/ai-models` z fałszywym kluczem do lokalnego backendu, który zwrócił `invalid x-api-key`; nie przesłano prawdziwego sekretu, promptu, odpowiedzi ani danych użytkownika. Wszystkie zachowania `/api/ai-chat` były deterministycznie przechwycone.
- Final-review fixes w `83941fe` zachowują gotowościowy niski streak i rekomendację przy niedostępnej historii treningów, bez fałszywego `0 treningów` lub braku aktywności. Kontrakt zależności pozostaje jawny: workout trends wymagają treningów, weak-week comparison treningów i profilu, a readiness streak wyłącznie readiness. Prompt planu otrzymał istniejące heading/line rekordów dla wariantu available i unavailable, a parametryczna regresja loadera dowodzi zachowania znormalizowanych, niepustych sibling data przy odrzuceniu każdego pojedynczego źródła.
- Finalny whole-branch re-review pełnego diffu od `PHASE6B_BASE` przez `83941fe` zakończył się `Ready to merge: Yes`; Critical: 0, Important: 0, Minor: 0. Ponownie sprawdzono awarie pojedyncze/całkowitą, empty-vs-unavailable, zależności analiz, limity 1+31+31+6=69 i faktyczne query, oba prompty, niezmienione `chunk | done | error` oraz `{ plan }`, generation ID/abort/reset/stale callbacki, prywatność logów, indeksy i rollout/recovery oraz granice Fazy 6C/`userExercises`/`RELEASE-08`.
- Hygiene: `git diff --check` czysty; worktree był czysty przed lifecycle refresh; finalny diff implementacji obejmuje 15 planowanych plików (`1190 insertions`, `166 deletions`); `docs/audits/2026-07-14-senior-design-review.md` pozostał poza diffem i nietknięty.
- Lifecycle: Faza 6B ma status `DONE` / `COMPLETED — VERIFIED — AWAITING INTEGRATION`; Fazy 2B i 6C pozostają `READY`, Faza S bez zmian, `RELEASE-08` otwarte. Indeksy nie zostały opublikowane; integracja, push i deploy nie zostały wykonane.
- Krok zapisu pamięci pozostaje tu niezaznaczony celowo: zgodnie z procedurą następuje dopiero po commicie tych dokumentów, aby pamięć mogła wskazać jego HEAD; nie powstanie drugi commit tylko dla odnotowania zewnętrznego save.

---

## Spec Coverage Map

| Wymaganie | Task | Dowód |
|---|---:|---|
| `AI-01` niezależne źródła | 1–3 | source statuses, `Promise.allSettled`, pojedyncze awarie |
| `AI-09` metadata i uczciwe UI | 3–6 | header, strict parser, notice czatu/planu, E2E |
| `AI-10` budżet odczytów | 2 | stałe 1+31+31+6, bounded query, test sumy 69 |
| `AI-11` kolejne daty | 1 | non-consecutive negative test, month/year boundary positive test |
| Empty ≠ unavailable | 1–2 | prompt i loader tests |
| Wszystkie źródła unavailable | 2–3, 6 | coded 503, no Anthropic fetch, retry E2E |
| Niezmieniony NDJSON i `{ plan }` | 3–4 | API integration i client tests |
| Brak stale statusu po abort/reset | 5–6 | generation-ID unit tests i browser flow |
| Prywatność logów | 2, 7 | safe logger assertions i focused review |
| Indeksy, rollout i recovery | 2, 7 | config diff, direct gate i dokumentacja closeout |
| Bezpośrednia obserwacja UI | 7 | serial browser walkthrough oznaczony `Observed` |

## Recovery Decision

- Kod Fazy 6B jest odwracalny zwykłym revertem commitów brancha.
- Dwa nowe indeksy nie modyfikują dokumentów i mogą pozostać po rollbacku.
- Brak gotowego indeksu blokuje produkcyjny rollout; nie wolno wracać do drogiego query ani pustego fallbacku.
- Nie powstaje feature flag, dual-read ani compatibility layer.

## Definition of Done

- [x] Każda pojedyncza awaria zachowuje trzy pozostałe źródła.
- [x] Empty snapshot pozostaje `available`.
- [x] Cztery awarie zwracają retryable 503 bez Anthropic fetch.
- [x] Budżet podstawowego kontekstu wynosi najwyżej 69 dokumentów.
- [x] Niskie readiness wymaga kolejnych dat kalendarzowych.
- [x] Header jest kanoniczny i ścisłe walidowany przez klienta.
- [x] Pełny kontekst jest cichy; limited jest przypisany do właściwej odpowiedzi/planu.
- [x] Reset, abort, supersede i retry nie zostawiają stale metadata.
- [x] NDJSON i body planu pozostają zgodne z Fazą 6A.
- [x] Focused tests, pełny unit/support, lint i build przechodzą.
- [x] Deterministyczny Playwright przechodzi bez prawdziwego Claude API.
- [x] Direct runtime observation ma status `Observed`.
- [x] Focused Elevated-risk review nie ma otwartych znalezisk.
- [ ] Roadmapa, spec, plan i pamięć opisują rzeczywisty poziom zakończenia.
- [x] Audyt użytkownika pozostaje nietknięty.
- [x] Brak pushu, deployu, publikacji indeksów i zmian `RELEASE-08`.
