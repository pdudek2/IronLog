# UI Quality Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Usunąć potwierdzone blokery aktywnego treningu i mobilnego edytora planu bez zmiany lifecycle danych ani nierozstrzygniętego zachowania „Anuluj”.

**Architecture:** Zmiany pozostają w istniejących komponentach i CSS: desktopowy ledger dostaje ograniczone kolumny i widoczne inputy, zakończone ćwiczenie filtruje istniejącą sugestię progresji, a mobilny edytor nie renderuje stałego docka dla czystego, zapisanego stanu. Nie powstaje nowa warstwa, zależność ani kontrakt danych.

**Tech Stack:** React 19, TypeScript, CSS, Vitest + Testing Library, Playwright.

**Spec:** [kanoniczna roadmapa](./2026-08-14-ui-quality-roadmap.md), etap 1.

**Status:** ukończony; implementacja zintegrowana lokalnie do `main` w `f3aba48`, assurance ponowione na wyniku merge.

## Global Constraints

- Scope lineage: `roadmapa UI quality → etap 1 → etapy 2–5 i decyzje produktowe pozostają otwarte`.
- Nie zmieniać położenia ani confirmation flow „Anuluj”; B-02 pozostaje decyzją produktową.
- Nie zmieniać Firestore, `exerciseSource`, finalize/discard ani modelu aktywnej sesji.
- Zachować minimum 44×44 px dla kontrolek serii i istniejący focus ring.
- Zachować płaski mobilny ledger; nowe bounded input wells dotyczą breakpointu desktopowego.
- Nie dodawać zależności, feature flag, compatibility layer ani nowego design systemu.
- Nie commitować i nie pushować bez osobnego polecenia użytkownika.
- Primary visual surface: Browser control w świeżym lokalnym runtime; Playwright służy do kontraktów automatycznych.

## File map

- `src/pages/WorkoutPage.tsx` — usunięcie lokalnej kopii globalnej nawigacji.
- `src/components/workout/WorkoutExerciseLedgerItem.tsx` — ukrycie sugestii po ukończeniu ćwiczenia.
- `src/components/TemplateSaveDock.tsx` — brak aktywnego docka dla stanu `persisted-clean`.
- `src/index.css` — desktopowe proporcje i resting state pól.
- `src/components/__tests__/WorkoutExerciseLedgerItem.test.tsx` — regresja ukończonego ćwiczenia.
- `src/components/__tests__/TemplateSaveDock.test.tsx` — regresja pasywnego persisted state.
- `src/pages/__tests__/TemplateEditorAccessibility.test.tsx` — kontrakt załadowanego, czystego edytora.
- `tests/e2e/workout-mobile.spec.ts` — runtime geometry desktopowego ledgera i brak zduplikowanej nawigacji.

---

### Task 1: Desktopowy aktywny trening

**Files:**
- Modify: `tests/e2e/workout-mobile.spec.ts`
- Modify: `src/pages/WorkoutPage.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: istniejące `.workout-set-header`, `.workout-set-grid`, `.workout-set-input` i globalny `TopNav`.
- Produces: desktopowe pola o szerokości maksymalnie `9rem`, widocznym resting state oraz jeden globalny system nawigacji.

- [x] **Step 1: Rozszerzyć istniejący desktopowy test runtime**

W teście `desktop workout keeps shell chrome visible...` dodać przed wpisaniem serii:

```ts
await expect(page.getByText('Szybki podgląd', { exact: true })).toHaveCount(0)

const fieldContract = await firstSetRow.locator('.workout-set-input').evaluateAll((inputs) => (
  inputs.map((input) => {
    const box = input.getBoundingClientRect()
    const style = getComputedStyle(input)
    return {
      width: box.width,
      background: style.backgroundColor,
      border: style.borderTopWidth,
      borderColor: style.borderTopColor,
      radius: style.borderTopLeftRadius,
    }
  })
))

expect(fieldContract).toHaveLength(2)
for (const field of fieldContract) {
  expect(field.width).toBeLessThanOrEqual(144)
  expect(field.background).not.toBe('rgba(0, 0, 0, 0)')
  expect(field.border).toBe('1px')
  expect(field.borderColor).not.toBe('rgba(0, 0, 0, 0)')
  expect(field.radius).not.toBe('0px')
}
```

- [x] **Step 2: Uruchomić test i potwierdzić porażkę**

Run:

```bash
npx playwright test tests/e2e/workout-mobile.spec.ts --project=desktop --grep "desktop workout keeps shell chrome"
```

Expected: FAIL, bo `Szybki podgląd` istnieje, pola mają około 433 px i transparentny resting state.

- [x] **Step 3: Usunąć lokalną kopię nawigacji**

Z `WorkoutPage.tsx` usunąć `SESSION_QUICK_LINKS`, `SessionQuickLinks`, `goQuick`, ich jedyne wywołanie oraz osierocone importy ikon, `navigateWithAppTransition` i `preloadRouteByPath`. Nie zastępować ich nowym modułem.

- [x] **Step 4: Ograniczyć desktopowe kolumny i przywrócić resting state**

W istniejącym `@media (min-width: 1024px)` dodać:

```css
.workout-focus-shell .workout-set-header,
.workout-focus-shell .workout-set-grid {
  grid-template-columns: 2.75rem minmax(7rem, 9rem) minmax(7rem, 9rem) 4.5rem 2.75rem;
  justify-content: center;
}

.workout-focus-shell .workout-set-input {
  border: 1px solid color-mix(in srgb, var(--exercise-accent, var(--accent)) 24%, var(--border));
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--surface-2) 72%, transparent);
}
```

Pozostawić mobilny kontrakt pól bez zmian i zachować istniejący `:focus-visible`.

- [x] **Step 5: Uruchomić desktopowy i mobilny kontrakt treningu**

Run:

```bash
npx playwright test tests/e2e/workout-mobile.spec.ts --project=desktop --grep "desktop workout keeps shell chrome"
npx playwright test tests/e2e/workout-mobile.spec.ts --project=mobile --grep "steppers only"
```

Expected: PASS; desktop ma bounded fields, a mobile zachowuje transparentny płaski ledger.

### Task 2: Sugestia progresji po ukończeniu ćwiczenia

**Files:**
- Modify: `src/components/__tests__/WorkoutExerciseLedgerItem.test.tsx`
- Modify: `src/components/workout/WorkoutExerciseLedgerItem.tsx`

**Interfaces:**
- Consumes: `exerciseCompleted`, `exercise.sets.length` i istniejący `OverloadSuggestion`.
- Produces: hint widoczny tylko dla nieukończonego ćwiczenia; reguła `buildOverloadSuggestion` pozostaje bez zmian.

- [x] **Step 1: Dodać test regresyjny**

Utworzyć sugestię:

```ts
const suggestion = {
  suggestedWeight: 57.5,
  delta: -2.5,
  reason: 'deload_gap' as const,
  lastWeight: 60,
  basedOnSessions: 3,
}
```

Najpierw wyrenderować istniejący nieukończony set i potwierdzić widoczność tekstu `Deload — długa przerwa`. Następnie ustawić ten sam set jako `done: true`, przerenderować komponent i oczekiwać braku tekstu.

- [x] **Step 2: Uruchomić test i potwierdzić porażkę**

Run:

```bash
npx vitest run src/components/__tests__/WorkoutExerciseLedgerItem.test.tsx
```

Expected: FAIL w części dotyczącej ukończonego ćwiczenia.

- [x] **Step 3: Dodać jeden guard w komponencie**

Po obliczeniu `exerciseCompleted` dodać:

```ts
const exerciseComplete = exercise.sets.length > 0
  && exerciseCompleted === exercise.sets.length
```

Warunek renderowania zmienić na:

```tsx
{suggestion && !hintDismissed && !exerciseComplete && (
  <OverloadHint ... />
)}
```

- [x] **Step 4: Uruchomić test komponentu**

Run:

```bash
npx vitest run src/components/__tests__/WorkoutExerciseLedgerItem.test.tsx
```

Expected: PASS.

### Task 3: Mobilny dock zapisu edytora planu

**Files:**
- Modify: `src/components/__tests__/TemplateSaveDock.test.tsx`
- Modify: `src/pages/__tests__/TemplateEditorAccessibility.test.tsx`
- Modify: `src/components/TemplateSaveDock.tsx`

**Interfaces:**
- Consumes: istniejący `TemplateSaveState`.
- Produces: brak fixed docka dla `persisted-clean`; dirty, saving i error pozostają bez zmian.

**Evidence update:** bezpośredni pomiar 393×844 przed implementacją potwierdził, że końcową akcję można już przewinąć nad dock, więc brak scroll clearance nie jest bugiem. Screenshot blokera pokazuje dock `Zapisano` pośrodku zapisanych ćwiczeń; przyczyną jest renderowanie aktywnej fixed powierzchni dla pasywnego `persisted-clean`. Plan nie dodaje paddingu ani nowej zmiennej CSS.

- [x] **Step 1: Zmienić oczekiwania persisted state**

W `TemplateSaveDock.test.tsx` oczekiwać:

```ts
expect(screen.queryByTestId('template-save-dock')).not.toBeInTheDocument()
expect(screen.queryByRole('button', { name: 'Zapisano' })).not.toBeInTheDocument()
```

W `TemplateEditorAccessibility.test.tsx` zachować sprawdzenie braku wywołania update po submit, ale zamienić oczekiwania `Wszystkie zmiany zapisane` / `Zapisano` na brak mobilnego docka. Desktopowy przycisk formularza `Zapisano w formularzu` pozostaje disabled.

- [x] **Step 2: Uruchomić testy i potwierdzić porażkę**

Run:

```bash
npx vitest run src/components/__tests__/TemplateSaveDock.test.tsx src/pages/__tests__/TemplateEditorAccessibility.test.tsx
```

Expected: oba testy persisted state FAIL na obecnej implementacji.

- [x] **Step 3: Ukryć persisted dock**

W `TemplateSaveDock` zwrócić `null` dla `state === 'persisted-clean'`, usunąć nieużywaną ikonę `Check` i gałąź labelu `Zapisano`:

```ts
if (state === 'persisted-clean') return null
```

- [x] **Step 4: Uruchomić testy docka i istniejącej ergonomii**

Run:

```bash
npx vitest run src/components/__tests__/TemplateSaveDock.test.tsx src/pages/__tests__/TemplateEditorAccessibility.test.tsx
npx playwright test tests/e2e/mobile-ergonomics.spec.ts --project=mobile
```

Expected: PASS przy 320/375/390/393 px, 150% tekstu i ograniczonym visual viewport.

### Task 4: Assurance i observation gate

**Files:**
- Modify: `output/plans/2026-08-14-ui-quality-roadmap.md` — tylko status etapu po zamknięciu.
- Modify: `output/plans/2026-08-14-ui-quality-phase-1-implementation.md` — checkboxy i receipt.

**Interfaces:**
- Consumes: wynik Tasks 1–3.
- Produces: świeże dowody testowe i jeden kwalifikowany receipt wizualny; nie zamyka etapów 2–5.

- [x] **Step 1: Targetowane testy**

Run:

```bash
npx vitest run src/components/__tests__/WorkoutExerciseLedgerItem.test.tsx src/components/__tests__/TemplateSaveDock.test.tsx src/pages/__tests__/TemplateEditorAccessibility.test.tsx
npx playwright test tests/e2e/workout-mobile.spec.ts tests/e2e/mobile-ergonomics.spec.ts --project=desktop --project=mobile
```

- [x] **Step 2: Pełne statyczne gate’y**

Run:

```bash
npm run lint
npm run test:unit
npm run build
```

- [x] **Step 3: Świeży runtime**

Uruchomić istniejący lokalny stack zgodnie z repozytorium. Nie używać produkcyjnych danych; przygotować aktywną sesję i duży draft przez dostępny tryb testowy/emulator.

- [x] **Step 4: Bezpośrednia obserwacja serialna**

W Browser control obejrzeć po ostatniej zmianie:

1. `/workout/new` na 1440 px — bounded, widoczne inputy i brak „Szybki podgląd”;
2. `/templates/new` na 393 px — ostatnia akcja nad dockiem;
3. załadowany czysty template na mobile — brak aktywnego „Zapisano” overlayu.

Receipt ma mieć stan `Observed` wyłącznie wtedy, gdy ukończone wywołanie surface zwróci finalny widoczny stan. W przeciwnym razie raportować `Pending` z konkretną przyczyną.

- [x] **Step 5: Zamknąć tylko etap 1**

Po wszystkich gate’ach oznaczyć etap 1 jako ukończony w roadmapie i zapisać dowody. Etapy 2–5 oraz decyzje B-02, M-05, M-07 i M-14 pozostają otwarte.

## Execution receipt

- Zmiana produkcyjna: desktopowy ledger ma ograniczone, widoczne pola; usunięto `SESSION_QUICK_LINKS`; sugestia deloadu znika po ukończeniu ćwiczenia; `TemplateSaveDock` nie renderuje stanu `persisted-clean`.
- Korekta diagnozy: świeży pomiar 393×844 wykazał wystarczający scroll clearance dirty-state. Nie dodano paddingu, obsługi `VisualViewport` ani nowej zmiennej CSS.
- Targetowane unit: 3 pliki, 20 testów — PASS.
- Targetowane E2E na desktop i mobile: 16 PASS, 15 poprawnych breakpoint skips — PASS.
- Świeży gate gałęzi: `test:unit` 73/73 plików i 580/580 testów — PASS; `lint` — PASS; `build` — PASS.
- Visual evidence: **Observed** — Codex In-app Browser, świeży runtime emulatora. Desktop 1440: dwa pola 144×43 px z widocznym tłem, obramowaniem i promieniem oraz `observedQuickLinks=0`. Mobile 393: zapisany edytor miał `observedCleanDockCount=0` i `observedSavedButtonCount=0`. Aktywny Squat: `hintBefore=1`, po ukończeniu `hintAfter=0`. Konsola: 0 błędów i ostrzeżeń.
- Nie zmieniono lifecycle treningu, Firestore, `exerciseSource`, finalize/discard ani zachowania „Anuluj”.
- Integracja: commit `f3aba48` został scalony fast-forwardem do lokalnego `main`; gałąź i phase-owned worktree usunięto po zielonym gate.
- Pozostały zakres właściciela nadrzędnego: etapy 2–5 oraz decyzje B-02, M-05, M-07 i M-14.

## Self-review planu

- Spec coverage: B-01, mobile editor blocker, M-09 i M-10 mają task oraz test; B-02 jest jawnie wyłączone jako nierozstrzygnięte.
- Placeholder scan: brak `TBD`, `TODO`, „similar to” i nieokreślonych testów.
- Type consistency: plan używa istniejących `TemplateSaveState`, `OverloadSuggestion` i klas CSS; nie wprowadza nowego publicznego API.
- Scope control: cztery pliki produkcyjne, istniejące testy, zero nowych zależności i zero zmian danych.
- Named risk closed: testy geometryczne chronią dwa potwierdzone visual blockers; unit guard chroni błędny stan advice; pełny build i bezpośrednia obserwacja zamykają integrację.
