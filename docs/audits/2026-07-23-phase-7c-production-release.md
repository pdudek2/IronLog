# Phase 7C — Production release

**Status:** PASS

**Date:** 2026-07-23–24

## Scope

This record covers RELEASE-08 through RELEASE-10: Git archival and promotion, Vercel production deployment, Firestore indexes and rules, live product verification, production CSP and analytics checks, and cold-dashboard measurement.

## Baseline

| Item | Value |
| --- | --- |
| Candidate branch | `puls-rebrand` |
| Candidate before release-plan commit | `cbdada67ebbca0ab34993fe2e164e1ad8c3d2e5b` |
| Release-plan commit | `b50d56e` |
| Current `origin/main` | `1e5911fec7feacb137fa457b082c5029f2486c2d` |
| Planned archive branch | `main-before-puls-2026-07-23` |
| Current Vercel deployment | `dpl_HVft88xzWNQWeYWN2AgCGRntaLCY` |
| Current production URL | `https://iron-7rduj6pnx-pdudek2s-projects.vercel.app` |
| Product alias | `https://ironlog-coach.vercel.app` |
| Firebase project | `ironlog-ede05` |

The current Vercel deployment is Ready. The archive branch did not exist at baseline. Production still exposed the older blue product before this release.

## Gate matrix

| Gate | Status | Evidence |
| --- | --- | --- |
| Local release preflight | PASS | Lint; build 879 modules; unit 471/471; rules 16/16; workout integration 20/20; diff check clean. |
| Remote main archive | PASS | `main-before-puls-2026-07-23` resolves remotely to `1e5911fec7feacb137fa457b082c5029f2486c2d`. |
| Firestore indexes | PASS | All seven configured composite indexes are published in `ironlog-ede05`. |
| Retired Vercel analytics variables removed | PASS | `VITE_CSQ_TAG_ID` and `VITE_GA_MEASUREMENT_ID` are absent from the production environment listing. |
| `main` promotion | PASS | Local and remote `main` both resolve to release correction `f21f9e82c274b2dac3eddef3b040dc713efa3a14`. |
| Vercel Puls deployment | PASS | `dpl_93mSAowBvJTrpJqMQmBDmFiLV6b6` is Ready and owns `ironlog-coach.vercel.app`. |
| Pre-rules finish/discard smoke | PASS | Private release account completed, displayed, deleted, and discarded temporary sessions; no active session remained. |
| Restrictive Firestore Rules | PASS | Rules compiled and published to `ironlog-ede05`; post-rules finish/discard and server-owned projection paths passed. |
| Final live Playwright and manual smoke | PASS WITH HARNESS EXCEPTION | Full live run: 139 passed, 24 skipped, 52 failed. Failures were classified as local-CSP, emulator-bridge, intentional-offline, teardown-WebChannel, or shared-account contamination; the affected production flows passed direct isolated checks. |
| Production CSP and Network | PASS | Enforced CSP and security headers present; zero GA4, GTM, Hotjar, or Contentsquare requests in clean production measurement. |
| Cold dashboard measurement | PASS | 897 ms, 897 ms, 918 ms; median 897 ms to the ready action. |
| Rollback readiness | PASS | Previous Vercel deployment and old-main rules source are both identified; no rollback was required. |

## Rollback contract

The previous app can be restored with:

```bash
vercel rollback dpl_HVft88xzWNQWeYWN2AgCGRntaLCY --yes
```

If restrictive rules have already been published, Vercel rollback alone is insufficient because the old client creates workouts directly. Restore `firestore.rules` from `main-before-puls-2026-07-23` in an isolated temporary worktree and deploy only those rules. The new indexes are additive and do not need to be removed.

## Preflight

The exact release-plan tree passed lint, the production build, 471 unit tests, 16 Firestore Rules tests, 20 workout integration tests, and `git diff --check`. Firebase dry-run compiled the production rules and accepted the index configuration. It emitted one non-blocking warning for the now-unused `isWorkoutCreate` helper.

The ignored `.env.test` contains non-empty `TEST_EMAIL` and `TEST_PASSWORD`; their values were neither printed nor copied into tracked files.

## Release preparation

The previous canonical branch state is preserved remotely as `main-before-puls-2026-07-23` at the exact baseline SHA. The seven configured Firestore indexes are present, retired analytics environment-variable names are absent from Vercel production, and the Puls candidate is now the verified remote `main`.

## Deployment blocker

The first Vercel attempt built the SPA but was rejected before publication because the Hobby project would have created more than 12 Serverless Functions. Production remained on the previous Ready deployment and Firestore Rules were not changed. The cause was structural: shared implementation files lived in the ordinary `api/lib` path and were counted as function entries. The release correction moves that implementation to Vercel's reserved `api/_lib` support path without changing the seven public endpoint paths.

After the relocation, lint, the production build, 471 unit tests, 20 workout integration tests, and `git diff --check` passed. Two platform-only TypeScript diagnostics were removed with compatible syntax and an explicit ESM type-import extension; their 14 focused tests passed. A clean `vercel build --prod` completed successfully and its Build Output contained exactly seven functions: the seven intended public API endpoints.

## Vercel production gate

Deployment `dpl_93mSAowBvJTrpJqMQmBDmFiLV6b6` reached Ready and the product alias resolved to it. Public `/login` and direct `/history` routing returned 200. The response enforced the configured CSP and included HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, Referrer Policy, and Permissions Policy.

Before changing Firestore Rules, the private release account completed a one-set Bench Press workout, saw the 100 kg volume reflected in the product, deleted that temporary workout, then started and discarded a second session. The dashboard returned to the prior history with no active session.

## Firestore Rules and post-rules smoke

The restrictive rules were published with:

```bash
firebase deploy --only firestore:rules --project ironlog-ede05
```

The compiler accepted the rules with the known non-blocking warning for the unused `isWorkoutCreate` helper. After publication, the private release account completed and materialized a 3×3 Incline Bench Press workout, displayed it in Dashboard and History, deleted it, then started and discarded another session. History, Progress, Templates, Exercises, AI without a configured key, and Profile all rendered their expected data or empty/configuration states.

Additional mutation checks covered profile save and reload with restoration of the original name, creation and deletion of a custom exercise, and creation, launch, discard, and deletion of a four-set template day. Cleanup left the release account with its original profile name, no custom exercise, no template, no active session, and only its pre-existing April workout.

## Full live Playwright classification

`npx playwright test --retries=0` completed with 139 passed, 24 skipped, and 52 failed in 10.7 minutes. The run is not recorded as a green full-suite result. Its failures fall into known harness boundaries:

- CSP assertions target the local Vite server, which does not emit Vercel production headers; the production responses passed the same header contract directly.
- Workout lifecycle cases requiring `window.__ironlogEmulatorTestBridge` cannot run against live production.
- Offline-template cases intentionally disconnect the production Firestore client and receive `unavailable`.
- The shared diagnostic fixture records Firestore WebChannel `net::ERR_ABORTED` while contexts close.
- Emulator-only failures leave shared live-account state behind, causing cascades in later workout cases.

The product paths implicated by those failures were rerun serially against the deployed alias with isolated cleanup and passed. This is an accepted release-harness exception, not a hidden green result. The deterministic unit, rules, workout-integration, focused platform tests, production build, direct public checks, and post-rules product smoke remain green.

## Runtime, analytics, and performance evidence

A clean production measurement used three fresh browser contexts. Each context authenticated the private release account, cleared the browser cache, navigated directly to `/dashboard`, and measured until the primary `Rozpocznij nowy trening` action became ready:

| Sample | Ready time |
| ---: | ---: |
| 1 | 897 ms |
| 2 | 897 ms |
| 3 | 918 ms |
| Median | **897 ms** |

The same run observed zero requests to Google Analytics, Google Tag Manager, Hotjar, or Contentsquare and no `console.error`, `console.warn`, `pageerror`, or `requestfailed`. No performance optimization is justified by this evidence.

The longer mutation walkthrough produced no application error or page error. It did expose two non-blocking diagnostics: one Chrome advisory about the AI key field not being inside a form, and one transient Firestore SDK `BloomFilterError` warning after the extended session. The latter did not prevent data from loading and did not reproduce in the clean three-context measurement.

## Primary Browser receipt

The final serial observation used the primary in-app Browser surface at `https://ironlog-coach.vercel.app/login`. The rendered document title was `IronLog`; the DOM exposed the `Zaloguj się` heading, registration link, labelled Email and Hasło fields, and one `Zaloguj się` action. The tab reported no warning or error logs. This receipt is structural/runtime evidence, not a pixel-fidelity claim.

## Closeout

Closure lineage: **Phase 7 → Phase 7C / RELEASE-08–10 → no remaining release obligations**. The old product remains recoverable from `main-before-puls-2026-07-23`, the previous Vercel deployment remains available, Puls is canonical on `main`, all seven indexes and restrictive rules are published, and the production alias serves the Ready Puls deployment.

The full live Playwright harness remains a future test-infrastructure improvement if the team wants one command to run every test against production. It is not required to operate or release the verified product because the production-incompatible cases already have deterministic emulator or direct production gates.

## Verdict

**PASS.** Puls is released to production. No rollback was required.
