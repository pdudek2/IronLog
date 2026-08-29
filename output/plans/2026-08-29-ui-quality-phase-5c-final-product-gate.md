# UI Quality Phase 5C — Final Product Gate Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** DONE — `NEEDS REFINEMENT`; otwarto najmniejszy slice 5D

**Goal:** Issue a fresh, read-only Product-scope visual verdict for the complete current IronLog application after slices 1–5B, with traceable runtime coverage and no product edits.

**Architecture:** Use the existing local Firebase emulator, Vite app and development API to create a deterministic signed-in runtime. Discover surfaces from `src/router/index.tsx`, observe every route at least once in the Codex in-app Browser, deepen only materially different states, and keep technical test failures separate from the visual verdict. Produce one Markdown audit plus representative current-runtime screenshots.

**Tech Stack:** React 19, Vite, Firebase Auth/Firestore emulators, existing Playwright E2E support, Codex in-app Browser.

**Spec:** `output/plans/2026-08-14-ui-quality-roadmap.md` — Etap 5 / slice 5C final Product gate.

## Global Constraints

- Remain read-only with respect to `src/`, tests, Firebase rules, APIs and product data contracts; local emulator fixtures are disposable audit state.
- Do not narrow coverage to the 5B diff. Discover and observe every current user-facing route from `src/router/index.tsx`.
- Runtime pixels are primary evidence. Historical screenshots and source are context only.
- Record each surface, primary job, state, viewport, provenance and observed/unobserved status.
- Inspect 320×844, 393×852, 1024×768 and 1440×900; every viewport must have saved regression evidence.
- Cover loaded, empty, filled, selected/expanded, destructive confirmation, focus, disabled/locked and offline/error states only where they materially exist.
- Separate visual findings from product hypotheses, implementation/data defects and tooling failures.
- No product changes or new dependencies. If a `BLOCK` or `MATERIAL` issue is found, route it into a new refinement slice instead of fixing it during 5C.
- Preserve the existing untracked `output/` artifacts.

## Surface ledger target

| Surface | Primary job | Required state(s) | Viewport(s) |
| --- | --- | --- | --- |
| `/login` | authenticate | loaded, focus | 393, 1440 |
| `/register` | create account | loaded | 393 |
| `/onboarding` | create profile | fresh profile | 393, 1024 |
| `/dashboard` | choose next training action and assess week/readiness | empty/seeded, readiness, navigation | 320, 393, 1440 |
| `/progress` | understand training trend | empty range, seeded records/charts | 320, 393, 1440 |
| `/templates` | find and launch plans | empty and seeded/expanded | 393, 1440 |
| `/templates/new` | create a plan | empty editor, validation affordances | 393, 1024 |
| `/templates/:id/edit` | edit a plan | seeded long content | 393, 1440 |
| `/exercises` | find/manage exercises | library, search/filter, custom row | 320, 393, 1440 |
| `/exercises/:source/:id` | inspect exercise history | seeded history | 393, 1440 |
| `/history` | scan completed workouts | empty and seeded, grouped list | 393, 1440 |
| `/workout/new` | run an active session | empty, populated set, rest timer, destructive confirmation | 320, 393, 1440 |
| `/workout/:id` | inspect completed workout | seeded workout detail, action confirmation | 393, 1440 |
| `/chat` | configure/use Coach | no-key locked/read-only | 393, 1440 |
| `/profile` | update preferences | loaded controls, focus | 393, 1024 |
| unknown private route | recover from bad navigation | in-shell 404 | 393, 1440 |
| `/logout` and `/` | exit/redirect | redirect result | one viewport each |

---

### Task 1: Establish trustworthy current-runtime fixtures

**Files:**
- Read: `src/router/index.tsx`
- Read: `tests/e2e/support/*.ts`
- Create during audit: disposable emulator documents only

**Interfaces:**
- Consumes: existing Auth/Firestore emulator ports, `scripts/dev-api.ts`, existing Vite app.
- Produces: one fresh account plus deterministic workouts, exercise sessions, records, template, custom exercise and active-session states.

- [x] **Step 1: Start Auth/Firestore emulators, development API and Vite on free local ports.**
- [x] **Step 2: Create a fresh local audit account and complete onboarding through the UI.**
- [x] **Step 3: Seed only the minimum deterministic documents needed for filled states using existing schemas/helpers.**
- [x] **Step 4: Confirm every protected route loads in the same signed-in Browser session and that no production service is targeted.**

### Task 2: Run bounded technical gates that support visual judgment

**Files:**
- Read/run: `tests/e2e/accessibility.spec.ts`
- Read/run: `tests/e2e/contrast.spec.ts`
- Read/run: route-specific E2E specs only when needed to confirm a visual hypothesis

**Interfaces:**
- Consumes: Task 1 runtime.
- Produces: keyboard, focus, touch, contrast and console evidence kept separate from visual findings.

- [x] **Step 1: Run the existing accessibility and contrast desktop/mobile gate against emulators.**
- [x] **Step 2: Run the smallest route-specific checks needed for unverified shell, workout, history, template, exercise and Coach states.**
- [x] **Step 3: Reproduce any diagnostic on unchanged current `main` before classifying it as a product defect.** No failing diagnostic required baseline reproduction; all selected gates passed.

### Task 3: Observe the complete Product matrix in Browser

**Files:**
- Create: `output/playwright/ui-quality-phase-5c-final-product-gate/`
- Create: `output/playwright/ui-quality-phase-5c-final-product-gate/coverage-ledger.md`

**Interfaces:**
- Consumes: Tasks 1–2 and the surface ledger target.
- Produces: completed current-runtime evidence for every discovered surface and all four required viewports.

- [x] **Step 1: Observe each public and onboarding surface, including focus and redirect outcomes.**
- [x] **Step 2: Observe every protected surface in its primary loaded state.**
- [x] **Step 3: Deepen the materially different empty, filled, expanded, destructive, disabled/locked, focus and offline/error states named in the ledger.** Offline/error was excluded from pixel deepening because no materially distinct product surface was required; the boundary is recorded in the ledger.
- [x] **Step 4: Measure horizontal overflow, essential text floor, touch geometry and fixed/sticky overlap at all four viewports.**
- [x] **Step 5: Capture representative current-runtime screenshots and record Browser warnings/errors.**
- [x] **Step 6: Reset temporary viewport overrides, close the created Browser tab and stop the local runtime.**

### Task 4: Issue the final visual verdict and close or route the roadmap

**Files:**
- Create: `output/playwright/ui-quality-phase-5c-final-product-gate/final-product-audit.md`
- Modify: `output/plans/2026-08-29-ui-quality-phase-5c-final-product-gate.md`
- Modify: `output/plans/2026-08-14-ui-quality-roadmap.md`

**Interfaces:**
- Consumes: complete coverage ledger and current-runtime evidence.
- Produces: `VISUALLY READY`, `NEEDS REFINEMENT`, or `UNVERIFIED`; explicit next routing.

- [x] **Step 1: Apply every category in the visual-audit rubric and record `PASS`, `POLISH`, `MATERIAL`, `BLOCK` or `N/A` with concrete evidence.**
- [x] **Step 2: Write the prioritized audit: verdict, coverage, keep, findings, system pattern, next-pass brief, unknowns and tooling notes.**
- [x] **Step 3: If no `BLOCK` or `MATERIAL` remains, mark Etap 5 complete; otherwise open the smallest named refinement slice and keep Etap 5 active.** Opened 5D because two `MATERIAL` findings remain.
- [x] **Step 4: Mark this plan `DONE`, append an execution receipt and commit only the 5C plan/report/evidence plus the roadmap update.**

No push without explicit authority.

## Execution receipt

- **Branch / base:** `ui-quality-phase-5c-final-product-gate` from `201c394`.
- **Product edits:** none; `src/`, tests, rules and data contracts remained unchanged.
- **Coverage:** every route in the target ledger observed in a fresh emulator-backed Browser runtime; 53 current-run screenshots saved under `output/playwright/ui-quality-phase-5c-final-product-gate/`.
- **Verdict:** `NEEDS REFINEMENT` — 0 `BLOCK`, 2 `MATERIAL`, 0 separate `POLISH` tasks.
- **Findings:** dashboard streak and progress-link hitboxes below 44 px; operational labels in template editor and active workout below computed 12 px.
- **Browser evidence:** all four required viewport widths observed; no horizontal overflow; 0 console warnings/errors; viewport reset, tab closed and local runtime stopped.
- **Technical gates:** final unit run under bundled Node 22.23.1: 74 files / 602 tests passed; focused Playwright 40 passed / 17 conditional skips / 0 failed; lint passed; build passed. A host Node 25.6.1 web-storage incompatibility was reproduced and recorded as tooling, not product failure.
- **Audit artifacts:** `coverage-ledger.md`, `final-product-audit.md` and 53 screenshots in the 5C evidence directory.
- **Routing:** Etap 5 remains `ACTIVE`; next is one bounded slice `5D — mobile touch/readability closure`. Product decisions B-02, M-07 and M-14 remain separate.
