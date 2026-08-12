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

## Fix round 1

- Replaced the peak fixture's UTC timestamp with `new Date(2026, 6, 7, 12).getTime()`, so its intended July 7 date is a local-noon instant in every process time zone.
- Added an exact populated-cell title assertion: `7 lip: 1.0k kg`.
- RED reproduction: `TZ=Pacific/Kiritimati NODE_OPTIONS=--no-experimental-webstorage npx vitest run src/pages/__tests__/ProgressPage.test.tsx -t "uses source-aware strength keys"` — failed before the fixture adjustment because the visible peak was no longer July 7.
- GREEN focused tests: `NODE_OPTIONS=--no-experimental-webstorage npx vitest run src/pages/__tests__/ProgressPage.test.tsx -t "uses source-aware strength keys"` and `TZ=Pacific/Kiritimati NODE_OPTIONS=--no-experimental-webstorage npx vitest run src/pages/__tests__/ProgressPage.test.tsx -t "uses source-aware strength keys"` — passed.
- Full tests: `NODE_OPTIONS=--no-experimental-webstorage npx vitest run src/pages/__tests__/ProgressPage.test.tsx` and `TZ=Pacific/Kiritimati NODE_OPTIONS=--no-experimental-webstorage npx vitest run src/pages/__tests__/ProgressPage.test.tsx` — 12 passed in each time zone.
- Gates: `npm run lint`, `npm run build`, and `git diff --check` — passed.
