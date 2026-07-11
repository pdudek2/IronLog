# Task 3 report — materialization checkpoint retry consistency

## Status

Complete. Added only the test-owned Admin emulator database helper, optional materialization database/checkpoint seam, and deterministic emulator characterization test. No product recovery behavior, API/client checkpoint input, runtime flag, audit/roadmap update, merge, or push was added.

## RED

The prescribed focused command was attempted first:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 firebase emulators:exec --only firestore --project demo-ironlog "vitest run --config vitest.workout-review.config.ts tests/review/workoutProjection.review.test.ts"
```

It exited `127` because this shell did not expose the project-local `vitest` binary inside the direct `firebase emulators:exec` subprocess (`/bin/sh: vitest: command not found`). This was an environment failure, not valid RED evidence.

The equivalent focused command using the local npm binary was then run:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 firebase emulators:exec --only firestore --project demo-ironlog "npm exec vitest -- run --config vitest.workout-review.config.ts tests/review/workoutProjection.review.test.ts"
```

Result: exit `1`; 1 file failed, 3 tests failed. Every checkpoint case failed with the expected missing-seam symptom: `AssertionError: promise resolved "undefined" instead of rejecting` at the checkpoint fault assertion.

## GREEN and emulator observations

Final focused evidence command:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 firebase emulators:exec --only firestore --project demo-ironlog "npm exec vitest -- run --config vitest.workout-review.config.ts tests/review/workoutProjection.review.test.ts --disableConsoleIntercept --reporter=verbose"
```

Result: exit `0`; 1 file passed, 3 tests passed.

Exact observations:

| Checkpoint | Immediate state after injected fault | State after two checkpoint-free retries |
|---|---|---|
| `beforeExerciseSessions` | `materialized=false`, sessions `0`, record absent | `materialized=true`, sessions `1`, `totalSessions=1`, `maxWeight=80`, `maxReps=5`, `bestVolume=400` |
| `afterExerciseSessions` | `materialized=false`, sessions `1`, record absent | `materialized=true`, sessions `1`, `totalSessions=1`, `maxWeight=80`, `maxReps=5`, `bestVolume=400` |
| `afterRecords` | `materialized=false`, sessions `1`, record present and correct (`totalSessions=1`, `maxWeight=80`, `maxReps=5`, `bestVolume=400`) | `materialized=true`, sessions `1`, `totalSessions=1`, `maxWeight=80`, `maxReps=5`, `bestVolume=400` |

Every final session retained the seeded workout ID. After every case, teardown cleared the emulator and directly verified that `workouts`, `exerciseSessions`, and `records` were empty.

The finalized complete review suite was run twice:

```bash
npm run test:review:workout
npm run test:review:workout
```

Both runs exited `0` with identical counts: 2 files passed, 7 tests passed.

## Static runtime-reachability scan

Command:

```bash
rg -n "MaterializationReviewCheckpoints|beforeExerciseSessions|afterExerciseSessions|afterRecords" api src tests
```

Result: checkpoint declarations and calls occur only in `api/lib/workoutProjection.ts`; test checkpoint names occur only in `tests/review/workoutProjection.review.test.ts`. There are no references in an API handler, request body, environment flag, or client source. `/api/materialize-workout` continues to call `materializeWorkoutForUser(userId, body.workoutId)` with no options. The review test mocks `api/lib/firebaseAdmin.js` before importing `workoutProjection`, and its helper never imports that module.

## Regression gates

Final fresh run after the last test edit:

| Command | Result |
|---|---|
| `npm run test:unit` | exit `0`; 22 files, 120 tests passed |
| `npm run test:rules` | exit `0`; 1 file, 8 tests passed |
| `npm run lint` | exit `0` |
| `npm run build` | exit `0`; TypeScript and Vite build passed; existing chunk-size warning only |
| `git diff --check` | exit `0` |

## Self-review, commits, and concerns

- Reviewed database threading through materialization reads, session replacement, and record recomputation. Existing update/delete behavior remains on `adminDb`.
- Confirmed checkpoint order matches the three partial-failure boundaries and callbacks have no built-in failure behavior.
- Confirmed no Task 4+ files, audit, roadmap, memory, merge, or push were touched.
- Implementation/test commit: `7083c6a test: verify workout projection retries`.
- Concern: the brief's direct focused command could not resolve `vitest` in this shell; `npm run test:review:workout` works unchanged and passed twice, while `npm exec vitest` supplied focused RED/GREEN evidence.
