# UI Quality Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Usunąć potwierdzone sprzeczności copy, błędne affordance i redundantne elementy etapu 2 bez zmiany modelu danych ani kierunku Puls.

**Architecture:** Zmiany pozostają w istniejących stronach, współdzielonym `Input` i `src/index.css`. Copy korzysta z już dostępnego zakresu danych, login przekazuje błąd do istniejącego kontraktu pola, a poprawki wizualne usuwają elementy lub ograniczają CSS zamiast dodawać nowe komponenty.

**Tech Stack:** React 19, TypeScript, CSS, Vitest + Testing Library, Playwright.

**Spec:** [kanoniczna roadmapa](./2026-08-14-ui-quality-roadmap.md), etap 2.

## Global Constraints

- Scope lineage: `roadmapa UI quality → etap 2 → etapy 3–5 i decyzje B-02, M-05, M-07, M-14 pozostają otwarte`.
- Nie zmieniać tokenów semantycznych, taksonomii ćwiczeń, Firestore ani modelu rekordów.
- Rekordy w `records` są all-time PR; usunąć redundantny badge `PR`, nie wyliczać nieistniejącego „momentu ustanowienia”.
- Zachować istniejący focus ring, role alert/status i cele dotykowe co najmniej 44×44 px.
- Nie dodawać komponentu, helpera, zależności, feature flag ani compatibility layer.
- Nie commitować i nie pushować bez osobnego polecenia użytkownika.
- Primary visual surface: bezpośrednia obserwacja w świeżym runtime; Playwright służy do kontraktów automatycznych.

## File map

- `src/pages/DashboardPage.tsx` — copy pustego bieżącego tygodnia zależne od istnienia historii.
- `src/pages/ExerciseDetailPage.tsx` — jawny zakres ostatnich maksymalnie 10 sesji.
- `src/pages/LoginPage.tsx` — błąd przypisany do emaila albo hasła przez istniejący `Input.error`.
- `src/pages/HistoryPage.tsx` contract + `src/index.css` — jedna kontrolka czyszczenia wyszukiwarki bez zmiany JSX.
- `src/pages/TemplateEditorPage.tsx` + `src/index.css` — poprawna fleksja, jedna widoczna para liczników i akcje zakotwiczone w głównej kolumnie.
- `src/pages/ProgressPage.tsx` + `src/index.css` — usunięcie badge’a `PR` i korekta dwukolumnowego ledgera.
- `src/pages/ExercisesPage.tsx` + `src/index.css` — konkretne transition properties i bazowy kursor dla aktywnych przycisków.
- Istniejące testy stron i E2E — regresje copy, a11y, DOM/CSS i geometrii.

---

### Task 1: Prawdziwy zakres tygodnia i historii ćwiczenia

**Files:**
- Modify: `src/pages/DashboardPage.tsx`
- Modify: `src/pages/ExerciseDetailPage.tsx`
- Modify: `src/pages/__tests__/DashboardProjectionStatus.test.tsx`
- Modify: `src/pages/__tests__/ExerciseDetailCatalogState.test.tsx`

**Interfaces:**
- Consumes: `workouts`, `weeklyWorkouts`, domyślny limit `getExerciseSessions(..., count = 10)` i `record.totalSessions`.
- Produces: copy rozróżniające pusty tydzień od pustego konta oraz zakres listy od all-time metric.

- [x] **Step 1: Dodać regresje copy**

W teście dashboardu pokryć dwa stany:

```tsx
expect(await screen.findByText('Statystyki tygodnia pojawią się po pierwszym treningu.')).toBeInTheDocument()

// workout starszy niż bieżący tydzień
expect(await screen.findByText('Brak zapisanych treningów w tym tygodniu.')).toBeInTheDocument()
expect(screen.queryByText('Statystyki tygodnia pojawią się po pierwszym treningu.')).not.toBeInTheDocument()
```

W teście detalu zwrócić 10 sesji i rekord z `totalSessions: 14`, następnie oczekiwać:

```tsx
expect(await screen.findByText(/10 ostatnich sesji/)).toBeInTheDocument()
expect(screen.queryByText(/sesji w historii/)).not.toBeInTheDocument()
expect(screen.getByText('Sesje').parentElement).toHaveTextContent('14')
```

- [x] **Step 2: Uruchomić testy i potwierdzić porażkę**

Run:

```bash
npx vitest run src/pages/__tests__/DashboardProjectionStatus.test.tsx src/pages/__tests__/ExerciseDetailCatalogState.test.tsx
```

Expected: FAIL na starym account-scoped copy i `sesji w historii`.

- [x] **Step 3: Zmienić wyłącznie copy**

W pustym tygodniu:

```tsx
{workouts.length === 0
  ? 'Statystyki tygodnia pojawią się po pierwszym treningu.'
  : 'Brak zapisanych treningów w tym tygodniu.'}
```

W detalu:

```tsx
`${sessions.length} ${polishPlural(
  sessions.length,
  'ostatnia sesja',
  'ostatnie sesje',
  'ostatnich sesji',
)} · ${formatVolume(totalVolumeAll)} w tych sesjach`
```

Nie zmieniać zapytań ani limitów.

- [x] **Step 4: Uruchomić testy stron**

Run: komenda ze Step 2.

Expected: PASS.

### Task 2: Błąd logowania przy właściwym polu

**Files:**
- Modify: `src/pages/LoginPage.tsx`
- Modify: `src/pages/__tests__/AuthPageContracts.test.tsx`

**Interfaces:**
- Consumes: istniejący prop `Input.error`, który ustawia `aria-invalid`, `aria-describedby` i `role="alert"`.
- Produces: błąd logowania przy haśle; błąd resetu hasła przy emailu; bez zduplikowanego alertu formularza.

- [x] **Step 1: Dodać testy targetowania błędu**

Użyć hoisted mocków `loginUser`, `resetPassword` i `getAuthErrorMessage`. Dla odrzuconego logowania oczekiwać:

```tsx
expect(await screen.findByText('Nieprawidłowy email lub hasło.')).toBeInTheDocument()
expect(screen.getByLabelText('Hasło')).toHaveAttribute('aria-invalid', 'true')
expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid')
expect(screen.getAllByRole('alert')).toHaveLength(1)
```

Po kliknięciu resetu bez emaila oczekiwać odwrotnego targetu.

- [x] **Step 2: Uruchomić test i potwierdzić porażkę**

Run:

```bash
npx vitest run src/pages/__tests__/AuthPageContracts.test.tsx
```

Expected: FAIL, bo obecny alert nie ustawia stanu żadnego pola.

- [x] **Step 3: Zastąpić string błędu jednym typed state**

```tsx
type LoginField = 'email' | 'password'
type LoginError = { field: LoginField; message: string }

const [error, setError] = useState<LoginError | null>(null)
```

W `handleSubmit` przypisać błąd do `password`, w reset flow do `email`. Przekazać odpowiedni `error?.message` do dwóch istniejących `Input`, usuwać błąd danego pola przy jego edycji i usunąć osobny `<p id="login-form-error">`.

- [x] **Step 4: Uruchomić test auth**

Run: komenda ze Step 2.

Expected: PASS i dokładnie jeden alert.

### Task 3: Jedno czyszczenie wyszukiwarki i uczciwe affordance

**Files:**
- Modify: `src/index.css`
- Modify: `src/pages/ExercisesPage.tsx`
- Modify: `tests/e2e/mobile-ergonomics.spec.ts`

**Interfaces:**
- Consumes: natywny `input[type="search"]`, aktywne `<button>` i istniejące focus/disabled rules.
- Produces: ukryty WebKit cancel, `cursor: pointer` tylko dla aktywnych przycisków i konkretne transition properties chipów.

- [x] **Step 1: Rozszerzyć runtime contract**

W istniejącym teście route filters po otwarciu formularza ćwiczenia i Historii sprawdzić:

```ts
expect(await muscleButton.evaluate((element) => getComputedStyle(element).cursor)).toBe('pointer')
expect(await muscleButton.evaluate((element) => getComputedStyle(element).transitionProperty)).not.toContain('all')

const search = page.getByLabel('Szukaj w historii treningów')
expect(await search.evaluate((element) => (
  getComputedStyle(element, '::-webkit-search-cancel-button').webkitAppearance
))).toBe('none')
```

- [x] **Step 2: Uruchomić kontrakt i potwierdzić porażkę**

Run:

```bash
npx playwright test tests/e2e/mobile-ergonomics.spec.ts --project=mobile --grep "route filter targets"
```

Expected: FAIL dla kursora, `transition-property: all` lub native cancel appearance.

- [x] **Step 3: Dodać minimalny CSS i usunąć `transition-all`**

W bazowej sekcji CSS:

```css
button:not(:disabled),
[role='button']:not([aria-disabled='true']) {
  cursor: pointer;
}

.history-search-input::-webkit-search-cancel-button {
  appearance: none;
  -webkit-appearance: none;
}
```

W `ExercisesPage.tsx` zamienić tylko `transition-all` na `transition-colors`.

- [x] **Step 4: Uruchomić kontrakt E2E**

Run: komenda ze Step 2.

Expected: PASS; focus i hit area pozostają bez zmian.

### Task 4: Jeden zestaw liczników i zakotwiczone akcje planu

**Files:**
- Modify: `src/pages/TemplateEditorPage.tsx`
- Modify: `src/index.css`
- Modify: `src/pages/__tests__/TemplateEditorAccessibility.test.tsx`
- Modify: `tests/e2e/templates.visual.spec.ts`

**Interfaces:**
- Consumes: istniejące `polishPlural`, `.template-editor-main`, desktop summary i responsive breakpoint 1280 px.
- Produces: `1 dzień`, header stats na mobile/tablet, summary stats na desktopie oraz action footer wewnątrz głównej kolumny.

- [x] **Step 1: Dodać unit i runtime regressions**

W teście komponentu:

```tsx
expect(screen.getByLabelText('Podsumowanie edytowanego planu')).toHaveTextContent('1dzień')
expect(document.querySelector('.template-editor-main')).toContainElement(
  screen.getByRole('button', { name: 'Zapisz szablon w formularzu' }),
)
```

W `new template editor empty state` dla desktopu oczekiwać ukrytych `.template-editor-heading .planner-mini-stats`, widocznego `.template-editor-summary` oraz potomka `.template-editor-main .template-editor-bottom-actions`. Na mobile oczekiwać odwrotnej widoczności liczników.

- [x] **Step 2: Uruchomić testy i potwierdzić porażkę**

Run:

```bash
npx vitest run src/pages/__tests__/TemplateEditorAccessibility.test.tsx
npx playwright test tests/e2e/templates.visual.spec.ts --project=desktop --project=mobile --grep "new template editor"
```

Expected: FAIL dla `1 dni`, położenia footer i zduplikowanych desktop stats.

- [x] **Step 3: Użyć istniejącego plural helpera i przenieść footer**

W headerze:

```tsx
{polishPlural(days.length, 'dzień', 'dni', 'dni')}
```

Przenieść istniejący `.template-editor-bottom-actions` na koniec `.template-editor-main`; nie duplikować przycisków. W `@media (min-width: 1280px)` dodać:

```css
.template-editor-heading .planner-mini-stats {
  display: none;
}
```

- [x] **Step 4: Uruchomić unit i E2E**

Run: komendy ze Step 2.

Expected: PASS na obu breakpointach.

### Task 5: Rekordy bez dekoracyjnego badge’a `PR`

**Files:**
- Modify: `src/pages/ProgressPage.tsx`
- Modify: `src/index.css`
- Modify: `src/pages/__tests__/ProgressPage.test.tsx`
- Modify: `tests/e2e/progress.spec.ts`

**Interfaces:**
- Consumes: kolekcję all-time `records` i istniejący podział featured/ledger.
- Produces: te same rekordy bez powtarzanego badge’a oraz dwukolumnowy ledger.

- [x] **Step 1: Dodać regresję semantyczną i layoutową**

W unit teście rekordów:

```tsx
expect(screen.queryByText('PR', { exact: true })).not.toBeInTheDocument()
```

W E2E po znalezieniu `.progress-records`:

```ts
await expect(records.getByText('PR', { exact: true })).toHaveCount(0)
```

- [x] **Step 2: Uruchomić testy i potwierdzić porażkę**

Run:

```bash
npx vitest run src/pages/__tests__/ProgressPage.test.tsx
npx playwright test tests/e2e/progress.spec.ts --project=desktop --project=mobile --grep "records readable"
```

Expected: FAIL, bo każda pozycja ma `PR`.

- [x] **Step 3: Usunąć dwa spany i martwy CSS**

Usunąć `.progress-record-rank` z featured i ledger. Zmienić ledger na:

```css
.progress-record-ledger-head,
.progress-record-ledger-row {
  grid-template-columns: minmax(0, 1fr) minmax(5.8rem, auto);
}

.progress-record-ledger-head span:first-child {
  grid-column: 1;
}
```

W mobile override ustawić dokładnie:

```css
.progress-record-ledger-row {
  grid-template-columns: minmax(0, 1fr) minmax(5.4rem, auto);
}
```

Skasować wszystkie nieużywane reguły `.progress-record-rank`.

- [x] **Step 4: Uruchomić unit i E2E**

Run: komendy ze Step 2.

Expected: PASS; rekordy nie przepełniają viewportu.

### Task 6: Assurance i closeout dziecka

**Files:**
- Modify: `output/plans/2026-08-14-ui-quality-roadmap.md`
- Modify: `output/plans/2026-08-16-ui-quality-phase-2-implementation.md`

**Interfaces:**
- Consumes: wyniki Tasks 1–5.
- Produces: fresh gate i kwalifikowany receipt wizualny; nie zamyka etapów 3–5.

- [x] **Step 1: Targetowane testy**

Run:

```bash
npx vitest run src/pages/__tests__/AuthPageContracts.test.tsx src/pages/__tests__/DashboardProjectionStatus.test.tsx src/pages/__tests__/ExerciseDetailCatalogState.test.tsx src/pages/__tests__/HistoryPage.test.tsx src/pages/__tests__/TemplateEditorAccessibility.test.tsx src/pages/__tests__/ProgressPage.test.tsx
```

Run:

```bash
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e \
firebase emulators:exec --only auth,firestore --project demo-ironlog \
"npx playwright test tests/e2e/mobile-ergonomics.spec.ts tests/e2e/templates.visual.spec.ts tests/e2e/progress.spec.ts --project=desktop --project=mobile"
```

- [x] **Step 2: Pełne gate’y**

Run:

```bash
npm run lint
NODE_OPTIONS=--no-experimental-webstorage npm run test:unit
npm run build
```

- [x] **Step 3: Bezpośrednia obserwacja serialna**

Po ostatniej zmianie obejrzeć w jednym świeżym runtime:

1. login invalid credentials — jeden alert przy polu i widoczny invalid state;
2. dashboard z historią, ale pustym tygodniem — week-scoped copy;
3. detail ćwiczenia z 10/14 sesji — jawnie różne zakresy;
4. Historia — jedna kontrolka clear;
5. template editor desktop/mobile — jeden widoczny zestaw liczników i zakotwiczony save;
6. Postępy — brak badge’y `PR`, czytelny dwukolumnowy ledger.

Receipt `Observed` wymaga ukończonych wywołań primary surface; w przeciwnym razie zapisać `Pending` z konkretną przyczyną.

- [x] **Step 4: Zamknąć tylko etap 2 po integracji**

Etapy 3–5 oraz decyzje B-02, M-05, M-07 i M-14 pozostają otwarte. Następny etap to etap 3, ale wymaga decyzji o modelu wykresu progresji.

## Self-review planu

- Spec coverage: M-01, M-03, M-15, M-18, P-02, P-03, P-05, P-06, P-07 i Codex `transition-all` mają task oraz test/gate.
- Scope correction: P-05 jest redundancją badge’a na liście rekordów, nie brakiem danych o historycznym ustanowieniu PR; plan usuwa dekorację bez rozszerzania modelu.
- Kontrola kompletności: każdy krok wskazuje konkretny plik, zmianę i oczekiwany wynik.
- Type consistency: wykorzystane są istniejące `Input.error`, `polishPlural`, `workouts`, `sessions` i `record.totalSessions`.
- Scope control: zero nowych zależności, helperów, tokenów, zapytań i kontraktów danych.

## Execution receipt — 2026-08-16

- Implementacja Tasks 1–5: ukończona na gałęzi `ui-quality-phase-2`.
- Targetowane unit: 6 plików, 59 testów — PASS.
- Pełne gate’y: ESLint — PASS; Vitest — 73 pliki, 585 testów — PASS; build produkcyjny — PASS; `git diff --check` — PASS.
- Targetowane E2E: kontrakty mobile, template i progress przeszły funkcjonalnie na desktop/mobile. Zbiorczy przebieg miał dwa błędy infrastrukturalne: przerwany kanał emulatora Firestore przy teardown oraz jednorazowy 404 zewnętrznego fontu; font przeszedł przy osobnym powtórzeniu, a asercja rekordów przechodzi przed błędem teardown. Nie maskowano ich zmianą produktu.
- Visual evidence: Observed — surface: Codex In-app Browser; proof: ukończone zdarzenia `Oglądam rekordy w świeżym runtime`, `Oglądam finalny edytor planu`, `Oglądam mobilny edytor planu` i `Sprawdzam wyszukiwarkę historii` zwróciły finalne screenshoty oraz stany: 0 badge’y `PR`, brak poziomego overflow, desktop header stats ukryte/summary widoczne, mobile header stats widoczne/summary ukryte, action footer wewnątrz `.template-editor-main` i jedna widoczna kontrolka clear. Konsola audytowanych ścieżek: 0 warningów/errorów.
- Integracja: fast-forward do `main` w `4a9aa74`; na zintegrowanym drzewie ESLint, 585 testów unit i build produkcyjny — PASS.
- Lineage po closeoucie: `roadmapa → etapy 1–2 zintegrowane → etapy 3–5 oraz decyzje B-02, M-05, M-07, M-14 otwarte`.
