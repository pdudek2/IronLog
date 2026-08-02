# Phase 9 — Corrective release gate

**Status:** PASS — AWAITING RELEASE DECISION

**Data:** 2026-08-02

## Lineage

Program korekcyjny 8A–9 → Faza 9 → brak dalszych faz po pozytywnym closeoucie.

## Kandydat

- commit bazowy: `9260f78d5bb26c19aefd41d49d49773d03ad472c`
- commit kandydata release gate (Task 6): `53151eb09f906cb4786e15894f92451baec8d20e`
- `origin/main` przy zamknięciu lokalnej bramki: `b7567128660ff53edcc8be5d1bbab862dddf84bc`
- branch i worktree: `corrective-release-gate` — `/Users/patryk/Desktop/IronLog/.worktrees/corrective-release-gate`
- backend testów: Auth + Firestore emulators, `demo-ironlog`;
- Playwright retry: `0`.

## Wersje środowiska

- `node --version`: `v25.6.1`
- `npm --version`: `11.9.0`
- `firebase --version`: `15.15.0`
- `vercel --version`: `Vercel CLI 51.8.0`
- `npx playwright --version`: `Version 1.59.1`

## Powierzchnia pełnego E2E

- Command: `E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e npx playwright test --list --project=desktop --project=mobile`
- Exit code: `0`
- Output: `Total: 217 tests in 23 files`

## Macierz

| Gate | Status | Dowód |
| --- | --- | --- |
| Lint | PASS | `npm run lint`; exit `0` after fix |
| Unit | PASS | `npm run test:unit`; `63` files / `484` tests before fix; focused fence `1` / `3` after fix |
| Vite build | PASS | `npm run build`; exit `0`, `878` modules after fix |
| Vercel production build | PASS | `vercel build --prod --yes`; exit `0`, no `TS2550`/`Object.hasOwn` diagnostic after fix |
| Firestore Rules | PASS | `npm run test:rules`; `1` file / `17` tests on `demo-ironlog` |
| Workout integration | PASS | `npm run test:integration:workout`; `3` files / `38` tests on fresh emulator |
| Failure injection | PASS | workout `2` files / `35` tests; AI `3` files / `35` tests; named contracts recorded below |
| Full E2E | PASS | emulator + CSP + desktop/mobile + zero retry; `189` passed, `28` skipped, `0` failed, `7.2m` |
| Direct observation | PASS | local CSP production preview; Codex In-app Browser, desktop `1440 × 900` and mobile `390 × 844` |
| Hygiene | PASS | Task 6 Steps 1–3: tracking, ignore proofs, `public/`, `dist/`, diff/status/log |
| Final review / rollback | PASS | independent whole-branch review, rollback target and explicit integration boundary |

## Znaleziska

Pierwszy przebieg zatrzymał się na `vercel build --prod --yes`: Vercel zwrócił
exit `0`, ale wypisał diagnostykę `TS2550` dla `Object.hasOwn` w
`api/_lib/workoutProjectionFence.ts:53`. Pozostałe pierwsze gate'y (lint, unit,
Vite build) przeszły. Diagnostyka była regresją kompatybilności kompilacji
funkcji serwerowej, nie blokadą uwierzytelnienia.

Root cause: builder `@vercel/node` odczytuje root `tsconfig.json` dla każdego
entrypointu `api/*.ts`; ten plik zawiera tylko references i nie przekazuje
opcji `tsconfig.node.json`. Vercel ustawia więc domyślny target/lib ES2021,
podczas gdy `Object.hasOwn` wymaga biblioteki ES2022. W repo znaleziono jedno
wywołanie `Object.hasOwn`; pozostałe sprawdzenia własności używają istniejących
wzorców `in` albo bezpośrednich odczytów pól.

Minimalna poprawka w osobnym commicie `26007abcd01131b2e4f36c741d21a88f7d08c8e6`
zastąpiła wywołanie wzorcem `Object.prototype.hasOwnProperty.call`, zachowując
semantykę własnej właściwości i zgodność z ES2021. Po poprawce przeszły: lint,
focused fence, Vite build i Vercel production build bez diagnostyki `TS2550` ani
`Object.hasOwn`.

Rules i workout integration przeszły na świeżych emulatorach. Dry-run produkcyjnej
konfiguracji Firestore zakończył się sukcesem; zachowano znane ostrzeżenie o
nieużywanej funkcji `isWorkoutCreate` (`firestore.rules:239:14`). Deploy,
publikacja reguł/indeksów i push nie były wykonywane.

## Failure injection — Task 3

### Workout

Command:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 firebase emulators:exec \
  --only firestore \
  --project demo-ironlog \
  "npx vitest run \
    --config vitest.workout-integration.config.ts \
    tests/integration/workoutClosure.integration.test.ts \
    tests/integration/workoutProjectionSerialization.integration.test.ts"
```

Result: exit `0`; `2` test files passed, `35` tests passed on a fresh Firestore
emulator. The passing run covered these named failure/race contracts:

- `survives a lost transaction acknowledgement and retry`;
- `converges two concurrent finishes to one logical workout`;
- `keeps the committed closure when materialization fails and converges on retry`;
- `converges idempotently after afterDeleteClaim`;
- `converges idempotently after afterDeleteSessions`;
- `converges idempotently after beforeDeleteRecords`;
- `serializes overlapping updates and materializes only the latest revision`;
- `rejects materialization from an update committed before delete`;
- `keeps delete terminal when an older materialization resumes after beforeExerciseSessions`;
- `keeps delete terminal when an older materialization resumes after afterExerciseSessions`.

### AI catalog

Command:

```bash
npx vitest run \
  api/__tests__/aiChatContextIntegration.test.ts \
  src/lib/__tests__/chatService.test.ts \
  src/pages/__tests__/ChatPageAccessibility.test.tsx
```

Result: exit `0`; `3` test files passed, `35` tests passed. The passing run
confirmed these named contracts:

- `returns a retryable catalog error without calling Anthropic`: a
  `userExercises` failure returns HTTP `503`, code `ai_catalog_unavailable`,
  and Anthropic is not called;
- `rejects ambiguous name fallbacks regardless of catalog order`: a global/user
  `Bench Press` collision has the same rejection for both catalog orders;
- `announces a catalog generation failure and lets the user retry`: the error
  message remains visible, the same `Generuj plan` button is enabled, and the
  second click completes generation;
- `preserves the retryable catalog error contract`: the client retains the
  server message, status contract, and `ai_catalog_unavailable` code.

Failure injection is complete. Direct observation, hygiene and final
review remain pending for subsequent tasks.

## Task 4 — Full E2E and fix rounds

The first full run was intentionally stopped on failure. Round 1 included the
scoped `MobileInteractionProvider` product focus fix; subsequent changes were
limited to the proven test, snapshot, cleanup, geometry and diagnostics paths.
No dependency, deployment, publication or external data was changed.

### Initial run

Command:

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

Result: exit `1`; `183` passed, `28` skipped, `6` failed, `7.7m`.
Failures were stale dashboard contrast locators (desktop/mobile), stale
template visual snapshots (desktop/mobile), missing mobile profile save toast,
and mobile workout-detail clearance. No audit result was committed for this
failed run.

### Fix round 1/5

Commits: `a618c56` and `074f371`.

- Added a RED→GREEN regression for preserving mobile navigation focus through
  form submission (`3` focused Vitest tests passed after the product focus
  guard).
- Aligned the contrast seed, current template snapshots and affected E2E
  contracts.
- Focused E2E result: `11` passed, `1` skipped, `1` failed; the remaining
  workout-detail clearance hypothesis was disproved (`0`, expected `>80`).

### Fix round 2/5

Commit: `4e62689`.

The workout-detail assertion now waits for the existing dock visibility
transitions without a clearance magic number. Focused mobile workout-detail
result: `2` passed. The one permitted full rerun then reported exit `1`:
`187` passed, `28` skipped, `2` failed, `7.3m`; remaining failures were the
contrast cleanup `AggregateError` and dense mobile workout geometry.

### Fix round 3/5

Commit: `71210e2`.

- Scoped contrast cleanup to the per-project Phase-1 workout ID.
- Made the existing mobile workout viewport helper honor the compact/full
  action-bar occluder variants.
- Focused contrast/workout-mobile result: `10` passed, `7` explicit viewport
  skips, `0` failed.
- The one permitted full rerun reported exit `1`: `187` passed, `28` skipped,
  `2` failed, `7.1m`; remaining failures were a `1.328px` mobile ergonomics
  separation delta and an aborted emulator Firestore Write channel during
  persistence reload.

### Fix round 4/5

Commit: `4b08552 test: preserve navigation diagnostics through reload`.

- Added the requested browser-diagnostics regression: an active Firestore Write
  request is marked intentional when a main-frame document navigation begins,
  while a new Write request started after that navigation remains blocking.
- TDD result: focused RED was `18` passed / `1` failed; focused GREEN was
  `19` passed / `0` failed.
- Focused emulator+CSP E2E result: `11` passed, `8` explicit viewport skips,
  `0` failed, `41.3s`.

The exact full command above was then run once with `--retries=0` on one worker:

```text
exit 0
189 passed
28 skipped
0 failed
7.1m
```

All `28` skips were explicit desktop-only/mobile-only viewport contracts or
the named authenticated-account no-workout-row condition; there were no
unclassified skips. The clean run produced no failure screenshots, videos,
traces or error-context files. Existing diagnostic-capture and accessibility
attachments in the ignored `test-results/` directory are expected artifacts,
not failures. No blocking console, pageerror or requestfailed diagnostics were
reported; expected emulator/offline diagnostics remained covered by the
existing predicates.

### Fix round 5/5 and final result

Commit: `6ad09ea test: scope navigation diagnostics to page`.

- Added a cross-page browser-diagnostics regression: page A navigation now
  marks only page A's active requests intentional, while context-wide active
  requests remain available for intentional teardown. Page B's active Firestore
  request therefore remains blocking when page A navigates.
- TDD result: focused RED was `19` passed / `1` failed; focused GREEN was
  `20` passed / `0` failed.
- Focused emulator+CSP workout-persistence result: `3` passed, `0` failed,
  `28.4s`.

The exact full command above was then run once with `--retries=0` on one worker:

```text
exit 0
189 passed
28 skipped
0 failed
7.2m
```

The clean final run produced no failure screenshots, videos, traces or
error-context files. Existing diagnostic-capture and accessibility attachments
in the ignored `test-results/` directory are expected artifacts, not failures.
No blocking console, pageerror or requestfailed diagnostics were reported;
expected emulator/offline diagnostics remained covered by the existing
predicates.

Task 4 full E2E is complete. Hygiene and final review/rollback remain pending
for the subsequent release-gate tasks.

## Task 5 — Direct observation

**Status:** PASS

**Observation contract:** `Observed` — surface: Codex In-app Browser. The
Browser tab completed its observation run and was finalized; the viewport was
reset afterwards. No Playwright or second observation surface was used for
this task.

### Setup

- Preview: local production Vite preview at `http://127.0.0.1:5174` with
  `E2E_BACKEND=emulator` and `E2E_CSP=true`.
- API: local `npm run dev:api` on port `3000` with the Auth and Firestore
  emulator contract.
- Emulators: Auth `127.0.0.1:9099`, Firestore `127.0.0.1:8080`, project
  `demo-ironlog`.
- Account: `e2e@ironlog.local` bootstrapped in the Auth emulator without
  printing a token.
- Exact CSP build: `npm run build` exited `0` before the preview was started.

### Desktop `1440 × 900`

The Browser observed the serial flow through login and onboarding, dashboard
and readiness, plan creation/save/start, one completed session and a second
discarded session, history and workout detail, Progress `30`/`90` toggles,
exercise library, AI Coach without a key, profile, and logout. The observed
states included:

- dashboard showed Patryk and readiness after login/onboarding;
- the saved workout showed `Trening zapisany!`; the discarded session returned
  to dashboard after confirmation;
- history/detail returned `Full Body`, `480kg`, `1 set`, and a `60kg` top set;
- Progress toggles exposed the expected `aria-pressed` states and charts;
- exercise library returned the global catalog (`36` exercises);
- AI Coach showed `Klucz wymagany` and kept chat disabled without a key;
- profile showed Patryk and logout returned `/login`.

### Mobile `390 × 844`

The Browser observed representative login, dashboard, plans, active workout,
history, Progress, and AI states. The mobile evidence confirmed the Puls
bottom navigation, visible readiness and plan states, active-workout lifecycle
bar and timer dock, and AI `Klucz wymagany` state. Geometry checks returned
`innerWidth = 390`, `scrollWidth = 375` (no horizontal overflow), the full
rest action bar at `669.23–749.61`, and bottom navigation at `762.41–844`
(`12.8px` separation). Main actions remained available and timers/docks did
not overlap.

### Runtime diagnostics and cleanup

Every Browser step's `tab.dev.logs({levels: ['error']})` payload was `[]`.
This is the direct console-error evidence. Absence of request and page-error
failures is additionally backed by Task 4's final full E2E result (`189`
passed, `28` explicit skips, `0` failed, zero blocking diagnostics); no
separate Browser network listener was used for this receipt.

The account, workout, plan and readiness data were emulator-only under
`demo-ironlog`; no production Firebase, Anthropic, deployment or publication
was touched. Preview, API and emulator sessions were stopped with clean
shutdown signals and no emulator export was kept. Post-cleanup listener checks
confirmed ports `5174`, `3000`, `9099` and `8080` are free.

No product issue or product change was found during direct observation.

## Task 6 — Higiena, final review i decyzja release

**Status:** PASS — AWAITING RELEASE DECISION

### Steps 1–3 — hygiene evidence

- Tracking assertion exited `0`; none of `tests/e2e/.auth`, `.playwright-cli`,
  `test-results`, `playwright-report`, `output`, `.impeccable`, `.vercel` or
  `dist` is tracked.
- All seven requested hypothetical runtime paths resolved to `.gitignore`
  rules with exit `0`. No auth state or `.env*` contents were read or printed.
- `public/` contains only `favicon.svg` and `icons.svg`; preview/variant files
  are absent from `public/` and `dist/`; `src/assets/hero.png` exists and
  scaffold assets `react.svg`/`vite.svg` are absent. Every assertion exited `0`.
- `git diff --check` exited `0`; `git status --short --branch` is clean on
  `corrective-release-gate`; the final 12-commit log was recorded in the
  ignored Task 6 preparation report.
- Existing ignored gate artifacts (`dist/`, `.vercel/`, `playwright-report/`,
  `test-results/`, `firestore-debug.log`) were not cleaned by instruction and
  are not staged or tracked.

### Step 4 — independent whole-branch review

The independent review compared the execution branch with the Task 1 base and
was **APPROVED**. It found no Critical or Important findings. Reviewer spot
checks passed (`3` files / `26` tests). The one Minor finding was stale plan
state (`READY FOR IMPLEMENTATION` with unchecked steps); this closeout updates
the plan status and all task checkboxes so the plan, roadmap and audit converge.

### Step 5 — rollback and rollout boundary

- Exact candidate SHA: `53151eb09f906cb4786e15894f92451baec8d20e`
- Exact `origin/main` SHA: `b7567128660ff53edcc8be5d1bbab862dddf84bc`
- Read-only `vercel inspect ironlog-coach.vercel.app` resolved the current
  production deployment URL:
  `https://iron-5m4u417r6-pdudek2s-projects.vercel.app`
- Deployment ID: `dpl_6pW39kJHCwYWueSQL34iP6Htqwf4`
- Exact rollback command, derived but **not executed**:
  `vercel rollback dpl_6pW39kJHCwYWueSQL34iP6Htqwf4`
- No new Firestore rules or indexes were published in this local phase, so data
  rollback is not required. If a later release includes rules, rollback must
  restore `firestore.rules` from the previous approved SHA and publish only
  after separate explicit approval.

### Steps 6–7 — local closeout and explicit integration decision

The local gate is closed as `PASS — AWAITING RELEASE DECISION`. The plan is
`VERIFIED — INTEGRATION PENDING`; Phase 9 in the roadmap is
`INTEGRATION PENDING`, and the roadmap is not archived before integration
closeout. Execution stops here for separate user approval: no push, merge,
production deploy, Firestore rules/index publication or rollback was authorized
or performed. The local closeout commit is the only new external-facing action
in this phase.
