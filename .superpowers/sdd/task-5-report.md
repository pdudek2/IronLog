# Task 5 RED/GREEN report

## Scope

Implemented recoverable finish, ordinary discard, and stale discard in `WorkoutPage` and `useActiveSession`. Added a pure active-session synchronization policy and wired it into both the hook and stale replacement lifecycle.

## RED

Added `src/lib/__tests__/activeSessionSyncPolicy.test.ts` first with six decisions:

1. matching pending intent blocks persistence;
2. remote deletion retains a matching closure snapshot;
3. remote deletion without intent clears stale local state;
4. permission denial is remote closure only for the same session ID;
5. a different remote session wins;
6. stale replacement requires confirmed discard.

Command:

```text
npx vitest run src/lib/__tests__/activeSessionSyncPolicy.test.ts src/lib/__tests__/workoutLifecycle.test.ts src/lib/__tests__/activeSessionService.test.ts
```

Observed expected failure:

```text
FAIL src/lib/__tests__/activeSessionSyncPolicy.test.ts
Error: Cannot find module '../activeSessionSyncPolicy'
Test Files 1 failed | 2 passed (3)
Tests 11 passed (11)
```

The missing policy module established the RED state before production implementation.

## GREEN implementation

- Added `activeSessionSyncPolicy.ts` and used its decisions in active-session reconciliation, persistence error handling, and stale replacement gating.
- Replaced all `WorkoutPage`/`useActiveSession` production uses of `clearSession` and direct `deleteActiveSession`.
- Added a UID-scoped closure state contract: captured intent, submitting, unconfirmed closure, mismatch, confirmed clear, and reload-current-state.
- Hydrates a stored intent snapshot on reload and never re-saves that matching session through debounce, pagehide, visibility change, backup restoration, or initial persistence.
- Retains the intent snapshot when the remote document disappears; only confirmed endpoint completion clears Zustand, active backup, and intent.
- Routes finish and both discard variants through endpoint-backed lifecycle functions with the same captured snapshot and `createdAt`.
- Creates a stale replacement only after confirmed discard; replacement gets the store's new session ID.
- Added persistent Polish recovery/mismatch panels and locked the workout editor with `inert` while closure is pending or unresolved.
- Handles same-session permission denial as remote closure and accepts a different remote session as authoritative.

Focused GREEN command:

```text
npx vitest run src/lib/__tests__/activeSessionSyncPolicy.test.ts src/lib/__tests__/workoutLifecycle.test.ts src/lib/__tests__/activeSessionService.test.ts src/lib/__tests__/workoutClosureIntent.test.ts src/lib/__tests__/workoutClosureService.test.ts
```

Result: 5 files passed, 42 tests passed.

Full unit command:

```text
npm run test:unit
```

Result: 27 files passed, 173 tests passed.

## Static verification

```text
npm run lint
```

Result: exit 0.

```text
npm run build
```

Result: exit 0. Vite emitted only the existing large-chunk advisory.

## Legacy-path audit

`rg` found no `deleteActiveSession`, `clearSession`, or direct `saveWorkout(...)` use in `src/pages/WorkoutPage.tsx` or `src/hooks/useActiveSession.ts`.

## Notes

- Browser-level loss-of-response and multi-client behavior remain assigned to Task 7 focused Playwright, as specified by the brief.
- No production fault injection or CSS changes were introduced.

## Review-fix wave: session ownership and definitive failures

### RED

Added four policy regressions before changing production code:

1. confirmation captured for session A preserves current/remote session B;
2. a newly loaded different stale remote returns `review_stale_remote` before hydration;
3. deletion of observed session B while intent A remains returns `retain_closure_snapshot`;
4. definitive `closure_conflict`, `session_not_active`, and auth-like errors do not map to `closure_unconfirmed`.

Command:

```text
npx vitest run src/lib/__tests__/activeSessionSyncPolicy.test.ts src/lib/__tests__/workoutLifecycle.test.ts src/lib/__tests__/activeSessionService.test.ts
```

Observed RED:

```text
Test Files 1 failed | 2 passed (3)
Tests 4 failed | 17 passed (21)

decideConfirmedClosure is not a function
expected 'accept_remote' to be 'review_stale_remote'
expected 'clear_local' to be 'retain_closure_snapshot'
classifyClosureFailure is not a function
```

Added a separate stale-replacement race test before wiring the final replacement gate:

```text
npx vitest run src/lib/__tests__/activeSessionSyncPolicy.test.ts
```

Observed RED:

```text
Test Files 1 failed (1)
Tests 1 failed | 10 passed (11)
expected true to be false
```

The failing case was confirmed discard A with current and remote session B; replacement C was still permitted.

### GREEN implementation

- Added explicit confirmation ownership policy. Confirming A clears only A; any different current or last-observed remote session is rehydrated/preserved with its backup.
- Added a last-remote-session ref so confirmation cannot infer authority solely from whichever session happens to be rendered.
- Reordered different-remote stale handling through `review_stale_remote`, preserving the existing “Wrócić do starej sesji?” decision surface before hydration.
- Made any pending closure intent retain and rehydrate its captured snapshot when the remote document disappears, including the A → B → deleted-B sequence. The state returns to persistent `closure_unconfirmed` and no generic empty/start flow is exposed.
- Rechecked session ownership immediately before stale replacement creation. A confirmed discard cannot create or persist C if B exists or won the race.
- Added distinct persistent states for `closure_conflict`, `auth_required`, and other definitive `closure_failed` responses. Conflict/session-not-active states offer loading current server state; auth-like states preserve recovery data and offer authentication reload.
- Removed the dead `saveError` state and render.

Focused GREEN:

```text
npx vitest run src/lib/__tests__/activeSessionSyncPolicy.test.ts src/lib/__tests__/workoutLifecycle.test.ts src/lib/__tests__/activeSessionService.test.ts src/lib/__tests__/workoutClosureIntent.test.ts src/lib/__tests__/workoutClosureService.test.ts
```

Result: 5 files passed, 46 tests passed.

Full unit verification:

```text
npm run test:unit
```

Result: 27 files passed, 178 tests passed.

Static verification:

```text
npm run lint
npm run build
```

Both exited 0. Build emitted only the existing chunk-size advisory.

Legacy/dead-state audit:

```text
rg -n "deleteActiveSession|clearSession|saveError" src/pages/WorkoutPage.tsx src/hooks/useActiveSession.ts
```

Result: no matches.

No component fault-injection test was added: the definitive-state transition is covered as a pure policy and the page renders each resulting state persistently; producing the error through `WorkoutPage` would require inventing runtime service fault injection outside this wave.
