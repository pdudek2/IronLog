# IronLog Phase 1 — Workout Lifecycle Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Use `superpowers:test-driven-development` for every behavior change and `superpowers:verification-before-completion` before claiming the phase is done.

**Goal:** Make workout finish and discard idempotent, recoverable after ambiguous failures, honest in the UI, and resistant to late writes from offline or independent clients.

**Architecture:** Give every active workout a stable `sessionId`. Close a session through an Admin SDK transaction that creates `workouts/{sessionId}` when finishing, writes `closedSessions/{sessionId}`, and deletes the matching `activeSessions/{uid}` document atomically. Keep a client-side closure intent until the endpoint confirms the result. Firestore rules reject every later active-session write whose `sessionId` has a tombstone.

**Tech Stack:** React 19, TypeScript, Zustand, Firebase Web SDK, Firebase Admin SDK, Firestore rules, Vercel Functions, Vitest, Firebase emulators, Playwright.

**Approved design:** `docs/roadmap/specs/2026-07-11-phase-1-workout-lifecycle-integrity-design.md`

## Global constraints

- Scope is limited to `WORKOUT-01`, `WORKOUT-02`, `WORKOUT-03`, `WORKOUT-05`, and `WORKOUT-06`.
- `WORKOUT-04` is a protected baseline. Preserve its projection retry tests; do not redesign materialization.
- Statuses and error codes in TypeScript are English: `materialized`, `projection_pending`, `closure_unconfirmed`, `session_mismatch`, `finished`, `discarded`.
- User-facing copy remains Polish.
- Keep every Firestore collection top-level.
- Preserve `exerciseSource: 'global' | 'user'` through active sessions, workout payloads, and projections.
- Store weights in kg.
- Client components do not call Firestore directly. Firestore access stays in `src/lib/`.
- Admin SDK endpoints use the Node.js runtime, existing authentication, and request-size limits.
- No production fault-injection flag, query parameter, local-storage debug switch, or weakened rule.
- Do not read or modify `.env.local` or `.env.test` for isolated tests.
- Register emulator cleanup before the first test mutation.
- After each task: run its focused tests, inspect the diff, request independent review, then commit.
- Do not update the roadmap to `DONE` until every final gate passes.

### Approved final-review corrections

- Legacy sessions without a stored `sessionId` derive one shared browser/server ID from UID and `startedAt`; it is deterministic, user-scoped, Firestore-safe, and at most 160 characters. Stored IDs are never rewritten.
- A first discard requires a matching active session. Only an existing owned compatible `discarded` tombstone makes an absent active session an idempotent success; preemptive tombstone creation is forbidden.
- Unexpected non-`ApiError` endpoint failures return a non-sensitive HTTP 500. Typed `ApiError` statuses and codes remain unchanged, so the client retains ambiguous recovery intent.
- Only `fromCache === false && hasPendingWrites === false` snapshots are authoritative for cleanup, closure confirmation, stale replacement, or replacing recovery.
- Active-session autosave failure is a persistent `WorkoutPage` state with retry; backup survives and the warning clears only after a successful write or resolving authoritative reconciliation.

## Planned file map

| File | Responsibility |
|---|---|
| `src/lib/sessionIdentity.ts` | Generate new IDs and derive stable legacy IDs. |
| `src/store/workoutStore.ts` | Require and preserve `ActiveWorkout.sessionId`. |
| `src/lib/activeSessionService.ts` | Persist and parse `sessionId`; recognize tombstone rejection. |
| `src/lib/activeSessionBackup.ts` | Normalize legacy backups and preserve closure recovery data. |
| `src/lib/templateService.ts` | Create template workouts with a new `sessionId`. |
| `src/lib/workoutClosureIntent.ts` | Persist, read, and clear per-user finish/discard intent. |
| `src/lib/workoutClosureService.ts` | Typed client calls for finalize/discard and ambiguous errors. |
| `src/lib/workoutLifecycle.ts` | Orchestrate prepare → request → confirmed cleanup without premature clearing. |
| `src/lib/activeSessionSyncPolicy.ts` | Pure decisions for autosave and remote snapshots while closure is pending. |
| `src/hooks/useActiveSession.ts` | Pause autosave during closure and restore pending intent on reload. |
| `src/pages/WorkoutPage.tsx` | Recovery panel and finish/discard state transitions. |
| `src/pages/DashboardPage.tsx` | Persistent projection status and manual retry. |
| `api/lib/workoutClosure.ts` | Validation and transactional finish/discard protocol. |
| `api/finalize-workout.ts` | Authenticated finalization handler. |
| `api/discard-session.ts` | Authenticated discard handler. |
| `api/lib/errors.ts`, `api/lib/http.ts` | Optional machine-readable API error codes. |
| `scripts/dev-api.ts` | Local routes for both new endpoints. |
| `firestore.rules` | Require `sessionId`, deny direct workout writes, block tombstoned sessions. |
| `tests/rules/firestore.rules.test.ts` | Security and resurrection regression coverage. |
| `tests/integration/workoutClosure.integration.test.ts` | Transaction, retry, concurrency, and conflict evidence. |
| `tests/integration/workoutProjection.integration.test.ts` | Renamed `WORKOUT-04` protected baseline. |
| `tests/e2e/workout-lifecycle.spec.ts` | Recovery, pending projection, reload, and two-client behavior. |
| `tests/e2e/support/workoutLifecycleEmulator.ts` | Phase 1 seed/read/cleanup helpers. |
| `vitest.workout-integration.config.ts` | Focused Admin/Web SDK emulator suite. |
| `package.json` | `test:integration:workout` and `test:e2e:workout` commands. |

---

### Task 1: Add stable session identity and legacy normalization

**Files:**
- Create: `src/lib/sessionIdentity.ts`
- Create: `src/lib/__tests__/sessionIdentity.test.ts`
- Modify: `src/store/workoutStore.ts`
- Modify: `src/store/workoutStore.test.ts`
- Modify: `src/lib/activeSessionService.ts`
- Modify: `src/lib/activeSessionBackup.ts`
- Create: `src/lib/__tests__/activeSessionBackup.test.ts`
- Modify: `src/lib/templateService.ts`
- Modify: `src/lib/__tests__/activeSessionService.test.ts`
- Modify fixtures returned by `rg -l "ActiveWorkout|hydrateFromDoc" src tests`

**Produces:** required `ActiveWorkout.sessionId`, one ID generator, and deterministic migration of old active documents/backups.

- [ ] **Step 1: Write failing identity tests**

Add `src/lib/__tests__/sessionIdentity.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createSessionId, deriveLegacySessionId, normalizeSessionId } from '../sessionIdentity'

describe('session identity', () => {
  it('creates a Firestore-safe UUID', () => {
    expect(createSessionId()).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/)
  })

  it('keeps an existing session id', () => {
    expect(normalizeSessionId('session-123', 'user-1', 500)).toBe('session-123')
  })

  it('derives the same user-scoped legacy id on every client', () => {
    expect(normalizeSessionId(undefined, 'user-1', 500))
      .toBe(deriveLegacySessionId('user-1', 500))
  })
})
```

Extend store, service, and backup tests to assert:

- `startWorkout()` assigns one ID;
- store edits preserve that ID;
- a new template workout receives an ID;
- `activeSessionDocument()` includes `sessionId`;
- a remote document without it hydrates as `legacy-${ownerToken}-${startedAt}`;
- an old local backup hydrates with the same legacy ID.

- [ ] **Step 2: Verify RED**

Run:

```bash
npx vitest run src/lib/__tests__/sessionIdentity.test.ts src/lib/__tests__/activeSessionService.test.ts src/lib/__tests__/activeSessionBackup.test.ts src/store/workoutStore.test.ts
```

Expected: FAIL because the helper and required field do not exist.

- [ ] **Step 3: Implement the minimal identity helper**

Create:

```ts
export function createSessionId(): string {
  return crypto.randomUUID()
}

export function normalizeSessionId(value: unknown, userId: string, startedAt: number): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  return deriveLegacySessionId(userId, startedAt)
}
```

Add `sessionId: string` to `ActiveWorkout`. Call `createSessionId()` only when starting a genuinely new workout or building one from a template. Do not generate an ID during hydration.

In `parseSessionDoc`, calculate `startedAt` first, then call `normalizeSessionId(data.sessionId, startedAt)`. Apply the same rule in `readActiveSessionBackup`.

`refreshStaleActiveSession()` must preserve the original `sessionId` even though it refreshes `startedAt`.

- [ ] **Step 4: Update compile-time fixtures mechanically**

Use:

```bash
rg -l "ActiveWorkout|hydrateFromDoc" src tests
```

Add stable test IDs such as `sessionId: 'session-1'`. Do not use a new random value inside expected objects.

- [ ] **Step 5: Verify GREEN and regressions**

Run:

```bash
npx vitest run src/lib/__tests__/sessionIdentity.test.ts src/lib/__tests__/activeSessionService.test.ts src/lib/__tests__/activeSessionBackup.test.ts src/lib/__tests__/sessionDuration.test.ts src/lib/__tests__/templateService.test.ts src/lib/__tests__/templateLaunchService.test.ts src/store/workoutStore.test.ts
npm run lint
npm run build
```

Expected: focused tests, lint, and build pass; every new session has exactly one stable ID.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/lib/sessionIdentity.ts src/lib/__tests__/sessionIdentity.test.ts src/store/workoutStore.ts src/store/workoutStore.test.ts src/lib/activeSessionService.ts src/lib/activeSessionBackup.ts src/lib/__tests__/activeSessionBackup.test.ts src/lib/templateService.ts src/lib/__tests__/activeSessionService.test.ts src/lib/__tests__/sessionDuration.test.ts src/lib/__tests__/templateService.test.ts src/lib/__tests__/templateLaunchService.test.ts src/lib/__tests__/workoutLifecycle.test.ts src/lib/__tests__/workoutService.test.ts tests/review/workoutPersistence.review.test.ts
git commit -m "feat: add stable workout session identity"
```

---

### Task 2: Enforce tombstones and server-owned workouts in Firestore rules

**Files:**
- Modify: `firestore.rules`
- Modify: `tests/rules/firestore.rules.test.ts`

**Produces:** the rule-level invariant preventing `WORKOUT-06` and client-side workout duplication.

- [ ] **Step 1: Add failing rules tests**

Extend `activeSessions rules` with cases that:

1. allow a valid session containing `sessionId`;
2. reject a session without `sessionId`;
3. seed `closedSessions/session-1` through `withSecurityRulesDisabled`, then reject create and update of an active session using `session-1`;
4. create a newer active session with `sessionId: 'session-2'`, then reject a late update whose payload uses tombstoned `session-1` and verify the newer document remains unchanged;
5. reject client read/write on `closedSessions`;
6. reject client create on `workouts` while preserving owner read of Admin-seeded history.

Update `validActiveSession()` to contain `sessionId: 'session-1'`.

- [ ] **Step 2: Verify RED**

Run:

```bash
npm run test:rules
```

Expected: new tombstone and server-owned-workout assertions fail under current rules.

- [ ] **Step 3: Implement the rule contract**

Update `isActiveSession` so its keys include `sessionId`, validate it with `isDocumentId`, and add:

```text
!exists(/databases/$(database)/documents/closedSessions/$(data.sessionId))
```

Use the request payload for both create and update. Do not require read permission on the tombstone.

Change `workouts/{id}` to owner read only:

```text
allow read: if ownsDoc();
allow create, update, delete: if false;
```

Add:

```text
match /closedSessions/{id} {
  allow read, write: if false;
}
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm run test:rules
npm run lint
```

Expected: all rule tests pass. The late write cannot recreate or replace a session.

- [ ] **Step 5: Commit Task 2**

```bash
git add firestore.rules tests/rules/firestore.rules.test.ts
git commit -m "feat: guard closed workout sessions"
```

---

### Task 3: Implement the idempotent server closure protocol

**Files:**
- Create: `api/lib/workoutClosure.ts`
- Create: `api/finalize-workout.ts`
- Create: `api/discard-session.ts`
- Modify: `api/lib/errors.ts`
- Modify: `api/lib/http.ts`
- Modify: `api/lib/__tests__/http.test.ts`
- Modify: `api/lib/workoutValidation.ts`
- Modify: `scripts/dev-api.ts`
- Create: `tests/integration/workoutClosure.integration.test.ts`
- Move behavior from: `tests/review/workoutPersistence.review.test.ts`
- Move: `tests/review/workoutProjection.review.test.ts` → `tests/integration/workoutProjection.integration.test.ts`
- Remove: `vitest.workout-review.config.ts`
- Create: `vitest.workout-integration.config.ts`
- Modify: `package.json`

**Produces:** atomic finish/discard, deterministic workout ID, typed conflicts, and an emulator integration command.

- [ ] **Step 1: Add failing parser and API error tests**

Add unit cases for:

- a valid finalize body;
- missing or unsafe `sessionId`;
- invalid `exerciseSource`, set, label, `finishedAt < startedAt`, and duration beyond the existing active-session cap;
- request-supplied `userId`, `materialized`, or `closedAt` being rejected as unexpected fields;
- `ApiError(409, ..., { code: 'session_mismatch' })` serializing `{ error, code }` without changing existing errors that have no code.

The normalized finish input is:

```ts
export interface FinalizeWorkoutInput {
  sessionId: string
  templateId: string | null
  startedAt: number
  finishedAt: number
  label: string | null
  exercises: ValidatedWorkoutExercise[]
}
```

- [ ] **Step 2: Add failing emulator integration tests**

Create `tests/integration/workoutClosure.integration.test.ts` with Admin-seeded active sessions and the following cases:

- first finish creates `workouts/{sessionId}` and `closedSessions/{sessionId}`, then removes `activeSessions/{uid}`;
- a second finish with the same ID returns the existing workout and leaves one document;
- two concurrent finishes produce one logical workout;
- an injected lost acknowledgement after the transaction followed by retry produces one workout;
- a materialization failure returns `projection_pending` while workout and tombstone stay committed;
- a retry changes the response to `materialized` after the materializer succeeds;
- discard is idempotent and creates no workout;
- missing active session fails unless an owned compatible discard tombstone already proves an idempotent retry;
- `session_mismatch` does not delete a newer active session;
- a `finished` tombstone cannot become `discarded`, and vice versa.

Inject only `db`, `now`, and `materialize` through test options. Do not expose these switches through HTTP.

- [ ] **Step 3: Create the focused integration command and verify RED**

Replace the Phase R config with `vitest.workout-integration.config.ts`, including `tests/integration/**/*.integration.test.ts`. Add:

```json
"test:integration:workout": "FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 firebase emulators:exec --only firestore --project demo-ironlog \"vitest run --config vitest.workout-integration.config.ts\""
```

Move the projection checkpoint suite without changing its assertions. Remove the old persistence review suite after its failing scenarios have been replaced by closure regression cases. Git history and the Phase R audit retain the original evidence.

Run:

```bash
npx vitest run api/lib/__tests__/http.test.ts api/lib/__tests__/workoutValidation.test.ts
npm run test:integration:workout
```

Expected: FAIL because the closure module and endpoints do not exist.

- [ ] **Step 4: Implement transaction semantics**

Expose:

```ts
export type FinalizeWorkoutStatus = 'materialized' | 'projection_pending'
export type ClosedSessionOutcome = 'finished' | 'discarded'

export async function finalizeWorkoutForUser(
  userId: string,
  input: FinalizeWorkoutInput,
  options?: WorkoutClosureOptions,
): Promise<{ workoutId: string; status: FinalizeWorkoutStatus }>

export async function discardSessionForUser(
  userId: string,
  sessionId: string,
  options?: WorkoutClosureOptions,
): Promise<{ status: 'discarded' }>
```

Inside the finish transaction:

1. read workout, tombstone, and `activeSessions/{uid}` before writes;
2. verify ownership and matching identity for existing documents;
3. if already finished, return the stored workout state without rewriting its payload;
4. otherwise require the active session to match `sessionId`;
5. create `workouts/{sessionId}` with `sessionId`, `userId`, `materialized: false`, and normalized fields;
6. create the `finished` tombstone;
7. delete the matching active document.

Call the existing `materializeWorkoutForUser()` after the transaction. Convert only materialization failure to `projection_pending`; transaction/auth/validation/conflict failures remain errors.

Discard follows the same ownership/conflict checks but creates only a tombstone and deletes the matching active session. It never creates a first tombstone without a matching active document; absence is successful only for an existing owned compatible discard tombstone.

- [ ] **Step 5: Add endpoint handlers and local routes**

Both handlers must:

- accept only POST;
- call `requireUserId`;
- use `readJsonBody` with an explicit cap;
- return structured success JSON;
- use `sendApiError` for typed errors.
- map unexpected non-`ApiError` failures to a non-sensitive HTTP 500.

Register both routes in `scripts/dev-api.ts`.

- [ ] **Step 6: Verify GREEN and protected projection behavior**

Run:

```bash
npx vitest run api/lib/__tests__/http.test.ts api/lib/__tests__/workoutValidation.test.ts
npm run test:integration:workout
npm run lint
npm run build
```

Expected: parser/unit tests and all closure integration cases pass. Existing projection retry cases remain green.

- [ ] **Step 7: Commit Task 3**

```bash
git add api/lib/workoutClosure.ts api/finalize-workout.ts api/discard-session.ts api/lib/errors.ts api/lib/http.ts api/lib/__tests__/http.test.ts api/lib/workoutValidation.ts api/lib/__tests__/workoutValidation.test.ts scripts/dev-api.ts tests/integration/workoutClosure.integration.test.ts tests/integration/workoutProjection.integration.test.ts tests/review/workoutPersistence.review.test.ts tests/review/workoutProjection.review.test.ts vitest.workout-integration.config.ts vitest.workout-review.config.ts package.json
git commit -m "feat: add idempotent workout closure api"
```

---

### Task 4: Persist closure intent and classify ambiguous client outcomes

**Files:**
- Create: `src/lib/workoutClosureIntent.ts`
- Create: `src/lib/__tests__/workoutClosureIntent.test.ts`
- Create: `src/lib/workoutClosureService.ts`
- Create: `src/lib/__tests__/workoutClosureService.test.ts`
- Modify: `src/lib/workoutService.ts`
- Modify: `src/lib/__tests__/workoutService.test.ts`
- Modify: `src/lib/workoutLifecycle.ts`
- Modify: `src/lib/__tests__/workoutLifecycle.test.ts`

**Produces:** a durable retry snapshot and typed distinction between confirmed, ambiguous, and definitive results.

- [ ] **Step 1: Add failing intent tests**

Cover:

- separate local-storage key per UID;
- round-trip for `finish` and `discard`;
- complete session snapshot including `sessionId` and `exerciseSource`;
- malformed JSON, wrong UID, invalid action, and missing session returning `null`;
- explicit clear after confirmed completion;
- no age-based deletion while closure is unresolved.

Use:

```ts
export type WorkoutClosureIntent =
  | { action: 'finish'; session: ActiveWorkout; createdAt: number }
  | { action: 'discard'; session: ActiveWorkout; createdAt: number }
```

- [ ] **Step 2: Add failing service tests**

Mock `auth.currentUser.getIdToken` and `fetch`. Assert:

- finalize sends the finished payload without `userId` or `materialized`;
- `200 { status: 'materialized' }` and `projection_pending` are returned exactly;
- discard returns `discarded`;
- rejected `fetch`, an unreadable response, and HTTP 5xx throw `WorkoutClosureError` with `kind: 'ambiguous'`;
- 400/409 with a code throw `kind: 'definitive'` and preserve `session_mismatch`;
- retry reuses the same `sessionId`.

- [ ] **Step 3: Rewrite lifecycle tests to express the target ordering and verify RED**

Replace the Phase R expectations that clear local state before remote cleanup. New assertions:

```text
prepare-intent → request → confirmed-clear
```

For ambiguous failure:

```text
prepare-intent → request-fails → keep-intent-and-session
```

For stale discard, assert replacement creation occurs only after confirmed discard.

Run:

```bash
npx vitest run src/lib/__tests__/workoutClosureIntent.test.ts src/lib/__tests__/workoutClosureService.test.ts src/lib/__tests__/workoutLifecycle.test.ts src/lib/__tests__/workoutService.test.ts
```

Expected: FAIL under the Phase R lifecycle contract.

- [ ] **Step 4: Implement the client contract**

Move finished-payload construction from the old direct `addDoc` path into a pure exported builder used by `finalizeWorkout`. Remove `addDoc` and the production `WorkoutWritePort`; workout creation now belongs only to the endpoint.

Keep `materializeWorkout(workoutId)` for dashboard retry. Add a public one-workout retry function if needed by Task 6.

Implement one generic closure orchestrator or equivalent small functions that:

- persist the intent before the request;
- never clear Zustand, backup, or intent on ambiguous failure;
- return `closure_unconfirmed` instead of swallowing the error;
- clear local state only after confirmed endpoint success;
- create a replacement stale session only after confirmed discard.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npx vitest run src/lib/__tests__/workoutClosureIntent.test.ts src/lib/__tests__/workoutClosureService.test.ts src/lib/__tests__/workoutLifecycle.test.ts src/lib/__tests__/workoutService.test.ts
npm run lint
npm run build
```

Expected: no direct workout create remains in the client; ambiguous failure preserves all retry data.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/lib/workoutClosureIntent.ts src/lib/__tests__/workoutClosureIntent.test.ts src/lib/workoutClosureService.ts src/lib/__tests__/workoutClosureService.test.ts src/lib/workoutService.ts src/lib/__tests__/workoutService.test.ts src/lib/workoutLifecycle.ts src/lib/__tests__/workoutLifecycle.test.ts
git commit -m "feat: persist workout closure recovery intent"
```

---

### Task 5: Integrate recoverable finish and discard into the workout UI

**Files:**
- Modify: `src/hooks/useActiveSession.ts`
- Create: `src/lib/activeSessionSyncPolicy.ts`
- Create: `src/lib/__tests__/activeSessionSyncPolicy.test.ts`
- Modify: `src/pages/WorkoutPage.tsx`
- Modify: `src/index.css` only if existing panel/button utilities cannot express the recovery panel

**Produces:** autosave pause, reload recovery, honest blocking UI, and safe stale-session replacement.

- [ ] **Step 1: Add failing sync-policy tests**

Extract pure decisions into `activeSessionSyncPolicy.ts` and cover them without real timers or network:

- a matching pending intent blocks active-session persistence;
- a pending intent retains its snapshot when the remote active document disappears;
- no intent accepts an authoritative `onSnapshot` remote deletion and clears stale local state;
- a write failure, including same-session `permission-denied`, preserves local and recovery state because it is not authoritative proof of a tombstone or remote closure;
- an authoritative `onSnapshot` with a different active `sessionId` replaces the stale local session;
- cache or pending-write metadata never clear/replace recovery or become the authoritative remote reference;
- autosave failure exposes persistent hook state, preserves backup, and clears only after successful write/retry or resolving authoritative reconciliation;
- confirmed stale discard permits replacement creation; ambiguous discard does not.

**Approved implementation correction:** only authoritative `onSnapshot` reconciliation (`remote null` or a different session) may clear or replace local state. A rejected write reports a sync error and waits for that reconciliation. The hook still owns timer cancellation and storage calls. Focused Playwright in Task 7 proves the complete browser behavior.

Authoritative means exactly `fromCache === false && hasPendingWrites === false`. `WorkoutPage` renders a compact persistent Polish sync-warning panel with `Ponów synchronizację`; console logging is diagnostic only.

- [ ] **Step 2: Verify RED**

Run:

```bash
npx vitest run src/lib/__tests__/activeSessionSyncPolicy.test.ts src/lib/__tests__/workoutLifecycle.test.ts src/lib/__tests__/activeSessionService.test.ts
```

Expected: current hook still clears too early and reschedules persistence.

- [ ] **Step 3: Refactor `useActiveSession` around closure state**

The hook should expose a small contract similar to:

```ts
type ClosureUiState = 'idle' | 'submitting' | 'closure_unconfirmed' | 'session_mismatch'

{
  closureIntent,
  closureState,
  beginClosure,
  confirmClosure,
  markClosureUnconfirmed,
  reloadCurrentSession,
  // existing ready/stale-session operations
}
```

Keep timer cancellation in one helper. Every write path (`debounce`, `pagehide`, `visibilitychange`, backup restore, initial empty-session creation) must check for a pending closure intent before persisting.

- [ ] **Step 4: Replace `WorkoutPage` finish/discard flows**

Finish and discard use the endpoint services and the same captured intent. Remove the old `clearSession()` delete sequence.

UI rules:

- `submitting`: disable editing and close actions;
- `materialized`: clear confirmed state, navigate, show `Trening zapisany!`;
- `projection_pending`: clear confirmed state, navigate, show `Trening zapisany. Statystyki oczekują na synchronizację.`;
- `closure_unconfirmed`: stay on the workout page, keep the snapshot visible, show a persistent panel and `Spróbuj ponownie`;
- `session_mismatch`: show a persistent message and `Wczytaj aktualny stan`;
- stale discard does not announce success or create replacement before confirmation.

Do not rely on a toast as the only recovery surface.

- [ ] **Step 5: Verify focused behavior**

Run:

```bash
npx vitest run src/lib/__tests__/activeSessionSyncPolicy.test.ts src/lib/__tests__/workoutLifecycle.test.ts src/lib/__tests__/activeSessionService.test.ts src/lib/__tests__/workoutClosureIntent.test.ts src/lib/__tests__/workoutClosureService.test.ts
npm run lint
npm run build
```

Expected: tests, lint, and build pass. No old `deleteActiveSession` call remains in finish/discard UI flows.

- [ ] **Step 6: Commit Task 5**

```bash
git add src/hooks/useActiveSession.ts src/lib/activeSessionSyncPolicy.ts src/lib/__tests__/activeSessionSyncPolicy.test.ts src/pages/WorkoutPage.tsx src/index.css
git commit -m "feat: integrate recoverable workout closure ui"
```

---

### Task 6: Make pending projection visible and manually recoverable

**Files:**
- Modify: `src/lib/workoutService.ts`
- Modify: `src/lib/__tests__/workoutService.test.ts`
- Modify: `src/pages/DashboardPage.tsx`
- Create: `src/components/workout/WorkoutProjectionStatus.tsx`
- Create: `src/pages/__tests__/DashboardProjectionStatus.test.tsx`
- Modify: `src/index.css` only if needed

**Produces:** persistent `projection_pending`, retry-in-progress, failure, and success feedback.

- [ ] **Step 1: Add failing service and UI tests**

Service tests assert that retrying one workout:

- calls `/api/materialize-workout` with the correct ID;
- returns success;
- exposes failure instead of swallowing it.

UI tests assert that a non-materialized history row:

- contains `Statystyki oczekują na synchronizację.` rather than only `sync`;
- shows `Ponów synchronizację` after automatic retry fails;
- disables the button and shows progress during retry;
- removes the pending state or refreshes the row after success.

- [ ] **Step 2: Verify RED**

Run:

```bash
npx vitest run src/lib/__tests__/workoutService.test.ts src/pages/__tests__/DashboardProjectionStatus.test.tsx
```

Expected: FAIL because dashboard has only the badge and no per-workout retry state.

- [ ] **Step 3: Implement per-workout projection state**

Use a local map keyed by workout ID with English states:

```ts
type ProjectionRetryState = 'idle' | 'retrying' | 'failed'
```

Keep the existing automatic retry, but record failures per workout. The manual button retries only that workout. On success, update or refetch the dashboard snapshot so the pending message disappears.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npx vitest run src/lib/__tests__/workoutService.test.ts src/pages/__tests__/DashboardProjectionStatus.test.tsx
npm run lint
npm run build
```

- [ ] **Step 5: Commit Task 6**

```bash
git add src/lib/workoutService.ts src/lib/__tests__/workoutService.test.ts src/components/workout/WorkoutProjectionStatus.tsx src/pages/DashboardPage.tsx src/pages/__tests__/DashboardProjectionStatus.test.tsx src/index.css
git commit -m "feat: expose workout projection recovery actions"
```

---

### Task 7: Replace Phase R reproductions with Phase 1 regression E2E

**Files:**
- Create: `tests/e2e/workout-lifecycle.spec.ts`
- Remove: `tests/e2e/workout-lifecycle-review.spec.ts`
- Create: `tests/e2e/support/workoutLifecycleEmulator.ts`
- Remove: `tests/e2e/support/workoutReviewEmulator.ts`
- Create: `tests/e2e/support/workoutLifecycleDiagnostics.ts`
- Remove: `tests/e2e/support/workoutReviewDiagnostics.ts`
- Modify: `tests/e2e/fixtures.ts` only if a precise expected diagnostic is needed
- Modify: `package.json`
- Modify: `docs/audits/2026-07-11-phase-r-workout-lifecycle-review.md`

**Produces:** browser-level evidence for all user-visible Phase 1 outcomes without retaining misleading tests that expect the bugs.

- [ ] **Step 1: Prepare Phase 1 emulator helpers**

Helpers must seed/read/clean:

- `activeSessions` with `sessionId`;
- `workouts`;
- `closedSessions`;
- related `exerciseSessions` and `records` created by the test.

Use `phase-1-` IDs and labels. Refuse to run outside the Auth and Firestore emulators. Cleanup gathers all failures and throws one `AggregateError`.

At the same time replace `test:e2e:workout-review` in `package.json` with:

```json
"test:e2e:workout": "E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog \"playwright test tests/e2e/workout-lifecycle.spec.ts --project=desktop\""
```

- [ ] **Step 2: Write failing browser scenarios**

Cover at least:

1. normal finish creates one workout, removes active session, creates tombstone, and stays closed after reload;
2. route the real finalize request through `route.fetch()`, then abort the browser response to simulate acknowledgement loss; verify `closure_unconfirmed`, click retry, and assert one workout;
3. ordinary discard acknowledgement loss stays on the workout page and succeeds on retry;
4. stale discard creates a new session only after confirmed success and uses a different `sessionId`;
5. mocked `projection_pending` response produces the correct finish toast and dashboard persistent status; before fulfilling the response, the helper must apply the equivalent committed workout/tombstone/session-delete state so UI and Firestore do not disagree;
6. failed dashboard materialization shows `Ponów synchronizację`, and a later success clears the failure;
7. client B goes offline and queues an edit, client A closes the session, client B reconnects, and the active session remains absent;
8. if client A has already started a new session, client B's old queued write cannot replace it.

Keep client B open after the rules rejection in scenarios 7–8. Assert its pending/cache state does not prematurely clear or replace recovery, then wait for the authoritative `onSnapshot` result in local UI and verify final Admin state.

Every independent client uses a separate observed `BrowserContext`.

- [ ] **Step 3: Run the new acceptance suite**

Run:

```bash
npm run test:e2e:workout
```

Expected: scenarios may already pass because Tasks 1–6 implemented their lower-level contracts. Any failure must identify missing integration wiring, not trigger a new architecture. Do not weaken an assertion merely to obtain GREEN.

- [ ] **Step 4: Finish only the minimal wiring exposed by E2E**

Fix integration defects in the owning modules. Do not place test-only branches in production code. Add exact diagnostic predicates only for expected offline/tombstone permission errors.

- [ ] **Step 5: Remove obsolete bug-expecting tests and preserve history**

Delete Phase R tests that assert duplicate creation or resurrection. Keep the Phase R audit as historical evidence and add a short note that its reproductions describe baseline commit `448e46a`; Phase 1 regression paths supersede the removed runtime tests.

- [ ] **Step 6: Verify GREEN and repeat for flake resistance**

Run:

```bash
npm run test:integration:workout
npm run test:e2e:workout
npm run test:e2e:workout
```

Expected: both integration and two consecutive browser runs pass; cleanup leaves no Phase 1 workout, tombstone, projection, or active session.

- [ ] **Step 7: Commit Task 7**

```bash
git add tests/e2e/workout-lifecycle.spec.ts tests/e2e/workout-lifecycle-review.spec.ts tests/e2e/support/workoutLifecycleEmulator.ts tests/e2e/support/workoutReviewEmulator.ts tests/e2e/support/workoutLifecycleDiagnostics.ts tests/e2e/support/workoutReviewDiagnostics.ts tests/e2e/fixtures.ts package.json docs/audits/2026-07-11-phase-r-workout-lifecycle-review.md
git commit -m "test: cover workout lifecycle recovery"
```

---

### Task 8: Run final gates and close Phase 1 documentation

**Files:**
- Modify: `docs/roadmap/ROADMAP.md`
- Modify: `docs/audits/2026-07-11-phase-r-workout-lifecycle-review.md`
- Modify: `docs/roadmap/specs/2026-07-11-phase-1-workout-lifecycle-integrity-design.md` only if implementation required an approved correction
- Modify: `docs/roadmap/plans/2026-07-11-phase-1-workout-lifecycle-integrity.md` only to record an approved deviation

**Produces:** one evidence-backed phase status and a release handoff that does not claim unrun production checks.

- [ ] **Step 1: Run the focused gates**

```bash
npm run lint
npm run test:unit
npm run test:rules
npm run test:integration:workout
npm run build
npm run test:e2e:workout
```

Expected:

- lint passes;
- all unit/support tests pass;
- all Firestore rules tests pass;
- closure and projection integration tests pass;
- production build passes;
- focused workout lifecycle Playwright passes.

- [ ] **Step 2: Run the broad isolated regression suite**

```bash
npm run test:e2e:isolated
```

Expected: all isolated critical/profile/exercises/templates scenarios pass.

- [ ] **Step 3: Prove each roadmap item from a named test**

Create a compact evidence table in the Phase R audit remediation section:

| Item | Required proof |
|---|---|
| `WORKOUT-01` | lost acknowledgement + retry + one workout |
| `WORKOUT-02` | no local clear before confirmed closure |
| `WORKOUT-03` | persisted intent + reload/retry |
| `WORKOUT-05` | three distinct UI outcomes and next actions |
| `WORKOUT-06` | tombstone rejects offline late write |

Keep `WORKOUT-04` marked `already_protected` with its integration retry test.

- [ ] **Step 4: Update roadmap status only after evidence is green**

Change Phase 1 from `READY` to `DONE`, record the implementing commit range, and keep `RELEASE-08` explicitly open for:

- full live Playwright with private `TEST_EMAIL` and `TEST_PASSWORD`;
- production Vercel checks;
- production Firestore-rules publication in the approved rollout order.

Add the rollout handoff:

1. deploy API and SPA;
2. smoke-test finish/discard;
3. publish restrictive Firestore rules.

- [ ] **Step 5: Run documentation and repository checks**

```bash
git diff --check
rg -n "Phase 1|WORKOUT-0[1-6]|RELEASE-08|448e46a" docs/roadmap/ROADMAP.md docs/audits/2026-07-11-phase-r-workout-lifecycle-review.md
git status --short
```

Expected: no whitespace errors, Phase 1 and audit agree, and only intended documentation changes remain.

- [ ] **Step 6: Request final independent review**

The reviewer checks:

- idempotency under transaction retry and acknowledgement loss;
- ownership and conflict handling;
- no local data loss on ambiguous outcomes;
- no resurrection from offline clients;
- honest persistent UI states;
- migration safety for sessions without `sessionId`;
- no expansion into Phase 2 or release work.

Resolve all Critical and Important findings, then rerun affected gates and the final focused suite.

- [ ] **Step 7: Commit Task 8**

```bash
git add docs/roadmap/ROADMAP.md docs/audits/2026-07-11-phase-r-workout-lifecycle-review.md docs/roadmap/specs/2026-07-11-phase-1-workout-lifecycle-integrity-design.md docs/roadmap/plans/2026-07-11-phase-1-workout-lifecycle-integrity.md
git commit -m "docs: complete workout lifecycle integrity phase"
```

## Final acceptance checklist

- [ ] Same `sessionId` always maps to one logical workout.
- [ ] Finish transaction atomically creates workout/tombstone and closes the active session.
- [ ] Discard transaction atomically tombstones and closes the active session.
- [ ] Ambiguous response keeps a durable intent and visible retry.
- [ ] Confirmed response is the only path that clears local recovery data.
- [ ] `projection_pending` remains visible and manually retryable.
- [ ] A late offline write cannot recreate or replace a closed session.
- [ ] Legacy active sessions and backups receive deterministic IDs.
- [ ] `WORKOUT-04` projection convergence remains green.
- [ ] No production fault injection or weakened rule exists.
- [ ] Lint, unit, rules, integration, build, focused E2E, and isolated E2E pass.
- [ ] Roadmap, audit, spec, and code use the same scope and status names.
- [ ] Live production verification remains assigned to `RELEASE-08` until actually run.
