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
| Remote main archive | PENDING | |
| Firestore indexes | PENDING | |
| Retired Vercel analytics variables removed | PENDING | |
| `main` promotion | PENDING | |
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

## Verdict

PENDING.
