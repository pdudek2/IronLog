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
