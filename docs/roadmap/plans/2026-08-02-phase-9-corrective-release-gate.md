# Phase 9 Corrective Release Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zweryfikować cały zakres korekcyjny 8A–8D na jednym kandydacie wydania i dostarczyć audytowalne dowody przed jakimkolwiek pushem, mergem lub deployem.

**Status:** VERIFIED — INTEGRATION PENDING

**Architecture:** Faza używa wyłącznie istniejących runnerów: Vitest, Firebase Emulator Suite, Playwright, Vite i Vercel CLI. Gate'y działają sekwencyjnie na jednym izolowanym worktree; każdy failure zatrzymuje dalszą ścieżkę, a potwierdzona regresja otrzymuje najmniejszy test i osobny commit. Wyniki trafiają do jednego raportu, natomiast zewnętrzna integracja i deploy pozostają osobnym punktem zgody.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, Vitest 4, Firebase Emulator Suite 15, Playwright 1.59, Vercel CLI 51.

## Global Constraints

- Zakres obejmuje wyłącznie `CORRECTIVE-RELEASE-01–05` z aktywnej roadmapy.
- Używać jednego izolowanego worktree i wykonywać gate'y sekwencyjnie; współdzielone emulatory i obserwacja przeglądarkowa nie mogą działać równolegle.
- Nie dodawać zależności, agregatora testów, nowego skryptu npm, workflow CI ani nowego harnessu.
- Wszystkie mutujące testy muszą używać wyłącznie Auth + Firestore emulatorów oraz projektu `demo-ironlog`.
- Nie używać produkcyjnego Firebase, Anthropic ani prywatnego konta użytkownika do lokalnych gate'ów.
- Pełny Playwright musi działać z `--retries=0`; retry, zwiększenie timeoutu lub nowy skip nie może ukrywać nieustalonej awarii.
- Jeżeli gate ujawni błąd, zatrzymać wykonanie i użyć `superpowers:systematic-debugging`; naprawić wyłącznie potwierdzoną przyczynę, dodać najmniejszy test regresyjny i osobny commit.
- Lokalny `vercel build --prod --yes` może pobrać ustawienia projektu do ignorowanego `.vercel/`, ale nie wolno drukować wartości środowiskowych ani wykonywać deployu.
- Jeżeli diagnostyka `Object.hasOwn` odtworzy się w `vercel build`, zatrzymać Fazę 9 i obsłużyć ją jako osobny mały fix przed wznowieniem gate'u.
- Nie stage'ować `AGENTS.md`, `.impeccable/`, `output/`, `docs/audits/2026-07-14-senior-design-review.md`, `.vercel/`, `dist/`, `playwright-report/`, `test-results/` ani `tests/e2e/.auth/`.
- Push, merge, deploy Vercela oraz publikacja Firestore Rules lub indeksów wymagają osobnej, jawnej zgody użytkownika.
- Bez zgody zewnętrznej Faza 9 może dojść najwyżej do `VERIFIED — INTEGRATION PENDING`.

---

## File Structure

### Created during execution

- `docs/audits/2026-08-02-phase-9-corrective-release-gate.md` — jedno źródło wyników, znalezisk, dowodów wizualnych i decyzji rollback.

### Modified during execution

- `docs/roadmap/ROADMAP.md` — lifecycle Fazy 9 i końcowa archiwizacja aktywnej roadmapy dopiero po pełnym closeoucie.
- `docs/roadmap/plans/2026-08-02-phase-9-corrective-release-gate.md` — checklisty oraz dowody wykonania.

### Modified only after a proven regression

- Dokładny plik aplikacji wskazany przez ustalony root cause.
- Najmniejszy istniejący plik testowy pokrywający tę samą granicę.

### Deliberately unchanged

- `package.json`, `package-lock.json`, `playwright.config.ts`, `firebase.json`, konfiguracje Vitest i workflow CI — istniejące runnery wystarczają.
- Produkcyjne środowiska Vercela i Firebase — lokalna bramka ich nie mutuje.
- Lokalne pliki użytkownika wymienione w Global Constraints.

---

## Task 1: Zamrozić kandydata i otworzyć raport

**Files:**

- Create: `docs/audits/2026-08-02-phase-9-corrective-release-gate.md`
- Modify: `docs/roadmap/ROADMAP.md`

**Interfaces:**

- Consumes: zintegrowane Fazy 8A–8D oraz aktualny commit startowy worktree.
- Produces: nieruchomy SHA kandydata, wersje narzędzi, lista E2E i macierz gate'ów.

- [x] **Step 1: Potwierdzić lineage i czystość wykonawczego worktree**

Run:

```bash
git status --short --branch
git rev-parse HEAD
git log --oneline --decorate -7
git worktree list
```

Expected:

- wykonawczy worktree jest na osobnej nazwanej gałęzi utworzonej z aktualnego `main`;
- nie zawiera zmian ani nieśledzonych plików użytkownika;
- roadmapa pokazuje 8A–8D jako `DONE`, a Fazę 9 jako `PLANNED`.

- [x] **Step 2: Zapisać wersje środowiska**

Run:

```bash
node --version
npm --version
firebase --version
vercel --version
npx playwright --version
```

Expected: wszystkie komendy kończą się kodem `0`; raport zapisuje dokładne wersje bez wartości środowiskowych.

- [x] **Step 3: Potwierdzić powierzchnię pełnego E2E**

Run:

```bash
E2E_BACKEND=emulator \
TEST_EMAIL=e2e@ironlog.local \
TEST_PASSWORD=ironlog-e2e \
npx playwright test --list --project=desktop --project=mobile
```

Expected: `Total: 217 tests in 23 files`. Jeśli zatwierdzona poprawka przed wykonaniem planu zmieni listę, zapisać rzeczywisty licznik i różnicę zamiast przywracać historyczną wartość.

- [x] **Step 4: Wykonać tani preflight `Object.hasOwn`**

Run:

```bash
node -e "if (!Object.hasOwn({ marker: true }, 'marker')) process.exit(1)"
npx vitest run api/_lib/__tests__/workoutProjectionFence.test.ts
```

Expected: natywny runtime i focused contract fence'a przechodzą. Ten krok nie zastępuje Vercel build z Task 2.

- [x] **Step 5: Utworzyć raport wejściowy**

Raport ma zawierać:

```markdown
# Phase 9 — Corrective release gate

**Status:** IN PROGRESS
**Data:** 2026-08-02

## Lineage

Program korekcyjny 8A–9 → Faza 9 → brak dalszych faz po pozytywnym closeoucie.

## Kandydat

- commit bazowy: dokładny wynik `git rev-parse HEAD`;
- branch i worktree: dokładne nazwy z Task 1;
- backend testów: Auth + Firestore emulators, `demo-ironlog`;
- Playwright retry: `0`.

## Macierz

| Gate | Status | Dowód |
| --- | --- | --- |
| Lint | PENDING | `npm run lint` |
| Unit | PENDING | `npm run test:unit` |
| Vite build | PENDING | `npm run build` |
| Vercel production build | PENDING | `vercel build --prod --yes` |
| Firestore Rules | PENDING | `npm run test:rules` |
| Workout integration | PENDING | `npm run test:integration:workout` |
| Failure injection | PENDING | workout + AI focused gates |
| Full E2E | PENDING | emulator + CSP + desktop/mobile + zero retry |
| Direct observation | PENDING | local production preview |
| Hygiene | PENDING | Git, auth state, public i dist |
| Final review / rollback | PENDING | independent review + release decision |

## Znaleziska

Brak przed wykonaniem gate'ów.
```

Wstawić rzeczywisty SHA i nazwy zamiast znaczników opisowych.

- [x] **Step 6: Ustawić Fazę 9 na `IN PROGRESS` i commit**

W roadmapie zmienić wyłącznie status Fazy 9 z `PLANNED` na `IN PROGRESS` i podlinkować raport.

```bash
git add docs/audits/2026-08-02-phase-9-corrective-release-gate.md docs/roadmap/ROADMAP.md
git commit -m "docs: start phase 9 release gate"
```

---

## Task 2: Uruchomić statyczne i emulatorowe gate'y

**Files:**

- Modify: `docs/audits/2026-08-02-phase-9-corrective-release-gate.md`
- Modify/Test only after a proven failure: exact source and test files named by diagnostics.

**Interfaces:**

- Consumes: nieruchomy kandydat z Task 1 i istniejące skrypty repo.
- Produces: świeże wyniki lint, unit, Vite/Vercel build, rules i workout integration.

- [x] **Step 1: Uruchomić lint i unit**

```bash
npm run lint
npm run test:unit
```

Expected: ESLint exit `0`; Vitest minimum 63 pliki i 484 testy PASS. Zapisać rzeczywiste liczniki.

- [x] **Step 2: Uruchomić produkcyjne buildy**

```bash
npm run build
vercel build --prod --yes
```

Expected:

- TypeScript i Vite kończą się kodem `0`;
- Vercel buduje SPA i wszystkie funkcje API dla ustawień produkcyjnych bez deployu;
- nie odtwarza się diagnostyka `Object.hasOwn`;
- `.vercel/` i `dist/` pozostają ignorowane.

Jeżeli Vercel CLI nie jest uwierzytelnione albo nie może pobrać ustawień projektu, zatrzymać gate jako `PENDING` i poprosić użytkownika o dostęp. Nie zastępować tego wyniku samym Vite buildem.

- [x] **Step 3: Uruchomić Firestore Rules**

```bash
npm run test:rules
```

Expected: wszystkie testy w `tests/rules/firestore.rules.test.ts` PASS na projekcie `demo-ironlog`; ostatni potwierdzony baseline to 1 plik i 17 testów.

- [x] **Step 4: Uruchomić integracje workoutu**

```bash
npm run test:integration:workout
```

Expected: wszystkie trzy pliki integracyjne PASS na świeżym emulatorze Firestore; ostatni potwierdzony baseline to 38 testów.

- [x] **Step 5: Sprawdzić produkcyjną konfigurację Firestore bez publikacji**

```bash
firebase deploy \
  --only firestore:rules,firestore:indexes \
  --project ironlog-ede05 \
  --dry-run
```

Expected: reguły i indeksy są przyjęte przez dry run; żadna konfiguracja nie zostaje opublikowana.

- [x] **Step 6: Obsłużyć failure bez maskowania**

Jeżeli dowolny krok Task 2 nie przejdzie:

1. przerwać dalsze gate'y;
2. zapisać komendę, kod wyjścia i pełną istotę błędu w raporcie;
3. użyć `superpowers:systematic-debugging` i ustalić root cause;
4. dodać najmniejszy test, który jest czerwony przed poprawką;
5. wdrożyć minimalną poprawkę i ponowić focused test oraz cały dotknięty gate;
6. zapisać poprawkę w osobnym commicie `fix:` nazwanym od ustalonej przyczyny; ogólny subject `fix: release gate failure` jest niedozwolony.

Nie dodawać retry, timeoutu, skipu ani fallbacku bez potwierdzonej przyczyny.

- [x] **Step 7: Uzupełnić raport i commit**

Wpisać wyniki, liczniki, ostrzeżenia i ewentualne commity naprawcze do macierzy.

```bash
git add docs/audits/2026-08-02-phase-9-corrective-release-gate.md
git commit -m "docs: record phase 9 core gates"
```

---

## Task 3: Potwierdzić deterministyczne failure injection

**Files:**

- Modify: `docs/audits/2026-08-02-phase-9-corrective-release-gate.md`
- Test only after a proven gap: existing workout or AI test file covering that boundary.

**Interfaces:**

- Consumes: serializację 8B, integralność katalogu 8C i świeże emulatory.
- Produces: jawny dowód dla race/fault workoutu oraz awarii kompletności katalogu AI.

- [x] **Step 1: Uruchomić failure injection workoutu**

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
firebase emulators:exec \
  --only firestore \
  --project demo-ironlog \
  "npx vitest run \
    --config vitest.workout-integration.config.ts \
    tests/integration/workoutClosure.integration.test.ts \
    tests/integration/workoutProjectionSerialization.integration.test.ts"
```

Expected: PASS dla utraconego acknowledgement, równoległego finish, failure materializacji, checkpointów delete oraz przeplotów update/materialize/delete.

- [x] **Step 2: Uruchomić failure injection katalogu AI**

```bash
npx vitest run \
  api/__tests__/aiChatContextIntegration.test.ts \
  src/lib/__tests__/chatService.test.ts \
  src/pages/__tests__/ChatPageAccessibility.test.tsx
```

Expected: minimum 3 pliki i 35 testów PASS, w tym:

- błąd `userExercises` zwraca retryable `503 ai_catalog_unavailable` przed wywołaniem Anthropic;
- kolizja nazw global/user nie zależy od kolejności;
- klient zachowuje komunikat i pozwala ponowić generację tym samym przyciskiem.

- [x] **Step 3: Udokumentować nazwane scenariusze**

W raporcie zapisać nie tylko exit code, ale również nazwy scenariuszy z dwóch poprzednich kroków. Brak któregoś kontraktu zatrzymuje Fazę 9 nawet wtedy, gdy pozostałe testy są zielone.

- [x] **Step 4: Commit dowodów**

```bash
git add docs/audits/2026-08-02-phase-9-corrective-release-gate.md
git commit -m "docs: record phase 9 failure gates"
```

---

## Task 4: Uruchomić pełny E2E bez retry

**Files:**

- Modify: `docs/audits/2026-08-02-phase-9-corrective-release-gate.md`
- Modify/Test only after a proven failure: exact E2E helper, spec or product file named by diagnostics.

**Interfaces:**

- Consumes: 217 pozycji w 23 plikach, Auth + Firestore emulators, lokalny API i produkcyjny preview z CSP.
- Produces: jeden pełny wynik desktop + mobile bez retry i bez produkcyjnych sekretów.

- [x] **Step 1: Usunąć wyłącznie odtwarzalny emulator auth state**

```bash
git check-ignore -v tests/e2e/.auth/emulator-user.json
rm -f tests/e2e/.auth/emulator-user.json
```

Expected: ścieżka jest ignorowana; setup utworzy nowy stan logowania na świeżych emulatorach. Nie usuwać `tests/e2e/.auth/user.json`.

- [x] **Step 2: Uruchomić pełny suite**

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

- wszystkie niewyłączone przypadki PASS;
- `failed = 0`, `retry = 0`;
- skipy wynikają wyłącznie z jawnych kontraktów viewportu lub nazwanych warunków danych;
- wspólny fixture nie raportuje nieoczekiwanych `console`, `pageerror` ani `requestfailed`;
- nie ma requestów do produkcyjnego Firebase ani Anthropic;
- dokumenty są serwowane z egzekwowanym CSP.

- [x] **Step 3: Zweryfikować wynik poza samym exit code**

Zapisać w raporcie:

- passed, skipped, failed i czas;
- wszystkie skipy inne niż jawne `desktop-only`, `mobile-only` albo nazwany brak danych;
- potwierdzenie `--retries=0`;
- listę powstałych trace, screenshotów i video albo jawne `brak`;
- klasyfikację każdego oczekiwanego offline/emulator diagnostic.

Failure uruchamia procedurę z Task 2 Step 6. Nie klasyfikować awarii jako flaky bez izolowanej reprodukcji.

- [x] **Step 4: Commit wyniku E2E**

```bash
git add docs/audits/2026-08-02-phase-9-corrective-release-gate.md
git commit -m "docs: record phase 9 full e2e"
```

---

## Task 5: Wykonać bezpośredni smoke desktop i mobile

**Files:**

- Modify: `docs/audits/2026-08-02-phase-9-corrective-release-gate.md`

**Interfaces:**

- Consumes: ten sam kandydat, lokalny produkcyjny preview i konto emulatora.
- Produces: bezpośrednią obserwację najważniejszych przepływów na jednej powierzchni przeglądarkowej.

- [x] **Step 1: Załadować kontrakt obserwacji**

Przed uruchomieniem środowiska przeczytać `project-convergence/references/visual-observation.md`, wybrać jedną podstawową powierzchnię Browser i stosować jej kontrakt `Observed`/`Pending`. Nie używać równolegle Playwrighta jako drugiej powierzchni obserwacyjnej.

- [x] **Step 2: Uruchomić emulatory**

W trwałej sesji terminala:

```bash
firebase emulators:start --only auth,firestore --project demo-ironlog
```

- [x] **Step 3: Uruchomić lokalny API z pełnym kontraktem emulatora**

W drugiej trwałej sesji:

```bash
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
GCLOUD_PROJECT=demo-ironlog \
E2E_BACKEND=emulator \
VITE_FIREBASE_API_KEY=demo-api-key \
VITE_FIREBASE_AUTH_DOMAIN=demo-ironlog.firebaseapp.com \
VITE_FIREBASE_PROJECT_ID=demo-ironlog \
VITE_FIREBASE_STORAGE_BUCKET=demo-ironlog.appspot.com \
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789 \
VITE_FIREBASE_APP_ID=1:123456789:web:demo \
VITE_FIREBASE_USE_EMULATORS=true \
npm run dev:api
```

- [x] **Step 4: Zbudować i uruchomić preview z CSP**

```bash
E2E_BACKEND=emulator \
E2E_CSP=true \
VITE_FIREBASE_API_KEY=demo-api-key \
VITE_FIREBASE_AUTH_DOMAIN=demo-ironlog.firebaseapp.com \
VITE_FIREBASE_PROJECT_ID=demo-ironlog \
VITE_FIREBASE_STORAGE_BUCKET=demo-ironlog.appspot.com \
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789 \
VITE_FIREBASE_APP_ID=1:123456789:web:demo \
VITE_FIREBASE_USE_EMULATORS=true \
npm run build

E2E_BACKEND=emulator \
E2E_CSP=true \
VITE_FIREBASE_API_KEY=demo-api-key \
VITE_FIREBASE_AUTH_DOMAIN=demo-ironlog.firebaseapp.com \
VITE_FIREBASE_PROJECT_ID=demo-ironlog \
VITE_FIREBASE_STORAGE_BUCKET=demo-ironlog.appspot.com \
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789 \
VITE_FIREBASE_APP_ID=1:123456789:web:demo \
VITE_FIREBASE_USE_EMULATORS=true \
npm run preview -- --host 127.0.0.1 --port 5174
```

- [x] **Step 5: Utworzyć lokalne konto bez drukowania tokenu**

```bash
node -e 'const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "e2e@ironlog.local", password: "ironlog-e2e", returnSecureToken: true }) }); const body = await response.json(); if (!response.ok && body.error?.message !== "EMAIL_EXISTS") throw new Error(body.error?.message ?? "Auth emulator bootstrap failed");'
```

- [x] **Step 6: Obserwować desktop `1440 × 900`**

Na `http://127.0.0.1:5174` przejść serialnie:

1. login i onboarding;
2. dashboard oraz readiness;
3. utworzenie planu i uruchomienie jego dnia;
4. zakończenie jednej sesji i odrzucenie drugiej;
5. historia i detail zapisanego treningu;
6. Progress dla 30 i 90 dni;
7. biblioteka ćwiczeń;
8. AI Coach bez klucza; retry katalogu pozostaje deterministycznym dowodem z Task 3 i pełnego E2E, bez sztucznego odtwarzania w ręcznym Browserze;
9. profil i logout.

Każdy przepływ musi osiągnąć stan gotowy bez nieoczekiwanych błędów konsoli, strony i requestów.

- [x] **Step 7: Obserwować mobile `390 × 844`**

Powtórzyć reprezentatywne stany loginu, dashboardu, planów, aktywnego workoutu z timerem, historii, Progress i AI. Potwierdzić dolną nawigację, brak poziomego overflow, dostępność głównej akcji oraz brak nakładania timerów i docków.

- [x] **Step 8: Zapisać dowód i zatrzymać procesy**

W raporcie zapisać dowód zgodnie z kontraktem obserwacji, diagnostykę runtime i cleanup danych emulatora. Następnie zatrzymać preview, API oraz emulatory i potwierdzić zwolnienie portów `5174`, `3000`, `9099` i `8080`.

```bash
git add docs/audits/2026-08-02-phase-9-corrective-release-gate.md
git commit -m "docs: record phase 9 direct smoke"
```

---

## Task 6: Higiena, final review i decyzja release

**Files:**

- Modify: `docs/audits/2026-08-02-phase-9-corrective-release-gate.md`
- Modify: `docs/roadmap/ROADMAP.md`
- Modify: `docs/roadmap/plans/2026-08-02-phase-9-corrective-release-gate.md`

**Interfaces:**

- Consumes: komplet świeżych wyników Task 1–5.
- Produces: `PASS`, `FAIL` albo `VERIFIED — INTEGRATION PENDING`, gotowy rollback i decyzję użytkownika o integracji.

- [x] **Step 1: Sprawdzić tracking wrażliwych i roboczych ścieżek**

Run:

```bash
test -z "$(git ls-files tests/e2e/.auth .playwright-cli test-results playwright-report output .impeccable .vercel dist)"
git check-ignore -v tests/e2e/.auth/user.json
git check-ignore -v tests/e2e/.auth/emulator-user.json
git check-ignore -v .playwright-cli/session.json
git check-ignore -v test-results/result.json
git check-ignore -v playwright-report/index.html
git check-ignore -v .vercel/output/config.json
git check-ignore -v dist/index.html
```

Expected: żadna ścieżka nie jest śledzona, a każda hipotetyczna ścieżka runtime jest ignorowana. Nie wyświetlać zawartości auth state ani plików `.env*`.

- [x] **Step 2: Sprawdzić public i produkcyjny build**

```bash
find public -maxdepth 1 -type f -print | sort
test ! -e public/__preview.html
test ! -e public/__variant-shot.png
test ! -e dist/__preview.html
test ! -e dist/__variant-shot.png
test -e src/assets/hero.png
test ! -e src/assets/react.svg
test ! -e src/assets/vite.svg
```

Expected: `public/` zawiera wyłącznie zatwierdzone assety, a build nie zawiera roboczego preview ani martwego scaffoldingu.

- [x] **Step 3: Uruchomić końcowe kontrole repo**

```bash
git diff --check
git status --short --branch
git log --oneline --decorate -12
```

Expected: brak błędów whitespace i brak nieoczekiwanych plików. Ignorowane artefakty testów/buildów nie są stage'owane.

- [x] **Step 4: Wykonać independent whole-branch review**

Reviewer ma porównać gałąź wykonawczą z bazowym SHA Task 1 i sprawdzić:

- każdy element `CORRECTIVE-RELEASE-01–05` ma świeży dowód;
- żaden failure nie został ukryty przez retry, skip albo timeout;
- każda poprawka ma test regresyjny i osobny commit;
- smoke obejmuje login, dashboard, plany, aktywną sesję, historię, postępy i AI;
- raport, plan i roadmapa wskazują ten sam stan;
- zakres nie zawiera sekretów, produkcyjnych mutacji ani lokalnych plików użytkownika.

Critical i Important muszą zostać naprawione i ponownie zreviewowane przed dalszym krokiem.

- [x] **Step 5: Zapisać rollback i decyzję rolloutową**

W raporcie zapisać:

- dokładny SHA kandydata i `origin/main`;
- aktualny produkcyjny deployment uzyskany read-only przez `vercel inspect ironlog-coach.vercel.app`;
- kompletną komendę `vercel rollback` z dokładnym deployment ID zwróconym przez inspect; wolno ją uruchomić dopiero po osobnej zgodzie;
- brak publikacji nowych reguł lub indeksów w tej fazie lokalnej, więc rollback danych nie jest wymagany;
- jeżeli późniejszy release obejmie reguły, rollback musi przywrócić `firestore.rules` z poprzedniego zatwierdzonego SHA i opublikować je dopiero po osobnej zgodzie.

Nie uruchamiać żadnej komendy rollback podczas zielonego gate'u.

- [x] **Step 6: Zamknąć lokalną bramkę**

Jeżeli wszystkie gate'y i review są zielone:

- ustawić plan na `VERIFIED — INTEGRATION PENDING`;
- ustawić Fazę 9 w roadmapie na `INTEGRATION PENDING`;
- ustawić raport na `PASS — AWAITING RELEASE DECISION`;
- nie archiwizować roadmapy przed faktycznym closeoutem integracji.

```bash
git add \
  docs/audits/2026-08-02-phase-9-corrective-release-gate.md \
  docs/roadmap/ROADMAP.md \
  docs/roadmap/plans/2026-08-02-phase-9-corrective-release-gate.md
git commit -m "docs: close phase 9 local release gate"
```

- [x] **Step 7: Zatrzymać się na jawnej zgodzie**

Użyć `superpowers:finishing-a-development-branch` i przedstawić wybór integracji. Push `main`, produkcyjny deploy Vercela oraz publikacja Firestore wymagają oddzielnej jawnej zgody. Bez niej zachować branch/worktree oraz status `INTEGRATION PENDING`.

Closeout state: execution stops here for separate user approval. No push,
merge, production deploy, Firestore Rules/index publication or rollback is
authorized or performed; keep the branch/worktree and `INTEGRATION PENDING`
status.

---

## Execution

Plan jest przeznaczony do wykonania inline przez `superpowers:executing-plans`. Gate'y współdzielą emulatory, porty i jedną powierzchnię obserwacyjną; delegacja nie skróci ścieżki krytycznej i utrudni przypisanie awarii do konkretnego przebiegu.

## Traceability

| Roadmapa | Zadania planu | Dowód wyjściowy |
| --- | --- | --- |
| `CORRECTIVE-RELEASE-01` | Task 2 | lint, unit, Vite/Vercel build, Rules i integracje workoutu |
| `CORRECTIVE-RELEASE-02` | Task 4–5 | pełny E2E oraz bezpośredni smoke desktop/mobile |
| `CORRECTIVE-RELEASE-03` | Task 3 | nazwane failure injection workoutu i katalogu AI |
| `CORRECTIVE-RELEASE-04` | Task 6 Step 1–3 | tracking, auth state, `public/`, build i diff check |
| `CORRECTIVE-RELEASE-05` | Task 6 Step 4–7 | whole-branch review, rollback i jawna decyzja integracyjna |

## Done When

- lint, unit, Vite build, Vercel build, Rules i workout integration są zielone;
- deterministyczne failure injection workoutu i katalogu AI jest jawnie udokumentowane;
- pełny Playwright desktop/mobile przechodzi na świeżych emulatorach z CSP i `--retries=0`;
- bezpośredni desktop/mobile smoke obejmuje wszystkie krytyczne trasy;
- repo, auth state, `public/` i build nie zawierają wrażliwych lub roboczych artefaktów;
- final review nie ma Critical ani Important;
- rollback i granica produkcyjnej zgody są zapisane;
- roadmapa, plan i raport wskazują ten sam stan.
