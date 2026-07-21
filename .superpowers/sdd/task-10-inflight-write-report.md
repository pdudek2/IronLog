# Task 10 — in-flight closed-session write completion

## Root cause

`persistSession(snapshot)` rejected new writes for the confirmed closed session,
but a write already started before `confirmClosure()` still ran its completion
handlers. Its late rejection set the sync state to `failed` and logged an error;
its late success could reset a newer replacement-session failure to `idle`.

## TDD evidence

RED, before the production change:

- command: `npm run test:unit -- src/pages/__tests__/useActiveSessionAuthority.test.tsx`
- result: 2 failed, 4 passed
- observed failures:
  - late rejected closed-session write returned `failed` instead of `idle`
  - late successful closed-session write returned `idle` instead of preserving the
    replacement write's `failed` state

GREEN, after the production change:

- focused test: 6/6 passed
- full unit suite: 51 files, 342/342 passed
- lint: passed
- production build: passed, 877 modules transformed

## Implementation

Both the success and failure handlers of `persistSession(snapshot)` now compare
the captured snapshot ID with `confirmedClosedSessionIdRef.current` before
changing status or logging. Only completion from the exact confirmed closed
session is ignored. A replacement-session rejection remains visible as `failed`
and is still logged.

The regression coverage also verifies that neither late completion resurrects
the closed workout and that a late old success cannot hide a newer failure.

## Re-review follow-up: consecutive closures

The first guard retained only one closed session ID. A second confirmed closure
therefore replaced the first identity and allowed a still-pending completion or
authoritative snapshot for the first session through.

RED reproduced all three consequences after closing session A and then B:

- an authoritative snapshot for A resurrected it;
- a late rejection for A set the sync status to `failed` and logged an error;
- a late success for A reset the real failure of a newer session C to `idle`.

The hook now retains a `Set` of every confirmed closed session ID for the current
user lifecycle. One predicate is used consistently by snapshot reconciliation,
write start and completion, store persistence, page flush, and manual retry. The
set is reset whenever `uid` changes, so an ID from one account cannot suppress a
valid session belonging to another account.

GREEN evidence:

- focused authority tests: 7/7 passed, including the user-change reset contract;
- full unit suite: 51 files, 344/344 passed;
- lint: passed;
- production build: passed, 877 modules transformed.

## Re-review follow-up: retry and user lifecycle generations

The closed-ID set still left two completion paths unsafe:

- `retryActiveSessionSync()` checked the ID only before its `await`;
- changing `uid` reset the closed-ID set, so an old user's pending promise lost
  its closure protection.

RED reproduced four failures:

- retry rejection for A after confirmed closure A changed `retrying` to `failed`
  and logged;
- retry success for closed A hid a real retry failure for replacement B;
- old user-1 persistence rejection changed user-2 state to `failed` and logged;
- old user-1 persistence success hid a real user-2 persistence failure.

Each write now captures `{ generation, sessionId }`. A shared predicate permits
completion side effects only while both the user lifecycle generation is still
current and the session ID has not been confirmed closed. The effect captures
its own generation for persistence, increments the generation on uid changes,
and invalidates it on cleanup/unmount.

The same post-completion rule is applied to automatic persistence, manual retry,
stale-session continuation, and stale-session replacement persistence. Errors
from the current generation remain visible and logged; stale completions are
ignored.

GREEN evidence:

- focused authority tests: 11/11 passed;
- full unit suite: 51 files, 348/348 passed;
- lint: passed without warnings;
- production build: passed, 877 modules transformed.

## Re-review follow-up: hook-to-UI invalidation feedback

Write-side guards prevented stale state mutation, but the public hook operations
did not describe invalidation to their caller. `continueStaleSession()` returned
`void` after a stale success and propagated a stale rejection; `WorkoutPage`
therefore displayed success or error feedback for an operation that no longer
belonged to the mounted user lifecycle. Stale discard had the same result gap.

RED reproduced six failures covering missing completed/ignored results, stale
rejection propagation, and a discarded result escaping after uid/unmount
invalidation.

The continuation now returns an explicit English status of `completed` or
`ignored`. A current failure still rejects. Stale success or failure after
confirmed closure, uid change, or unmount resolves as `ignored`. Stale discard
also returns `ignored` after lifecycle invalidation, including its catch path;
current successful discard keeps its existing `discarded` result. Discard result
validity uses the lifecycle generation rather than the now-closed stale session
ID.

`WorkoutPage` reports success only for completed/current results and reports an
error only for a real current rejection. It emits no toast for `ignored`.

Focused GREEN evidence: 2 files, 24/24 tests passed (19 hook contracts and 5
page-level feedback contracts).

Full GREEN evidence:

- unit suite: 52 files, 361/361 passed;
- lint: passed without warnings;
- production build: passed, 877 modules transformed.
