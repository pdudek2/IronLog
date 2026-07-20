# Task 7 report — Polish copy and contrast contracts

## Status

Implementation complete. The focused unit suite, lint, and production build are green. A full required E2E run was green during development (31 passed, 6 expected skips), but the latest exact full rerun before the final test-cleanup refinement recorded one mobile diagnostic failure described under **Browser evidence**. The task coordinator requested finalization without another full E2E run, so this report does not claim a fresh all-green full run after that last refinement.

## Implementation

- Added the approved `getCategoryWorkloadInsight` mapping for all seven known categories plus a presentation-label fallback.
- Replaced the workout-detail label-lowercasing sentence with the copy helper.
- Applied `polishPlural` to both counts in the muscle-balance accessible summary.
- Changed the discard dialog actions to the unambiguous `Wróć` and `Odrzuć trening`, and updated affected browser locators to assert both labels.
- Changed only the approved contrast tokens: `--muted-soft`, `--primary-start`, `--primary-end`, and the primary gradient composition. `--accent` remains unchanged.
- Added a computed-style contrast scenario against real dashboard helper text and a real enabled primary CTA. The test resolves root tokens, inspects the actual painted surface and gradient, and evaluates default, hover, and active styles with a local WCAG luminance implementation.
- Updated lifecycle assertions to include the already-returned `exerciseNames` metadata and to verify the replacement session through viewport-independent state contracts.
- Made mobile workout cleanup wait for `document.fonts.ready`, preventing cleanup navigation from aborting an in-flight Google font without weakening browser diagnostics.
- Made the explicit-discard cleanup conditional after successful discard and kept only the redirect inside the existing narrow intentional-navigation diagnostic scope. No global diagnostic filter was loosened.

## Files

- `src/lib/workoutCopy.ts` (created)
- `src/lib/__tests__/workoutCopy.test.ts` (created)
- `src/lib/__tests__/polishPlural.test.ts`
- `src/pages/WorkoutDetailPage.tsx`
- `src/pages/ProgressPage.tsx`
- `src/pages/WorkoutPage.tsx`
- `src/pages/__tests__/ProgressPage.test.tsx`
- `src/index.css`
- `tests/e2e/contrast.spec.ts` (created)
- `tests/e2e/support/accountCleanup.ts`
- `tests/e2e/workout-guard.spec.ts`
- `tests/e2e/workout-lifecycle.spec.ts`
- `tests/e2e/workout-mobile.spec.ts`

## TDD evidence

### RED

Command:

```bash
npm run test:unit -- src/lib/__tests__/workoutCopy.test.ts src/lib/__tests__/polishPlural.test.ts src/pages/__tests__/ProgressPage.test.tsx
```

Result: exit 1 as expected.

- Vite could not resolve the not-yet-created `../workoutCopy` module.
- The rendered chart summary still exposed the incorrect `1 wpisów` / `2 wpisów` forms.
- The independently extended plural-helper cases already passed.

### GREEN

Fresh final command:

```bash
npm run test:unit -- src/lib/__tests__/workoutCopy.test.ts src/lib/__tests__/polishPlural.test.ts src/pages/__tests__/ProgressPage.test.tsx
```

Result: exit 0, 3 files passed, 27/27 tests passed.

The copy test covers all seven approved category sentences and the unknown-category fallback. The plural test covers `0, 1, 2, 4, 5, 12, 22`, and the rendered ProgressPage test proves `1 wpis` plus `2 wpisy` in the accessible chart summary.

## Browser evidence

Required command, using Auth and Firestore emulators and no retries:

```bash
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "npx playwright test tests/e2e/contrast.spec.ts tests/e2e/workout-guard.spec.ts tests/e2e/workout-lifecycle.spec.ts tests/e2e/workout-mobile.spec.ts --project=desktop --project=mobile --retries=0"
```

Run history:

- Initial post-change run: 15 passed, 6 skipped, 16 failed. Twelve failures came from the shared cleanup still locating `Anuluj trening`; four came from exact lifecycle metadata expectations omitting the existing `exerciseNames` field. Both causes were corrected.
- Subsequent complete run: exit 0, 31 passed, 6 expected skips, 0 failed.
- A later fresh run exposed two diagnostics during intentional cleanup/navigation: a local emulator Firestore Write-channel `net::ERR_ABORTED` and a Google-font `net::ERR_ABORTED`. The font case was corrected by waiting for `document.fonts.ready`; the Firestore case was kept inside the existing URL- and error-specific intentional-navigation classifier.
- Focused rerun of those two scenarios: exit 0, setup plus both scenarios passed (3/3).
- Latest exact full run before the final explicit-discard cleanup refinement: 30 passed, 6 expected skips, 1 failed. The only failure was the same mobile Firestore Write-channel abort emitted after the redirect scope. The final test-only refinement avoids starting and discarding a redundant replacement session in successful cleanup, and asserts dashboard state directly. Per coordinator direction, no further full E2E run was started.

The contrast scenario itself passed on desktop and mobile in every full run. It does not pass by comparing expected hex literals: it reads resolved computed colors, the actual helper surface, the CTA's computed gradient, and evaluates ratios for every relevant gradient stop in default, hover, and mouse-down states.

## Final verification

- Focused unit suite — exit 0, 3 files, 27/27 tests.
- `npm run lint -- --quiet` — exit 0, no lint errors.
- `npm run build` — exit 0; `tsc -b` and Vite production build passed, 877 modules transformed.
- `git diff --check` — exit 0.

## Self-review

- The helper text and dialog copy exactly match the approved Polish wording.
- Both top and total chart counts use the shared plural helper.
- `--accent`, category colors, and global microtype sizes were not changed.
- Contrast is checked on real rendered elements and computed interaction states.
- Backend discard semantics, Firestore rules, routing, and data models were not changed.
- Browser diagnostic handling remains narrow; no global ignore was added.
- No push or deployment was performed.

## Concern

The final explicit-discard test-only cleanup refinement has fresh unit/lint/build coverage, but not a fresh complete E2E pass because the coordinator explicitly stopped additional browser runs. The integration owner should include the required no-retry desktop/mobile command in the aggregate verification.
