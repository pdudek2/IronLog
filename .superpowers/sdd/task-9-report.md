# Task 9 Report — Harden the demo reseed without executing it

## Status

Code/tooling implementation is complete. `DEMO-01` operational execution remains open and requires a separate, immediate approval from Patryk.

No operational seed or dry-run was executed. Demo data was not read, reset, written or materialized during this task.

## TDD evidence

1. Baseline before Task 9 changes:
   - `npm run test:unit`
   - PASS: 49 files, 316 tests.
2. Initial discovery RED:
   - `npm run test:unit -- scripts/__tests__/demoSeedContract.test.ts`
   - EXIT 1: `No test files found`, because the approved test path was absent from the node project include in `vitest.config.ts`.
   - This was recorded as a plan/configuration gap, not accepted as behavior RED.
3. Minimal discovery fix:
   - added only `scripts/**/__tests__/**/*.test.ts` to the existing node include in `vitest.config.ts`.
4. Valid behavior RED:
   - the same focused command discovered the suite and failed with `Cannot find module '../demoSeedContract.js'`.
5. GREEN:
   - the focused suite passes 16/16 tests after implementing the pure contract.

## Implemented contract and safeguards

- Added the exact public `DemoSeedConfirmation`, `DemoSeedSnapshot`, `DemoSeedExpectations`, `assertDemoSeedConfirmation` and `validateDemoSeedSnapshot` contract.
- Confirmation fails closed for missing/mismatched email, missing/mismatched project confirmation, wrong Firebase Auth account and wrong initialized Admin app project.
- The project id is read from `getApps()[0]?.options.projectId`; credentials, private keys and tokens are never printed.
- Preflight completes before `resetDemo` or any writer/materialization call.
- `--dry-run` has a read-only branch: it may resolve the user and query the snapshot, then returns before reset, seed writers and materialization.
- Post-reseed validation reads the authoritative snapshot and exits non-zero when any validation issue remains.
- Expectations are derived from the real fixtures: `buildSchedule().length`, `USER_EXERCISES.length`, the one template fixture, `READINESS_PATTERNS.length`, and the maximum fixture `durationMin`.
- Reset still clears `workouts`, `exerciseSessions`, `records`, `userExercises`, `templates`, `readiness`, `chatMessages` and `activeSessions/{uid}`.

## Intended operational target and dry-run summary

- Target account: `demo@ironlog.app`
- Target Firebase project: `ironlog-ede05`
- Required confirmations: `DEMO_SEED_CONFIRM_EMAIL=demo@ironlog.app` and `DEMO_SEED_CONFIRM_PROJECT_ID=ironlog-ede05`
- Fixture expectations presented by the read-only validator:
  - workouts: 26
  - templates: 1
  - custom exercises: 4
  - readiness entries: 7
  - maximum workout duration: 74 minutes
  - blank workout labels: 0
  - active session: absent

This is the intended dry-run/validation summary from code and fixtures, not a report from an operational dry-run against Firebase.

## Verification

- Focused pure unit: PASS, 1 file / 16 tests.
- Full unit gate: PASS, 50 files / 332 tests.
- Static script typecheck (`tsc --noEmit`, ESNext/Bundler): PASS.
- `npm run lint -- --quiet`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS.

No `npm run seed:demo`, operational `--dry-run`, push or deploy was performed.
