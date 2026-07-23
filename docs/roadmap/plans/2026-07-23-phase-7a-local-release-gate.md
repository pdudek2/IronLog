# Phase 7A Local Release Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** COMPLETED — VERIFIED — AWAITING INTEGRATION

**Goal:** Wykonać pełną lokalną bramkę automatyczną wydania na emulatorach, naprawić wyłącznie potwierdzone regresje i zapisać audytowalny wynik bez udawania gotowości produkcyjnej.

**Architecture:** Faza 7A używa istniejących runnerów zamiast dodawać agregator lub nowy skrypt npm. Pełny Playwright działa na produkcyjnym bundlu z egzekwowanym CSP oraz emulatorami Auth i Firestore, dzięki czemu obejmuje wszystkie 215 przypadków desktop+mobile bez sekretów i produkcyjnego quota. Wyniki trafiają do jednego raportu; roadmapa zachowuje `RELEASE-08–10` i manualny odbiór jako kolejne obowiązki.

**Tech Stack:** Vitest, Firebase Emulator Suite, Playwright, Vite preview, TypeScript, Markdown.

## Global Constraints

- Nie dodawać zależności, nowego runnera, skryptu agregującego ani workflow CI.
- Nie używać prywatnych `TEST_EMAIL`, `TEST_PASSWORD`, produkcyjnego Firebase ani produkcyjnego Vercel.
- Wszystkie mutujące testy muszą działać wyłącznie z `--project demo-ironlog` oraz emulatorami Auth i Firestore.
- Playwright ma działać z `--retries=0`; retry nie może ukrywać niestabilności bramki.
- Nie zamykać całej Fazy 7: `RELEASE-08`, `RELEASE-09`, `RELEASE-10` oraz manualny odbiór desktop/mobile pozostają poza 7A.
- Jeżeli gate ujawni błąd, najpierw użyć `superpowers:systematic-debugging`; naprawa wymaga najmniejszego testu regresyjnego i osobnego commitu.
- Push, deploy i publikacja reguł lub indeksów są poza zakresem.

---

### Task 1: Zamrożenie zakresu lokalnej bramki

**Files:**
- Create: `docs/audits/2026-07-23-phase-7a-local-release-gate.md`

**Interfaces:**
- Consumes: skrypty z `package.json`, `playwright.config.ts`, `firebase.json`
- Produces: macierz gate’ów i jawny podział `7A local` / `7B manual` / `7C production`

- [x] **Step 1: Potwierdzić stan wejściowy**

Run:

```bash
git status --short
git log --oneline --decorate -5
git worktree list
```

Expected:

- aktywna gałąź wykonawcza jest czysta;
- jedyny stan należący do użytkownika w głównym checkoutcie to `docs/audits/2026-07-14-senior-design-review.md`;
- baza wykonania wskazuje aktualny `puls-rebrand`.

- [x] **Step 2: Potwierdzić listę pełnego Playwright**

Run:

```bash
E2E_BACKEND=emulator \
TEST_EMAIL=e2e@ironlog.local \
TEST_PASSWORD=ironlog-e2e \
npx playwright test --list --project=desktop --project=mobile
```

Expected: `Total: 215 tests in 23 files`. Jeżeli liczba zmieniła się przez uzgodnioną zmianę kodu przed wykonaniem, zapisać rzeczywisty wynik i listę plików zamiast przywracać starą liczbę.

- [x] **Step 3: Utworzyć raport z zamkniętym szablonem**

Utworzyć:

```markdown
# Phase 7A — Local release gate

**Status:** IN PROGRESS
**Data:** 2026-07-23
**Commit bazowy:** `55eda97f9b371118b6da05260e7c6fb17c0f4c66`

## Zakres

7A obejmuje automatyczne gate'y lokalne na emulatorach. Nie obejmuje manualnego odbioru desktop/mobile, prywatnego live E2E, pushu, deployu, publikacji reguł i indeksów, produkcyjnego CSP ani produkcyjnego pomiaru dashboardu.

## Środowisko

- Node: `v22.23.1`
- npm: `10.9.8`
- Firebase CLI: `15.15.0`
- Playwright: `1.59.1`
- Backend: Auth + Firestore emulators, projekt `demo-ironlog`
- Retry: `0`

## Macierz wyników

| Gate | Wynik | Liczba | Uwagi |
| --- | --- | ---: | --- |
| Unit | PENDING | — | `npm run test:unit` |
| Lint | PENDING | — | `npm run lint` |
| Build | PENDING | — | `npm run build` |
| Firestore Rules | PENDING | — | `npm run test:rules` |
| Workout integration | PENDING | — | `npm run test:integration:workout` |
| Full Playwright desktop+mobile | PENDING | 215 listed | emulatory + preview + CSP |

## Znaleziska i poprawki

Brak wpisów przed wykonaniem gate'ów.

## Pozostałe obowiązki

- 7B: manualny smoke, klawiatura, accessibility snapshot i zgodność demo/dokumentacji;
- `RELEASE-08`: live E2E, deploy i publikacja produkcyjnych reguł po osobnej zgodzie;
- `RELEASE-09`: produkcyjna obserwacja CSP i requestów;
- `RELEASE-10`: powtarzalny pomiar zimnego dashboardu.

## Wniosek

PENDING
```

- [x] **Step 4: Commit**

```bash
git add docs/audits/2026-07-23-phase-7a-local-release-gate.md
git commit -m "docs: start phase 7a local release gate"
```

### Task 2: Statyczne, jednostkowe i emulatorowe gate’y

**Files:**
- Modify: `docs/audits/2026-07-23-phase-7a-local-release-gate.md`
- Modify/Test only if a failure proves a regression: exact file named by the failing stack trace

**Interfaces:**
- Consumes: istniejące skrypty `test:unit`, `lint`, `build`, `test:rules`, `test:integration:workout`
- Produces: pięć świeżych wyników z kodami wyjścia i licznikami

- [x] **Step 1: Uruchomić unit**

Run:

```bash
npm run test:unit
```

Expected: 59 plików i 468 testów PASS. Zapisać rzeczywisty licznik, jeżeli uzgodniona poprawka doda test.

- [x] **Step 2: Uruchomić lint**

Run:

```bash
npm run lint
```

Expected: exit `0`, bez błędów ESLint.

- [x] **Step 3: Uruchomić build**

Run:

```bash
npm run build
```

Expected: exit `0`; zapisać liczbę transformowanych modułów i każde ostrzeżenie. Sam rozmiar chunku nie jest powodem do optymalizacji bez pomiaru zgodnie z `RELEASE-06`.

- [x] **Step 4: Uruchomić Firestore Rules**

Run:

```bash
npm run test:rules
```

Expected: wszystkie testy `tests/rules/firestore.rules.test.ts` PASS na emulatorze `demo-ironlog`.

- [x] **Step 5: Uruchomić integrację workoutu**

Run:

```bash
npm run test:integration:workout
```

Expected: wszystkie testy integracyjne materializacji workoutu PASS na emulatorze Firestore.

- [x] **Step 6: Obsłużyć wyłącznie potwierdzone błędy**

Jeżeli którykolwiek gate nie przejdzie:

1. zatrzymać wykonywanie kolejnych gate’ów;
2. zapisać komendę, test i pełny komunikat w `Znaleziska i poprawki`;
3. uruchomić `superpowers:systematic-debugging`;
4. po ustaleniu root cause dodać najmniejszy test regresyjny;
5. naprawić jedną przyczynę i ponowić focused test oraz cały gate;
6. zapisać osobny commit `fix: <konkretna przyczyna>`.

Nie dodawać retry, timeoutu ani wyjątku tylko po to, by ukryć nieustaloną przyczynę.

- [x] **Step 7: Uzupełnić macierz i commit**

W raporcie zastąpić `PENDING` wynikami, licznikami i krótkimi uwagami dla pięciu gate’ów.

```bash
git add docs/audits/2026-07-23-phase-7a-local-release-gate.md
git commit -m "docs: record phase 7a core gates"
```

### Task 3: Pełny Playwright na emulatorach i egzekwowanym CSP

**Files:**
- Modify: `docs/audits/2026-07-23-phase-7a-local-release-gate.md`
- Modify/Test only if a failure proves a regression: exact file named by Playwright diagnostics

**Interfaces:**
- Consumes: 215 przypadków z 23 plików, projekty `desktop` i `mobile`
- Produces: jeden wynik pełnego lokalnego E2E bez retry, produkcyjnego quota i sekretów

- [x] **Step 1: Uruchomić pełny suite**

Run:

```bash
E2E_BACKEND=emulator \
E2E_CSP=true \
TEST_EMAIL=e2e@ironlog.local \
TEST_PASSWORD=ironlog-e2e \
firebase emulators:exec \
  --only auth,firestore \
  --project demo-ironlog \
  "npx playwright test --project=desktop --project=mobile --retries=0"
```

Expected:

- wszystkie niewyłączone testy PASS;
- skipy wynikają wyłącznie z jawnych kontraktów desktop/mobile lub braku danych testowych;
- brak nieoczekiwanych `console`, `pageerror` i `requestfailed`, ponieważ wspólne fixtures traktują je jako blocking diagnostics;
- brak prawdziwych requestów do Anthropic i produkcyjnego Firebase;
- CSP jest obecny na odpowiedziach dokumentów.

- [x] **Step 2: Zweryfikować wynik zamiast ufać samemu exit code**

W outputcie i raporcie zapisać:

- liczbę passed, skipped i failed;
- czas wykonania;
- listę skipów innych niż jawne `desktop-only`, `mobile-only` i `No workout rows available`;
- listę retry — oczekiwana wartość `0`;
- informację, czy powstały trace, screenshot lub video z failure.

Jeżeli wynik zawiera failure, zastosować dokładnie procedurę z Task 2 Step 6 i nie oznaczać 7A jako ukończonej.

- [x] **Step 3: Uzupełnić raport i commit**

W wierszu `Full Playwright desktop+mobile` zapisać wynik i liczniki. W sekcji `Wniosek` ustawić:

```markdown
PASS — lokalna automatyczna bramka 7A jest zielona. Nie stanowi dowodu gotowości produkcyjnej; 7B oraz RELEASE-08–10 pozostają otwarte.
```

```bash
git add docs/audits/2026-07-23-phase-7a-local-release-gate.md
git commit -m "docs: record phase 7a full e2e gate"
```

### Task 4: Focused review, lifecycle i integracja

**Files:**
- Modify: `docs/roadmap/ROADMAP.md`
- Modify: `docs/roadmap/plans/2026-07-23-phase-7a-local-release-gate.md`
- Modify: `docs/audits/2026-07-23-phase-7a-local-release-gate.md`

**Interfaces:**
- Consumes: komplet świeżych wyników z Task 2–3
- Produces: status `7A DONE`, zachowane obowiązki 7B i `RELEASE-08–10`

- [x] **Step 1: Wykonać focused review**

Sprawdzić:

- każdy wynik w raporcie ma odpowiadającą komendę i świeży output;
- żaden test nie użył produkcyjnego projektu, prywatnych sekretów ani retry;
- skipy nie ukrywają głównego przepływu;
- każda poprawka znaleziona przez gate ma test regresyjny i osobny commit;
- raport nie nazywa lokalnego wyniku produkcyjną gotowością;
- nie zamknięto 7B ani `RELEASE-08–10`.

- [x] **Step 2: Uruchomić końcowy diff check**

Run:

```bash
git diff --check
git status --short
```

Expected: diff check PASS; brak nieoczekiwanych plików. Raport użytkownika `docs/audits/2026-07-14-senior-design-review.md` pozostaje nietknięty.

- [x] **Step 3: Zaktualizować lifecycle**

W planie ustawić:

```markdown
**Status:** COMPLETED — VERIFIED — AWAITING INTEGRATION
```

W roadmapie pod `### Faza 7 — Bramka release` dodać:

```markdown
**Status: PHASE 7A COMPLETED — VERIFIED — AWAITING INTEGRATION.** Lokalna bramka automatyczna obejmuje unit, lint, build, Firestore Rules, integrację workoutu oraz pełny Playwright desktop+mobile na emulatorach i egzekwowanym CSP. Manualny odbiór 7B oraz `RELEASE-08–10` pozostają otwarte. Dowody: [`../audits/2026-07-23-phase-7a-local-release-gate.md`](../audits/2026-07-23-phase-7a-local-release-gate.md).
```

- [x] **Step 4: Commit**

```bash
git add docs/roadmap/ROADMAP.md docs/roadmap/plans/2026-07-23-phase-7a-local-release-gate.md docs/audits/2026-07-23-phase-7a-local-release-gate.md
git commit -m "docs: close phase 7a local release gate"
```

## Execution

Plan jest przeznaczony do wykonania inline. Większość pracy to sekwencyjna obserwacja jednego współdzielonego środowiska emulatorów, więc podział między agentów nie skróci krytycznej ścieżki i utrudni przypisanie awarii do konkretnego gate’u.
