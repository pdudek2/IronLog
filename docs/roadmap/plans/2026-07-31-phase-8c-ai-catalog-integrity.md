# AI Catalog Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nie dopuścić, aby generator planu przypisał ćwiczenie na podstawie niejednoznacznej nazwy albo wygenerował plan z katalogu, który po cichu utracił ćwiczenia użytkownika.

**Status:** COMPLETED

## Closeout evidence

- Commity implementacyjne: `6fd63dd` (`fix: fail incomplete ai exercise catalogs`), `034a025` (`fix: reject ambiguous ai exercise names`), `b41eac6` (`test: cover ai plan catalog retry`) i `65cacbc` (`test: target visible ai plan retry`).
- Dotknięte testy: `npx vitest run api/__tests__/aiChatContextIntegration.test.ts src/lib/__tests__/chatService.test.ts src/pages/__tests__/ChatPageAccessibility.test.tsx` — PASS, 3 pliki i 35/35 testów, bez retry.
- Pełne gate'y: `npm run lint` — PASS; `npm run test:unit` — PASS, 63 pliki i 484/484 testów; `npm run build` — PASS; `git diff --check` — PASS.
- Focused review: PASS. Wszystkie błędy odczytu kompletnego katalogu są normalizowane do `503 ai_catalog_unavailable` przed wywołaniem Anthropic; pusty poprawnie odczytany `userExercises` pozostaje sukcesem; dokładny klucz wygrywa przed nazwą; kolizje nazw nie mapują się niezależnie od kolejności katalogu; klient zachowuje komunikat i kod oraz pozwala ponowić bez resetu formularza.
- Zakres zmian w commitach potwierdza brak zmian promptu, schematu danych, UI produkcyjnego, reguł, indeksów i zależności. Zatwierdzone odchylenia od planu: brak.

**Architecture:** Serwer buduje jeden kompletny katalog `global + user` przed wywołaniem Anthropic. Awaria dowolnego źródła zatrzymuje generowanie stabilnym błędem `503 ai_catalog_unavailable`. Normalizacja najpierw rozstrzyga dokładne `exerciseSource + exerciseId`, a fallback po nazwie dopuszcza wyłącznie nazwę występującą raz w całym połączonym katalogu. Istniejący klient pokazuje treść błędu i pozwala ponowić tę samą operację.

**Tech Stack:** TypeScript 5.9, React 19, Vercel Node Functions, Firebase Admin SDK 13, Vitest 4, Testing Library.

**Approved product decision:** Awaria pobrania katalogu powoduje retryable failure całej generacji. Nie dodajemy trybu ograniczonego do ćwiczeń globalnych.

## Global Constraints

- Zakres obejmuje wyłącznie `AI-CATALOG-01`, `AI-CATALOG-02` i `AI-CATALOG-03`.
- Katalog jest kompletny albo niedostępny; nie wolno zastępować błędu `userExercises` pustą tablicą.
- Dokładna para `exerciseSource + exerciseId` ma pierwszeństwo przed nazwą.
- Fallback po znormalizowanej nazwie działa wyłącznie dla dokładnie jednego wpisu w całym katalogu.
- Kolejność katalogu nie może zmieniać wyniku normalizacji.
- Nie zmieniać promptu, schematu planu, kolekcji Firestore, reguł, indeksów ani zależności.
- Nie dodawać nowego przycisku retry: istniejący przycisk `Generuj plan` ponawia operację po błędzie.
- Nie zmieniać copy poza stabilnym komunikatem błędu katalogu.
- Nie stage'ować `.impeccable/`, `output/` ani `docs/audits/2026-07-14-senior-design-review.md`.
- Push i deploy wymagają osobnej zgody.

## File Structure

### Modified production files

- `api/ai-chat.ts` — pełne ładowanie katalogu, stabilny błąd oraz jednoznaczny indeks nazw.

### Modified test files

- `api/__tests__/aiChatContextIntegration.test.ts` — awaria Firestore, brak wywołania Anthropic, kolizje nazw i brakujące identyfikatory.
- `src/lib/__tests__/chatService.test.ts` — zachowanie kodu i treści błędu `ai_catalog_unavailable`.
- `src/pages/__tests__/ChatPageAccessibility.test.tsx` — widoczny błąd i ponowienie generacji tym samym przyciskiem.

### Documentation

- `docs/roadmap/ROADMAP.md` — status i zatwierdzony kontrakt Fazy 8C.
- `docs/roadmap/plans/2026-07-31-phase-8c-ai-catalog-integrity.md` — checklisty oraz późniejsze dowody wykonania.

### Deliberately unchanged

- `src/lib/chatService.ts` — już zachowuje serwerowe `error` i `code` w `AiApiError`.
- `src/pages/ChatPage.tsx` — już pokazuje błąd jako alert, odblokowuje formularz po `finally` i pozwala ponownie kliknąć `Generuj plan`.
- `tests/e2e/support/mockAiStream.ts` i `tests/e2e/chat.spec.ts` — zachowanie retry zostanie pokryte taniej i deterministycznie w teście komponentu; pełny browser smoke należy do Fazy 9.

---

## Task 1: Jawna awaria niekompletnego katalogu

**Files:**

- Modify/Test: `api/__tests__/aiChatContextIntegration.test.ts`
- Modify: `api/ai-chat.ts`
- Modify/Test: `src/lib/__tests__/chatService.test.ts`

- [x] **Step 1: Uzupełnić mock Firestore o kontrolowany odczyt `userExercises`**

W `api/__tests__/aiChatContextIntegration.test.ts` dodać do hoisted mocks:

```ts
getUserExercises: vi.fn(),
```

Zastąpić pusty `adminDb` minimalnym łańcuchem używanym przez endpoint:

```ts
vi.mock('../_lib/firebaseAdmin.js', () => ({
  adminDb: {
    collection: () => ({
      where: () => ({
        get: mocks.getUserExercises,
      }),
    }),
  },
}))
```

W `beforeEach` resetować mock i domyślnie zwracać kompletny katalog bez własnych ćwiczeń:

```ts
mocks.getUserExercises.mockReset()
mocks.getUserExercises.mockResolvedValue({ docs: [] })
```

To usuwa dotychczasową zależność testów sukcesu od cichego fallbacku.

- [x] **Step 2: Dodać failing test awarii katalogu**

W tym samym pliku dodać test plan mode:

```ts
it('returns a retryable catalog error without calling Anthropic', async () => {
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
    error: 'Nie udało się załadować katalogu ćwiczeń. Spróbuj ponownie.',
    code: 'ai_catalog_unavailable',
  })
  expect(fetchMock).not.toHaveBeenCalled()
})
```

- [x] **Step 3: Uruchomić test i potwierdzić RED**

Run:

```bash
npx vitest run api/__tests__/aiChatContextIntegration.test.ts
```

Expected: nowy test FAIL, ponieważ endpoint nadal przechodzi do Anthropic z katalogiem global-only.

- [x] **Step 4: Zastąpić cichy fallback stabilnym błędem**

W `api/ai-chat.ts`:

1. zaimportować `ApiError` z `./_lib/errors.js`;
2. usunąć `fetchAvailableExercisesSafe`;
3. objąć kompletne ładowanie `userExercises + global` w `fetchAvailableExercises` blokiem `try/catch`;
4. po błędzie zalogować istniejący marker i rzucić:

```ts
throw new ApiError(
  503,
  'Nie udało się załadować katalogu ćwiczeń. Spróbuj ponownie.',
  {
    code: 'ai_catalog_unavailable',
    cause: error,
  },
)
```

5. w handlerze wywołać `fetchAvailableExercises(userId)`.

Nie łapać tego błędu ponownie lokalnie. Istniejący `sendApiError` ma zwrócić status, komunikat i kod.

- [x] **Step 5: Potwierdzić GREEN i brak regresji plan mode**

Run:

```bash
npx vitest run api/__tests__/aiChatContextIntegration.test.ts
```

Expected: PASS; testy sukcesu korzystają z `{ docs: [] }`, a test awarii zwraca `503` bez requestu do Anthropic.

- [x] **Step 6: Dodać test kontraktu klienta**

W `src/lib/__tests__/chatService.test.ts` zaimportować `AiApiError` i dodać:

```ts
it('preserves the retryable catalog error contract', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    error: 'Nie udało się załadować katalogu ćwiczeń. Spróbuj ponownie.',
    code: 'ai_catalog_unavailable',
  }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  })))

  const result = generateTrainingPlan({
    apiKey: 'sk-ant-test-key-longer-than-twenty-characters',
    request: {
      goal: 'Siła',
      daysPerWeek: 3,
      experience: 'intermediate',
      equipment: [],
      focus: '',
      notes: '',
    },
  })

  await expect(result).rejects.toBeInstanceOf(AiApiError)
  await expect(result).rejects.toMatchObject({
    message: 'Nie udało się załadować katalogu ćwiczeń. Spróbuj ponownie.',
    code: 'ai_catalog_unavailable',
  })
})
```

- [x] **Step 7: Uruchomić oba kontrakty**

Run:

```bash
npx vitest run api/__tests__/aiChatContextIntegration.test.ts src/lib/__tests__/chatService.test.ts
```

Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add api/ai-chat.ts api/__tests__/aiChatContextIntegration.test.ts src/lib/__tests__/chatService.test.ts
git commit -m "fix: fail incomplete ai exercise catalogs"
```

---

## Task 2: Jednoznaczny fallback po nazwie

**Files:**

- Modify/Test: `api/__tests__/aiChatContextIntegration.test.ts`
- Modify: `api/ai-chat.ts`

- [x] **Step 1: Dodać failing test kolizji niezależny od kolejności**

W `api/__tests__/aiChatContextIntegration.test.ts` przygotować plan z brakującym ID i nazwą `Bench Press`, a następnie uruchomić `normalizeGeneratedPlan` dwa razy: raz z kolejnością `[global, user]`, raz `[user, global]`.

Katalog:

```ts
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
```

Dla obu kolejności oczekiwać:

```ts
toThrow('Generator nie zwrócił żadnego poprawnego dnia treningowego.')
```

Plan ma zawierać tylko kolizyjne ćwiczenie, dzięki czemu odrzucenie fallbacku daje jednoznaczny wynik.

- [x] **Step 2: Dodać testy brakującego ID i dokładnego klucza**

Dodać dwa kontrakty:

1. brakujące ID + unikalna nazwa mapuje do jedynego wpisu i zwraca jego prawdziwe `exerciseSource + exerciseId`;
2. poprawny dokładny klucz nadal wygrywa, nawet jeśli ta sama znormalizowana nazwa występuje w drugim źródle.

Użyć `daysPerWeek: 1` i pustego filtra sprzętu, aby testował wyłącznie rozstrzyganie katalogu.

- [x] **Step 3: Uruchomić testy i potwierdzić RED**

Run:

```bash
npx vitest run api/__tests__/aiChatContextIntegration.test.ts
```

Expected: test kolizji FAIL, ponieważ bieżący `Map` wybiera ostatni wpis zależnie od kolejności.

- [x] **Step 4: Zbudować indeks wyłącznie unikalnych nazw**

W `normalizeGeneratedPlan` w `api/ai-chat.ts` zachować istniejący `catalogByKey`, a `catalogByName` zbudować iteracyjnie:

```ts
const catalogByName = new Map<string, AvailableExercise | null>()

for (const exercise of catalog) {
  const normalizedName = normalizeExerciseName(exercise.name)
  if (!normalizedName) continue

  catalogByName.set(
    normalizedName,
    catalogByName.has(normalizedName) ? null : exercise,
  )
}
```

Przy dopasowaniu zachować kolejność:

```ts
const matchedExercise = catalogByKey.get(`${requestedSource}:${requestedId}`)
  ?? (requestedName
    ? catalogByName.get(normalizeExerciseName(requestedName)) ?? undefined
    : undefined)
```

`null` oznacza trwałą kolizję nazwy; trzeci duplikat nie może ponownie uczynić jej unikalną.

- [x] **Step 5: Potwierdzić GREEN**

Run:

```bash
npx vitest run api/__tests__/aiChatContextIntegration.test.ts
```

Expected: PASS dla obu kolejności, unikalnego fallbacku i dokładnego klucza.

- [x] **Step 6: Commit**

```bash
git add api/ai-chat.ts api/__tests__/aiChatContextIntegration.test.ts
git commit -m "fix: reject ambiguous ai exercise names"
```

---

## Task 3: Retry widoczny dla użytkownika

**Files:**

- Modify/Test: `src/pages/__tests__/ChatPageAccessibility.test.tsx`

- [x] **Step 1: Rozszerzyć test błędu generowania o udane ponowienie**

Zastąpić ogólny jednorazowy błąd sekwencją:

```ts
mocks.generateTrainingPlan
  .mockRejectedValueOnce(new Error(
    'Nie udało się załadować katalogu ćwiczeń. Spróbuj ponownie.',
  ))
  .mockResolvedValueOnce({
    plan: {
      name: 'Plan po ponowieniu',
      summary: 'Gotowy plan',
      days: [{ name: 'Dzień 1', exercises: [] }],
    },
    context: { status: 'full', unavailableSources: [] },
  })
```

Po pierwszym kliknięciu:

- alert pokazuje dokładny błąd katalogu;
- poprawny cel nie ma `aria-invalid`;
- przycisk `Generuj plan` jest ponownie aktywny.

Kliknąć ten sam przycisk drugi raz i oczekiwać:

```ts
expect(await screen.findByRole('heading', { name: 'Plan po ponowieniu' })).toBeVisible()
expect(mocks.generateTrainingPlan).toHaveBeenCalledTimes(2)
expect(screen.queryByRole('alert')).not.toBeInTheDocument()
```

- [x] **Step 2: Uruchomić test komponentu**

Run:

```bash
npx vitest run src/pages/__tests__/ChatPageAccessibility.test.tsx
```

Expected: PASS bez zmian w `ChatPage.tsx`. Jeśli test ujawni realny błąd, najpierw udokumentować go w tym planie, a dopiero potem dodać minimalną poprawkę klienta.

- [x] **Step 3: Commit**

```bash
git add src/pages/__tests__/ChatPageAccessibility.test.tsx
git commit -m "test: cover ai plan catalog retry"
```

---

## Task 4: Gate, review i closeout

**Files:**

- Modify: `docs/roadmap/ROADMAP.md`
- Modify: `docs/roadmap/plans/2026-07-31-phase-8c-ai-catalog-integrity.md`

- [x] **Step 1: Uruchomić dotknięte testy**

```bash
npx vitest run api/__tests__/aiChatContextIntegration.test.ts src/lib/__tests__/chatService.test.ts src/pages/__tests__/ChatPageAccessibility.test.tsx
```

Expected: PASS bez retry.

- [x] **Step 2: Uruchomić pełne gate'y repo**

```bash
npm run lint
npm run test:unit
npm run build
git diff --check
```

Expected: wszystkie komendy kończą się kodem `0`.

- [x] **Step 3: Wykonać focused review**

Sprawdzić ręcznie:

- każda ścieżka błędu odczytu katalogu kończy się `503 ai_catalog_unavailable`;
- po błędzie katalogu Anthropic nie jest wywoływane;
- sukces z pustym, ale poprawnie odczytanym `userExercises` nadal działa;
- dokładny klucz wygrywa przed nazwą;
- nazwa z co najmniej dwoma wpisami nigdy nie daje dopasowania;
- odwrócenie kolejności katalogu nie zmienia wyniku;
- klient zachowuje komunikat i kod błędu;
- użytkownik może ponowić generowanie bez resetowania formularza;
- brak zmian promptu, schematu danych, UI, reguł, indeksów i zależności.

- [x] **Step 4: Zapisać dowody**

W sekcji `Status` tego planu ustawić `COMPLETED`, dopisać:

- commity implementacyjne;
- liczbę i wynik testów dotkniętych oraz pełnego `test:unit`;
- wyniki lint, build i `git diff --check`;
- wynik focused review;
- każde zatwierdzone odchylenie od planu.

- [x] **Step 5: Zamknąć Fazę 8C w roadmapie**

W `docs/roadmap/ROADMAP.md`:

- ustawić Fazę 8C na `DONE`;
- podlinkować ten plan jako dowód;
- zachować Fazę 8D jako `READY`;
- pozostawić Fazę 9 `BLOCKED` wyłącznie przez 8D.

- [x] **Step 6: Commit closeoutu**

```bash
git add docs/roadmap/ROADMAP.md docs/roadmap/plans/2026-07-31-phase-8c-ai-catalog-integrity.md
git commit -m "docs: close ai catalog integrity work"
```

Nie wykonywać pushu ani deployu bez osobnej zgody.
