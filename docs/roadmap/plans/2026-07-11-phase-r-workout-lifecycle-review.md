# IronLog Phase R — Workout Lifecycle Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deterministically classify `WORKOUT-01`–`WORKOUT-06` as `confirmed`, `rejected`, or `already_protected`, without implementing the Phase 1 product fixes.

**Architecture:** Preserve production behavior while extracting only the orchestration seams required for deterministic tests. Use Firestore emulator integration tests for ambiguous writes, cleanup, and projection checkpoints; use focused Playwright only for cache, UI, reload, offline, and independent-client evidence. Finish with one audit report and a roadmap update derived from the observed results.

**Tech Stack:** React 19, TypeScript, Vitest, Playwright, Firebase Web SDK, Firebase Admin SDK, Auth emulator, Firestore emulator.

## Global Constraints

- Scope is limited to `REVIEW-WORKOUT-01`–`REVIEW-WORKOUT-05` and hypotheses `WORKOUT-01`–`WORKOUT-06`.
- Review statuses in code and structured data are exactly `confirmed`, `rejected`, and `already_protected`.
- Phase R may extract behavior-preserving seams and add tests; it must not implement idempotency, retry, tombstones, recovery UI, or another Phase 1 fix.
- Failure implementations live only in tests. Do not add a runtime flag, query parameter, local-storage key, debug endpoint, or weakened Firestore rule.
- Every browser context must use the shared diagnostics layer; independent clients use `observedContextFactory`.
- Every mutation registers cleanup before the first write. Emulator helpers must refuse to run unless `E2E_BACKEND=emulator` or `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` is present, as appropriate.
- Do not read, copy, or modify `.env.local` or `.env.test` for isolated review commands.
- Keep `exerciseSource: 'global' | 'user'` in every exercise reference.
- Preserve kg in persisted data.
- Do not plan or implement Phase 1 until the Phase R report is accepted.
- After each task, run an independent spec/code review before starting the next task.

---

## Planned file map

| File | Responsibility |
|---|---|
| `src/lib/workoutLifecycle.ts` | Behavior-preserving finish, discard, and stale-discard orchestration seams. |
| `src/lib/__tests__/workoutLifecycle.test.ts` | Unit characterization of ordering and cleanup outcomes. |
| `src/lib/workoutService.ts` | Injectable workout-write port around existing `addDoc` and materialization. |
| `src/lib/__tests__/workoutService.test.ts` | Unit contract for the workout-write port. |
| `src/pages/WorkoutPage.tsx` | Consume orchestration outcomes without changing existing navigation or copy. |
| `src/hooks/useActiveSession.ts` | Consume stale-discard orchestration without changing current behavior. |
| `vitest.workout-review.config.ts` | Node-only focused emulator integration suite. |
| `tests/review/support/faultOutcomes.ts` | Shared English fault scenario identifiers used only by review tests. |
| `tests/review/support/firestoreReviewEnvironment.ts` | Authenticated Web SDK test context and deterministic Firestore cleanup. |
| `tests/review/support/adminReviewDatabase.ts` | Test-owned Admin SDK connection to the Firestore emulator. |
| `tests/review/workoutPersistence.review.test.ts` | `WORKOUT-01`–`03` persistence and cleanup evidence. |
| `tests/review/workoutProjection.review.test.ts` | `WORKOUT-04` projection checkpoint and retry evidence. |
| `api/lib/workoutProjection.ts` | Optional database/checkpoint seam; production calls retain existing defaults. |
| `tests/e2e/support/offlineDiagnostics.ts` | Exact shared predicate for intentional emulator-offline diagnostics. |
| `tests/e2e/support/workoutReviewEmulator.ts` | Emulator-only seed, read, poll, and cleanup helpers for Playwright. |
| `tests/e2e/workout-lifecycle-review.spec.ts` | `WORKOUT-02`, `05`, and `06` UI/cache/multi-client evidence. |
| `tests/e2e/template-launch.spec.ts` | Reuse the extracted offline diagnostic predicate. |
| `package.json` | Focused review and Playwright emulator commands. |
| `docs/audits/2026-07-11-phase-r-workout-lifecycle-review.md` | Final evidence matrix and Phase 1 consequence. |
| `docs/roadmap/ROADMAP.md` | Phase R status and evidence-backed Phase 1 scope. |

---

### Task 1: Extract behavior-preserving client lifecycle seams

**Files:**
- Create: `src/lib/workoutLifecycle.ts`
- Create: `src/lib/__tests__/workoutLifecycle.test.ts`
- Modify: `src/pages/WorkoutPage.tsx:451-540`
- Modify: `src/hooks/useActiveSession.ts:256-282`
- Modify: `src/lib/workoutService.ts:42-45`

**Interfaces:**
- Produces: `SessionCleanupState`, `finishWorkoutLifecycle`, `discardWorkoutLifecycle`, and `discardStaleSessionLifecycle`.
- Consumes later: Task 2 uses these functions with emulator-backed operations.
- Preserves: `WorkoutPage` navigation and Polish toasts; `useActiveSession.discardStaleSession()` still resolves after a remote delete failure and still creates a replacement session.

- [ ] **Step 1: Add failing unit characterization tests**

Create `src/lib/__tests__/workoutLifecycle.test.ts` with the following cases:

```ts
import { describe, expect, it, vi } from 'vitest'
import {
  discardStaleSessionLifecycle,
  discardWorkoutLifecycle,
  finishWorkoutLifecycle,
} from '../workoutLifecycle'

const savedWorkout = { id: 'workout-1', materialized: false }

describe('finishWorkoutLifecycle', () => {
  it('does not clear local or remote session state when workout save fails', async () => {
    const clearWorkout = vi.fn()
    const clearSession = vi.fn()

    await expect(finishWorkoutLifecycle({
      saveWorkout: vi.fn().mockRejectedValue(new Error('ambiguous write result')),
      clearWorkout,
      clearSession,
    })).rejects.toThrow('ambiguous write result')

    expect(clearWorkout).not.toHaveBeenCalled()
    expect(clearSession).not.toHaveBeenCalled()
  })

  it('reports unconfirmed cleanup after a saved workout without rejecting the finish', async () => {
    const order: string[] = []
    const result = await finishWorkoutLifecycle({
      saveWorkout: vi.fn(async () => { order.push('save'); return savedWorkout }),
      clearWorkout: vi.fn(() => { order.push('clear-local') }),
      clearSession: vi.fn(async () => { order.push('clear-remote'); throw new Error('delete failed') }),
    })

    expect(order).toEqual(['save', 'clear-local', 'clear-remote'])
    expect(result.workout).toEqual(savedWorkout)
    expect(result.sessionCleanup).toBe('unconfirmed')
    expect(result.cleanupError).toEqual(new Error('delete failed'))
  })
})

describe('discardWorkoutLifecycle', () => {
  it('clears local state first and reports a failed cloud cleanup', async () => {
    const order: string[] = []
    const result = await discardWorkoutLifecycle({
      clearWorkout: vi.fn(() => { order.push('clear-local') }),
      clearSession: vi.fn(async () => { order.push('clear-remote'); throw new Error('delete failed') }),
    })

    expect(order).toEqual(['clear-local', 'clear-remote'])
    expect(result.sessionCleanup).toBe('unconfirmed')
  })
})

describe('discardStaleSessionLifecycle', () => {
  it('starts and persists a replacement after the old remote delete fails', async () => {
    const replacement = { startedAt: 200, exercises: [] }
    const persistReplacement = vi.fn(async () => undefined)
    const result = await discardStaleSessionLifecycle({
      clearLocal: vi.fn(),
      deleteRemote: vi.fn().mockRejectedValue(new Error('delete failed')),
      startReplacement: vi.fn(() => replacement),
      persistReplacement,
    })

    expect(result.sessionCleanup).toBe('unconfirmed')
    expect(result.replacement).toBe(replacement)
    expect(persistReplacement).toHaveBeenCalledWith(replacement)
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run src/lib/__tests__/workoutLifecycle.test.ts
```

Expected: FAIL because `src/lib/workoutLifecycle.ts` does not exist.

- [ ] **Step 3: Implement the minimal orchestration module**

Create `src/lib/workoutLifecycle.ts`:

```ts
import type { ActiveWorkout } from '../store/workoutStore'
import type { SaveWorkoutResult } from './workoutService'

export type SessionCleanupState = 'confirmed' | 'unconfirmed'

interface CleanupOutcome {
  sessionCleanup: SessionCleanupState
  cleanupError?: unknown
}

interface FinishWorkoutDependencies {
  saveWorkout(): Promise<SaveWorkoutResult>
  clearWorkout(): void
  clearSession(): Promise<void>
}

interface DiscardWorkoutDependencies {
  clearWorkout(): void
  clearSession(): Promise<void>
}

interface DiscardStaleSessionDependencies {
  clearLocal(): void
  deleteRemote(): Promise<void>
  startReplacement(): ActiveWorkout | null
  persistReplacement(workout: ActiveWorkout): Promise<void>
}

async function confirmCleanup(action: () => Promise<void>): Promise<CleanupOutcome> {
  try {
    await action()
    return { sessionCleanup: 'confirmed' }
  } catch (cleanupError) {
    return { sessionCleanup: 'unconfirmed', cleanupError }
  }
}

export async function finishWorkoutLifecycle(
  dependencies: FinishWorkoutDependencies,
): Promise<CleanupOutcome & { workout: SaveWorkoutResult }> {
  const workout = await dependencies.saveWorkout()
  dependencies.clearWorkout()
  return { workout, ...await confirmCleanup(dependencies.clearSession) }
}

export async function discardWorkoutLifecycle(
  dependencies: DiscardWorkoutDependencies,
): Promise<CleanupOutcome> {
  dependencies.clearWorkout()
  return confirmCleanup(dependencies.clearSession)
}

export async function discardStaleSessionLifecycle(
  dependencies: DiscardStaleSessionDependencies,
): Promise<CleanupOutcome & { replacement: ActiveWorkout | null }> {
  dependencies.clearLocal()
  const cleanup = await confirmCleanup(dependencies.deleteRemote)
  const replacement = dependencies.startReplacement()
  if (replacement) await dependencies.persistReplacement(replacement)
  return { ...cleanup, replacement }
}
```

Export `SaveWorkoutResult` from `src/lib/workoutService.ts` without changing its fields.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npx vitest run src/lib/__tests__/workoutLifecycle.test.ts
```

Expected: 1 file passes; all lifecycle characterization cases pass.

- [ ] **Step 5: Route production callers through the seams**

Update `WorkoutPage.doFinish()` to call `finishWorkoutLifecycle`. Preserve both current messages. Use `result.cleanupError` for the existing console error and cleanup toast; then navigate and show `Trening zapisany!` exactly as today.

Update `WorkoutPage.handleConfirmDiscard()` to call `discardWorkoutLifecycle`. Preserve navigation and `Nie udało się od razu usunąć sesji w chmurze, ale wróciłem do dashboardu.`.

Update `useActiveSession.discardStaleSession()` so its local reset is inside `clearLocal`, its remote delete is passed as `deleteRemote`, and creation/persistence of the replacement session is passed through the other callbacks. Log `cleanupError` with the existing `[discard stale session error]` prefix, but do not reject only because cleanup is unconfirmed; this preserves the current resolved promise and success toast.

- [ ] **Step 6: Run behavior and regression gates**

Run:

```bash
npx vitest run src/lib/__tests__/workoutLifecycle.test.ts src/lib/__tests__/workoutService.test.ts src/store/workoutStore.test.ts
npm run lint
npm run build
```

Expected: all focused tests, lint, and build pass. No copy or navigation changes appear in the diff.

- [ ] **Step 7: Commit Task 1**

```bash
git add src/lib/workoutLifecycle.ts src/lib/__tests__/workoutLifecycle.test.ts src/lib/workoutService.ts src/pages/WorkoutPage.tsx src/hooks/useActiveSession.ts
git commit -m "test: expose workout lifecycle outcomes"
```

---

### Task 2: Reproduce ambiguous writes and failed cleanup on Firestore emulator

**Files:**
- Modify: `src/lib/workoutService.ts:57-68,199-220`
- Modify: `src/lib/__tests__/workoutService.test.ts`
- Create: `vitest.workout-review.config.ts`
- Create: `tests/review/support/faultOutcomes.ts`
- Create: `tests/review/support/firestoreReviewEnvironment.ts`
- Create: `tests/review/workoutPersistence.review.test.ts`
- Modify: `package.json:scripts`

**Interfaces:**
- Produces: `WorkoutWritePort`, `WorkoutWritePayload`, and `saveWorkoutWithPort(uid, workout, port)`.
- Produces: test-only `FaultOutcome` and `ReviewFault`.
- Produces command: `npm run test:review:workout`.
- Consumes: lifecycle functions from Task 1.
- Must keep: public `saveWorkout(uid, workout)` and its materialization-error behavior unchanged.

- [ ] **Step 1: Add the failing write-port unit tests**

Extend `src/lib/__tests__/workoutService.test.ts` with tests that import `saveWorkoutWithPort` and assert:

```ts
import type { ActiveWorkout } from '../../store/workoutStore'

const workout: ActiveWorkout = {
  startedAt: 1_790_000_000_000,
  templateId: null,
  label: 'Phase R workout',
  exercises: [{
    exerciseId: 'bench-press',
    exerciseSource: 'global',
    name: 'Bench Press',
    sets: [{ weight: '80', reps: '5', done: true }],
  }],
}

it('propagates an ambiguous create error without attempting materialization', async () => {
  const port = {
    createWorkout: vi.fn().mockRejectedValue(new Error('ack lost')),
    materializeWorkout: vi.fn(),
  }

  await expect(saveWorkoutWithPort('user-1', workout, port)).rejects.toThrow('ack lost')
  expect(port.materializeWorkout).not.toHaveBeenCalled()
})

it('returns a pending result when materialization fails after create', async () => {
  const port = {
    createWorkout: vi.fn().mockResolvedValue({ id: 'workout-1' }),
    materializeWorkout: vi.fn().mockRejectedValue(new Error('projection failed')),
  }

  await expect(saveWorkoutWithPort('user-1', workout, port)).resolves.toEqual({
    id: 'workout-1',
    materialized: false,
  })
})
```

Reuse this exact `ActiveWorkout` fixture in both new cases.

- [ ] **Step 2: Verify the write-port tests fail**

Run:

```bash
npx vitest run src/lib/__tests__/workoutService.test.ts
```

Expected: FAIL because `saveWorkoutWithPort` and `WorkoutWritePort` do not exist.

- [ ] **Step 3: Extract the production write port**

Add these public types to `src/lib/workoutService.ts`:

```ts
export interface WorkoutWritePayload {
  userId: string
  templateId: string | null
  startedAt: number
  finishedAt: number
  materialized: false
  label: string | null
  exercises: WorkoutExerciseSummary[]
}

export interface WorkoutWritePort {
  createWorkout(payload: WorkoutWritePayload): Promise<{ id: string }>
  materializeWorkout(workoutId: string): Promise<void>
}

export async function saveWorkoutWithPort(
  uid: string,
  workout: ActiveWorkout,
  port: WorkoutWritePort,
): Promise<SaveWorkoutResult> {
  const payload = buildWorkoutPayload(uid, workout)
  const created = await port.createWorkout(payload)
  try {
    await port.materializeWorkout(created.id)
    return { id: created.id, materialized: true }
  } catch (error) {
    console.error('[materializeWorkout error]', error)
    return { id: created.id, materialized: false }
  }
}
```

Export `WorkoutExerciseSummary` as well, because it is part of the public `WorkoutWritePayload` shape. Keep its fields unchanged.

Implement `saveWorkout` as a call to `saveWorkoutWithPort` with a module-local default port. The default `createWorkout` uses the current `addDoc`; the default `materializeWorkout` calls the current API helper. Do not expose a fault mode in the default port.

Annotate `buildWorkoutPayload(uid, workout): WorkoutWritePayload` so `materialized` remains the literal type `false` rather than widening to `boolean`.

- [ ] **Step 4: Verify unit GREEN**

Run:

```bash
npx vitest run src/lib/__tests__/workoutService.test.ts src/lib/__tests__/workoutLifecycle.test.ts
```

Expected: both files pass. Existing `retryPendingMaterializations` cases remain green.

- [ ] **Step 5: Add the focused emulator configuration and shared fault model**

Create `tests/review/support/faultOutcomes.ts`:

```ts
export type FaultOutcome =
  | 'failed_before_remote_commit'
  | 'remote_commit_succeeded_ack_lost'
  | 'failed_after_workout_before_projection'
  | 'failed_after_sessions_before_records'
  | 'failed_after_records_before_materialized_flag'
  | 'active_session_delete_failed'

export class ReviewFault extends Error {
  constructor(readonly outcome: FaultOutcome) {
    super(outcome)
    this.name = 'ReviewFault'
  }
}
```

Create `vitest.workout-review.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    fileParallelism: false,
    include: ['tests/review/**/*.review.test.ts'],
    env: {
      VITE_FIREBASE_API_KEY: 'phase-r-test-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'demo-ironlog.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'demo-ironlog',
      VITE_FIREBASE_STORAGE_BUCKET: 'demo-ironlog.appspot.com',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789',
      VITE_FIREBASE_APP_ID: '1:123456789:web:phase-r',
    },
  },
})
```

Add to `package.json`:

```json
"test:review:workout": "FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 firebase emulators:exec --only firestore --project demo-ironlog \"vitest run --config vitest.workout-review.config.ts\""
```

- [ ] **Step 6: Create the authenticated Firestore review environment**

Create `tests/review/support/firestoreReviewEnvironment.ts` with:

```ts
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'

export async function createFirestoreReviewEnvironment(): Promise<RulesTestEnvironment> {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') {
    throw new Error('Workout review requires the local Firestore emulator.')
  }
  return initializeTestEnvironment({
    projectId: 'demo-ironlog',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  })
}
```

The test file owns `beforeAll`, `beforeEach(clearFirestore)`, and `afterAll(cleanup)`.

- [ ] **Step 7: Write the RED emulator tests for `WORKOUT-01`–`03`**

Create `tests/review/workoutPersistence.review.test.ts`.

Use user ID `phase-r-user`, an authenticated rules context, and a valid completed `ActiveWorkout`. Add these deterministic cases:

1. `remote commit succeeded, acknowledgement was lost, retry creates a second logical workout`:
   - first `createWorkout` calls `addDoc(collection(db, 'workouts'), payload)` and then throws `new ReviewFault('remote_commit_succeeded_ack_lost')`;
   - call `saveWorkoutWithPort` and expect rejection;
   - call it again with a normal `createWorkout`;
   - query `workouts` by `userId` and assert two documents with equivalent exercise payloads and different IDs.
2. `finish cleanup failure leaves activeSessions document after local clear`:
   - seed `activeSessions/phase-r-user`;
   - call `finishWorkoutLifecycle` with successful save, a tracked local clear, and a rejecting `clearSession`;
   - assert `sessionCleanup === 'unconfirmed'`, local clear ran, and the Firestore document still exists.
3. `discard cleanup failure leaves activeSessions document after local clear`:
   - repeat with `discardWorkoutLifecycle` and assert the same persisted residue.
4. `stale discard masks delete failure and persists a replacement session`:
   - seed an old session;
   - reject `deleteRemote` without deleting;
   - let `persistReplacement` call `setDoc` with a new session;
   - assert the helper resolves with `unconfirmed` and the cloud document now contains the replacement.

Use `ReviewFault('remote_commit_succeeded_ack_lost')` for the first scenario and `ReviewFault('active_session_delete_failed')` for the cleanup scenarios. The first run should fail only because the new integration assumptions or wiring are incomplete. Do not change product behavior to make these characterization assertions pass.

- [ ] **Step 8: Run the focused emulator suite and make the characterization tests GREEN**

Run:

```bash
npm run test:review:workout
```

Expected after minimal test/harness corrections: all four persistence scenarios pass and the emulator shuts down. The ambiguous-ack test must observe two distinct workout IDs; otherwise stop and record the actual invariant before proceeding.

- [ ] **Step 9: Run Task 2 regression gates**

```bash
npm run test:unit
npm run test:rules
npm run lint
npm run build
git diff --check
```

Expected: all commands pass; the existing build chunk advisory may remain.

- [ ] **Step 10: Commit Task 2**

```bash
git add package.json src/lib/workoutService.ts src/lib/__tests__/workoutService.test.ts vitest.workout-review.config.ts tests/review/support/faultOutcomes.ts tests/review/support/firestoreReviewEnvironment.ts tests/review/workoutPersistence.review.test.ts
git commit -m "test: reproduce workout persistence failures"
```

---

### Task 3: Verify materialization checkpoint retry consistency

**Files:**
- Modify: `api/lib/workoutProjection.ts:77-96,242-425`
- Create: `tests/review/support/adminReviewDatabase.ts`
- Create: `tests/review/workoutProjection.review.test.ts`

**Interfaces:**
- Produces: `MaterializationReviewOptions` and optional checkpoints `beforeExerciseSessions`, `afterExerciseSessions`, and `afterRecords`.
- Production caller `/api/materialize-workout` continues calling `materializeWorkoutForUser(userId, workoutId)` with no options.
- Tests pass a test-owned emulator database explicitly; `api/lib/firebaseAdmin.ts` is not imported by the test helper.

- [ ] **Step 1: Add the test-owned Admin emulator helper**

Create `tests/review/support/adminReviewDatabase.ts`:

```ts
import { deleteApp, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const APP_NAME = 'phase-r-workout-review'

export function getReviewAdminDatabase() {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') {
    throw new Error('Admin workout review requires the local Firestore emulator.')
  }
  const app = getApps().find((candidate) => candidate.name === APP_NAME)
    ?? initializeApp({ projectId: 'demo-ironlog' }, APP_NAME)
  return getFirestore(app)
}

export async function clearReviewAdminDatabase(): Promise<void> {
  const response = await fetch(
    'http://127.0.0.1:8080/emulator/v1/projects/demo-ironlog/databases/(default)/documents',
    { method: 'DELETE' },
  )
  if (!response.ok) throw new Error(`Firestore emulator clear failed: ${response.status}`)
}

export async function closeReviewAdminDatabase(): Promise<void> {
  const app = getApps().find((candidate) => candidate.name === APP_NAME)
  if (app) await deleteApp(app)
}
```

- [ ] **Step 2: Write a RED projection checkpoint test**

Create `tests/review/workoutProjection.review.test.ts`. Seed one valid workout with one global `bench-press` exercise and `materialized: false`.

Before importing `workoutProjection`, replace its static Admin module with the test-owned emulator database so the test never evaluates `api/lib/firebaseAdmin.ts` or loads `.env.local`:

```ts
vi.mock('../../api/lib/firebaseAdmin.js', async () => {
  const { getReviewAdminDatabase } = await import('./support/adminReviewDatabase')
  return { adminDb: getReviewAdminDatabase() }
})

import { materializeWorkoutForUser } from '../../api/lib/workoutProjection'
```

For each checkpoint below:

```ts
const checkpointCases = [
  'beforeExerciseSessions',
  'afterExerciseSessions',
  'afterRecords',
] as const
```

Call `materializeWorkoutForUser('phase-r-user', workoutId, { db, checkpoints })`. The selected checkpoint throws `ReviewFault` with outcomes in order: `failed_after_workout_before_projection`, `failed_after_sessions_before_records`, and `failed_after_records_before_materialized_flag`.

Assert the immediate state:

| Checkpoint | Workout | `exerciseSessions` | record |
|---|---|---:|---|
| `beforeExerciseSessions` | `materialized: false` | 0 | absent |
| `afterExerciseSessions` | `materialized: false` | 1 | absent |
| `afterRecords` | `materialized: false` | 1 | present and correct |

Then call materialization twice without checkpoints. Assert after both calls:

```ts
expect(workout.materialized).toBe(true)
expect(exerciseSessions).toHaveLength(1)
expect(exerciseSessions[0].workoutId).toBe(workoutId)
expect(record.totalSessions).toBe(1)
expect(record.maxWeight).toBe(80)
expect(record.maxReps).toBe(5)
expect(record.bestVolume).toBe(400)
```

- [ ] **Step 3: Run the projection test and verify RED**

Run:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 firebase emulators:exec --only firestore --project demo-ironlog "vitest run --config vitest.workout-review.config.ts tests/review/workoutProjection.review.test.ts"
```

Expected: FAIL because `materializeWorkoutForUser` does not accept a database or checkpoints.

- [ ] **Step 4: Add the minimal projection seam**

In `api/lib/workoutProjection.ts`, import `type Firestore` from `firebase-admin/firestore` and add:

```ts
export interface MaterializationReviewCheckpoints {
  beforeExerciseSessions?(): void | Promise<void>
  afterExerciseSessions?(): void | Promise<void>
  afterRecords?(): void | Promise<void>
}

export interface MaterializationReviewOptions {
  db?: Firestore
  checkpoints?: MaterializationReviewCheckpoints
}
```

Change the public function to:

```ts
export async function materializeWorkoutForUser(
  userId: string,
  workoutId: string,
  options: MaterializationReviewOptions = {},
): Promise<void> {
  const database = options.db ?? adminDb
  // existing validation and reads use database
  await options.checkpoints?.beforeExerciseSessions?.()
  await replaceExerciseSessions(database, existingSessions, nextSessions)
  await options.checkpoints?.afterExerciseSessions?.()
  await recomputeRecords(database, workout.userId, affectedExercises)
  await options.checkpoints?.afterRecords?.()
  await workoutRef.update({ materialized: true })
}
```

Thread `database: Firestore` through `loadUserExerciseMetadata`, `listExerciseSessionsForWorkout`, `replaceExerciseSessions`, `recomputeRecords`, and `recomputeRecordForExercise`. Replace their internal `adminDb` references with that parameter. Leave update/delete behavior unchanged by passing `adminDb` or the same local `database` through their existing paths.

The checkpoint functions contain no built-in failure and are not populated by any production route.

- [ ] **Step 5: Run projection GREEN twice**

Run twice:

```bash
npm run test:review:workout
npm run test:review:workout
```

Expected: both runs pass with identical counts. Emulator cleanup leaves no workout, `exerciseSessions`, or record documents.

- [ ] **Step 6: Verify that failure injection is not runtime-reachable**

Run:

```bash
rg -n "MaterializationReviewCheckpoints|beforeExerciseSessions|afterExerciseSessions|afterRecords" api src tests
```

Expected: declarations and calls occur only in `api/lib/workoutProjection.ts` and `tests/review/workoutProjection.review.test.ts`. No API handler, request body, env flag, or client bundle references a checkpoint.

- [ ] **Step 7: Run Task 3 regression gates**

```bash
npm run test:unit
npm run test:rules
npm run lint
npm run build
git diff --check
```

Expected: all pass.

- [ ] **Step 8: Commit Task 3**

```bash
git add api/lib/workoutProjection.ts tests/review/support/adminReviewDatabase.ts tests/review/workoutProjection.review.test.ts
git commit -m "test: verify workout projection retries"
```

---

### Task 4: Add emulator-owned UI evidence for residual and pending states

**Files:**
- Create: `tests/e2e/support/offlineDiagnostics.ts`
- Create: `tests/e2e/support/workoutReviewEmulator.ts`
- Create: `tests/e2e/workout-lifecycle-review.spec.ts`
- Modify: `tests/e2e/template-launch.spec.ts:4-26`
- Modify: `package.json:scripts`

**Interfaces:**
- Produces: `seedReviewActiveSession`, `seedReviewWorkout`, `readReviewActiveSession`, `waitForReviewActiveSession`, and `cleanupWorkoutReviewState`.
- Produces command: `npm run test:e2e:workout-review`.
- Consumes: `observedContextFactory`, `expectedBrowserDiagnostics`, and the canonical app-ready helpers from Phase 0.

- [ ] **Step 1: Extract the exact intentional-offline predicate**

Move the three URL patterns and `isExpectedOfflineLaunchDiagnostic` logic from `tests/e2e/template-launch.spec.ts` into `tests/e2e/support/offlineDiagnostics.ts` as:

```ts
export function isExpectedFirestoreOfflineDiagnostic(entry: BrowserDiagnostic): boolean
```

Keep the predicate exact: only the current Firestore channel, batch-get, clear-dot endpoints, exact `ERR_ABORTED`/`ERR_INTERNET_DISCONNECTED`, and the explicitly listed Firebase console messages. Update `template-launch.spec.ts` to import it. Do not broaden the global browser diagnostic classifier.

- [ ] **Step 2: Add the emulator-only Admin helper for Playwright**

Create `tests/e2e/support/workoutReviewEmulator.ts`. It must:

- throw unless `E2E_BACKEND === 'emulator'`, `FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080'`, and `FIREBASE_AUTH_EMULATOR_HOST === '127.0.0.1:9099'`;
- initialize a named Admin app with project `demo-ironlog` and no credentials;
- resolve the test UID with `getAuth(app).getUserByEmail(process.env.TEST_EMAIL!)`;
- seed only `activeSessions/{uid}` and `workouts/{phase-r-id}`;
- poll Firestore state with a deadline and 100 ms interval instead of fixed sleeps;
- cleanup the active session plus workout IDs beginning `phase-r-`;
- close the named Admin app in a worker-scoped teardown helper.

Use these exact persisted shapes:

```ts
export function reviewActiveSession(uid: string, startedAt = Date.now()) {
  return {
    userId: uid,
    startedAt,
    templateId: null,
    label: 'Phase R active session',
    exercises: [{
      exerciseId: 'bench-press',
      exerciseSource: 'global' as const,
      name: 'Bench Press',
      sets: [{ weight: '80', reps: '5', done: true }],
    }],
    updatedAt: Date.now(),
  }
}
```

The workout fixture uses numeric `{ weight: 80, reps: 5 }`, `materialized` supplied by the test, and a unique label beginning `Phase R`.

- [ ] **Step 3: Add the focused Playwright script**

Add to `package.json`:

```json
"test:e2e:workout-review": "E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog \"playwright test tests/e2e/workout-lifecycle-review.spec.ts --project=desktop\""
```

- [ ] **Step 4: Write the residual-session UI test**

In `tests/e2e/workout-lifecycle-review.spec.ts`:

1. Register `test.afterAll(closeWorkoutReviewEmulator)` before the describe block.
2. Register `cleanupWorkoutReviewState` before seeding.
3. Seed a materialized workout and a still-present active session for the same logical session.
4. Open `/dashboard` and assert both the completed workout label and `Wróć do sesji` are visible.
5. Create an independent context with `observedContextFactory.newContext({ storageState: await context.storageState() })`.
6. Open `/workout/new` there and assert `Bench Press` from the residual active session is restored.

This test is the UI/cache consequence of the Task 2 cleanup-failure proof; it does not fake a browser-visible delete failure.

- [ ] **Step 5: Write the pending-materialization UI test**

Seed a workout with `materialized: false` and no active session. Before `page.goto('/dashboard')`, route `**/api/materialize-workout` to a deterministic `503` response with `contentType: 'application/json'` and body `{"error":"phase-r projection failure"}` so the automatic retry stays pending. Open `/dashboard` and assert:

```ts
const pendingRow = page.locator('.dashboard-history-row').filter({
  hasText: 'Phase R pending projection',
})
await expect(pendingRow).toBeVisible()
await expect(pendingRow.getByText('sync', { exact: true })).toBeVisible()
await expect(pendingRow).not.toContainText(/spróbuj ponownie|oczekuje|błąd synchronizacji/i)
```

This characterizes the current message; it must not add recovery UI.

- [ ] **Step 6: Run focused Playwright RED/GREEN**

Run:

```bash
npm run test:e2e:workout-review
```

Expected initial RED: missing emulator helper/spec wiring. Expected GREEN after implementation: setup plus both review tests pass; all contexts and emulator processes close cleanly.

- [ ] **Step 7: Run Phase 0 regression and static gates**

```bash
npm run test:e2e:isolated
npx vitest run tests/e2e/support/browserDiagnostics.test.ts
rg -n "from '@playwright/test'" tests/e2e --glob '*.spec.ts' --glob 'global.setup.ts'
git diff --check
```

Expected: isolated 13/13 remains green; diagnostics tests pass; direct-import scan has no matches.

- [ ] **Step 8: Commit Task 4**

```bash
git add package.json tests/e2e/support/offlineDiagnostics.ts tests/e2e/support/workoutReviewEmulator.ts tests/e2e/workout-lifecycle-review.spec.ts tests/e2e/template-launch.spec.ts
git commit -m "test: expose workout lifecycle UI states"
```

---

### Task 5: Characterize independent-client, offline, and stale-session races

**Files:**
- Modify: `tests/e2e/workout-lifecycle-review.spec.ts`
- Modify: `tests/e2e/support/workoutReviewEmulator.ts`

**Interfaces:**
- Consumes: Task 4 seed/poll/cleanup helpers, `observedContextFactory`, and `isExpectedFirestoreOfflineDiagnostic`.
- Produces: runtime evidence for `WORKOUT-06` and stale-session parts of `WORKOUT-02`, `03`, and `05`.

- [ ] **Step 1: Add a helper that opens two independent authenticated clients**

Inside the spec, create:

```ts
async function openIndependentWorkoutClient(
  observedContextFactory: ObservedContextFactory,
  storageState: Awaited<ReturnType<BrowserContext['storageState']>>,
) {
  const context = await observedContextFactory.newContext({ storageState })
  const page = await context.newPage()
  await page.goto('/workout/new')
  await expectAppReady(page, '/workout/new', 25_000)
  return { context, page }
}
```

Import the fixture types from `./fixtures`; do not import `@playwright/test` directly.

- [ ] **Step 2: Write a neutral two-client deletion-race probe**

Seed one active session. Open client A and independent client B. In B:

1. enter `6` in `Powtórzenia, Bench Press, seria 1`;
2. enter a scoped intentional-offline block with `expectedBrowserDiagnostics.during`;
3. set B offline before its 400 ms active-session debounce can be confirmed remotely;
4. in A, route `/api/materialize-workout` to `{ ok: true }`, click `Zakończ`, and wait for `/dashboard`;
5. reconnect B and wait with `waitForReviewActiveSession` for either a document or a confirmed absence.

On the first diagnostic run, attach the resulting document JSON through `testInfo.attach('phase-r-two-client-state.json', ...)`. Then convert the observed state into one explicit assertion:

- if the document reappears with B's value, name the test `offline second client resurrects the deleted active session` and assert that state;
- if the document remains absent because an existing invariant wins, name it `confirmed deletion prevents the offline second client from restoring the session` and assert absence.

Do not change application code in this step. The observed branch determines `WORKOUT-06` status later.

- [ ] **Step 3: Add stale-session continue/discard probes**

Seed an active session older than the threshold used by `isActiveSessionStale`. Verify in an independent context:

- the stale-session decision UI appears;
- `Wróć do sesji` refreshes the timer and persists a non-stale session;
- `Odrzuć i zacznij od nowa` removes the old exercise and creates the current empty replacement.

Pair these success-path browser observations with Task 2's forced stale-delete failure. Do not attempt to intercept Firestore WebChannel deletion from the browser.

- [ ] **Step 4: Replace timing assumptions with emulator polling**

The only allowed fixed delay is the existing 400 ms product debounce plus a small scheduling allowance inside a helper. Final assertions must poll `activeSessions/{uid}` through the Admin emulator helper. No assertion may depend only on `waitForTimeout(3_000)`.

- [ ] **Step 5: Run the focused browser review twice**

```bash
npm run test:e2e:workout-review
npm run test:e2e:workout-review
```

Expected: identical test names and results in both runs, no retry-only pass, clean emulator shutdown, and no leftover `phase-r-*` documents.

- [ ] **Step 6: Run Task 5 regression gates**

```bash
npm run test:e2e:isolated
npm run lint
npm run build
git diff --check
```

Expected: all pass.

- [ ] **Step 7: Commit Task 5**

```bash
git add tests/e2e/workout-lifecycle-review.spec.ts tests/e2e/support/workoutReviewEmulator.ts
git commit -m "test: characterize workout client races"
```

---

### Task 6: Produce the evidence matrix and close Phase R

**Files:**
- Create: `docs/audits/2026-07-11-phase-r-workout-lifecycle-review.md`
- Modify: `docs/roadmap/ROADMAP.md`

**Interfaces:**
- Consumes: committed test names, outputs, attachments, and exact code citations from Tasks 1–5.
- Produces: one status per `WORKOUT-01`–`WORKOUT-06` and the only authorized Phase 1 scope.

- [ ] **Step 1: Run the complete evidence gate before writing conclusions**

Run from a clean worktree:

```bash
npm run lint
npm run test:unit
npm run test:rules
npm run test:review:workout
npm run build
npm run test:e2e:isolated
npm run test:e2e:workout-review
git diff --check
```

Expected: every command exits `0`. Record exact file/test counts and non-blocking warnings. If any diagnostic test is flaky or has different results across the two Task 5 runs, stop and repair the test before classification.

- [ ] **Step 2: Apply the classification rules**

Use these rules without weakening them:

| Hypothesis | `confirmed` | `already_protected` | `rejected` |
|---|---|---|---|
| `WORKOUT-01` | One logical finalization produces more than one workout after lost acknowledgement and retry. | A pre-existing stable identity guarantees exactly one document without a Phase R product fix. | The proposed ambiguity cannot occur at the tested boundary and the preventing invariant is cited. |
| `WORKOUT-02` | Finish/discard can clear local state while a resumable cloud session remains and reappears. | Existing reconciliation confirms deletion or safely suppresses the residue in every tested flow. | The residue exists but cannot affect any product state, with runtime proof. |
| `WORKOUT-03` | No retry/tombstone/reconciliation removes an unconfirmed cleanup and the residue remains actionable. | An existing recovery mechanism converges automatically in every tested flow. | Cleanup failure is impossible under the enforced data/rules contract, with proof. |
| `WORKOUT-04` | Any checkpoint retry leaves duplicate/stale `exerciseSessions`, wrong records, or a permanently false materialization flag. | Every partial checkpoint converges after retry and an extra retry is idempotent. | The hypothesized partial state cannot be reached and the preventing atomic boundary is cited. |
| `WORKOUT-05` | UI presents the same success state for materially different persistence outcomes or offers no accurate recovery signal. | Existing copy and actions distinguish every tested outcome. | The hypothesized mismatch is not rendered in any reachable UI state. |
| `WORKOUT-06` | Refresh, second client, offline, or stale handling restores/overwrites a closed session or creates another workout. | Existing multi-client reconciliation converges in all tested scenarios. | The proposed race cannot be reached under the observed ordering and cited invariant. |

Prefer `already_protected` when protection exists in the baseline before Phase R. Use `rejected` only when the hypothesis itself is invalid, not merely because one test passed.

- [ ] **Step 3: Write the audit report with actual evidence**

Create `docs/audits/2026-07-11-phase-r-workout-lifecycle-review.md` with these fixed sections:

```markdown
# IronLog — Faza R: review cyklu życia treningu

## Zakres i środowisko
## Mapa finalizacji i granice awarii
## Macierz wyników WORKOUT-01–06
## Dowody szczegółowe
### WORKOUT-01
### WORKOUT-02
### WORKOUT-03
### WORKOUT-04
### WORKOUT-05
### WORKOUT-06
## Zakres rekomendowany dla Fazy 1
## Weryfikacja i ograniczenia
```

For every hypothesis include the reproduction command, committed test name, observed Firestore/local/UI state, code citations, one approved status, and Phase 1 consequence. Do not include speculative fixes beyond naming the confirmed contract that Phase 1 must address.

- [ ] **Step 4: Update the canonical roadmap**

In `docs/roadmap/ROADMAP.md`:

- mark Phase R `DONE`;
- replace hypothesis language in Phase 1 with only the `confirmed` items;
- mark `already_protected` and `rejected` items in the baseline or Phase R evidence section, not as Phase 1 work;
- if no item is `confirmed`, set Phase 1 to `DONE — no implementation required`;
- otherwise set Phase 1 to `READY` and name the exact remaining IDs;
- update test counts to the fresh gate output;
- keep Phase S `READY` and `RELEASE-08` unchanged;
- keep the live-suite credential/quota limitation evidence-based.

- [ ] **Step 5: Validate report/roadmap consistency**

Run:

```bash
for id in WORKOUT-01 WORKOUT-02 WORKOUT-03 WORKOUT-04 WORKOUT-05 WORKOUT-06; do
  rg -n "$id" docs/audits/2026-07-11-phase-r-workout-lifecycle-review.md docs/roadmap/ROADMAP.md
done
rg -n "confirmed|rejected|already_protected" docs/audits/2026-07-11-phase-r-workout-lifecycle-review.md
rg -n "TB[D]|TO[D]O|do usta[l]enia|uzupełni[ć]" docs/audits/2026-07-11-phase-r-workout-lifecycle-review.md docs/roadmap/ROADMAP.md
git diff --check
```

Expected: every ID occurs in both documents; every report row has one approved status; placeholder scan has no matches; diff check passes.

- [ ] **Step 6: Run an independent final review**

Provide the reviewer:

- base and head commit SHAs;
- this plan and the approved design spec;
- the immutable diff package;
- all Task 6 gate outputs;
- the audit report and roadmap.

The reviewer must verify that test seams preserve production behavior, no fault mode is user-reachable, statuses follow the classification table, and Phase 1 contains only confirmed findings. Resolve every Critical or Important issue and re-run affected gates.

- [ ] **Step 7: Commit Task 6**

```bash
git add docs/audits/2026-07-11-phase-r-workout-lifecycle-review.md docs/roadmap/ROADMAP.md
git commit -m "docs: complete workout lifecycle review"
```

---

## Final completion checklist

- [ ] `WORKOUT-01`–`WORKOUT-06` each have exactly one evidence-backed status.
- [ ] No Phase 1 product fix is present in the Phase R diff.
- [ ] Fault implementations exist only under test paths.
- [ ] Production API request shapes and Firestore rules are unchanged.
- [ ] Review emulator tests pass twice from fresh state.
- [ ] Focused Playwright review passes twice without retry-only success.
- [ ] Phase 0 isolated Playwright remains 13/13.
- [ ] Lint, unit/support, Firestore rules, and production build pass.
- [ ] Audit report and roadmap state the same Phase 1 scope.
- [ ] Independent final review has no unresolved Critical or Important issue.
- [ ] `memory-save` records Phase R results only after the report is accepted.

## Execution handoff

Recommended execution mode: `superpowers:subagent-driven-development` in an isolated worktree created from `puls-rebrand`. Use one fresh implementer and one fresh reviewer per task, then a broad final reviewer for the complete Phase R diff. Do not merge or push until the final review and fresh completion gate are green.
