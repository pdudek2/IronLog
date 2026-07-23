# Phase 7C — Production release

**Status:** IN PROGRESS

**Date:** 2026-07-23

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
| `main` promotion | PASS | Local and remote `main` both resolve to `04c7fcae730ea47cb08d59ecf6e6667494fb978a`. |
| Vercel Puls deployment | PENDING | |
| Pre-rules finish/discard smoke | PENDING | |
| Restrictive Firestore Rules | PENDING | |
| Final live Playwright and manual smoke | PENDING | |
| Production CSP and Network | PENDING | |
| Cold dashboard measurement | PENDING | |
| Rollback readiness | PENDING | |

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

## Verdict

PENDING.
