# Phase 7B — Manual release acceptance

**Status:** PASS

**Date:** 2026-07-23

**Baseline commit:** `fbe64864bfbdfbf5430f510f8fb4c18e2f5005f7`

## Scope

Phase 7B covers RELEASE-02 through RELEASE-07: manual desktop and mobile smoke testing, keyboard and accessibility checks, runtime diagnostics, and comparison of the production product, README, and screenshots.

Deployment, production data mutation, live production E2E, Vercel configuration, and RELEASE-08 through RELEASE-10 remain outside this path.

## Environment

| Item | Value |
| --- | --- |
| Branch | `phase-7b-manual-release-acceptance` |
| Local frontend | production Vite build and preview with enforced CSP |
| Local backend | Firebase Auth and Firestore emulators plus local API |
| Observation surface | in-app Browser |
| Desktop viewport | 1440 × 900 |
| Mobile viewport | 390 × 844 |
| Production | `https://ironlog-coach.vercel.app`, read-only |

The local account and every mutating scenario used emulators. No production data, configuration, deployment, or rules were changed.

## Acceptance matrix

| Scenario | Desktop | Mobile | Evidence and notes |
| --- | --- | --- | --- |
| Sign-in and onboarding | PASS | NOT RUN | Local account created and onboarded on desktop; the authenticated session was then reused for mobile. |
| Dashboard and readiness | PASS | PASS | Readiness saved as 3/5 for sleep, mood, and DOMS; dashboard showed `Umiarkowany`; reload preserved the entry. |
| Workout start, set logging, and finish | PASS | NOT RUN | Bench Press 60 kg × 8 produced 480 kg and finished through the real local API. Mobile covered start and set editing but intentionally discarded the session. |
| Workout discard | PASS | PASS | Template-launched desktop session and mobile session were both discarded; dashboard no longer offered resume. |
| History and workout detail | PASS | PASS | One workout, one set, eight reps, 480 kg, and a 60 kg top set agreed across list and detail. |
| Progress 30/90 days | PASS | PASS | Both ranges selected correctly; one session, 480 kg, one exercise, and one Bench Press record agreed with history. |
| Templates | PASS | PASS | Desktop covered create, edit, launch, and delete. Mobile covered the empty state and new-template editor. |
| Custom exercises | PASS | PASS | Desktop covered create, rename, source distinction, and delete. Mobile library and empty custom state were correct. |
| AI Coach without a key | PASS | PASS | Key-required state, disabled controls, local-key copy, and short-key validation were correct. |
| Profile | PASS | PASS | Unit preference persisted through reload; mobile layout remained clean and the test profile was restored to kg. |
| Keyboard and focus | PASS | PASS | Escape closed a confirmation dialog. Targeted desktop/mobile navigation tests passed, including hidden-nav focus transfer on mobile. |
| Console, page error, failed request | PASS | PASS | No new warnings or errors after the harness correction. Intentional navigation produced only cancelled `ERR_ABORTED` fetches. |
| Production product and README | PASS | PASS | Public login rendered at both viewports. A user-authenticated, read-only desktop walkthrough covered dashboard, history and workout detail, Progress, templates, exercises, AI, and profile. No production data was changed. |

## Visual evidence

Surface: Browser
State: local `/progress`, desktop 1440 × 900, authenticated emulator account, 30-day range
Evidence: direct Browser observation and refreshed [`desktop-showcase.png`](../screenshots/app/desktop-showcase.png)
Result: current Puls navigation, progress metrics, 30/90 selector, and chart layout rendered without clipping.

Surface: Browser
State: local `/dashboard`, mobile 390 × 844, authenticated emulator account
Evidence: direct Browser observation and refreshed [`mobile-showcase.png`](../screenshots/app/mobile-showcase.png)
Result: header, readiness, weekly summary, and fixed bottom navigation fit without horizontal overflow.

Surface: Browser
State: local `/workout/new`, mobile 390 × 844, profile set to lbs
Evidence: emitted Browser screenshot after the regression fix
Result: the set input showed `100 lbs`, the steppers showed `±2.5 lbs`, and the kg-backed volume remained 363 kg.

Surface: Browser and Brave
State: production `/login` at desktop and mobile widths, followed by authenticated read-only desktop routes
Evidence: direct observation of the public login plus dashboard, history, workout detail, Progress, templates, exercises, AI, and profile
Result: the public surface was responsive, protected routes loaded coherent populated data, no unfinished workout was offered for resumption, and no production mutation was performed. Personal production screenshots were not retained in the report.

## Accessibility and keyboard evidence

The focused accessibility run completed with 15 passes and four expected viewport-specific skips:

```text
npx playwright test tests/e2e/accessibility.spec.ts \
  --project=desktop --project=mobile --retries=0

15 passed
4 skipped
```

All 16 generated `.aria.yml` files were reviewed. Desktop snapshots used `Nawigacja główna`; mobile snapshots used `Nawigacja dolna`. Template fields, exercise filters, AI mode controls, disabled states, headings, and interactive names agreed with the manual Browser snapshots. Targeted Axe checks passed for dashboard, template editor, exercise library, and AI Coach on both viewports.

Manual Escape behavior passed on a destructive confirmation dialog. The in-app Browser did not advance focus when synthetic Tab was sent from the route-focused `<main>`, so focus-order evidence is taken from the passing targeted Playwright tests rather than claimed from that unsupported Browser interaction.

## Runtime diagnostics

The first local workout finalization failed with an invalid-token error. The cause was the acceptance harness: `firebase emulators:start` does not inject Admin SDK emulator variables into a separately launched API process. The API was missing:

- `FIREBASE_AUTH_EMULATOR_HOST`;
- `FIRESTORE_EMULATOR_HOST`;
- `GCLOUD_PROJECT`.

The plan command now includes those variables. Retrying the exact same closure then passed without a product-code change. The later accessibility command also needed the documented `TEST_EMAIL` and `TEST_PASSWORD`; the plan now includes them.

After those corrections:

- no new console warnings or errors were recorded;
- no page exceptions were recorded;
- cancelled `ERR_ABORTED` fetches occurred only during deliberate navigation and reload;
- the browser emitted one non-blocking recommendation that the local Claude key password field is outside a form.

## Defects and fixes

### 1. Incorrect lbs write boundary — fixed

**Classification:** release blocker.

When the profile used pounds, the active workout relabelled a kg value as lbs. A stored `60 kg` appeared as `60 lbs`, and editing the field could therefore save a materially wrong load.

The fix keeps workout state and database payloads in kg and converts only at the active-workout UI boundary:

- kg values render as pounds when required;
- typed pounds convert back to kg with enough internal precision for a stable round trip;
- top-set and overload suggestion values use the selected display unit;
- mobile weight steppers use the selected unit.

Regression evidence:

```text
src/components/__tests__/WorkoutExerciseLedgerItem.test.tsx
2 passed
```

The test failed first with `60` instead of `132.3`, then with early rounding from `100 lbs` to `100.1 lbs`. Whole-branch review also caught a kg-only summary rounding `82.25 kg` to `82.3 kg`; the second regression case now covers both the unchanged input and exact top-set display. After the fix, the Browser showed an exact stable `100 lbs`; the internal kg-backed set volume was 363 kg.

### 2. README product link opened 404 — fixed

**Classification:** documentation/product-entry mismatch.

Production `/` renders the app's not-found screen. The README product link now targets `/login`.

### 3. README showcase images used the retired blue UI — fixed

**Classification:** documentation mismatch.

Both README showcase images were replaced with direct screenshots from the current Puls candidate. The old composites no longer represent the linked product.

### 4. Production differs from the Puls candidate — recorded

**Classification:** expected deployment mismatch.

The authenticated production walkthrough confirmed a credible populated product: historical sessions and workout detail agreed, both Progress ranges rendered coherent charts and records, templates and global/custom exercises were present, AI correctly showed the no-key state, and profile data rendered without requiring a save. The account was the user's existing personal account; no credentials or raw personal data were copied into repository artifacts.

Production still uses the older blue `main` presentation, while the release candidate and refreshed README screenshots show the Puls rebrand. This is expected because the candidate has not been deployed. The mismatch is recorded for the production release path and was not bypassed by deploying from 7B.

### Non-blocking follow-up

A full-page reload directly on `/workout/new` does not bootstrap the profile store, so an lbs user temporarily sees the safe, explicitly labelled kg fallback until visiting dashboard or profile. This does not corrupt data after the write-boundary fix, but the preference should eventually load before rendering unit-dependent deep links. It is tracked as `LATER-11`.

## Build and verification

Final local verification after the lbs fix:

| Gate | Result |
| --- | --- |
| `npm run lint` | PASS |
| `npm run test:unit` | PASS — 60 files, 471 tests |
| `npm run build` | PASS — 879 modules |
| `git diff --check` | PASS |
| Accessibility Playwright | PASS — 15 passed, 4 expected skips |

The normal production build produced no chunk above the 500 kB warning threshold. The emulator-enabled build emitted an 895.73 kB entry chunk because the test bridge changes bundling; this did not reproduce in the normal release build and did not affect observed route behavior. RELEASE-06 therefore needs no optimization work.

## Release verdict

| Release item | Verdict |
| --- | --- |
| RELEASE-02 — manual desktop/mobile smoke | PASS |
| RELEASE-03 — keyboard and accessibility | PASS |
| RELEASE-04 — runtime diagnostics | PASS |
| RELEASE-05 — production product and documentation credibility | PASS |
| RELEASE-06 — measured bundle assessment | PASS |
| RELEASE-07 — acceptance record and deferred work | PASS |

**Overall verdict: PASS.**

The local candidate is healthy, the acceptance defect found during 7B is fixed and retested, and the production product was reviewed read-only on an existing authenticated account. The remaining visual mismatch is the expected result of Puls not yet being deployed. RELEASE-08 through RELEASE-10 remain open and were not executed.
