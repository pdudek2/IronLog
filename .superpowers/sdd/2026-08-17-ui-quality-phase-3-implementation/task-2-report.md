# Task 2 report — selected strength series, selector, and trend insight

## Status

DONE

## Implementation

- Progress now consumes the complete deterministic strength-series catalogue by calling `aggregateStrengthProgression(currentSessions)` without a limit.
- Added local `selectedStrengthKey` state and a derived `effectiveStrengthKey`, so an invalid selection falls back to the first valid frequency-ranked series without synchronously resetting state in an effect.
- Added a native source-aware exercise selector whose values are `${exerciseSource}:${exerciseId}` keys.
- Kept one persistent strength panel/header while switching only its body between the per-exercise readiness state and the chart-ready state.
- Filtered chart points and readiness counts to the selected exercise and render exactly one `<Line>`.
- Added a visible pre-chart insight with the selected exercise's latest, maximum, and change from its first top set in the current range.
- Removed the multi-series legend and added flat responsive styling. The selector keeps the global focus treatment, has a `2.75rem` minimum height, and uses labels at least `0.75rem` high.
- Preserved the existing heatmap assertions as an independent regression test.

## Files

- `src/pages/ProgressPage.tsx`
- `src/pages/__tests__/ProgressPage.test.tsx`
- `src/index.css`

## TDD evidence

### RED

Command:

```bash
NODE_OPTIONS=--no-experimental-webstorage npx vitest run src/pages/__tests__/ProgressPage.test.tsx
```

Result before production changes: exit 1; 2 failed and 12 passed. Both new regressions failed because the accessible combobox did not exist; the rendered strength panel still contained multiple lines and the readiness decision was not selectable per exercise.

### Contract ruling during GREEN

The literal selector fixture originally gave `user:row` only two dated points while expecting both a chart line and `Ostatnio 60 kg`; this conflicted with the explicit `<3`-point readiness-only contract. Per the parent ruling, the fixture now includes a third Row point at 50 kg, producing a complete 50 → 55 → 60 kg series and a `+10 kg` delta. A same-day fourth Bench entry keeps Bench strictly most frequent while preserving its three chart points and 70 → 75 → 80 kg trend.

The fallback fixture places Row 45 days ago, so narrowing from 90 to 30 days actually invalidates `global:row`. Its assertion uses the exact deterministic fallback key `global:bench`; this is required because `toHaveValue` does not accept the proposed asymmetric `expect.stringMatching` matcher.

### GREEN

Command:

```bash
NODE_OPTIONS=--no-experimental-webstorage npx vitest run src/pages/__tests__/ProgressPage.test.tsx
```

Final result: exit 0; 1 test file passed, 14 tests passed.

## Additional verification

Commands:

```bash
npx eslint src/pages/ProgressPage.tsx src/pages/__tests__/ProgressPage.test.tsx
npm run build
```

Results: focused ESLint exited 0 with no warnings; TypeScript and the Vite production build exited 0.

## Full unit suite

Command:

```bash
NODE_OPTIONS=--no-experimental-webstorage npm run test:unit
```

Result: exit 0; 73 test files passed, 589 tests passed.

## Commit

- `11ecc18 feat: focus strength progress on one series`

## Self-review

- Inspected the committed diff with `git show --check`; no whitespace errors.
- Confirmed Progress is the only no-limit consumer changed and Task 1's optional bounded aggregator interface remains untouched.
- Confirmed every option and the rendered line use the source-aware series key, with no normalization or shared comparison scale.
- Confirmed an invalid selected key falls back through derivation only and the selector DOM remains available in both readiness and chart states.
- Confirmed the visible insight precedes the analytics grid and exposes latest, delta, and maximum without hover.
- Confirmed the old legend styles and markup are removed, global focus styles still apply, and mobile layout stacks the selector and insight.
- Confirmed no Firestore, query, store, data lifecycle, dependency, or unrelated product code changed.

## Concerns

None.
