# Task 8 report — diagnostic capture and visual regression

## Result

- Renamed `tests/e2e/audit-screenshots.spec.ts` to `tests/e2e/diagnostic-capture.spec.ts` with `git mv` so Git retains rename history.
- Diagnostic captures now use `testInfo.outputPath('diagnostic', ...)`, page-specific `expectAppReady` contracts, `document.fonts.ready`, and reduced motion.
- Removed all `waitForTimeout` calls from diagnostic capture. Scrolled captures use unique output names and a render-frame boundary after scrolling.
- `/login` is captured through a separate observed anonymous context with empty storage state, so authenticated storage cannot redirect it to `/dashboard`.
- Removed unconditional screenshots and the misleading visual-regression comment from `smoke.spec.ts`.
- Added the only pixel-regression test for the empty Templates page, with desktop and mobile projects only.
- Added the dedicated `npm run test:e2e:visual` emulator command.

## Baselines

Generated from a fresh Auth + Firestore emulator invocation with the dedicated `e2e@ironlog.local` account:

- `templates-empty-desktop-darwin.png` — 1280×784
- `templates-empty-mobile-darwin.png` — 393×1345

Exactly two PNG files exist in `tests/e2e/templates.visual.spec.ts-snapshots/`.

Both PNGs were inspected at original resolution. The desktop and mobile captures show the expected empty state (`0` plans and `Nie masz jeszcze szablonów`) plus the static example panel, with no user templates or other unexpected data. There are no loading skeletons/spinners, clipped page edges or clipped CTAs, and no visible font fallback; the display and body fonts render consistently. On mobile, the fixed BottomNav occupies its intended overlay position while the full-page capture retains the remaining content below it.

## Verification

1. Baseline generation, fresh emulator, `npx playwright`, retries disabled: `3 passed` (setup + desktop + mobile).
2. Immediate clean comparison via `npm run test:e2e:visual`: `3 passed` (setup + desktop + mobile).
3. `npm run lint -- --quiet`: exit 0.
4. `npm run build`: exit 0; Vite built 877 modules.
5. `npx playwright test tests/e2e/templates.visual.spec.ts tests/e2e/diagnostic-capture.spec.ts --project=desktop --list`: 20 tests listed, confirming both specs compile and are discovered.

The general diagnostic capture suite was intentionally not run because Task 8 did not require fresh diagnostic artifacts.
