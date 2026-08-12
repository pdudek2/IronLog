# Task 2 — localized progress heatmap dates

## Outcome

- Added `formatHeatmapDate`, parsing date-only heatmap keys at local noon and reusing the existing Polish date formatter.
- Applied it to the visible peak summary, heatmap accessible name, and all heatmap cell titles.
- Strengthened the existing ProgressPage test with exact visible and accessible localized-date assertions, with `Date.now()` pinned to `NOW`.

## TDD evidence

- RED: `NODE_OPTIONS=--no-experimental-webstorage npx vitest run src/pages/__tests__/ProgressPage.test.tsx -t "uses source-aware strength keys"` failed because the summary still rendered `2026-07-07`.
- GREEN: the same focused command passed after the production change.

## Verification

- `NODE_OPTIONS=--no-experimental-webstorage npx vitest run src/pages/__tests__/ProgressPage.test.tsx` — 12 passed.
- `npm run lint` — passed.
- `npm run build` — passed.
- `git diff --check` — passed.

## Scope

Changed only `src/pages/ProgressPage.tsx` and `src/pages/__tests__/ProgressPage.test.tsx` (plus this report). No dependencies or layout/class changes.
