# Task 10 report — stable template browser contracts

## Status

Complete. The focused diagnostics unit suite, no-retry desktop/mobile emulator browser matrix, lint, and production build are green.

## Root causes and implementation

- On mobile, the template-launch setup clicked the first `Dodaj ćwiczenie` control without positioning it away from the fixed save dock and BottomNav. The working CRUD path already scrolled the exact control, asserted that it was visible and enabled, centered it, and then clicked it.
- `template-launch.spec.ts` now reuses that interaction sequence through one local `openExercisePicker` helper for both template creation and fresh-workout setup.
- The intentional offline launch includes Firestore retry/backoff plus a deliberate reconnect wait. A clean mobile pass took more than the default 30-second test budget, and a desktop RED run expired at the final retry control for the same reason. Only that offline scenario now has a 60-second budget.
- A `fonts.gstatic.com` font request aborted during intentional navigation or teardown was classified as a blocking diagnostic. The classifier now treats it as non-blocking only when all four conditions hold: resource type `font`, error `net::ERR_ABORTED`, exact trusted HTTPS `fonts.gstatic.com` origin, and an active intentional navigation/teardown scope.
- The font rule is not a global ignore. Other resource types, errors, hosts, and the same request outside the explicit scope remain blocking.

## Files

- `tests/e2e/template-launch.spec.ts`
- `tests/e2e/support/browserDiagnostics.ts`
- `tests/e2e/support/browserDiagnostics.test.ts`
- `.superpowers/sdd/task-10-template-e2e-report.md`

`tests/e2e/templates.spec.ts` was used as the proven interaction reference and was not changed.

## TDD evidence

### Diagnostics RED

Command:

```bash
npx vitest run tests/e2e/support/browserDiagnostics.test.ts
```

Result: exit 1, 1 failed / 13 passed. The new regression test expected the scoped trusted Google font abort to be non-blocking but received `true`.

The test also proves every negative boundary remains blocking: no active scope, `net::ERR_FAILED`, resource type `script`, `fonts.googleapis.com`, and a lookalike `fonts.gstatic.com.evil.example` host.

### Diagnostics GREEN

The same command after the minimal classifier change passed: 1 file, 14/14 tests.

### Browser RED and GREEN

The previously captured mobile browser failure was the RED evidence for the obstructed bare click. The first post-fix focused run moved past that interaction on both viewports and passed 6/7 tests. Its only failure was the desktop offline scenario reaching the final retry click after the default 30-second test budget; the corresponding mobile scenario passed in 31.2 seconds.

After applying a 60-second budget only to the intentional offline test, the clean final command was:

```bash
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e npx firebase emulators:exec --only auth,firestore --project demo-ironlog "npx playwright test tests/e2e/template-launch.spec.ts tests/e2e/templates.spec.ts --project=desktop --project=mobile --retries=0"
```

Final result: exit 0, 7/7 passed in 1.9 minutes. This includes setup plus both template-launch scenarios and the CRUD/launch lifecycle on desktop and mobile, with retries disabled.

One intermediate rerun was discarded because a stale local port race left the API watcher alive without a listener on port 3000, producing `ECONNREFUSED`/502 cleanup failures. A direct API startup check succeeded; after stopping it and confirming ports 3000, 5174, 8080, and 9099 were clear, the clean final matrix above passed.

## Final verification

- Focused diagnostics unit: PASS, 1 file / 14 tests.
- Focused emulator E2E, desktop + mobile, retries disabled: PASS, 7/7 tests.
- `npm run lint -- --quiet`: PASS.
- `npm run build`: PASS; TypeScript and Vite production build completed, 877 modules transformed.
- `git diff --check`: PASS.

## Self-review

- The mobile interaction targets the exact first `Dodaj ćwiczenie` button and uses the proven scroll/visibility/enabled/center sequence before clicking.
- The increased timeout is local to the intentionally slow offline scenario; global Playwright timing and retries remain unchanged.
- The diagnostics exception requires the exact conjunction requested and retains blocking behavior for lookalike or out-of-scope failures.
- No application code, Firebase rules, data model, deployment configuration, push, or deploy was changed.
- No AI co-author trailer will be added to the commit.

## Concerns

None.
